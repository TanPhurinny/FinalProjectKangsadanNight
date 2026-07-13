const prisma = require('../config/prismaClient');

const ZONE_CATEGORY_META = {
    FASHION: { icon: 'fa-shirt', description: 'โซนแฟชั่น' },
    FOOD: { icon: 'fa-utensils', description: 'โซนอาหาร' },
    EVENT_BOOTH: { icon: 'fa-store', description: 'โซนกิจกรรม/บูธพิเศษ' }
};

// ดึงสถิติจริงจากระบบผังตลาดปัจจุบัน (Zone/ZoneRow/Stall) ไม่ใช่ตาราง Slot รุ่นเก่าที่เลิกใช้แล้ว
// เพราะการจองแผงจริงตอนนี้ทำผ่าน /select-zone → /booking-stall ซึ่งอัปเดตสถานะที่ตาราง Stall
exports.getDashboardPage = async (req, res) => {
    try {
        const [
            totalStalls,
            bookedStalls,
            availableStalls,
            maintenanceStalls,
            pendingRepairs,
            totalRepairs,
            pendingRequests,
            totalAnnouncements,
            sellerCount,
            zoneList
        ] = await Promise.all([
            prisma.stall.count(),
            prisma.stall.count({ where: { status: 'BOOKED' } }),
            prisma.stall.count({ where: { status: 'AVAILABLE' } }),
            prisma.stall.count({ where: { status: 'MAINTENANCE' } }),
            prisma.maintenanceReport.count({ where: { status: 'PENDING' } }),
            prisma.maintenanceReport.count(),
            prisma.bookingRequest.count({ where: { status: 'PENDING' } }),
            prisma.announcement.count(),
            prisma.user.count({ where: { role: 'SELLER' } }),
            prisma.zone.findMany({ orderBy: { displayOrder: 'asc' } })
        ]);

        const stats = {
            totalStalls,
            bookedStalls,
            availableStalls,
            maintenanceStalls,
            pendingRepairs,
            totalRepairs,
            pendingRequests,
            totalAnnouncements,
            sellerCount
        };

        const zones = await Promise.all(zoneList.map(async (zone) => {
            const grouped = await prisma.stall.groupBy({
                by: ['status'],
                where: { row: { zoneId: zone.id } },
                _count: true
            });

            const counts = { AVAILABLE: 0, BOOKED: 0, MAINTENANCE: 0 };
            grouped.forEach((group) => {
                counts[group.status] = group._count;
            });

            const meta = ZONE_CATEGORY_META[zone.productCategory] || { icon: 'fa-store', description: 'พื้นที่เอนกประสงค์' };
            const total = counts.AVAILABLE + counts.BOOKED + counts.MAINTENANCE;

            return {
                name: zone.name,
                slug: zone.code.toLowerCase(),
                icon: meta.icon,
                description: meta.description,
                total,
                available: counts.AVAILABLE,
                booked: counts.BOOKED,
                maintenance: counts.MAINTENANCE,
                occupancyRate: total > 0 ? Math.round((counts.BOOKED / total) * 100) : 0
            };
        }));

        res.render('admin/dashboard', { stats, zones, user: req.user });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).send("Error loading dashboard");
    }
};

function toThaiDateShort(value) {
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

// หน้าผังแผงค้า: ดึงผัง (Zone/ZoneRow/Stall) และข้อมูลผู้จองจริงจากคำขอที่อนุมัติแล้ว
// (BookingRequest.assignedStallCode คือ field ที่ผูกแผงจริงตอนแอดมินอนุมัติที่ /admin/booking-stall)
exports.getSlotsPage = async (req, res) => {
    try {
        const zoneRecords = await prisma.zone.findMany({
            orderBy: { displayOrder: 'asc' },
            include: {
                rows: {
                    orderBy: { displayOrder: 'asc' },
                    include: {
                        stalls: { orderBy: { displayOrder: 'asc' } }
                    }
                }
            }
        });

        const approvedRequests = await prisma.bookingRequest.findMany({
            where: { status: 'APPROVED', assignedStallCode: { not: null } },
            select: {
                productName: true,
                description: true,
                sellerName: true,
                phone: true,
                zone: true,
                assignedStallCode: true,
                createdAt: true
            }
        });

        const bookingByStallCode = {};
        approvedRequests.forEach((request) => {
            const stallCode = String(request.assignedStallCode || '').trim().toUpperCase();
            if (!stallCode) return;

            bookingByStallCode[stallCode] = {
                shop: request.productName || '-',
                product: request.zone ? `โซน ${String(request.zone).toUpperCase()}` : '-',
                name: request.sellerName || '-',
                phone: request.phone || '-',
                date: toThaiDateShort(request.createdAt),
                note: request.description || '-'
            };
        });

        const zoneCategoryLabel = {
            FASHION: 'แฟชั่น',
            FOOD: 'อาหาร',
            EVENT_BOOTH: 'กิจกรรม/บูธพิเศษ'
        };

        const zonesData = zoneRecords.map((zone) => ({
            code: zone.code,
            description: zoneCategoryLabel[zone.productCategory] || 'พื้นที่เอนกประสงค์',
            columns: zone.rows.map((row) => ({
                rowCode: row.rowCode,
                stalls: row.stalls.map((stall) => ({
                    code: stall.stallCode,
                    status: stall.status
                }))
            }))
        }));

        res.render('admin/slots', {
            zonesData,
            bookingByStallCode,
            user: req.user
        });
    } catch (error) {
        console.error("Slots Page Error:", error);
        res.status(500).send("Error loading slots map");
    }
};