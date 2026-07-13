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

const ZONE_CATEGORY_LABEL = {
    FASHION: 'แฟชั่น',
    FOOD: 'อาหาร',
    EVENT_BOOTH: 'กิจกรรม/บูธพิเศษ'
};

// สร้างโครงสร้างผังแผงจริง (Zone/ZoneRow/Stall) พร้อมการปรับแต่งให้ตรงกับผังจริงทางกายภาพ
// (รวมหัวแถวเดี่ยว, รวมโซน T เข้าโซน B, เว้นช่องว่างจับกลุ่มคอลัมน์, เติมช่องว่าง F1/F2)
// ใช้ร่วมกันทั้งหน้า /admin/slots (ดูผังอย่างเดียว) และ /admin/booking-stall (จัดแผงให้คำขอจอง)
// เพื่อไม่ให้ผังทั้งสองหน้าเพี้ยนไปคนละแบบ
async function buildZonesData() {
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

    let zonesData = zoneRecords.map((zone) => ({
        code: zone.code,
        description: ZONE_CATEGORY_LABEL[zone.productCategory] || 'พื้นที่เอนกประสงค์',
        columns: zone.rows.map((row) => ({
            rowCode: row.rowCode,
            stalls: row.stalls.map((stall) => ({
                code: stall.stallCode,
                status: stall.status
            }))
        }))
    }));

    // โซน B: B100/B200/B299/B300 ในผังจริงไม่ใช่คอลัมน์แยกของตัวเอง แต่เป็นแค่แผงบนสุดของ
    // คอลัมน์ B1/B2/B3/B4 ตามลำดับ (อยู่ตำแหน่งเดียวกันทางกายภาพ แค่แยก ZoneRow ไว้ในข้อมูล)
    // จึงรวมเป็นแผงแรกของคอลัมน์นั้นๆ แทนการแสดงเป็นคอลัมน์เดี่ยวๆ แยกต่างหาก
    const zoneBHeaderEntry = zonesData.find((zone) => zone.code === 'B');
    if (zoneBHeaderEntry) {
        // B299 กับ B300 เรียงต่อกันเป็นแผงหัวแถวชุดเดียวกัน วางไว้เหนือคอลัมน์ B3 ทั้งคู่
        // (ไม่ได้แยกกันไปคนละคอลัมน์กับ B4)
        const headerMerges = [
            ['B100', 'B1'],
            ['B200', 'B2'],
            [['B299', 'B300'], 'B3']
        ];
        headerMerges.forEach(([headerRowCodes, targetRowCode]) => {
            const codes = Array.isArray(headerRowCodes) ? headerRowCodes : [headerRowCodes];
            const headerStalls = [];
            codes.forEach((headerRowCode) => {
                const headerIndex = zoneBHeaderEntry.columns.findIndex((column) => column.rowCode === headerRowCode);
                if (headerIndex === -1) return;
                const [headerColumn] = zoneBHeaderEntry.columns.splice(headerIndex, 1);
                headerStalls.push(...headerColumn.stalls);
            });
            const targetColumn = zoneBHeaderEntry.columns.find((column) => column.rowCode === targetRowCode);
            if (targetColumn && headerStalls.length) targetColumn.stalls.unshift(...headerStalls);
        });
    }

    // โซน T เป็นแผงล็อกเล็กที่วางแทรกอยู่ในคอลัมน์เดียวกับ B2/B2b จริงในผังจริง (คอลัมน์เดียว
    // ต่อเนื่องกัน: B200, B201, T102...T131, B222, B223) จึงรวมเป็นคอลัมน์เดียวกันทั้งหมด
    // (ทำเครื่องหมาย small ไว้ที่แต่ละแผงของโซน T เพราะเป็นล็อกเล็กกว่าแผง B ปกติ)
    // ข้อมูลจริงในฐานข้อมูลยังคงแยกเป็น Zone T ต่างหาก (จำเป็นสำหรับระบบจัดแผงที่หน้า /admin/booking-stall)
    const zoneBEntry = zonesData.find((zone) => zone.code === 'B');
    const zoneTEntry = zonesData.find((zone) => zone.code === 'T');
    if (zoneBEntry && zoneTEntry) {
        const b2Column = zoneBEntry.columns.find((column) => column.rowCode === 'B2');
        const b2bIndex = zoneBEntry.columns.findIndex((column) => column.rowCode === 'B2b');
        const tStalls = zoneTEntry.columns.flatMap((column) => column.stalls.map((stall) => ({ ...stall, small: true })));

        if (b2Column) {
            b2Column.stalls.push(...tStalls);
            if (b2bIndex !== -1) {
                const [b2bColumn] = zoneBEntry.columns.splice(b2bIndex, 1);
                b2Column.stalls.push(...b2bColumn.stalls);
            }
        }
        zonesData = zonesData.filter((zone) => zone.code !== 'T');
    }

    // เว้นช่องว่างระหว่างคอลัมน์ให้จับกลุ่มเป็นคู่/บล็อกเหมือนผังจริง (แค่ผลด้านการแสดงผล ไม่กระทบข้อมูล)
    const groupEndByZone = {
        A: ['A1', 'A3', 'A5', 'A7'],
        F: ['F2', 'F4'],
        B: ['B2', 'B4', 'B6']
    };
    zonesData.forEach((zone) => {
        const groupEnds = groupEndByZone[zone.code];
        if (!groupEnds) return;
        zone.columns.forEach((column) => {
            if (groupEnds.includes(column.rowCode)) column.groupEnd = true;
        });
    });

    // โซน F คอลัมน์ F1/F2 ในผังจริงมีแค่ 17 แผง แต่มีช่องว่าง (x) ต่อท้ายให้สูงเท่าคอลัมน์ F3/F4 (34)
    // (F5/F6 สูงกว่านั้นอีก 36 แผง แต่เป็นความสูงจริง ไม่ใช่ช่องว่าง จึงไม่ใช้เป็นเกณฑ์)
    const zoneFEntry = zonesData.find((zone) => zone.code === 'F');
    if (zoneFEntry) {
        const referenceColumn = zoneFEntry.columns.find((column) => column.rowCode === 'F3');
        const referenceLength = referenceColumn ? referenceColumn.stalls.length : 0;
        zoneFEntry.columns.forEach((column) => {
            if (column.rowCode !== 'F1' && column.rowCode !== 'F2') return;
            const missing = referenceLength - column.stalls.length;
            for (let i = 0; i < missing; i += 1) {
                column.stalls.push({ code: `${column.rowCode}-placeholder-${i}`, status: 'PLACEHOLDER' });
            }
        });
    }

    return zonesData;
}
exports.buildZonesData = buildZonesData;

// หน้าผังแผงค้า: ดึงผัง (Zone/ZoneRow/Stall) และข้อมูลผู้จองจริงจากคำขอที่อนุมัติแล้ว
// (BookingRequest.assignedStallCode คือ field ที่ผูกแผงจริงตอนแอดมินอนุมัติที่ /admin/booking-stall)
exports.getSlotsPage = async (req, res) => {
    try {
        const zonesData = await buildZonesData();

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