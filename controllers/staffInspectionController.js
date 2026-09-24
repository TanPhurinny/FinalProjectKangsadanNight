const prisma = require('../config/prismaClient');
const { electricExcessInputSchema, inspectionCheckInputSchema, stallIssueInputSchema, cleanlinessInspectionInputSchema } = require('../utils/validationSchemas');
const { buildZonesData } = require('./marketController');
const { toStartOfDay, addDays, getBookingRoundMetaForDate, getRoundWindow } = require('../utils/bookingRound');
const { toDateKey } = require('../utils/inspectionScoring');
const { normalizeProductType } = require('../utils/zoneAccess');
const { CLEANLINESS_CHECKLIST, CLEANLINESS_ITEM_IDS } = require('../utils/cleanlinessChecklist');

// ใช้แกะ requestId จาก Booking.storeDetailSnapshot เหมือน scoreReportController.js เพื่อย้อนกลับไปหา
// BookingRequest.assignedStallCode จริงของรอบที่ดูอยู่ (Booking มีช่วงวันเช่า แต่ไม่มีล็อคที่ได้จริง)
const REQUEST_TAG_REGEX = /\[BOOKING_REQUEST_ID:(\d+)\]/;

// ต้องตรงกับค่าที่ routes/sellerRoute.js ใช้คิดเงินเครื่องใช้ไฟฟ้าตอนจอง (คนละจุดโดยเจตนา)
const SMALL_APPLIANCE_PRICE = 20;
const LARGE_APPLIANCE_PRICE = 40;

function buildRange(prefix, start, end, direction = 'asc') {
    const codes = [];
    if (direction === 'asc') {
        for (let n = start; n <= end; n += 1) {
            codes.push(`${prefix}${n}`);
        }
        return codes;
    }

    for (let n = start; n >= end; n -= 1) {
        codes.push(`${prefix}${n}`);
    }

    return codes;
}

function buildPreferredWalkOrder() {
    const preferred = [
        ...buildRange('B', 604, 601, 'desc'),
        ...buildRange('B', 623, 601, 'desc'),
        ...buildRange('B', 501, 523, 'asc'),
        ...buildRange('B', 423, 401, 'desc'),
        ...buildRange('B', 299, 323, 'asc'),

        ...buildRange('F', 636, 601, 'desc'),
        ...buildRange('F', 501, 536, 'asc'),
        ...buildRange('F', 434, 401, 'desc'),
        ...buildRange('F', 301, 334, 'asc'),
        ...buildRange('F', 217, 201, 'desc'),
        ...buildRange('F', 117, 101, 'desc'),

        ...buildRange('C', 112, 101, 'desc'),

        ...buildRange('A', 923, 901, 'desc'),
        ...buildRange('A', 801, 823, 'asc'),
        ...buildRange('A', 722, 701, 'desc'),
        ...buildRange('A', 601, 622, 'asc'),
        ...buildRange('A', 521, 501, 'desc'),
        ...buildRange('A', 401, 421, 'asc'),
        ...buildRange('A', 319, 301, 'desc'),
        ...buildRange('A', 201, 219, 'asc'),
        ...buildRange('A', 119, 101, 'desc'),

        ...buildRange('E', 101, 104, 'asc'),
        ...buildRange('D', 201, 212, 'asc'),
        ...buildRange('X', 101, 106, 'asc')
    ];

    const seen = new Set();
    return preferred.filter((code) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
    });
}

