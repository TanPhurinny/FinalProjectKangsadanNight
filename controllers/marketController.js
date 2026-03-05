const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- ส่วน getDashboardPage คงเดิมตามที่คุณส่งมา ---
exports.getDashboardPage = async (req, res) => {
    try {
        const [totalSlots, occupiedCount, pendingRepairs, unpaidCount] = await Promise.all([
            prisma.slot.count(), 
            prisma.slot.count({ where: { isAvailable: false } }), 
            prisma.maintenanceReport.count({ where: { status: 'PENDING' } }), 
            prisma.booking.count({ where: { status: 'PENDING' } }) 
        ]);

        const stats = { 
            totalSlots: totalSlots || 0, 
            occupiedCount: occupiedCount || 0, 
            pendingRepairs: pendingRepairs || 0,
            unpaidCount: unpaidCount || 0
        };

        const rawZones = await prisma.slot.findMany({ 
            distinct: ['zone'], 
            select: { zone: true } 
        });

        const zones = await Promise.all(rawZones.map(async (z) => {
            const zName = z.zone;
            const [available, repairs] = await Promise.all([
                prisma.slot.count({ where: { zone: zName, isAvailable: true } }),
                prisma.maintenanceReport.count({ 
                    where: { location: { contains: zName }, status: 'PENDING' } 
                })
            ]);

            const config = {
                'A': { color: '#2c3e50', icon: 'fa-utensils', desc: 'โซนอาหาร' },
                'B': { color: '#8e44ad', icon: 'fa-tshirt', desc: 'โซนแฟชั่น' },
                'C': { color: '#2980b9', icon: 'fa-laptop', desc: 'โซนไอที' }
            };

            return {
                name: `โซน ${zName}`, slug: zName, available, unpaid: 0, repairs,
                color: config[zName]?.color || '#1a1a2e',
                icon: config[zName]?.icon || 'fa-store',
                description: config[zName]?.desc || 'พื้นที่เอนกประสงค์'
            };
        }));

        res.render('admin/dashboard', { stats, zones, user: req.session.user });
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
            user: req.session.user 
        });
    } catch (error) {
        console.error("Slots Page Error:", error);
        res.status(500).send("Error loading slots map");
    }
};