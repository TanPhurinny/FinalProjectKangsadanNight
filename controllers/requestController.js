const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getRequestsPage = async (req, res) => {
    try {
        const bookings = await prisma.booking.findMany({
            include: {
                user: { select: { name: true, phoneNumber: true } },
                slot: { select: { slotNumber: true, zone: true, price: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const requestRows = bookings.map((booking) => {
            const statusCode = String(booking.status || 'PENDING').toUpperCase();
            const createdAtText = new Date(booking.createdAt).toLocaleString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            return {
                id: booking.id,
                zone: booking.zoneCode || booking.slot?.zone || '-',
                zoneLabel: booking.selectedZoneLabel || (booking.zoneCode ? `โซน ${booking.zoneCode}` : `โซน ${booking.slot?.zone || '-'}`),
                slotNumber: booking.slot?.slotNumber || '-',
                sellerName: booking.user?.name || 'ไม่ระบุ',
                phone: booking.user?.phoneNumber || '-',
                status: statusCode,
                statusLabel:
                    statusCode === 'APPROVED'
                        ? 'อนุมัติแล้ว'
                        : statusCode === 'REJECTED'
                            ? 'ปฏิเสธ'
                            : 'รออนุมัติ',
                createdAtText,
                rentalStartDate: booking.rentalStartDate,
                rentalEndDate: booking.rentalEndDate,
                rentalDays: booking.rentalDays,
                stallCount: booking.stallCount,
                dailyStallPrice: booking.dailyStallPrice,
                grandTotal: booking.grandTotal,
                storeDetailSnapshot: booking.storeDetailSnapshot || '',
                lightEnabled: booking.lightEnabled,
                smallApplianceCount: booking.smallApplianceCount,
                largeApplianceCount: booking.largeApplianceCount
            };
        });

        const counts = {
            all: requestRows.length,
            pending: requestRows.filter((booking) => booking.status === 'PENDING').length,
            approved: requestRows.filter((booking) => booking.status === 'APPROVED').length,
            rejected: requestRows.filter((booking) => booking.status === 'REJECTED').length
        };

        res.render('admin/requests', { 
            user: req.user,
            requests: requestRows,
            counts,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.redirect('/admin/dashboard?error=db_error');
    }
};

exports.updateStatus = async (req, res) => {
    const { id, status } = req.body;
    try {
        const normalizedStatus = String(status || '').toUpperCase();
        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(normalizedStatus)) {
            return res.redirect('/admin/requests?error=invalid_status');
        }

        await prisma.booking.update({ 
            where: { id: parseInt(id) }, 
            data: { status: normalizedStatus } 
        });
        res.redirect('/admin/requests?success=updated');
    } catch (err) {
        res.redirect('/admin/requests?error=update_failed');
    }
};