// assignedStallCode เก็บได้ทั้งล็อกเดียว ("A901") หรือหลายล็อกคั่นด้วย comma ("A901,A902")
// เหมือนกับ parseStallCodes ใน approvalController.js (คัดลอกมาเพราะไฟล์นั้นไม่ได้ export ฟังก์ชันนี้)
function parseStallCodes(assignedStallCodeText) {
    return String(assignedStallCodeText || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

// ใช้เป็นแหล่งความจริงเดียวกันทั้งหน้า (bookingByStallCode) และ endpoint บันทึกข้อมูล
// แทนการเช็ค stall.isAvailable/stall.status ซึ่งถูกตั้งตอนแอดมิน "จัดล็อกให้" (IN_PROGRESS)
// ไม่ได้ถูกอัปเดตอีกตอนยืนยันจ่ายเงิน (confirmPayment) จึงอาจไม่ตรงกับสถานะจ่ายเงินจริง
async function isStallPaidAndBooked(stallCode) {
    const normalizedCode = String(stallCode || '').trim().toUpperCase();
    if (!normalizedCode) return false;

    const candidates = await prisma.bookingRequest.findMany({
        where: {
            status: 'SUCCESS',
            assignedStallCode: { contains: normalizedCode }
        },
        select: { assignedStallCode: true }
    });

    return candidates.some((request) => parseStallCodes(request.assignedStallCode).includes(normalizedCode));
}

// เช็คว่าร้านที่จองล็อคนี้อยู่ ณ ตอนนี้ ลงทะเบียนเป็นประเภท "อาหาร" จริงไหม (สำหรับ defense-in-depth
// กัน POST ตรงๆ ที่ข้าม UI มา) — ใช้ตรรกะเดียวกับที่หน้า getMarketInspectionPage ใช้ตัดสิน isFoodStall
async function isStallFoodType(stallCode) {
    const normalizedCode = String(stallCode || '').trim().toUpperCase();
    if (!normalizedCode) return false;

    const candidates = await prisma.bookingRequest.findMany({
        where: {
            status: 'SUCCESS',
            assignedStallCode: { contains: normalizedCode }
        },
        select: { assignedStallCode: true, sellerName: true }
    });
    const match = candidates.find((request) => parseStallCodes(request.assignedStallCode).includes(normalizedCode));
    if (!match) return false;

    const sellerUser = await prisma.user.findFirst({
        where: { role: 'SELLER', name: match.sellerName },
        select: { shop: { select: { productType: true } } }
    });

    return normalizeProductType(sellerUser?.shop?.productType) === 'FOOD';
}

// ดูข้อมูลรอบเก่า/รอบถัดไปแบบย้อนหลัง (อ่านอย่างเดียว) — ต่างจาก bookingByStallCode ของรอบปัจจุบัน
// ตรงที่ต้องยึดช่วงวันเช่าจริงของรอบนั้น (Booking.rentalStartDate/EndDate) แทน "ใครจองอยู่ตอนนี้"
// เพราะ BookingRequest.assignedStallCode ถูกเขียนทับทุกครั้งที่มีการจัดล็อกใหม่ ไม่เก็บประวัติ
async function buildHistoricalBookingByStallCode(cycleStart, cycleEnd) {
    const bookings = await prisma.booking.findMany({
        where: {
            status: 'SUCCESS',
            rentalStartDate: { not: null, lte: cycleEnd },
            rentalEndDate: { not: null, gte: cycleStart }
        },
        select: {
            createdAt: true,
            storeDetailSnapshot: true,
            user: {
                select: {
                    name: true,
                    phoneNumber: true,
                    shop: { select: { shopName: true, productType: true, productDetail: true } }
                }
            }
        }
    });

    const requestIds = Array.from(new Set(
        bookings
            .map((booking) => {
                const match = String(booking.storeDetailSnapshot || '').match(REQUEST_TAG_REGEX);
                return match ? Number.parseInt(match[1], 10) : null;
            })
            .filter(Boolean)
    ));

    const requests = requestIds.length
        ? await prisma.bookingRequest.findMany({
            where: { id: { in: requestIds } },
            select: { id: true, assignedStallCode: true }
        })
        : [];
    const stallCodesByRequestId = new Map(
        requests.map((request) => [request.id, parseStallCodes(request.assignedStallCode)])
    );

    const bookingByStallCode = {};
    bookings.forEach((booking) => {
        if (!booking.user) return;
        const match = String(booking.storeDetailSnapshot || '').match(REQUEST_TAG_REGEX);
        const requestId = match ? Number.parseInt(match[1], 10) : null;
        const stallCodes = requestId ? (stallCodesByRequestId.get(requestId) || []) : [];
        if (!stallCodes.length) return;

        const shop = booking.user.shop || {};
        stallCodes.forEach((stallCode) => {
            if (bookingByStallCode[stallCode]) return;
            bookingByStallCode[stallCode] = {
                sellerName: booking.user.name || '-',
                sellerPhone: booking.user.phoneNumber || '-',
                shopName: shop.shopName || booking.user.name || '-',
                productDetail: shop.productDetail || '-',
                productType: shop.productType || '',
                bookingStatus: 'SUCCESS',
                bookingCreatedAt: booking.createdAt
            };
        });
    });

    return bookingByStallCode;
}

// หน้าต่างแก้ไข 24 ชม. — ให้ "ตรวจทุกวัน" ทำงานได้จริง: ถ้าเร็คอร์ดล่าสุดของล็อคนี้เป็นของวันก่อนหน้า
// (คนละวันปฏิทินกับวันนี้) ถือเป็นการตรวจรอบใหม่ของวันนี้เสมอ ไม่ต้องเช็คเวลา — เช็ค 24 ชม. แบบ rolling
// เฉพาะกรณีเร็คอร์ดล่าสุดเป็นของ "วันนี้" เท่านั้น (กันแก้ของเก่าข้ามวันแบบไม่มีที่สิ้นสุด)
function isWithinEditWindow(latestRecordCreatedAt) {
    if (!latestRecordCreatedAt) return true;
    const sameDay = toDateKey(new Date(latestRecordCreatedAt)) === toDateKey(new Date());
    if (!sameDay) return true;
    return (Date.now() - new Date(latestRecordCreatedAt).getTime()) < 24 * 60 * 60 * 1000;
}

function parseStallNumber(stallCode) {
    const numeric = Number.parseInt(String(stallCode || '').replace(/^[A-Z]/i, ''), 10);
    return Number.isFinite(numeric) ? numeric : 0;
}

function fallbackSort(a, b) {
    const zoneCompare = String(a.zoneCode || '').localeCompare(String(b.zoneCode || ''));
    if (zoneCompare !== 0) return zoneCompare;
    return parseStallNumber(a.stallCode) - parseStallNumber(b.stallCode);
}

exports.getMarketInspectionPage = async (req, res) => {
    try {
        // เลือกดูรอบก่อนหน้า/รอบถัดไปได้เหมือนหน้า /staff/marketinspection/report — ค่าเริ่มต้นคือรอบปัจจุบัน
        // รอบอื่นที่ไม่ใช่รอบปัจจุบันถือเป็นประวัติ เปิดดูได้อย่างเดียว แก้ไข/บันทึกไม่ได้ (ดู inspectionEnabled ด้านล่าง)
        const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
        const requestedRound = Number.parseInt(req.query.round, 10);
        const roundNumber = Number.isFinite(requestedRound) ? requestedRound : currentRoundNumber;
        const isCurrentRound = roundNumber === currentRoundNumber;
        const { cycleStart, cycleEnd } = getRoundWindow(roundNumber);
        const historicalRecordDateFilter = { gte: cycleStart, lt: addDays(cycleEnd, 1) };

        const stallRows = await prisma.stall.findMany({
            include: {
                row: {
                    include: {
                        zone: {
                            select: {
                                code: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        let bookingByStallCode = {};
        if (isCurrentRound) {
            const activeRequests = await prisma.bookingRequest.findMany({
                where: {
                    // SUCCESS = จุดเดียวที่แอดมินยืนยันสลิปแล้ว (paymentConfirmedAt ถูกตั้งพร้อมกัน ดู approvalController.confirmPayment)
                    // ตัดสถานะ APPROVED/IN_PROGRESS ออก เพราะเป็นล็อคที่จัดให้แล้วแต่ยังไม่จ่ายเงิน ไม่ควรให้เดินตรวจ
                    status: 'SUCCESS',
                    assignedStallCode: { not: null }
                },
                select: {
                    assignedStallCode: true,
                    sellerName: true,
                    phone: true,
                    productName: true,
                    description: true,
                    zone: true,
                    createdAt: true,
                    status: true,
                    seller: {
                        select: {
                            shopName: true,
                            productDetail: true,
                            productType: { select: { name: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const missingShopInfoNames = [...new Set(
                activeRequests.filter((request) => !request.seller?.productType?.name).map((request) => request.sellerName).filter(Boolean)
            )];
            const shopInfoByName = {};
            if (missingShopInfoNames.length) {
                const sellerUsers = await prisma.user.findMany({
                    where: { role: 'SELLER', name: { in: missingShopInfoNames } },
                    select: {
                        name: true,
                        shop: {
                            select: {
                                productType: true,
                                productDetail: true
                            }
                        }
                    }
                });
                sellerUsers.forEach((user) => {
                    if (user.shop) {
                        shopInfoByName[user.name] = user.shop;
                    }
                });
            }

            activeRequests.forEach((request) => {
                const stallCodes = parseStallCodes(request.assignedStallCode);
                if (!stallCodes.length) return;

                const fallbackShop = shopInfoByName[request.sellerName] || {};
                const productDetail = request.seller?.productDetail || fallbackShop.productDetail || request.description || '-';
                const productType = request.seller?.productType?.name || fallbackShop.productType || '';

                stallCodes.forEach((stallCode) => {
                    if (bookingByStallCode[stallCode]) return;
                    bookingByStallCode[stallCode] = {
                        sellerName: request.sellerName || '-',
                        sellerPhone: request.phone || '-',
                        shopName: request.seller?.shopName || request.productName || '-',
                        productDetail,
                        productType,
                        bookingStatus: request.status || '-',
                        bookingCreatedAt: request.createdAt || null
                    };
                });
            });
        } else {
            bookingByStallCode = await buildHistoricalBookingByStallCode(cycleStart, cycleEnd);
        }

        const preferredOrder = buildPreferredWalkOrder();
        const preferredIndex = new Map(preferredOrder.map((code, idx) => [code, idx]));

        const excessRecords = await prisma.stallElectricExcessRecord.findMany({
            where: {
                stallId: { in: stallRows.map((stall) => stall.id) },
                ...(isCurrentRound ? {} : { createdAt: historicalRecordDateFilter })
            },
            orderBy: { createdAt: 'desc' }
        });
        const latestExcessByStallId = new Map();
        excessRecords.forEach((record) => {
            if (!latestExcessByStallId.has(record.stallId)) {
                latestExcessByStallId.set(record.stallId, record);
            }
        });

        const issueRecords = await prisma.stallIssueRecord.findMany({
            where: {
                stallId: { in: stallRows.map((stall) => stall.id) },
                ...(isCurrentRound ? {} : { createdAt: historicalRecordDateFilter })
            },
            orderBy: { createdAt: 'desc' }
        });
        const latestIssueByStallId = new Map();
        issueRecords.forEach((record) => {
            if (!latestIssueByStallId.has(record.stallId)) {
                latestIssueByStallId.set(record.stallId, record);
            }
        });

        const stalls = stallRows.map((stall) => {
            const booking = bookingByStallCode[String(stall.stallCode || '').trim().toUpperCase()] || null;
            const zoneCode = stall.row?.zone?.code || '';
            // ยึดจาก booking (มาจาก BookingRequest ที่ SUCCESS เท่านั้น) เป็นตัวตัดสิน "ว่าง" เพียงตัวเดียว
            // ไม่ใช้ stall.status === 'BOOKED' อีกต่อไป เพราะ field นั้นถูกตั้งตั้งแต่ตอน IN_PROGRESS (ยังไม่จ่ายเงิน)
            const isVacant = !booking;
            const excess = latestExcessByStallId.get(stall.id) || null;
            const issue = latestIssueByStallId.get(stall.id) || null;

            return {
                id: stall.id,
                stallCode: stall.stallCode,
                zoneCode,
                zoneName: stall.row?.zone?.name || `Zone ${zoneCode}`,
                rowCode: stall.row?.rowCode || '-',
                stallStatus: stall.status,
                isAvailable: Boolean(stall.isAvailable),
                sellerName: booking?.sellerName || (isVacant ? 'ว่าง' : 'จองอยู่'),
                sellerPhone: booking?.sellerPhone || '-',
                shopName: booking?.shopName || (isVacant ? 'ว่าง' : 'กำลังใช้งาน'),
                productDetail: booking?.productDetail || '-',
                bookingStatus: booking?.bookingStatus || (isVacant ? 'VACANT' : 'BOOKED'),
                bookingStartDate: null,
                bookingEndDate: null,
                isVacant,
                // รอบเก่า/รอบถัดไปเปิดดูได้อย่างเดียว บันทึก/แก้ไขได้เฉพาะรอบปัจจุบันเท่านั้น
                inspectionEnabled: !isVacant && isCurrentRound,
                // เฉพาะร้านที่ลงทะเบียนเป็น "อาหาร" จริง (ไม่ใช่เช็คจากโซน เพราะโซน A เป็นโซนผสมแฟชั่น+อาหาร)
                isFoodStall: !isVacant && normalizeProductType(booking?.productType) === 'FOOD',
                electricExcess: excess ? {
                    smallCount: excess.smallCount,
                    largeCount: excess.largeCount,
                    subtotal: excess.subtotal,
                    note: excess.note || ''
                } : null,
                issues: {
                    noShow: Boolean(issue?.noShow),
                    sublease: Boolean(issue?.sublease),
                    otherMarket: Boolean(issue?.otherMarket),
                    wrongSeller: Boolean(issue?.wrongSeller),
                    otherIssueNote: issue?.otherIssueNote || ''
                },
                preferredIndex: preferredIndex.has(stall.stallCode) ? preferredIndex.get(stall.stallCode) : Number.POSITIVE_INFINITY
            };
        });

        const foodStallIds = stalls.filter((stall) => stall.isFoodStall).map((stall) => stall.id);
        const cleanlinessByStallId = {};
        if (foodStallIds.length) {
            const cleanlinessRecords = await prisma.stallCleanlinessInspection.findMany({
                where: {
                    stallId: { in: foodStallIds },
                    ...(isCurrentRound ? {} : { createdAt: historicalRecordDateFilter })
                },
                orderBy: { createdAt: 'desc' }
            });
            const latestCleanlinessByStallId = new Map();
            cleanlinessRecords.forEach((record) => {
                if (!latestCleanlinessByStallId.has(record.stallId)) {
                    latestCleanlinessByStallId.set(record.stallId, record);
                }
            });
            stalls.forEach((stall) => {
                if (!stall.isFoodStall) return;
                const record = latestCleanlinessByStallId.get(stall.id) || null;
                stall.cleanliness = record ? {
                    itemResults: record.itemResults,
                    overallPassed: record.overallPassed,
                    note: record.note || '',
                    checkedAt: record.createdAt
                } : null;
                cleanlinessByStallId[stall.id] = stall.cleanliness;
            });
        }

        stalls.sort((a, b) => {
            // ล็อคที่มีคนจองขึ้นก่อนทั้งกลุ่ม ลดการเลื่อนหาล็อคว่างที่แทรกอยู่ตลอดเส้นทาง
            if (a.isVacant !== b.isVacant) {
                return a.isVacant ? 1 : -1;
            }
            if (a.preferredIndex !== b.preferredIndex) {
                return a.preferredIndex - b.preferredIndex;
            }
            return fallbackSort(a, b);
        });

        const zones = Array.from(new Set(stalls.map((stall) => stall.zoneCode).filter(Boolean)));

        // ข้อมูลผังจริง (โซน/แถว/ล็อค) ใช้ตัวเดียวกับหน้า /admin/booking-stall และ /market
        // เพื่อไม่ให้ผัง "ดูแบบผัง" ของหน้านี้เพี้ยนไปคนละแบบ — ดู buildZonesData()
        const zonesData = await buildZonesData();
        const zoneByCode = {};
        zonesData.forEach((zone) => { zoneByCode[zone.code] = zone; });

        // lookup แบบแบน keyed ด้วย stallCode แทนการ merge เข้าไปใน zoneByCode ฝั่ง server
        // (zoneByCode มี hardcode reshaping เยอะ ผูก logic เพิ่มเข้าไปเสี่ยง drift — ให้ client JS lookup เองตอน render cell)
        const inspectionByStallCode = {};
        stalls.forEach((stall) => {
            const hasIssue = Boolean(
                stall.issues.noShow || stall.issues.sublease || stall.issues.otherMarket ||
                stall.issues.wrongSeller || (stall.issues.otherIssueNote && stall.issues.otherIssueNote.trim()) ||
                (stall.electricExcess && (stall.electricExcess.smallCount > 0 || stall.electricExcess.largeCount > 0))
            );
            inspectionByStallCode[String(stall.stallCode || '').trim().toUpperCase()] = {
                id: stall.id,
                isVacant: stall.isVacant,
                inspectionEnabled: stall.inspectionEnabled,
                hasIssue
            };
        });

        const dateLabelOptions = { day: '2-digit', month: 'long', year: 'numeric' };
        const inspectionDateLabel = isCurrentRound
            ? new Date().toLocaleDateString('th-TH', dateLabelOptions)
            : `${cycleStart.toLocaleDateString('th-TH', dateLabelOptions)} - ${cycleEnd.toLocaleDateString('th-TH', dateLabelOptions)}`;

        return res.render('staff/marketinspection', {
            user: req.user,
            inspectionRoundLabel: `งานตรวจตลาดรอบที่ ${roundNumber}`,
            inspectionDateLabel,
            roundNumber,
            currentRoundNumber,
            isCurrentRound,
            stalls,
            zones,
            selectedZone: String(req.query.zone || 'ALL').toUpperCase(),
            query: String(req.query.q || '').trim(),
            smallAppliancePrice: SMALL_APPLIANCE_PRICE,
            largeAppliancePrice: LARGE_APPLIANCE_PRICE,
            zoneByCode,
            inspectionByStallCode,
            cleanlinessChecklist: CLEANLINESS_CHECKLIST,
            cleanlinessByStallId
        });
    } catch (error) {
        console.error('Staff market inspection page error:', error);
        const fallbackRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
        return res.status(500).render('staff/marketinspection', {
            user: req.user,
            inspectionRoundLabel: 'งานตรวจตลาด',
            inspectionDateLabel: '-',
            roundNumber: fallbackRoundNumber,
            currentRoundNumber: fallbackRoundNumber,
            isCurrentRound: true,
            stalls: [],
            zones: [],
            selectedZone: 'ALL',
            query: '',
            cleanlinessChecklist: CLEANLINESS_CHECKLIST,
            cleanlinessByStallId: {},
            smallAppliancePrice: SMALL_APPLIANCE_PRICE,
            largeAppliancePrice: LARGE_APPLIANCE_PRICE,
            zoneByCode: {},
            inspectionByStallCode: {},
            error: 'ไม่สามารถโหลดข้อมูลงานตรวจตลาดได้'
        });
    }
};

// บันทึก/แก้ไขจำนวนเครื่องใช้ไฟฟ้าเกินที่พบจริงหน้างาน (เรียกจาก fetch ในหน้า marketinspection.js)
exports.saveElectricExcess = async (req, res) => {
    try {
        const parsed = electricExcessInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
        }

        const { stallId, smallCount, largeCount, note } = parsed.data;

        const stall = await prisma.stall.findUnique({
            where: { id: stallId },
            select: { id: true, stallCode: true }
        });

        if (!stall) {
            return res.status(404).json({ success: false, message: 'ไม่พบล็อคที่ระบุ' });
        }

        // บันทึกคะแนนเกินได้เฉพาะล็อคที่มีการจองและชำระเงินแล้วจริง (สอดคล้องกับ inspectionEnabled บนหน้า)
        const isBooked = await isStallPaidAndBooked(stall.stallCode);
        if (!isBooked) {
            return res.status(400).json({ success: false, message: 'บันทึกได้เฉพาะล็อคที่มีการจองอยู่เท่านั้น' });
        }

        const latestExcess = await prisma.stallElectricExcessRecord.findFirst({
            where: { stallId: stall.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        if (!isWithinEditWindow(latestExcess?.createdAt)) {
            return res.status(400).json({ success: false, message: 'เกินเวลาที่แก้ไขได้แล้ว (24 ชม.)' });
        }

        const subtotal = (smallCount * SMALL_APPLIANCE_PRICE) + (largeCount * LARGE_APPLIANCE_PRICE);

        const record = await prisma.stallElectricExcessRecord.create({
            data: {
                stallId: stall.id,
                stallCode: stall.stallCode,
                smallCount,
                largeCount,
                smallUnitPrice: SMALL_APPLIANCE_PRICE,
                largeUnitPrice: LARGE_APPLIANCE_PRICE,
                subtotal,
                note: note || null,
                recordedById: req.user.id
            }
        });

        return res.json({
            success: true,
            record: {
                stallId: stall.id,
                smallCount: record.smallCount,
                largeCount: record.largeCount,
                subtotal: record.subtotal,
                note: record.note || ''
            }
        });
    } catch (error) {
        console.error('Save electric excess error:', error);
        return res.status(500).json({ success: false, message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
    }
};

// บันทึกสถานะ "ตรวจสอบแล้ว" ตอนเดินตรวจตลาด (เก็บเป็น event log เอาแถวล่าสุดเป็นค่าปัจจุบัน)
exports.saveInspectionCheck = async (req, res) => {
    try {
        const parsed = inspectionCheckInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
        }

        const { stallId, isInspected } = parsed.data;

        const stall = await prisma.stall.findUnique({
            where: { id: stallId },
            select: { id: true, stallCode: true }
        });

        if (!stall) {
            return res.status(404).json({ success: false, message: 'ไม่พบล็อคที่ระบุ' });
        }

        const isBooked = await isStallPaidAndBooked(stall.stallCode);
        if (!isBooked) {
            return res.status(400).json({ success: false, message: 'บันทึกได้เฉพาะล็อคที่มีการจองอยู่เท่านั้น' });
        }

        const latestCheck = await prisma.stallInspectionCheckRecord.findFirst({
            where: { stallId: stall.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        if (!isWithinEditWindow(latestCheck?.createdAt)) {
            return res.status(400).json({ success: false, message: 'เกินเวลาที่แก้ไขได้แล้ว (24 ชม.)' });
        }

        await prisma.stallInspectionCheckRecord.create({
            data: {
                stallId: stall.id,
                stallCode: stall.stallCode,
                isInspected,
                recordedById: req.user.id
            }
        });

        return res.json({ success: true, isInspected });
    } catch (error) {
        console.error('Save inspection check error:', error);
        return res.status(500).json({ success: false, message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
    }
};

// บันทึกหัวข้อปัญหาที่พบตอนตรวจตลาด (ไม่มาขาย/ปล่อยเช่าช่วง/ไปเปิดท้ายหรือขายอื่น/ขายไม่ตรง + หมายเหตุปัญหาอื่นๆ)
// ส่งค่าทุก field มาพร้อมกันเสมอจากฝั่งหน้าเว็บ (ดู marketinspection.js: saveRowIssue) ไม่ได้บันทึกทีละฟิลด์
exports.saveStallIssue = async (req, res) => {
    try {
        const parsed = stallIssueInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
        }

        const { stallId, noShow, sublease, otherMarket, wrongSeller, otherIssueNote } = parsed.data;

        const stall = await prisma.stall.findUnique({
            where: { id: stallId },
            select: { id: true, stallCode: true }
        });

        if (!stall) {
            return res.status(404).json({ success: false, message: 'ไม่พบล็อคที่ระบุ' });
        }

        const isBooked = await isStallPaidAndBooked(stall.stallCode);
        if (!isBooked) {
            return res.status(400).json({ success: false, message: 'บันทึกได้เฉพาะล็อคที่มีการจองอยู่เท่านั้น' });
        }

        const latestIssue = await prisma.stallIssueRecord.findFirst({
            where: { stallId: stall.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        if (!isWithinEditWindow(latestIssue?.createdAt)) {
            return res.status(400).json({ success: false, message: 'เกินเวลาที่แก้ไขได้แล้ว (24 ชม.)' });
        }

        const record = await prisma.stallIssueRecord.create({
            data: {
                stallId: stall.id,
                stallCode: stall.stallCode,
                noShow,
                sublease,
                otherMarket,
                wrongSeller,
                otherIssueNote: otherIssueNote || null,
                recordedById: req.user.id
            }
        });

        return res.json({
            success: true,
            issue: {
                noShow: record.noShow,
                sublease: record.sublease,
                otherMarket: record.otherMarket,
                wrongSeller: record.wrongSeller,
                otherIssueNote: record.otherIssueNote || ''
            }
        });
    } catch (error) {
        console.error('Save stall issue error:', error);
        return res.status(500).json({ success: false, message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
    }
};

// บันทึกผลตรวจเช็คลิสต์ความสะอาด (5 หมวด/17 ข้อ ตาม CLEANLINESS_CHECKLIST) — กดบันทึกทั้งชุดทีเดียว
// ต่อร้าน ไม่ auto-save ทีละข้อแบบ saveStallIssue — ผลรวมผ่าน/ไม่ผ่านคำนวณอัตโนมัติจากข้อย่อยทั้งหมด
exports.saveCleanlinessInspection = async (req, res) => {
    try {
        const parsed = cleanlinessInspectionInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
        }

        const { stallId, itemResults, note } = parsed.data;

        const stall = await prisma.stall.findUnique({
            where: { id: stallId },
            select: { id: true, stallCode: true }
        });

        if (!stall) {
            return res.status(404).json({ success: false, message: 'ไม่พบล็อคที่ระบุ' });
        }

        const isBooked = await isStallPaidAndBooked(stall.stallCode);
        if (!isBooked) {
            return res.status(400).json({ success: false, message: 'บันทึกได้เฉพาะล็อคที่มีการจองอยู่เท่านั้น' });
        }

        const isFood = await isStallFoodType(stall.stallCode);
        if (!isFood) {
            return res.status(400).json({ success: false, message: 'ตรวจความสะอาดได้เฉพาะร้านค้าประเภทอาหารเท่านั้น' });
        }

        const latestCleanliness = await prisma.stallCleanlinessInspection.findFirst({
            where: { stallId: stall.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        if (!isWithinEditWindow(latestCleanliness?.createdAt)) {
            return res.status(400).json({ success: false, message: 'เกินเวลาที่แก้ไขได้แล้ว (24 ชม.)' });
        }

        // เผื่อ client ส่ง key เกินมา — เก็บเฉพาะข้อที่อยู่ใน checklist จริงเท่านั้น กันข้อมูลแปลกปลอมเข้า JSON
        const normalizedItemResults = {};
        CLEANLINESS_ITEM_IDS.forEach((id) => {
            normalizedItemResults[id] = Boolean(itemResults[id]);
        });
        const overallPassed = Object.values(normalizedItemResults).every(Boolean);

        const record = await prisma.stallCleanlinessInspection.create({
            data: {
                stallId: stall.id,
                stallCode: stall.stallCode,
                itemResults: normalizedItemResults,
                overallPassed,
                note: note || null,
                recordedById: req.user.id
            }
        });

        return res.json({
            success: true,
            inspection: {
                itemResults: record.itemResults,
                overallPassed: record.overallPassed,
                note: record.note || '',
                checkedAt: record.createdAt
            }
        });
    } catch (error) {
        console.error('Save cleanliness inspection error:', error);
        return res.status(500).json({ success: false, message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
    }
};

// "ส่งงาน" ตรวจตลาดรายวัน แยกตามพนักงานแต่ละคน — เป็นแค่หลักฐาน/สรุปยอด ณ เวลาที่ส่ง ไม่ใช่ hard lock
// (ยังกลับมาแก้ไข checkbox ของวันนั้นได้ตามหน้าต่าง 24 ชม. ปกติ ดู isWithinEditWindow)
// คำนวณ inspectedCount/totalCount จากฝั่งเซิร์ฟเวอร์เองเสมอ ไม่เชื่อค่าที่ client ส่งมา
//
// ตั้งแต่เอาคอลัมน์ "ตรวจสอบแล้ว" ออกจาก UI (เจ้าหน้าที่บันทึกเฉพาะร้านที่พบปัญหา) ไม่มีทาง
// ตั้ง isInspected=true ทีละร้านจาก client ได้อีกแล้ว — ระบบคะแนน/แดชบอร์ดพนักงานยังอิงค่านี้อยู่
// จึงให้ปุ่ม "ส่งงาน" เป็นจุด auto-mark: สร้าง StallInspectionCheckRecord(isInspected:true) ให้ทุก
// ล็อคที่จองและชำระเงินแล้วที่ยังไม่มีเร็คคอร์ดของ "วันนี้" ก่อนคำนวณสรุปยอด (ร้านไม่มีปัญหา = ถือว่า
// ตรวจผ่านเมื่อจบวัน โดยไม่ต้องกดยืนยันทีละร้าน)
exports.submitDay = async (req, res) => {
    try {
        // นับเฉพาะล็อคที่เปิดให้ตรวจได้จริง (มีการจองและชำระเงินแล้ว) ตรงกับ inspectionEnabled บนหน้า
        const stallRows = await prisma.stall.findMany({ select: { id: true, stallCode: true } });
        const bookedFlags = await Promise.all(stallRows.map((stall) => isStallPaidAndBooked(stall.stallCode)));
        const bookedStallIds = stallRows.filter((_, idx) => bookedFlags[idx]).map((stall) => stall.id);
        const bookedStallByCode = new Map(
            stallRows.filter((_, idx) => bookedFlags[idx]).map((stall) => [stall.id, stall.stallCode])
        );

        const totalCount = bookedStallIds.length;

        let inspectedCount = 0;
        let flaggedCount = 0;

        if (bookedStallIds.length) {
            const latestChecks = await prisma.stallInspectionCheckRecord.findMany({
                where: { stallId: { in: bookedStallIds } },
                orderBy: { createdAt: 'desc' }
            });
            const latestCheckByStallId = new Map();
            latestChecks.forEach((record) => {
                if (!latestCheckByStallId.has(record.stallId)) latestCheckByStallId.set(record.stallId, record);
            });

            const todayKey = toDateKey(new Date());
            const stallIdsMissingTodayCheck = bookedStallIds.filter((stallId) => {
                const latest = latestCheckByStallId.get(stallId);
                return !latest || toDateKey(new Date(latest.createdAt)) !== todayKey;
            });

            if (stallIdsMissingTodayCheck.length) {
                await prisma.stallInspectionCheckRecord.createMany({
                    data: stallIdsMissingTodayCheck.map((stallId) => ({
                        stallId,
                        stallCode: bookedStallByCode.get(stallId),
                        isInspected: true,
                        recordedById: req.user.id
                    }))
                });
                stallIdsMissingTodayCheck.forEach((stallId) => {
                    latestCheckByStallId.set(stallId, { stallId, isInspected: true });
                });
            }

            inspectedCount = Array.from(latestCheckByStallId.values()).filter((record) => record.isInspected).length;

            const [latestExcessRecords, latestIssueRecords] = await Promise.all([
                prisma.stallElectricExcessRecord.findMany({
                    where: { stallId: { in: bookedStallIds } },
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.stallIssueRecord.findMany({
                    where: { stallId: { in: bookedStallIds } },
                    orderBy: { createdAt: 'desc' }
                })
            ]);
            const latestExcessByStallId = new Map();
            latestExcessRecords.forEach((record) => {
                if (!latestExcessByStallId.has(record.stallId)) latestExcessByStallId.set(record.stallId, record);
            });
            const latestIssueByStallId = new Map();
            latestIssueRecords.forEach((record) => {
                if (!latestIssueByStallId.has(record.stallId)) latestIssueByStallId.set(record.stallId, record);
            });

            flaggedCount = bookedStallIds.filter((stallId) => {
                const excess = latestExcessByStallId.get(stallId);
                const issue = latestIssueByStallId.get(stallId);
                return Boolean(
                    issue?.noShow || issue?.sublease || issue?.otherMarket || issue?.wrongSeller ||
                    (issue?.otherIssueNote && issue.otherIssueNote.trim()) ||
                    (excess && (excess.smallCount > 0 || excess.largeCount > 0))
                );
            }).length;
        }

        const submissionDate = toStartOfDay(new Date());
        await prisma.dailyInspectionSubmission.upsert({
            where: { submissionDate_submittedById: { submissionDate, submittedById: req.user.id } },
            update: { inspectedCount, totalCount },
            create: { submissionDate, submittedById: req.user.id, inspectedCount, totalCount }
        });

        return res.json({ success: true, inspectedCount, totalCount, flaggedCount });
    } catch (error) {
        console.error('Submit inspection day error:', error);
        return res.status(500).json({ success: false, message: 'ส่งงานไม่สำเร็จ กรุณาลองใหม่' });
    }
};
