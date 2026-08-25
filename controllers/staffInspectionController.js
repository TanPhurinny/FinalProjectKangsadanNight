const prisma = require('../config/prismaClient');
const { electricExcessInputSchema, inspectionCheckInputSchema, stallIssueInputSchema } = require('../utils/validationSchemas');
const { buildZonesData } = require('./marketController');

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

        const bookingByStallCode = {};
        activeRequests.forEach((request) => {
            const stallCodes = parseStallCodes(request.assignedStallCode);
            if (!stallCodes.length) return;

            const fallbackShop = shopInfoByName[request.sellerName] || {};
            const productDetail = request.seller?.productDetail || fallbackShop.productDetail || request.description || '-';

            stallCodes.forEach((stallCode) => {
                if (bookingByStallCode[stallCode]) return;
                bookingByStallCode[stallCode] = {
                    sellerName: request.sellerName || '-',
                    sellerPhone: request.phone || '-',
                    shopName: request.seller?.shopName || request.productName || '-',
                    productDetail,
                    bookingStatus: request.status || '-',
                    bookingCreatedAt: request.createdAt || null
                };
            });
        });

        const preferredOrder = buildPreferredWalkOrder();
        const preferredIndex = new Map(preferredOrder.map((code, idx) => [code, idx]));

        const excessRecords = await prisma.stallElectricExcessRecord.findMany({
            where: { stallId: { in: stallRows.map((stall) => stall.id) } },
            orderBy: { createdAt: 'desc' }
        });
        const latestExcessByStallId = new Map();
        excessRecords.forEach((record) => {
            if (!latestExcessByStallId.has(record.stallId)) {
                latestExcessByStallId.set(record.stallId, record);
            }
        });

        const inspectionCheckRecords = await prisma.stallInspectionCheckRecord.findMany({
            where: { stallId: { in: stallRows.map((stall) => stall.id) } },
            orderBy: { createdAt: 'desc' }
        });
        const latestInspectionCheckByStallId = new Map();
        inspectionCheckRecords.forEach((record) => {
            if (!latestInspectionCheckByStallId.has(record.stallId)) {
                latestInspectionCheckByStallId.set(record.stallId, record);
            }
        });

        const issueRecords = await prisma.stallIssueRecord.findMany({
            where: { stallId: { in: stallRows.map((stall) => stall.id) } },
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
            const inspectionCheck = latestInspectionCheckByStallId.get(stall.id) || null;
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
                inspectionEnabled: !isVacant,
                electricExcess: excess ? {
                    smallCount: excess.smallCount,
                    largeCount: excess.largeCount,
                    subtotal: excess.subtotal,
                    note: excess.note || ''
                } : null,
                isInspected: Boolean(inspectionCheck?.isInspected),
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
                isInspected: stall.isInspected,
                hasIssue
            };
        });

        return res.render('staff/marketinspection', {
            user: req.user,
            inspectionRoundLabel: req.query.round || 'งานตรวจตลาดรอบที่ 45',
            inspectionDateLabel: new Date().toLocaleDateString('th-TH', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            }),
            stalls,
            zones,
            selectedZone: String(req.query.zone || 'ALL').toUpperCase(),
            query: String(req.query.q || '').trim(),
            smallAppliancePrice: SMALL_APPLIANCE_PRICE,
            largeAppliancePrice: LARGE_APPLIANCE_PRICE,
            zoneByCode,
            inspectionByStallCode
        });
    } catch (error) {
        console.error('Staff market inspection page error:', error);
        return res.status(500).render('staff/marketinspection', {
            user: req.user,
            inspectionRoundLabel: 'งานตรวจตลาด',
            inspectionDateLabel: '-',
            stalls: [],
            zones: [],
            selectedZone: 'ALL',
            query: '',
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
