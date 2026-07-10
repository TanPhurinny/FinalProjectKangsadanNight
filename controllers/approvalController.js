const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

async function buildAdminBookingStallPageData(requestId) {
    const bookingRequest = await prisma.bookingRequest.findUnique({
        where: { id: requestId }
    });

    if (!bookingRequest) {
        return null;
    }

    const zoneRows = await prisma.zoneRow.findMany({
        include: {
            zone: {
                select: {
                    code: true,
                    name: true
                }
            },
            stalls: {
                select: {
                    stallCode: true,
                    isAvailable: true,
                    status: true
                },
                orderBy: { displayOrder: 'asc' }
            }
        },
        orderBy: [{ zoneId: 'asc' }, { displayOrder: 'asc' }]
    });

    const layoutByZone = {};
    const allStalls = [];
    for (const row of zoneRows) {
        const zoneCode = normalizeZone(row.zone?.code);
        if (!zoneCode) continue;

        if (!layoutByZone[zoneCode]) {
            layoutByZone[zoneCode] = [];
        }

        const minDisplay = row.stallStartNumber || 1;
        const maxDisplay = row.stallEndNumber || row.stalls.length || 1;
        const slotCount = Math.max(0, maxDisplay - minDisplay + 1);

        layoutByZone[zoneCode].push([row.rowCode, slotCount, minDisplay]);

        row.stalls.forEach((stall) => {
            allStalls.push({
                stallCode: stall.stallCode,
                isBooked: !stall.isAvailable || String(stall.status || '').toUpperCase() !== 'AVAILABLE'
            });
        });
    }

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
        layoutByZone,
        bookedStalls: allStalls.filter((stall) => stall.isBooked).map((stall) => stall.stallCode),
        allStallCodes: allStalls.map((stall) => stall.stallCode)
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
        const statusCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };

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
                        applianceTotal: true
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
                            applianceTotal: true
                        }
                    });
                }
            }

            const smallApplianceCount = Number(linkedBooking?.smallApplianceCount || 0);
            const largeApplianceCount = Number(linkedBooking?.largeApplianceCount || 0);
            const electricityFee = Number(linkedBooking?.lightTotal || 0) + Number(linkedBooking?.applianceTotal || 0);

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
                            : 'รออนุมัติ',
                createdAtText,
                createdAtRaw: request.createdAt,
                assignedStallCode,
                productImage: request.productImage || sellerImageMap.get(String(request.sellerName || '').trim()) || null,
                smallApplianceCount,
                largeApplianceCount,
                electricityFee,
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
                createdAt: true
            }
        });
        if (!requestRecord) {
            return res.redirect('/admin/approvals?error=request_not_found');
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
                    status: 'APPROVED',
                    assignedStallCode: selectedStall,
                    description: cleanedDescription
                }
            });

            if (sellerUserId) {
                const requestTag = buildBookingRequestTag(requestId);
                let pendingBookings = await tx.booking.findMany({
                    where: {
                        userId: sellerUserId,
                        status: 'PENDING',
                        ...(requestTag ? { storeDetailSnapshot: { contains: requestTag } } : {})
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true }
                });

                if (!pendingBookings.length) {
                    pendingBookings = await tx.booking.findMany({
                    where: {
                        userId: sellerUserId,
                        status: 'PENDING',
                        ...(requestedZone ? { zoneCode: requestedZone } : {})
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true }
                });
                }

                if (pendingBookings.length) {
                    const bookingIds = pendingBookings.map((item) => item.id);

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
                        status: 'AVAILABLE'
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