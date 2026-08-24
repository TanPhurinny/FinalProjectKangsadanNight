const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildZonesData } = require('./marketController');
const zoneAccess = require('../utils/zoneAccess');

const { toStartOfDay, addDays, getBookingRoundMetaForDate, getRoundWindow, isRoundEditable } = require('../utils/bookingRound');
const { verifySlip } = require('../utils/slipVerification');

function normalizeZone(zone) {
    return String(zone || '').trim().toUpperCase();
}

// เดียวกับ BOOKING_REQUEST_TAG_PREFIX/buildBookingRequestTag ใน routes/sellerRoute.js
// (คัดลอกมาเพราะไฟล์นั้น export แค่ router ดึงฟังก์ชันเดี่ยวออกมาใช้ตรงๆ ไม่ได้)
const BOOKING_REQUEST_TAG_PREFIX = '[BOOKING_REQUEST_ID:';
function buildBookingRequestTag(requestId) {
    const parsed = Number.parseInt(requestId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return '';
    return `${BOOKING_REQUEST_TAG_PREFIX}${parsed}]`;
}

function toThaiDate(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: '2-digit'
        });
    } catch (_) {
        return '-';
    }
}

function extractAssignedStallFromDescription(descriptionText) {
    const text = String(descriptionText || '');
    const match = text.match(/\[ASSIGNED_STALL:([^\]]+)\]/i);
    return match ? String(match[1] || '').trim().toUpperCase() : '';
}

// assignedStallCode เก็บได้ทั้งล็อกเดียว ("A901") หรือหลายล็อกคั่นด้วย comma ("A901,A902")
// เผื่อคำขอเดียวขอมากกว่า 1 ล็อก (stallCount ใน Booking ที่ผูกกับคำขอนี้ > 1)
function parseStallCodes(assignedStallCodeText) {
    return String(assignedStallCodeText || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

function joinStallCodes(stallCodes) {
    return Array.from(new Set(stallCodes.filter(Boolean))).join(',');
}

// คำขอ "ต่อล็อค" (routes/sellerRoute.js POST /booking-stall/extend) ใส่ tag นี้ไว้หน้า description
function extractExtendOfRequestId(descriptionText) {
    const match = String(descriptionText || '').match(/\[EXTEND_OF:(\d+)\]/i);
    return match ? Number.parseInt(match[1], 10) : null;
}

// ความสนใจล็อคเต็ง (แผงหัวมุม/แผงพิเศษ) ที่ฝังไว้ในข้อความตอนจอง (routes/sellerRoute.js POST /booking-stall)
function extractCornerZoneNote(descriptionText) {
    const match = String(descriptionText || '').match(/\[สนใจแผงพิเศษ:\s*([^\]]+)\]/);
    return match ? String(match[1] || '').trim() : null;
}

// ตัด tag ภายในทั้งหมดออกจาก description ก่อนโชว์เป็นโน้ตจริงให้แอดมินอ่าน
function stripInternalTags(descriptionText) {
    return String(descriptionText || '')
        .replace(/\[BOOKING_REQUEST_ID:\d+\]\s*/gi, '')
        .replace(/\[EXTEND_OF:\d+\]\s*/gi, '')
        .replace(/\[ASSIGNED_STALL:[^\]]+\]\s*/gi, '')
        .replace(/\[สนใจแผงพิเศษ:[^\]]+\]\s*/g, '')
        .trim();
}

const PRODUCT_TYPE_LABEL = {
    FASHION: 'แฟชั่น',
    FOOD: 'อาหาร',
    EVENT_BOOTH: 'กิจกรรม/บูธพิเศษ'
};

