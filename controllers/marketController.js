const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- ส่วน getDashboardPage คงเดิมตามที่คุณส่งมา ---
exports.getDashboardPage = async (req, res) => {
    try {
        const [totalSlots, occupiedCount, availableSlots, pendingRepairs, unpaidCount, pendingRequests, announcements, sellerCount] = await Promise.all([
            prisma.slot.count(),
            prisma.slot.count({ where: { isAvailable: false } }),
            prisma.slot.count({ where: { isAvailable: true } }),
            prisma.maintenanceReport.count({ where: { status: 'PENDING' } }),
            prisma.booking.count({ where: { status: 'PENDING' } }),
            prisma.bookingRequest.count({ where: { status: 'PENDING' } }),
            prisma.announcement.count(),
            prisma.user.count({ where: { role: 'SELLER' } })
        ]);

        const stats = {
            totalSlots: totalSlots || 0,
            occupiedCount: occupiedCount || 0,
            availableSlots: availableSlots || 0,
            pendingRepairs: pendingRepairs || 0,
            unpaidCount: unpaidCount || 0,
            pendingRequests: pendingRequests || 0,
            announcements: announcements || 0,
            sellerCount: sellerCount || 0
        };

        const rawZones = await prisma.slot.findMany({ 
            distinct: ['zone'], 
            select: { zone: true } 
        });

        const zones = await Promise.all(rawZones.map(async (z) => {
            const zName = z.zone;
            const [available, repairs, unpaid] = await Promise.all([
                prisma.slot.count({ where: { zone: zName, isAvailable: true } }),
                prisma.maintenanceReport.count({
                    where: { location: { contains: zName }, status: 'PENDING' }
                }),
                prisma.booking.count({
                    where: { status: 'PENDING', slot: { zone: zName } }
                })
            ]);

            const config = {
                'A': { color: '#a855f7', icon: 'fa-shirt', desc: 'โซนแฟชั่น' },
                'C': { color: '#a855f7', icon: 'fa-shirt', desc: 'โซนแฟชั่น' },
                'E': { color: '#a855f7', icon: 'fa-gem', desc: 'โซนแฟชั่น' },
                'B': { color: '#d4880d', icon: 'fa-utensils', desc: 'โซนอาหาร' },
                'F': { color: '#d4880d', icon: 'fa-utensils', desc: 'โซนอาหาร' },
                'T': { color: '#d4880d', icon: 'fa-mug-hot', desc: 'โซนอาหาร' },
                'D': { color: '#d4880d', icon: 'fa-truck', desc: 'โซนอาหาร (ฟู้ดทรัค)' },
                'X': { color: '#d4880d', icon: 'fa-utensils', desc: 'โซนอาหาร' }
            };

            return {
                name: `โซน ${zName}`, slug: zName, available, unpaid, repairs,
                color: config[zName]?.color || '#1a1a2e',
                icon: config[zName]?.icon || 'fa-store',
                description: config[zName]?.desc || 'พื้นที่เอนกประสงค์'
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