const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// แสดงหน้า Dashboard พร้อมสรุปสถิติ
exports.getDashboardPage = async (req, res) => {
    try {
        const [totalSlots, occupiedSlots, pendingRepairs] = await Promise.all([
            prisma.slot.count(),
            prisma.slot.count({ where: { isAvailable: false } }),
            prisma.maintenanceReport.count({ where: { status: 'PENDING' } })
        ]);

        const stats = {
            totalSlots,
            occupiedCount: occupiedSlots,
            availableCount: totalSlots - occupiedSlots,
            pendingRepairs
        };

        res.render('admin/dashboard', { stats, user: req.session.user });
    } catch (error) {
        res.status(500).send("Dashboard Error: " + error.message);
    }
};

// แสดงหน้าแผนผังตลาดดิจิทัล (Digital Map)
exports.getSlotsPage = async (req, res) => {
    try {
        const allSlots = await prisma.slot.findMany();
        // แปลงข้อมูลเป็น Object เพื่อให้ View เรียกใช้ตามเลขล็อกได้ง่าย (เช่น slotsData['A101'])
        const slotsData = {};
        allSlots.forEach(s => {
            slotsData[s.slotNumber] = s;
        });

        res.render('admin/slots', { slotsData, user: req.session.user });
    } catch (error) {
        res.status(500).send("Error loading market map");
    }
};