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

// --- แก้ไขจุดนี้: ฟังก์ชันสำหรับหน้าผังแผงค้า (Slots) ---
exports.getSlotsPage = async (req, res) => {
    try {
        const slots = await prisma.slot.findMany({ orderBy: { slotNumber: 'asc' } });

        // แปลง Array เป็น Object เพื่อให้ EJS เรียกใช้ slotsData[id] ได้
        const slotsData = {};
        slots.forEach(slot => {
            slotsData[slot.slotNumber] = {
                id: slot.id,
                isAvailable: slot.isAvailable,
                zone: slot.zone
            };
        });

        // ส่งชื่อตัวแปร slotsData ไปให้ตรงกับที่ EJS รอรับ
        res.render('admin/slots', { 
            slotsData, 
            user: req.user 
        });
    } catch (error) {
        console.error("Slots Page Error:", error);
        res.status(500).send("Error loading slots map");
    }
};