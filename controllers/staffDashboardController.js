const prisma = require('../config/prismaClient');

const REPAIR_STATUS_LABELS = {
    PENDING: 'รอรับเรื่อง',
    IN_PROGRESS: 'กำลังดำเนินการ',
    SUCCESS: 'ซ่อมเสร็จแล้ว',
    REJECTED: 'ปฏิเสธ'
};

function toThaiDateTime(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '-';
    }
}

// เหมือน parseStallCodes ใน approvalController.js/staffInspectionController.js (คัดลอกมาเพราะไม่ได้ export)
function parseStallCodes(assignedStallCodeText) {
    return String(assignedStallCodeText || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

exports.getStaffDashboard = async (req, res) => {
    try {
        const { buildDailyReport, ISSUE_CATEGORIES } = require('./inspectionReportController');
        const { getBookingRoundMetaForDate } = require('../utils/bookingRound');
        const roundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;

        const [
            pendingRepairs,
            inProgressRepairs,
            totalRepairs,
            recentReports,
            today
        ] = await Promise.all([
            prisma.maintenanceReport.count({ where: { status: 'PENDING' } }),
            prisma.maintenanceReport.count({ where: { status: 'IN_PROGRESS' } }),
            prisma.maintenanceReport.count(),
            prisma.maintenanceReport.findMany({
                include: { user: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5
            }),
            buildDailyReport(roundNumber, null)
        ]);

        const repair = {
            pending: pendingRepairs,
            inProgress: inProgressRepairs,
            total: totalRepairs,
            recent: recentReports.map((report) => {
                const statusCode = String(report.status || 'PENDING').toUpperCase();
                return {
                    id: report.id,
                    location: report.location,
                    category: report.category,
                    reporterName: report.user?.name || 'ไม่ระบุ',
                    status: statusCode,
                    statusLabel: REPAIR_STATUS_LABELS[statusCode] || statusCode,
                    createdAtText: toThaiDateTime(report.createdAt)
                };
            })
        };

        const toBrief = (row) => ({
            stallCode: row.stallCode,
            zone: row.zone,
            shopName: row.shopName,
            issueKeys: row.issueKeys,
            attendance: row.attendance,
            cleanStatus: row.isFood ? row.cleanliness?.status : null,
            failedCount: (row.cleanliness?.failedItems || []).length
        });

        // ร้านที่ยังไม่ได้ตรวจ (เรียงตามเส้นทางเดินแล้ว) / ร้านที่พบปัญหาวันนี้ / ร้านที่ความสะอาดไม่ผ่าน
        const nextToCheck = today.rows.filter((row) => row.attendance === 'unchecked').slice(0, 8).map(toBrief);
        const problemRows = today.rows
            .filter((row) => row.issueKeys.length > 0 || row.cleanliness?.status === 'failed')
            .slice(0, 10).map(toBrief);

        return res.render('staff/dashboard', {
            user: req.user,
            repair,
            report: today,
            nextToCheck,
            problemRows,
            issueCategories: ISSUE_CATEGORIES,
            roundNumber
        });
    } catch (error) {
        console.error('Staff dashboard error:', error);
        return res.status(500).render('staff/dashboard', {
            user: req.user,
            repair: { pending: 0, inProgress: 0, total: 0, recent: [] },
            report: null,
            nextToCheck: [],
            problemRows: [],
            issueCategories: [],
            roundNumber: null,
            error: 'ไม่สามารถโหลดข้อมูลแดชบอร์ดได้'
        });
    }
};