async function buildAdminBookingStallPageData(requestId) {
    const bookingRequest = await prisma.bookingRequest.findUnique({
        where: { id: requestId }
    });

    if (!bookingRequest) {
        return null;
    }

    // ใช้ buildZonesData() ชุดเดียวกับหน้าผังตลาด (admin/slots, marketMap) เพื่อให้ตำแหน่งแผง/แถวแนวนอน
    // (โซน C/E/X), รูปตัว L ของโซน D, และสีมุมพิเศษ ตรงกับผังจริงเหมือนกันทุกหน้า
    const zonesData = await buildZonesData();
    const zoneByCode = {};
    zonesData.forEach((zone) => { zoneByCode[zone.code] = zone; });

    const bookedStalls = [];
    zonesData.forEach((zone) => {
        zone.columns.forEach((column) => {
            column.stalls.forEach((stall) => {
                if (stall.status !== 'PLACEHOLDER' && stall.status !== 'AVAILABLE') {
                    bookedStalls.push(stall.code);
                }
            });
        });
    });

    const requestedZone = normalizeZone(bookingRequest.zone);
    const assignedStallCode = String(bookingRequest.assignedStallCode || extractAssignedStallFromDescription(bookingRequest.description) || '').trim().toUpperCase();
    const assignedStallCodes = parseStallCodes(assignedStallCode);

    // จำกัดตัวเลือกโซนบนหน้านี้ให้ตรงกับประเภทสินค้าที่ผู้ขายลงทะเบียนไว้ (กันแอดมินจัดผิดโซน เช่น ร้านอาหารไปได้โซนแฟชั่น)
    // BookingRequest ไม่มี userId ผูกไว้ตรงๆ (sellerId ชี้โมเดล Seller ซึ่งระบบสมัครจริงไม่ได้ใช้ ปล่อยเป็น null เสมอ)
    // ข้อมูลประเภทสินค้าจริงอยู่ที่ ShopDetail.productType ของ User จึงต้องเทียบจากเบอร์โทรที่บันทึกไว้ตอนส่งคำขอแทน
    const applicantUser = bookingRequest.phone
        ? await prisma.user.findFirst({ where: { phoneNumber: bookingRequest.phone }, include: { shop: true } })
        : null;
    const applicantProductType = applicantUser?.shop?.productType || null;
    // ถ้าไม่มีข้อมูลประเภทสินค้า (คำขอเก่า/หาผู้ใช้ที่ตรงเบอร์ไม่เจอ) ไม่จำกัด ให้เลือกได้ทุกโซนเหมือนเดิมเพื่อไม่บล็อกแอดมินผิดที่
    let allowedZones = applicantProductType
        ? zoneAccess.allowedZonesFor(applicantProductType).map((z) => String(z).toUpperCase())
        : [];
    // เผื่อกรณีโซนที่ขอมาจริง หรือล็อกที่เคยจัดไว้แล้ว ไม่ตรงกับประเภทสินค้า (ข้อมูลเก่า/ผิดพลาดตั้งแต่ตอนสมัคร)
    // ยังต้องเลือก/ยืนยันล็อกเดิมได้เสมอ ไม่ถูกบล็อกโดยตัวกรองนี้
    if (allowedZones.length) {
        const mustIncludeZones = [requestedZone, ...assignedStallCodes.map((code) => (code.match(/^[A-Z]+/) || [])[0])].filter(Boolean);
        allowedZones = Array.from(new Set([...allowedZones, ...mustIncludeZones]));
    }

    // Booking ที่ผูกกับคำขอนี้มี 1 แถวต่อ 1 ล็อกที่ขอ (ดู POST /booking-stall ใน sellerRoute.js)
    // ดึงมาทั้งแถว (ไม่ใช่แค่นับ) เพื่อโชว์ระยะเวลาเช่า/ค่าไฟ/เครื่องใช้ไฟฟ้า/ยอดรวมให้แอดมินเห็นก่อนจัดแผงจริง
    // ทุกแถวของคำขอเดียวกันมีระยะเวลา/ราคาต่อวันเท่ากันหมด ต่างกันแค่ล็อก จึงอ่านค่าจากแถวแรกพอ
    const requestTag = buildBookingRequestTag(bookingRequest.id);
    const linkedBookings = requestTag
        ? await prisma.booking.findMany({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
        : [];
    const linkedBookingCount = linkedBookings.length;
    const requestedStallCount = Math.max(1, linkedBookingCount, assignedStallCodes.length);
    const bookingDetail = linkedBookings[0] || null;
    const grandTotalAllStalls = linkedBookings.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);

    // ล็อกที่เคยจัดให้คำขอนี้แล้วไม่ถือว่า "จองแล้ว" ในสายตาแอดมินคนนี้ (จะได้เลือกซ้ำ/ยืนยันใหม่ได้)
    const bookedStallsExcludingOwn = bookedStalls.filter((code) => !assignedStallCodes.includes(code));

    return {
        bookingRequest: {
            id: bookingRequest.id,
            shop: bookingRequest.productName,
            sellerName: bookingRequest.sellerName,
            phone: bookingRequest.phone,
            zone: requestedZone,
            zoneText: requestedZone ? `โซน ${requestedZone}` : '-',
            note: stripInternalTags(bookingRequest.description) || '-',
            cornerZoneNote: extractCornerZoneNote(bookingRequest.description),
            productImage: bookingRequest.productImage || null,
            productTypeText: PRODUCT_TYPE_LABEL[applicantProductType] || '-',
            dateText: toThaiDate(bookingRequest.createdAt),
            status: String(bookingRequest.status || 'PENDING').toUpperCase(),
            rentalDays: bookingDetail?.rentalDays ?? null,
            rentalPeriodText: bookingDetail?.rentalStartDate && bookingDetail?.rentalEndDate
                ? `${toThaiDate(bookingDetail.rentalStartDate)} - ${toThaiDate(bookingDetail.rentalEndDate)}`
                : '-',
            dailyStallPrice: bookingDetail?.dailyStallPrice ?? null,
            lightEnabled: !!bookingDetail?.lightEnabled,
            smallApplianceCount: bookingDetail?.smallApplianceCount ?? 0,
            largeApplianceCount: bookingDetail?.largeApplianceCount ?? 0,
            grandTotalAllStalls,
            assignedStallCode,
            assignedStallCodes,
            requestedStallCount,
            allowedZones
        },
        zoneByCode,
        bookedStalls: bookedStallsExcludingOwn
    };
}

exports.getApprovalsPage = async (req, res) => {
    try {
        const currentRoundMeta = getBookingRoundMetaForDate(new Date());
        const requestedRound = req.query.round ? Number(req.query.round) : currentRoundMeta.roundNumber;
        const selectedRoundNumber = Number.isInteger(requestedRound) && requestedRound > 0 ? requestedRound : currentRoundMeta.roundNumber;
        const selectedRoundWindow = getRoundWindow(selectedRoundNumber);

        const allRequests = await prisma.bookingRequest.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const bookingRequests = allRequests.filter((request) => {
            const createdAt = new Date(request.createdAt);
            if (Number.isNaN(createdAt.getTime())) {
                return false;
            }
            return createdAt >= selectedRoundWindow.cycleStart && createdAt <= selectedRoundWindow.cycleEnd;
        });

        const sellerNames = Array.from(
            new Set(
                bookingRequests
                    .map((request) => String(request.sellerName || '').trim())
                    .filter(Boolean)
            )
        );

        const sellerProfiles = sellerNames.length
            ? await prisma.user.findMany({
                where: { name: { in: sellerNames } },
                select: {
                    name: true,
                    shop: {
                        select: {
                            productImage: true,
                            shopCoverImage: true
                        }
                    }
                }
            })
            : [];

        const sellerImageMap = new Map();
        sellerProfiles.forEach((profile) => {
            const sellerName = String(profile.name || '').trim();
            if (!sellerName || sellerImageMap.has(sellerName)) {
                return;
            }
            sellerImageMap.set(
                sellerName,
                profile.shop?.productImage || profile.shop?.shopCoverImage || null
            );
        });

        const zoneCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
        const statusCounts = { PENDING: 0, IN_PROGRESS: 0, SUCCESS: 0, APPROVED: 0, REJECTED: 0 };

        // Join ข้อมูลการจองจริง (วันที่/จำนวนวัน/ราคา ฯลฯ) เข้ากับคำขอ — ผูกด้วย tag เดียวกับที่
        // confirmBookingStall ใช้คำนวณราคาจริง และที่ extend-lock ใช้หา "ล็อกที่กำลังใช้อยู่"
        // ดึงเป็นก้อนเดียวแทนการ query ทีละคำขอ (N+1) โดยจำกัดช่วงเวลาตามรอบที่กำลังดูอยู่
        const bookingsInRound = await prisma.booking.findMany({
            where: {
                storeDetailSnapshot: { startsWith: BOOKING_REQUEST_TAG_PREFIX },
                createdAt: { gte: selectedRoundWindow.cycleStart, lte: addDays(selectedRoundWindow.cycleEnd, 1) }
            },
            select: {
                storeDetailSnapshot: true,
                rentalStartDate: true,
                rentalEndDate: true,
                rentalDays: true,
                stallCount: true,
                dailyStallPrice: true,
                grandTotal: true,
                smallApplianceCount: true,
                largeApplianceCount: true
            }
        });

        const bookingByRequestId = new Map();
        bookingsInRound.forEach((booking) => {
            const match = String(booking.storeDetailSnapshot || '').match(/^\[BOOKING_REQUEST_ID:(\d+)\]/);
            if (match) {
                bookingByRequestId.set(Number.parseInt(match[1], 10), booking);
            }
        });

        const bookingRows = bookingRequests.map((request) => {
            const zoneCode = String(request.zone || '').trim().toUpperCase();
            const statusCode = String(request.status || 'PENDING').toUpperCase();
            const assignedStallCode = String(request.assignedStallCode || extractAssignedStallFromDescription(request.description) || '').trim().toUpperCase();
            const createdAtText = new Date(request.createdAt).toLocaleDateString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: '2-digit'
            });
            const linkedBooking = bookingByRequestId.get(request.id) || null;
            const extendOfRequestId = extractExtendOfRequestId(request.description);
            const cornerZoneNote = extractCornerZoneNote(request.description);

            if (zoneCode && zoneCounts[zoneCode] !== undefined) {
                zoneCounts[zoneCode] += 1;
            }

            if (statusCounts[statusCode] !== undefined) {
                statusCounts[statusCode] += 1;
            }

            return {
                id: request.id,
                productName: request.productName,
                description: stripInternalTags(request.description),
                sellerName: request.sellerName,
                phone: request.phone,
                zone: zoneCode,
                zoneLabel: zoneCode ? `โซน ${zoneCode}` : 'ไม่ระบุโซน',
                status: statusCode.toLowerCase(),
                statusLabel:
                    statusCode === 'APPROVED'
                        ? 'อนุมัติแล้ว'
                        : statusCode === 'REJECTED'
                            ? 'ปฏิเสธ'
                            : statusCode === 'IN_PROGRESS'
                                ? 'จัดล็อกแล้ว รอชำระเงิน'
                                : statusCode === 'SUCCESS'
                                    ? 'ชำระเงินแล้ว'
                                    : 'รออนุมัติ',
                createdAtText,
                createdAtRaw: request.createdAt,
                assignedStallCode,
                paymentSlipImage: request.paymentSlipImage || null,
                paymentConfirmedAt: request.paymentConfirmedAt || null,
                slipVerified: typeof request.slipVerified === 'boolean' ? request.slipVerified : null,
                slipVerifyReason: request.slipVerifyReason || null,
                productImage: request.productImage || sellerImageMap.get(String(request.sellerName || '').trim()) || null,
                isExtension: Boolean(extendOfRequestId),
                extendOfRequestId,
                cornerZoneNote,
                requestedStallCount: linkedBooking ? (linkedBooking.stallCount || 1) : 1,
                isFinalPrice: Boolean(assignedStallCode),
                booking: linkedBooking
                    ? {
                        rentalStartDateText: toThaiDate(linkedBooking.rentalStartDate),
                        rentalEndDateText: toThaiDate(linkedBooking.rentalEndDate),
                        rentalDays: linkedBooking.rentalDays,
                        stallCount: linkedBooking.stallCount,
                        dailyStallPrice: Number(linkedBooking.dailyStallPrice || 0),
                        grandTotal: Number(linkedBooking.grandTotal || 0),
                        smallApplianceCount: linkedBooking.smallApplianceCount || 0,
                        largeApplianceCount: linkedBooking.largeApplianceCount || 0
                    }
                    : null
            };
        });

        const previousRoundNumber = selectedRoundNumber - 1;
        const nextRoundNumber = selectedRoundNumber + 1;
        const isCurrentRound = selectedRoundNumber === currentRoundMeta.roundNumber;
        const isEditable = isCurrentRound;
        const roundSummary = {
            selectedRoundNumber,
            currentRoundNumber: currentRoundMeta.roundNumber,
            previousRoundNumber,
            nextRoundNumber,
            isCurrentRound,
            isEditable,
            selectedRoundWindow: selectedRoundWindow,
            currentRoundWindow: getRoundWindow(currentRoundMeta.roundNumber)
        };

        res.render('admin/approvals', {
            user: req.user,
            bookingRequests: bookingRows,
            counts: {
                all: bookingRows.length,
                pending: statusCounts.PENDING,
                approved: statusCounts.APPROVED,
                inProgress: statusCounts.IN_PROGRESS,
                success: statusCounts.SUCCESS,
                rejected: statusCounts.REJECTED,
                zones: zoneCounts
            },
            selectedRoundNumber,
            previousRoundNumber,
            nextRoundNumber,
            currentRoundNumber: currentRoundMeta.roundNumber,
            roundMeta: selectedRoundWindow,
            isCurrentRound,
            isEditable,
            error: req.query.error || null,
            errorReason: req.query.reason || null,
            errorRequestId: req.query.requestId || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.render('admin/dashboard', {
            user: req.user,
            error: "ไม่สามารถดึงข้อมูลรายการอนุมัติได้"
        });
    }
};

exports.confirmApproval = async (req, res) => {
    const { requestId, status } = req.body;
    try {
        const normalizedStatus = String(status || '').toUpperCase();
        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(normalizedStatus)) {
            return res.redirect('/admin/approvals?error=invalid_status');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: parseInt(requestId) }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        const requestRoundNumber = getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber;
        if (!isRoundEditable(requestRoundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        // ปุ่มนี้ใช้แค่ตอนคำขอยังไม่ได้จัดล็อก (PENDING/APPROVED) — ถ้าจัดล็อกไปแล้ว (IN_PROGRESS/SUCCESS)
        // ต้องปฏิเสธผ่าน rejectBookingStall เท่านั้น เพราะจุดนั้นปล่อยล็อกที่จัดไว้คืนด้วย ตรงนี้ทำแค่
        // เปลี่ยน status เฉยๆ ไม่แตะ Stall เลย ถ้าปล่อยให้เรียกได้จะทิ้งล็อกค้างสถานะ BOOKED แบบไม่มีเจ้าของ
        const currentStatus = String(requestRecord.status || '').toUpperCase();
        if (!['PENDING', 'APPROVED'].includes(currentStatus)) {
            return res.redirect('/admin/approvals?error=invalid_state_transition');
        }

        await prisma.bookingRequest.update({
            where: { id: parseInt(requestId) },
            data: { status: normalizedStatus }
        });
        res.redirect('/admin/approvals?success=status_updated');
    } catch (err) {
        res.redirect('/admin/approvals?error=update_failed');
    }
};

// แอดมินตรวจสลิปโอนเงินที่ผู้ขายส่งมาแล้วกดยืนยัน — จุดเดียวที่ทำให้ status เป็น SUCCESS
// และตั้ง paymentConfirmedAt ซึ่งเป็นเงื่อนไขที่ระบบใช้เปิดเผยเลขล็อกให้ลูกค้าเห็น
// (ก่อนหน้านี้ไม่มีปุ่มนี้เลย ทำให้สถานะค้างที่ IN_PROGRESS และเลขล็อกไม่ถูกเปิดเผยตลอดไป)
exports.confirmPayment = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        if (!requestId) {
            return res.redirect('/admin/approvals?error=missing_request_id');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (!isRoundEditable(getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        if (String(requestRecord.status || '').toUpperCase() !== 'IN_PROGRESS' || !requestRecord.paymentSlipImage) {
            return res.redirect('/admin/approvals?error=no_slip_to_confirm');
        }

        // ตรวจสลิปอัตโนมัติผ่าน SlipOK ก่อนยืนยัน (ถ้าตั้งค่า SLIPOK_API_KEY ไว้) — เทียบยอดในสลิป
        // กับราคาจริงของการจอง (Booking ที่ผูกด้วย tag เดียวกับที่ confirmBookingStall ใช้คำนวณราคา)
        // ปกติผลตรวจถูกเก็บไว้แล้วตั้งแต่ตอน /booking-payment/confirm อัปโหลดสลิป (กันยิง API ซ้ำ) —
        // ยิงใหม่เฉพาะกรณีไม่มีผลเก็บไว้เลย (slipVerified === null เช่นตอนอัปโหลด SlipOK ยังไม่ได้ตั้งค่า)
        const force = String(req.body.force || '') === '1';
        if (!force) {
            let verifyResult = requestRecord.slipVerified === null
                ? null
                : { ok: requestRecord.slipVerified, reason: requestRecord.slipVerifyReason, amount: requestRecord.slipVerifiedAmount };

            if (verifyResult === null) {
                const requestTag = buildBookingRequestTag(requestId);
                const linkedBooking = requestTag
                    ? await prisma.booking.findFirst({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
                    : null;
                const expectedAmount = linkedBooking ? Number(linkedBooking.grandTotal || 0) : null;
                verifyResult = await verifySlip(requestRecord.paymentSlipImage, expectedAmount);
            }

            if (verifyResult && verifyResult.ok === false) {
                const reason = encodeURIComponent(verifyResult.reason || 'ตรวจสลิปไม่ผ่าน');
                return res.redirect(`/admin/approvals?error=slip_verification_failed&reason=${reason}&requestId=${requestId}`);
            }
        }

        await prisma.bookingRequest.update({
            where: { id: requestId },
            data: {
                status: 'SUCCESS',
                paymentConfirmedAt: new Date()
            }
        });

        // Booking ที่ผูกกับคำขอนี้ต้องตามสถานะไปเป็น SUCCESS ด้วย ไม่งั้นหน้า seller
        // dashboard/booking-status/booking-history จะยังค้างแสดงว่า "รอดำเนินการ" ทั้งที่จ่ายเงินจบแล้ว
        const successRequestTag = buildBookingRequestTag(requestId);
        if (successRequestTag) {
            await prisma.booking.updateMany({
                where: { storeDetailSnapshot: { startsWith: successRequestTag } },
                data: { status: 'SUCCESS' }
            });
        }

        // จ่ายเงินสำเร็จ = ได้ล็อกจริงแล้ว เลื่อนสถานะลูกค้าทั่วไปเป็นผู้ขาย (ไม่แตะ ADMIN/STAFF/SELLER เดิม)
        const paidRequestTag = buildBookingRequestTag(requestId);
        if (paidRequestTag) {
            const paidBooking = await prisma.booking.findFirst({
                where: { storeDetailSnapshot: { startsWith: paidRequestTag } },
                select: { userId: true, zoneCode: true, selectedZoneLabel: true }
            });
            const paidZoneLabel = paidBooking?.selectedZoneLabel || (paidBooking?.zoneCode ? `โซน ${paidBooking.zoneCode}` : null);
            if (paidBooking?.userId) {
                await prisma.user.updateMany({
                    where: { id: paidBooking.userId, role: 'CUSTOMER' },
                    data: { role: 'SELLER' }
                });

                // ซิงก์ข้อมูลร้านค้าเข้า ShopDetail จากใบสมัคร (SellerApplication) ตัวล่าสุดของผู้ใช้นี้
                // เส้นทางนี้ (จองแผงเอง -> แอดมินยืนยันสลิป) ผู้ใช้อาจยังไม่ผ่าน /admin/seller-applications
                // มาก่อน (isSellerOrApplicant อนุญาตให้จองได้ตั้งแต่ใบสมัครยังรอตรวจสอบ) การยืนยันจ่ายเงินสำเร็จ
                // ของแอดมินในเส้นทางนี้จึงถือเป็นการอนุมัติโดยพฤตินัย — ไม่ปล่อยให้ผู้ขายกรอกชื่อร้าน/
                // ประเภทสินค้าเองใหม่ใน /shop-profile จนไม่ตรงกับที่สมัครมา
                const latestApplication = await prisma.sellerApplication.findFirst({
                    where: { userId: paidBooking.userId },
                    orderBy: { createdAt: 'desc' }
                });
                if (latestApplication) {
                    if (String(latestApplication.status || '').toUpperCase() === 'PENDING') {
                        await prisma.sellerApplication.update({
                            where: { id: latestApplication.id },
                            data: { status: 'APPROVED', reviewedAt: new Date() }
                        });
                    }
                    await prisma.shopDetail.upsert({
                        where: { userId: paidBooking.userId },
                        update: {
                            shopName: latestApplication.shopName,
                            productType: latestApplication.productType,
                            productDetail: latestApplication.productDetail,
                            shopCoverImage: latestApplication.shopCoverImage,
                            isVerified: true,
                            ...(paidZoneLabel ? { shopZoneLabel: paidZoneLabel } : {})
                        },
                        create: {
                            userId: paidBooking.userId,
                            shopName: latestApplication.shopName,
                            productType: latestApplication.productType,
                            productDetail: latestApplication.productDetail,
                            shopCoverImage: latestApplication.shopCoverImage,
                            isVerified: true,
                            shopZoneLabel: paidZoneLabel || null
                        }
                    });
                } else if (paidZoneLabel) {
                    // ไม่มีใบสมัครใหม่ (เช่น ผู้ขายเดิมต่อ/จองล็อกใหม่ในรอบถัดไป) แต่มี ShopDetail อยู่แล้ว
                    // ก็ยังต้องอัปเดตโซนให้ตรงกับล็อกล่าสุดที่จ่ายเงินจริง
                    await prisma.shopDetail.updateMany({
                        where: { userId: paidBooking.userId },
                        data: { shopZoneLabel: paidZoneLabel }
                    });
                }
            }
        }

        return res.redirect('/admin/approvals?success=payment_confirmed');
    } catch (err) {
        return res.redirect('/admin/approvals?error=confirm_payment_failed');
    }
};

// แอดมินตรวจแล้วพบว่าสลิปที่ผู้ขายส่งมาไม่ถูกต้อง (ยอดผิด/สลิปคนละคน/รูปไม่ชัด ฯลฯ)
// ต่างจาก rejectBookingStall (ปฏิเสธทั้งคำขอ ปล่อยล็อกคืน) ตรงนี้แค่ล้างสลิปเดิมทิ้ง
// เก็บล็อกที่จัดให้ไว้เหมือนเดิม (status ยังเป็น IN_PROGRESS) ให้ผู้ขายอัปโหลดสลิปใหม่ได้
exports.rejectPaymentSlip = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        const reason = String(req.body.reason || '').trim();
        if (!requestId) {
            return res.redirect('/admin/approvals?error=missing_request_id');
        }
        if (!reason) {
            return res.redirect('/admin/approvals?error=missing_reject_slip_reason');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (!isRoundEditable(getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        if (String(requestRecord.status || '').toUpperCase() !== 'IN_PROGRESS' || !requestRecord.paymentSlipImage) {
            return res.redirect('/admin/approvals?error=no_slip_to_confirm');
        }

        // ลบไฟล์สลิปเดิมออกจากดิสก์ กันไฟล์ค้างไม่มีใครอ้างถึง
        const relativePath = String(requestRecord.paymentSlipImage || '').replace(/^\/+/, '');
        const absolutePath = path.join(__dirname, '..', 'public', relativePath);
        fs.unlink(absolutePath, () => {});

        await prisma.bookingRequest.update({
            where: { id: requestId },
            data: {
                paymentSlipImage: null,
                slipVerified: null,
                slipVerifiedAmount: null,
                slipVerifyReason: `[แอดมินปฏิเสธสลิป] ${reason}`
            }
        });

        return res.redirect('/admin/approvals?success=slip_rejected');
    } catch (err) {
        return res.redirect('/admin/approvals?error=reject_slip_failed');
    }
};

exports.getBookingStallPage = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.query.requestId, 10);
        if (!requestId) {
            return res.redirect('/admin/approvals?error=missing_request_id');
        }

        const pageData = await buildAdminBookingStallPageData(requestId);
        if (!pageData) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        return res.render('admin/booking_stall', {
            user: req.user,
            pageData
        });
    } catch (err) {
        return res.redirect('/admin/approvals?error=load_booking_stall_failed');
    }
};

exports.confirmBookingStall = async (req, res) => {
    let stallUnavailableCode = null;
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        // selectedStalls: comma-separated stall codes จากหน้า booking_stall.ejs (รองรับคำขอที่ขอมากกว่า 1 ล็อก)
        // ยังรับ selectedStall เดิมไว้เผื่อ form เก่า/ค้าง cache
        const selectedStalls = parseStallCodes(req.body.selectedStalls || req.body.selectedStall);
        if (!requestId || !selectedStalls.length) {
            return res.redirect('/admin/approvals?error=missing_confirm_payload');
        }
        if (new Set(selectedStalls).size !== selectedStalls.length) {
            return res.redirect('/admin/approvals?error=duplicate_stall_selected');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: { id: true, createdAt: true, description: true, assignedStallCode: true }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (!isRoundEditable(getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        const requestTag = buildBookingRequestTag(requestId);
        // มี Booking 1 แถวต่อ 1 ล็อกที่ขอ (ดู POST /booking-stall ใน sellerRoute.js ที่สร้าง Booking
        // วนตามจำนวน stallCount) จำนวนแถวที่ผูกกับคำขอนี้จึงบอกว่าต้องเลือกกี่ล็อกจริงบนแผนที่
        const linkedBookings = requestTag
            ? await prisma.booking.findMany({ where: { storeDetailSnapshot: { startsWith: requestTag } }, orderBy: { id: 'asc' } })
            : [];
        const requestedStallCount = Math.max(1, linkedBookings.length);

        if (selectedStalls.length !== requestedStallCount) {
            return res.redirect('/admin/approvals?error=stall_count_mismatch');
        }

        const previousAssigned = parseStallCodes(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description));
        const stallsToRelease = previousAssigned.filter((code) => !selectedStalls.includes(code));
        const cleanedDescription = String(requestRecord.description || '').replace(/^\[ASSIGNED_STALL:[^\]]+\]\s*/i, '').trim();

        const joinedAssignedStallCode = joinStallCodes(selectedStalls);

        // เช็คความว่างของล็อก + ล็อกแถว (FOR UPDATE) และคำนวณราคาไว้ในทรานแซกชันเดียวกับที่เขียนจริง
        // กันสองคำขอ (สองแอดมิน/ดับเบิลคลิก) ผ่านเช็คว่างพร้อมกันแล้วชิงล็อกเดียวกันได้สำเร็จทั้งคู่ (double-booking)
        await prisma.$transaction(async (tx) => {
            const lockedStalls = await tx.$queryRaw`
                SELECT id, stallCode, isAvailable, status, basePrice, extraPrice, electricFeePerDay, extraElectricityCost
                FROM Stall WHERE stallCode IN (${Prisma.join(selectedStalls)}) FOR UPDATE
            `;
            const stallByCode = new Map(lockedStalls.map((s) => [s.stallCode, s]));

            for (const code of selectedStalls) {
                const stall = stallByCode.get(code);
                if (!stall) {
                    stallUnavailableCode = 'stall_not_found';
                    throw new Error('ROLLBACK_STALL_CHECK');
                }
                const isAlreadyBooked = !stall.isAvailable || String(stall.status || '').toUpperCase() !== 'AVAILABLE';
                // ล็อกที่คำขอนี้ถืออยู่แล้วจากการจัดครั้งก่อน ไม่ถือว่า "ไม่ว่าง" สำหรับคำขอนี้เอง (จัดใหม่/ยืนยันซ้ำได้)
                if (isAlreadyBooked && !previousAssigned.includes(code)) {
                    stallUnavailableCode = 'stall_unavailable';
                    throw new Error('ROLLBACK_STALL_CHECK');
                }
            }

            // ราคาที่เห็นตอนแจ้งความสนใจเป็นแค่ราคาต่ำสุดของทั้งโซน (ประมาณการ) ไม่ใช่ราคาจริง
            // ของล็อกที่จะได้ — ราคาจริงขึ้นกับตำแหน่งล็อกที่แอดมินเลือกให้ (Stall.basePrice + extraPrice)
            // ขอมากกว่า 1 ล็อก แต่ละล็อกอาจราคาไม่เท่ากัน จึงเฉลี่ยราคาต่อล็อกจากผลรวมของทุกล็อกที่เลือกจริง
            // (Booking แต่ละแถวเก็บราคา/ยอดรวมชุดเดียวกันซ้ำกันทุกแถว ตามดีไซน์เดิมที่หน้า seller
            // อ่านแค่แถวเดียว (findFirst) มาแสดงเป็นยอดรวมทั้งคำขอ)
            const totalDailyStallPrice = selectedStalls.reduce((sum, code) => {
                const stall = stallByCode.get(code);
                return sum + Number(stall.basePrice || 0) + Number(stall.extraPrice || 0);
            }, 0);
            const totalDailyLightPrice = selectedStalls.reduce((sum, code) => {
                const stall = stallByCode.get(code);
                return sum + Number(stall.electricFeePerDay || 0) + Number(stall.extraElectricityCost || 0);
            }, 0);
            const averageDailyStallPrice = totalDailyStallPrice / selectedStalls.length;
            const averageDailyLightPrice = totalDailyLightPrice / selectedStalls.length;

            await tx.bookingRequest.update({
                where: { id: requestId },
                data: {
                    // IN_PROGRESS = จัดล็อกให้แล้ว รอผู้ขายอัปโหลดสลิปโอนเงิน (ดู getBookingStep/getBookingStatusText)
                    // เดิม field นี้ตั้งเป็น 'APPROVED' ทำให้ /booking-payment/confirm ที่เช็คว่าต้องเป็น
                    // IN_PROGRESS ก่อนถึงจะอัปโหลดสลิปได้ ไม่มีทางถูกเข้าถึงเลย
                    status: 'IN_PROGRESS',
                    assignedStallCode: joinedAssignedStallCode,
                    description: cleanedDescription
                }
            });

            for (const code of selectedStalls) {
                const stall = stallByCode.get(code);
                await tx.stall.update({
                    where: { id: stall.id },
                    data: { isAvailable: false, status: 'BOOKED' }
                });
            }

            if (stallsToRelease.length) {
                await tx.stall.updateMany({
                    where: { stallCode: { in: stallsToRelease } },
                    data: { isAvailable: true, status: 'AVAILABLE' }
                });
            }

            // Booking (ตัวที่หน้า seller dashboard/booking-status/booking-history อ่าน) ต้อง
            // ตามสถานะจริงของ BookingRequest ไปด้วย — เดิมโค้ดจุดนี้อัปเดตแค่ราคา ทำให้ Booking.status
            // ค้างที่ PENDING ตลอดแม้แอดมินจะจัดล็อกและยืนยันจ่ายเงินแล้วจริงๆ ก็ตาม
            for (let i = 0; i < linkedBookings.length; i += 1) {
                const booking = linkedBookings[i];
                const code = selectedStalls[i % selectedStalls.length];

                const assignedSlot = await tx.slot.upsert({
                    where: { slotNumber: code },
                    update: { isAvailable: false },
                    create: {
                        slotNumber: code,
                        zone: code.replace(/[0-9].*$/, '') || 'A',
                        price: averageDailyStallPrice,
                        isAvailable: false
                    }
                });

                const rentTotal = averageDailyStallPrice * booking.stallCount * booking.rentalDays;
                const lightTotal = booking.lightEnabled ? averageDailyLightPrice * booking.stallCount * booking.rentalDays : 0;
                const grandTotal = rentTotal + lightTotal + booking.applianceTotal;

                await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        dailyStallPrice: averageDailyStallPrice,
                        lightUnitPrice: averageDailyLightPrice,
                        rentTotal,
                        lightTotal,
                        grandTotal,
                        status: 'IN_PROGRESS',
                        slotId: assignedSlot.id
                    }
                });
            }
        });

        return res.redirect('/admin/approvals?success=stall_assigned');
    } catch (err) {
        if (stallUnavailableCode) {
            return res.redirect(`/admin/approvals?error=${stallUnavailableCode}`);
        }
        return res.redirect('/admin/approvals?error=confirm_booking_stall_failed');
    }
};

