const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildZonesData } = require('./marketController');

const { toStartOfDay, addDays, getBookingRoundMetaForDate, getRoundWindow, isRoundEditable } = require('../utils/bookingRound');

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

    return {
        bookingRequest: {
            id: bookingRequest.id,
            shop: bookingRequest.productName,
            sellerName: bookingRequest.sellerName,
            phone: bookingRequest.phone,
            zone: requestedZone,
            zoneText: requestedZone ? `โซน ${requestedZone}` : '-',
            note: bookingRequest.description || '-',
            dateText: toThaiDate(bookingRequest.createdAt),
            status: String(bookingRequest.status || 'PENDING').toUpperCase(),
            assignedStallCode
        },
        zoneByCode,
        bookedStalls
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
        const statusCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };

        const bookingRows = bookingRequests.map((request) => {
            const zoneCode = String(request.zone || '').trim().toUpperCase();
            const statusCode = String(request.status || 'PENDING').toUpperCase();
            const assignedStallCode = String(request.assignedStallCode || extractAssignedStallFromDescription(request.description) || '').trim().toUpperCase();
            const createdAtText = new Date(request.createdAt).toLocaleDateString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: '2-digit'
            });

            if (zoneCode && zoneCounts[zoneCode] !== undefined) {
                zoneCounts[zoneCode] += 1;
            }

            if (statusCounts[statusCode] !== undefined) {
                statusCounts[statusCode] += 1;
            }

            return {
                id: request.id,
                productName: request.productName,
                description: request.description,
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
                productImage: request.productImage || sellerImageMap.get(String(request.sellerName || '').trim()) || null
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

        await prisma.bookingRequest.update({
            where: { id: requestId },
            data: {
                status: 'SUCCESS',
                paymentConfirmedAt: new Date()
            }
        });

        return res.redirect('/admin/approvals?success=payment_confirmed');
    } catch (err) {
        return res.redirect('/admin/approvals?error=confirm_payment_failed');
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
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        const selectedStall = String(req.body.selectedStall || '').trim().toUpperCase();
        if (!requestId || !selectedStall) {
            return res.redirect('/admin/approvals?error=missing_confirm_payload');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: { id: true, createdAt: true }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (!isRoundEditable(getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        const stall = await prisma.stall.findUnique({
            where: { stallCode: selectedStall },
            select: { id: true, isAvailable: true, status: true, basePrice: true, extraPrice: true, electricFeePerDay: true, extraElectricityCost: true }
        });

        if (!stall) {
            return res.redirect('/admin/approvals?error=stall_not_found');
        }

        const isAlreadyBooked = !stall.isAvailable || String(stall.status || '').toUpperCase() !== 'AVAILABLE';
        if (isAlreadyBooked) {
            return res.redirect('/admin/approvals?error=stall_unavailable');
        }

        const requestPayload = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: { id: true, description: true, assignedStallCode: true }
        });
        if (!requestPayload) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        const previousAssigned = String(requestPayload.assignedStallCode || extractAssignedStallFromDescription(requestPayload.description) || '').trim().toUpperCase();
        const isReassign = Boolean(previousAssigned) && previousAssigned !== selectedStall;

        const previousStall = isReassign
            ? await prisma.stall.findUnique({ where: { stallCode: previousAssigned }, select: { id: true } })
            : null;

        const cleanedDescription = String(requestPayload.description || '').replace(/^\[ASSIGNED_STALL:[^\]]+\]\s*/i, '').trim();

        // ราคาที่เห็นตอนแจ้งความสนใจเป็นแค่ราคาต่ำสุดของทั้งโซน (ประมาณการ) ไม่ใช่ราคาจริง
        // ของล็อกที่จะได้ — ราคาจริงขึ้นกับตำแหน่งล็อกที่แอดมินเลือกให้ (Stall.basePrice + extraPrice)
        // เมื่อแอดมินจัดล็อกจริงแล้ว คำนวณราคาใหม่แล้วอัปเดตกลับเข้า Booking ที่ผูกกับคำขอนี้
        const realDailyStallPrice = Number(stall.basePrice || 0) + Number(stall.extraPrice || 0);
        const realDailyLightPrice = Number(stall.electricFeePerDay || 0) + Number(stall.extraElectricityCost || 0);
        const requestTag = buildBookingRequestTag(requestId);

        await prisma.$transaction(async (tx) => {
            await tx.bookingRequest.update({
                where: { id: requestId },
                data: {
                    // IN_PROGRESS = จัดล็อกให้แล้ว รอผู้ขายอัปโหลดสลิปโอนเงิน (ดู getBookingStep/getBookingStatusText)
                    // เดิม field นี้ตั้งเป็น 'APPROVED' ทำให้ /booking-payment/confirm ที่เช็คว่าต้องเป็น
                    // IN_PROGRESS ก่อนถึงจะอัปโหลดสลิปได้ ไม่มีทางถูกเข้าถึงเลย
                    status: 'IN_PROGRESS',
                    assignedStallCode: selectedStall,
                    description: cleanedDescription
                }
            });

            await tx.stall.update({
                where: { id: stall.id },
                data: {
                    isAvailable: false,
                    status: 'BOOKED'
                }
            });

            if (previousStall?.id) {
                await tx.stall.update({
                    where: { id: previousStall.id },
                    data: {
                        isAvailable: true,
                        status: 'AVAILABLE'
                    }
                });
            }

            if (requestTag) {
                const linkedBookings = await tx.booking.findMany({
                    where: { storeDetailSnapshot: { startsWith: requestTag } }
                });

                for (const booking of linkedBookings) {
                    const rentTotal = realDailyStallPrice * booking.stallCount * booking.rentalDays;
                    const lightTotal = booking.lightEnabled ? realDailyLightPrice * booking.stallCount * booking.rentalDays : 0;
                    const grandTotal = rentTotal + lightTotal + booking.applianceTotal;

                    await tx.booking.update({
                        where: { id: booking.id },
                        data: {
                            dailyStallPrice: realDailyStallPrice,
                            lightUnitPrice: realDailyLightPrice,
                            rentTotal,
                            lightTotal,
                            grandTotal
                        }
                    });
                }
            }
        });

        return res.redirect('/admin/approvals?success=stall_assigned');
    } catch (err) {
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
            select: { id: true, createdAt: true }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (!isRoundEditable(getBookingRoundMetaForDate(requestRecord.createdAt).roundNumber)) {
            return res.redirect('/admin/approvals?error=history_round_locked');
        }

        await prisma.bookingRequest.update({
            where: { id: requestId },
            data: {
                status: 'REJECTED',
                assignedStallCode: null
            }
        });

        return res.redirect('/admin/approvals?success=request_rejected');
    } catch (err) {
        return res.redirect('/admin/approvals?error=reject_booking_stall_failed');
    }
};