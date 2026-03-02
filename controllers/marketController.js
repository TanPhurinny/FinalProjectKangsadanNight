const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
            pendingRepairs,
            unpaidCount: 0 
        };

        const uniqueZones = await prisma.slot.findMany({
            distinct: ['zone'],
            select: { zone: true }
        });

        const zones = await Promise.all(uniqueZones.map(async (item) => {
            const zName = item.zone;
            const [available, repairs] = await Promise.all([
                prisma.slot.count({ where: { zone: zName, isAvailable: true } }),
                prisma.maintenanceReport.count({ where: { status: 'PENDING', location: { contains: zName } } })
            ]);
            return { name: `Zone ${zName}`, slug: zName, available, repairs, unpaid: 0, color: zName === 'A' ? '#A73B24' : '#2c3e50' };
        }));

        res.render('admin/dashboard', { stats, zones, user: req.session.user });
    } catch (error) {
        res.status(500).send("Dashboard Error");
    }
};

exports.getSlotsPage = async (req, res) => {
    try {
        const allSlots = await prisma.slot.findMany();
        const slotsData = {};
        allSlots.forEach(s => {
            slotsData[s.slotNumber] = s;
        });

        res.render('admin/slots', { slotsData, user: req.session.user });
    } catch (error) {
        res.status(500).send("Error loading market map");
    }
};