exports.rejectBookingStall = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        if (!requestId) {
            return res.redirect('/admin/approvals?error=missing_request_id');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: { id: true, createdAt: true, description: true, assignedStallCode: true }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (!isRoundEditable(getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        // ถ้าแอดมินเคยจัดล็อกให้แล้ว (สถานะ IN_PROGRESS) แล้วมาปฏิเสธทีหลัง ต้องปล่อยล็อกจริงทุกล็อก
        // ที่จัดไว้กลับเป็นว่างด้วย ไม่งั้นล็อกจะค้างสถานะ BOOKED ตลอดไปโดยไม่มีเจ้าของ
        const stallCodesToRelease = parseStallCodes(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description));

        await prisma.bookingRequest.update({
            where: { id: requestId },
            data: {
                status: 'REJECTED',
                assignedStallCode: null
            }
        });

        if (stallCodesToRelease.length) {
            await prisma.stall.updateMany({
                where: { stallCode: { in: stallCodesToRelease } },
                data: { isAvailable: true, status: 'AVAILABLE' }
            });
        }

        const rejectedRequestTag = buildBookingRequestTag(requestId);
        if (rejectedRequestTag) {
            await prisma.booking.updateMany({
                where: { storeDetailSnapshot: { startsWith: rejectedRequestTag } },
                data: { status: 'REJECTED' }
            });
        }

        return res.redirect('/admin/approvals?success=request_rejected');
    } catch (err) {
        return res.redirect('/admin/approvals?error=reject_booking_stall_failed');
    }
};