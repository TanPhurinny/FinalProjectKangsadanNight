const prisma = require('../config/prismaClient');
const { buildZonesData } = require('./marketController');
const { sendStallAssignedEmail, sendPaymentConfirmedEmail } = require('../config/mailer');

function normalizeZone(zone) {
    return String(zone || '').trim().toUpperCase();
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

function buildBookingRequestTag(requestId) {
    const parsed = Number.parseInt(requestId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return '';
    return `[BOOKING_REQUEST_ID:${parsed}]`;
}

// ใช้ zonesData ชุดเดียวกับหน้า /admin/slots (ผัง Zone/ZoneRow/Stall จริง ปรับให้ตรงกับ
// ตำแหน่งทางกายภาพแล้ว) เพื่อไม่ให้ผังของสองหน้านี้เพี้ยนไปคนละแบบ
async function buildAdminBookingStallPageData(requestId) {
    const bookingRequest = await prisma.bookingRequest.findUnique({
        where: { id: requestId }
    });

    if (!bookingRequest) {
        return null;
    }

    const zonesData = await buildZonesData();
    const zoneByCode = zonesData.reduce((acc, zone) => {
        acc[zone.code] = zone;
        return acc;
    }, {});

    const bookedStalls = [];
    zonesData.forEach((zone) => {
        zone.columns.forEach((column) => {
            column.stalls.forEach((stall) => {
                if (stall.status === 'BOOKED' || stall.status === 'MAINTENANCE') {
                    bookedStalls.push(stall.code);
                }
            });
        });
    });

    // ดึงชื่อร้าน/ผู้ขายของแผงที่จองแล้ว เพื่อแสดงใน tooltip ตอน hover บนผังเดียวกับ /admin/slots
    const approvedRequests = await prisma.bookingRequest.findMany({
        where: { status: { in: ['IN_PROGRESS', 'SUCCESS'] }, assignedStallCode: { not: null } },
        select: {
            productName: true,
            description: true,
            sellerName: true,
            assignedStallCode: true,
            zone: true,
            productImage: true,
            seller: {
                select: {
                    shopName: true,
                    productDetail: true,
                    productImage: true,
                    productType: { select: { name: true } }
                }
            }
        }
    });
    // Seller (sellerId) มักไม่ถูกผูกไว้กับคำขอเก่า จึง fallback ไปหาข้อมูลร้าน (ประเภทสินค้า/
    // รายละเอียด/รูปร้าน) จาก User+ShopDetail ด้วยชื่อผู้ขาย เหมือนที่ /admin/slots ทำอยู่แล้ว
    const missingShopInfoNames = [...new Set(
        approvedRequests.filter((r) => !r.seller?.productType?.name).map((r) => r.sellerName).filter(Boolean)
    )];
    const shopInfoByName = {};
    if (missingShopInfoNames.length) {
        const sellerUsers = await prisma.user.findMany({
            where: { role: 'SELLER', name: { in: missingShopInfoNames } },
            select: { name: true, shop: { select: { productType: true, productDetail: true, productImage: true, shopCoverImage: true } } }
        });
        sellerUsers.forEach((u) => {
            if (u.shop) shopInfoByName[u.name] = u.shop;
        });
    }

    const bookingByStallCode = {};
    approvedRequests.forEach((request) => {
        const stallCode = String(request.assignedStallCode || '').trim().toUpperCase();
        if (!stallCode) return;

        const fallbackShop = shopInfoByName[request.sellerName] || {};
        bookingByStallCode[stallCode] = {
            shop: request.seller?.shopName || request.productName || '-',
            product: request.seller?.productType?.name
                || fallbackShop.productType
                || (request.zone ? `โซน ${String(request.zone).toUpperCase()}` : '-'),
            productDetail: request.seller?.productDetail || fallbackShop.productDetail || request.description || '-',
            image: request.productImage || request.seller?.productImage || fallbackShop.productImage || fallbackShop.shopCoverImage || null,
            name: request.sellerName || '-'
        };
    });

    const requestedZone = normalizeZone(bookingRequest.zone);
    const assignedStallCode = String(bookingRequest.assignedStallCode || extractAssignedStallFromDescription(bookingRequest.description) || '').trim().toUpperCase();

    // ดึงชื่อร้าน/ประเภทสินค้า/รูปร้านของผู้ขายเพิ่ม เพื่อให้แอดมินเห็นชัดว่าร้านนี้ขายอะไร
    // และมีข้อมูลพอตัดสินใจว่าจะจัดลงโซนไหน (ตรงกับที่หน้า /admin/approvals ใช้อยู่แล้ว -
    // ลองหาจาก Seller ก่อน แล้ว fallback ไป User/ShopDetail)
    let shopName = null;
    let productTypeLabel = '-';
    let productDetail = null;
    let productImage = bookingRequest.productImage || null;

    if (bookingRequest.sellerId) {
        const seller = await prisma.seller.findUnique({
            where: { id: bookingRequest.sellerId },
            select: {
                shopName: true,
                productDetail: true,
                productImage: true,
                productType: { select: { name: true } }
            }
        });
        shopName = seller?.shopName || null;
        productDetail = seller?.productDetail || null;
        if (seller?.productType?.name) productTypeLabel = seller.productType.name;
        if (!productImage) productImage = seller?.productImage || null;
    }

    if ((!productImage || !shopName) && bookingRequest.sellerName) {
        const sellerUser = await prisma.user.findFirst({
            where: { role: 'SELLER', name: String(bookingRequest.sellerName).trim() },
            select: { shop: { select: { shopName: true, productDetail: true, productImage: true, shopCoverImage: true, productType: true } } }
        });
        if (sellerUser?.shop) {
            shopName = shopName || sellerUser.shop.shopName || null;
            productDetail = productDetail || sellerUser.shop.productDetail || null;
            productImage = productImage || sellerUser.shop.productImage || sellerUser.shop.shopCoverImage || null;
            if (productTypeLabel === '-' && sellerUser.shop.productType) productTypeLabel = sellerUser.shop.productType;
        }
    }

    return {
        bookingRequest: {
            id: bookingRequest.id,
            shopName: shopName || bookingRequest.productName,
            productName: bookingRequest.productName,
            productDetail: productDetail || bookingRequest.description || '-',
            sellerName: bookingRequest.sellerName,
            phone: bookingRequest.phone,
            zone: requestedZone,
            zoneText: requestedZone ? `โซน ${requestedZone}` : '-',
            note: bookingRequest.description || '-',
            dateText: toThaiDate(bookingRequest.createdAt),
            status: String(bookingRequest.status || 'PENDING').toUpperCase(),
            assignedStallCode,
            productTypeLabel,
            productImage
        },
        zoneByCode,
        bookedStalls,
        bookingByStallCode
    };
}

exports.getApprovalsPage = async (req, res) => {
    try {
        const bookingRequests = await prisma.bookingRequest.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const sellerNames = Array.from(
            new Set(
                bookingRequests
                    .map((request) => String(request.sellerName || '').trim())
                    .filter(Boolean)
            )
        );

        const sellerIds = Array.from(
            new Set(
                bookingRequests
                    .map((request) => Number(request.sellerId || 0))
                    .filter((value) => Number.isInteger(value) && value > 0)
            )
        );

        const sellerProfiles = sellerNames.length
            ? await prisma.user.findMany({
                where: { name: { in: sellerNames } },
                select: {
                    id: true,
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

        const sellerRows = sellerIds.length
            ? await prisma.seller.findMany({
                where: { id: { in: sellerIds } },
                select: { id: true, userId: true }
            })
            : [];

        const sellerIdToUserIdMap = new Map();
        sellerRows.forEach((row) => {
            sellerIdToUserIdMap.set(Number(row.id), Number(row.userId));
        });

        const sellerImageMap = new Map();
        const sellerNameToUserIdMap = new Map();
        sellerProfiles.forEach((profile) => {
            const sellerName = String(profile.name || '').trim();
            if (!sellerName || sellerImageMap.has(sellerName)) {
                return;
            }
            sellerNameToUserIdMap.set(sellerName, Number(profile.id));
            sellerImageMap.set(
                sellerName,
                profile.shop?.productImage || profile.shop?.shopCoverImage || null
            );
        });

        const zoneCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
        const statusCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0, IN_PROGRESS: 0, SUCCESS: 0 };
        let awaitingSlipCount = 0;

        const bookingRows = await Promise.all(bookingRequests.map(async (request) => {
            const zoneCode = String(request.zone || '').trim().toUpperCase();
            const statusCode = String(request.status || 'PENDING').toUpperCase();
            const assignedStallCode = String(request.assignedStallCode || extractAssignedStallFromDescription(request.description) || '').trim().toUpperCase();
            const createdAtText = new Date(request.createdAt).toLocaleDateString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: '2-digit'
            });

            const sellerUserId = sellerIdToUserIdMap.get(Number(request.sellerId || 0))
                || sellerNameToUserIdMap.get(String(request.sellerName || '').trim())
                || null;

            let linkedBooking = null;
            if (sellerUserId) {
                const requestCreatedAt = request.createdAt instanceof Date
                    ? request.createdAt
                    : new Date(request.createdAt);
                const oneDayBefore = new Date(requestCreatedAt.getTime() - (24 * 60 * 60 * 1000));

                linkedBooking = await prisma.booking.findFirst({
                    where: {
                        userId: sellerUserId,
                        ...(zoneCode ? { zoneCode } : {}),
                        createdAt: { gte: oneDayBefore }
                    },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        rentalStartDate: true,
                        rentalEndDate: true,
                        smallApplianceCount: true,
                        largeApplianceCount: true,
                        lightTotal: true,
                        applianceTotal: true,
                        rentTotal: true,
                        grandTotal: true
                    }
                });

                if (!linkedBooking) {
                    linkedBooking = await prisma.booking.findFirst({
                        where: {
                            userId: sellerUserId,
                            ...(zoneCode ? { zoneCode } : {})
                        },
                        orderBy: { createdAt: 'desc' },
                        select: {
                            rentalStartDate: true,
                            rentalEndDate: true,
                            smallApplianceCount: true,
                            largeApplianceCount: true,
                            lightTotal: true,
                            applianceTotal: true,
                            rentTotal: true,
                            grandTotal: true
                        }
                    });
                }
            }

            const smallApplianceCount = Number(linkedBooking?.smallApplianceCount || 0);
            const largeApplianceCount = Number(linkedBooking?.largeApplianceCount || 0);
            const electricityFee = Number(linkedBooking?.lightTotal || 0) + Number(linkedBooking?.applianceTotal || 0);
            const rentTotal = Number(linkedBooking?.rentTotal || 0);
            const grandTotal = Number(linkedBooking?.grandTotal || 0);
            const grandTotalText = linkedBooking ? `${grandTotal.toLocaleString('th-TH')} บาท` : '-';

            if (zoneCode && zoneCounts[zoneCode] !== undefined) {
                zoneCounts[zoneCode] += 1;
            }

            if (statusCounts[statusCode] !== undefined) {
                statusCounts[statusCode] += 1;
            }

            if (statusCode === 'IN_PROGRESS' && request.paymentSlipImage) {
                awaitingSlipCount += 1;
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
                        ? 'ร้านผ่านการตรวจสอบ รอจัดล็อก'
                        : statusCode === 'IN_PROGRESS'
                            ? (request.paymentSlipImage ? 'ผู้ขายส่งสลิปแล้ว รอแอดมินยืนยัน' : 'จัดล็อกแล้ว รอชำระเงิน')
                            : statusCode === 'SUCCESS'
                                ? 'ชำระเงินแล้ว เสร็จสิ้น'
                                : statusCode === 'REJECTED'
                                    ? 'ปฏิเสธ'
                                    : 'รอตรวจสอบร้านค้า',
                createdAtText,
                createdAtRaw: request.createdAt,
                assignedStallCode,
                paymentSlipImage: request.paymentSlipImage || null,
                productImage: request.productImage || sellerImageMap.get(String(request.sellerName || '').trim()) || null,
                smallApplianceCount,
                largeApplianceCount,
                electricityFee,
                rentTotal,
                grandTotal,
                grandTotalText,
                rentalStartDateText: toThaiDate(linkedBooking?.rentalStartDate),
                rentalEndDateText: toThaiDate(linkedBooking?.rentalEndDate)
            };
        }));

        res.render('admin/approvals', { 
            user: req.user, 
            bookingRequests: bookingRows,
            counts: {
                all: bookingRows.length,
                pending: statusCounts.PENDING,
                approved: statusCounts.APPROVED,
                rejected: statusCounts.REJECTED,
                inProgress: statusCounts.IN_PROGRESS - awaitingSlipCount,
                awaitingSlip: awaitingSlipCount,
                success: statusCounts.SUCCESS,
                zones: zoneCounts
            },
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

        await prisma.bookingRequest.update({ 
            where: { id: parseInt(requestId) }, 
            data: { status: normalizedStatus } 
        });
        res.redirect('/admin/approvals?success=status_updated');
    } catch (err) {
        res.redirect('/admin/approvals?error=update_failed');
    }
};

// แอดมินตรวจสอบสลิปโอนเงินที่ผู้ขายแนบมาแล้วกดยืนยัน ระบบจะปิดสถานะเป็น SUCCESS และแจ้งผู้ขายว่าล็อกเป็นของตนแล้ว
// (ก่อนหน้านี้ผู้ขายอัปโหลดสลิปแล้วปิดสถานะเป็น SUCCESS ทันที ไม่มีขั้นตอนให้แอดมินตรวจสอบก่อน)
exports.confirmPayment = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        if (!requestId) {
            return res.redirect('/admin/approvals?error=missing_request_id');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: {
                id: true,
                status: true,
                paymentSlipImage: true,
                paymentConfirmedAt: true,
                sellerId: true,
                sellerName: true,
                assignedStallCode: true,
                description: true
            }
        });

        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        if (String(requestRecord.status || '').toUpperCase() !== 'IN_PROGRESS' || !requestRecord.paymentSlipImage) {
            return res.redirect('/admin/approvals?error=payment_not_awaiting_verification');
        }

        if (requestRecord.paymentConfirmedAt) {
            return res.redirect('/admin/approvals?error=payment_already_confirmed');
        }

        let sellerUserId = null;
        if (requestRecord.sellerId) {
            const seller = await prisma.seller.findUnique({
                where: { id: requestRecord.sellerId },
                select: { userId: true }
            });
            sellerUserId = seller?.userId || null;
        }

        if (!sellerUserId && requestRecord.sellerName) {
            const fallbackUser = await prisma.user.findFirst({
                where: { role: 'SELLER', name: String(requestRecord.sellerName).trim() },
                select: { id: true }
            });
            sellerUserId = fallbackUser?.id || null;
        }

        await prisma.$transaction(async (tx) => {
            await tx.bookingRequest.update({
                where: { id: requestId },
                data: {
                    status: 'SUCCESS',
                    paymentConfirmedAt: new Date()
                }
            });

            if (sellerUserId) {
                const requestTag = buildBookingRequestTag(requestId);
                await tx.booking.updateMany({
                    where: {
                        userId: sellerUserId,
                        status: 'APPROVED',
                        ...(requestTag ? { storeDetailSnapshot: { contains: requestTag } } : {})
                    },
                    data: { status: 'SUCCESS' }
                });
            }
        });

        if (sellerUserId) {
            try {
                const sellerUser = await prisma.user.findUnique({
                    where: { id: sellerUserId },
                    select: { email: true }
                });
                if (sellerUser?.email) {
                    const stallCode = String(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description) || '').trim().toUpperCase();
                    await sendPaymentConfirmedEmail(sellerUser.email, stallCode || '-');
                }
            } catch (mailErr) {
                console.warn('ส่งอีเมลแจ้งยืนยันการชำระเงินไม่สำเร็จ:', mailErr.message);
            }
        }

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

        const shopCheckedStatuses = ['APPROVED', 'IN_PROGRESS', 'SUCCESS'];
        if (!shopCheckedStatuses.includes(pageData.bookingRequest.status)) {
            return res.redirect('/admin/approvals?error=shop_not_verified_yet');
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

        const stall = await prisma.stall.findUnique({
            where: { stallCode: selectedStall },
            select: { id: true, isAvailable: true, status: true }
        });

        if (!stall) {
            return res.redirect('/admin/approvals?error=stall_not_found');
        }

        const isAlreadyBooked = !stall.isAvailable || String(stall.status || '').toUpperCase() !== 'AVAILABLE';
        if (isAlreadyBooked) {
            return res.redirect('/admin/approvals?error=stall_unavailable');
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: {
                id: true,
                description: true,
                assignedStallCode: true,
                sellerId: true,
                sellerName: true,
                zone: true,
                createdAt: true,
                status: true
            }
        });
        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        const assignableStatuses = ['APPROVED', 'IN_PROGRESS'];
        if (!assignableStatuses.includes(String(requestRecord.status || '').toUpperCase())) {
            return res.redirect('/admin/approvals?error=shop_not_verified_yet');
        }

        const selectedSlot = await prisma.slot.findUnique({
            where: { slotNumber: selectedStall },
            select: { id: true }
        });

        let sellerUserId = null;
        if (requestRecord.sellerId) {
            const seller = await prisma.seller.findUnique({
                where: { id: requestRecord.sellerId },
                select: { userId: true }
            });
            sellerUserId = seller?.userId || null;
        }

        if (!sellerUserId) {
            const fallbackUser = await prisma.user.findFirst({
                where: {
                    role: 'SELLER',
                    name: String(requestRecord.sellerName || '').trim()
                },
                select: { id: true }
            });
            sellerUserId = fallbackUser?.id || null;
        }

        const previousAssigned = String(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description) || '').trim().toUpperCase();
        const isReassign = Boolean(previousAssigned) && previousAssigned !== selectedStall;

        const previousStall = isReassign
            ? await prisma.stall.findUnique({ where: { stallCode: previousAssigned }, select: { id: true } })
            : null;

        const cleanedDescription = String(requestRecord.description || '').replace(/^\[ASSIGNED_STALL:[^\]]+\]\s*/i, '').trim();
        const requestedZone = String(requestRecord.zone || '').trim().toUpperCase();
        const zoneLabelWithStall = requestedZone
            ? `โซน ${requestedZone} (ล็อก ${selectedStall})`
            : `ล็อก ${selectedStall}`;

        await prisma.$transaction(async (tx) => {
            await tx.bookingRequest.update({
                where: { id: requestId },
                data: {
                    status: 'IN_PROGRESS',
                    assignedStallCode: selectedStall,
                    description: cleanedDescription
                }
            });

            let rentalStartDate = null;
            let rentalEndDate = null;

            if (sellerUserId) {
                const requestTag = buildBookingRequestTag(requestId);
                let pendingBookings = await tx.booking.findMany({
                    where: {
                        userId: sellerUserId,
                        status: 'PENDING',
                        ...(requestTag ? { storeDetailSnapshot: { contains: requestTag } } : {})
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, rentalStartDate: true, rentalEndDate: true }
                });

                if (!pendingBookings.length) {
                    pendingBookings = await tx.booking.findMany({
                    where: {
                        userId: sellerUserId,
                        status: 'PENDING',
                        ...(requestedZone ? { zoneCode: requestedZone } : {})
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, rentalStartDate: true, rentalEndDate: true }
                });
                }

                if (pendingBookings.length) {
                    const bookingIds = pendingBookings.map((item) => item.id);
                    rentalStartDate = pendingBookings[0].rentalStartDate || null;
                    rentalEndDate = pendingBookings[0].rentalEndDate || null;

                    await tx.booking.updateMany({
                        where: { id: { in: bookingIds } },
                        data: {
                            status: 'APPROVED',
                            selectedZoneLabel: zoneLabelWithStall
                        }
                    });

                    if (selectedSlot?.id) {
                        await tx.booking.update({
                            where: { id: bookingIds[0] },
                            data: { slotId: selectedSlot.id }
                        });
                    }
                }
            }

            await tx.stall.update({
                where: { id: stall.id },
                data: {
                    isAvailable: false,
                    status: 'BOOKED',
                    bookingStartDate: rentalStartDate,
                    bookingEndDate: rentalEndDate
                }
            });

            if (previousStall?.id) {
                await tx.stall.update({
                    where: { id: previousStall.id },
                    data: {
                        isAvailable: true,
                        status: 'AVAILABLE',
                        bookingStartDate: null,
                        bookingEndDate: null
                    }
                });
            }
        });

        if (sellerUserId) {
            try {
                const sellerUser = await prisma.user.findUnique({
                    where: { id: sellerUserId },
                    select: { email: true }
                });
                if (sellerUser?.email) {
                    await sendStallAssignedEmail(sellerUser.email, selectedStall, requestedZone ? `โซน ${requestedZone}` : '');
                }
            } catch (mailErr) {
                console.warn('ส่งอีเมลแจ้งจัดล็อกไม่สำเร็จ:', mailErr.message);
            }
        }

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
            select: { sellerId: true, sellerName: true, assignedStallCode: true, description: true }
        });
        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
        }

        let sellerUserId = null;
        if (requestRecord?.sellerId) {
            const seller = await prisma.seller.findUnique({
                where: { id: requestRecord.sellerId },
                select: { userId: true }
            });
            sellerUserId = seller?.userId || null;
        }

        if (!sellerUserId && requestRecord?.sellerName) {
            const fallbackUser = await prisma.user.findFirst({
                where: {
                    role: 'SELLER',
                    name: String(requestRecord.sellerName || '').trim()
                },
                select: { id: true }
            });
            sellerUserId = fallbackUser?.id || null;
        }

        const assignedStallCode = String(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description) || '').trim().toUpperCase();
        const assignedStall = assignedStallCode
            ? await prisma.stall.findUnique({ where: { stallCode: assignedStallCode }, select: { id: true } })
            : null;

        await prisma.$transaction(async (tx) => {
            await tx.bookingRequest.update({
                where: { id: requestId },
                data: {
                    status: 'REJECTED',
                    assignedStallCode: null
                }
            });

            if (assignedStall?.id) {
                await tx.stall.update({
                    where: { id: assignedStall.id },
                    data: {
                        isAvailable: true,
                        status: 'AVAILABLE',
                        bookingStartDate: null,
                        bookingEndDate: null
                    }
                });
            }

            if (sellerUserId) {
                const requestTag = buildBookingRequestTag(requestId);
                await tx.booking.updateMany({
                    where: {
                        userId: sellerUserId,
                        status: { in: ['PENDING', 'APPROVED'] },
                        ...(requestTag ? { storeDetailSnapshot: { contains: requestTag } } : {})
                    },
                    data: {
                        status: 'REJECTED'
                    }
                });
            }
        });

        return res.redirect('/admin/approvals?success=request_rejected');
    } catch (err) {
        return res.redirect('/admin/approvals?error=reject_booking_stall_failed');
    }
};