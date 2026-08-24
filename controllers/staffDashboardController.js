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
        const [
            pendingRepairs,
            inProgressRepairs,
            totalRepairs,
            recentReports,
            paidBookingRequests,
            inspectionCheckRecords,
            excessRecords,
            issueRecords
        ] = await Promise.all([
            prisma.maintenanceReport.count({ where: { status: 'PENDING' } }),
            prisma.maintenanceReport.count({ where: { status: 'IN_PROGRESS' } }),
            prisma.maintenanceReport.count(),
            prisma.maintenanceReport.findMany({
                include: { user: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5
            }),
            prisma.bookingRequest.findMany({
                where: { status: 'SUCCESS', assignedStallCode: { not: null } },
                select: { assignedStallCode: true }
            }),
            prisma.stallInspectionCheckRecord.findMany({
                orderBy: { createdAt: 'desc' },
                select: { stallCode: true, isInspected: true, createdAt: true }
            }),
            prisma.stallElectricExcessRecord.findMany({
                orderBy: { createdAt: 'desc' },
                select: { stallCode: true, smallCount: true, largeCount: true, createdAt: true }
            }),
            prisma.stallIssueRecord.findMany({
                orderBy: { createdAt: 'desc' },
                select: {
                    stallCode: true,
                    noShow: true,
                    sublease: true,
                    otherMarket: true,
                    wrongSeller: true,
                    otherIssueNote: true,
                    createdAt: true
                }
            })
        ]);

        // ล็อคที่ต้องเดินตรวจรอบนี้ = ล็อคที่อนุมัติและชำระเงินแล้วจริง (เดียวกับ staffInspectionController)
        const paidStallCodes = new Set();
        paidBookingRequests.forEach((request) => {
            parseStallCodes(request.assignedStallCode).forEach((code) => paidStallCodes.add(code));
        });

        const latestInspectionByCode = new Map();
        inspectionCheckRecords.forEach((record) => {
            if (!latestInspectionByCode.has(record.stallCode)) {
                latestInspectionByCode.set(record.stallCode, record.isInspected);
            }
        });

        const latestExcessByCode = new Map();
        excessRecords.forEach((record) => {
            if (!latestExcessByCode.has(record.stallCode)) {
                latestExcessByCode.set(record.stallCode, record);
            }
        });

        const latestIssueByCode = new Map();
        issueRecords.forEach((record) => {
            if (!latestIssueByCode.has(record.stallCode)) {
                latestIssueByCode.set(record.stallCode, record);
            }
        });

        let inspectedCount = 0;
        let issuesFoundCount = 0;
        paidStallCodes.forEach((code) => {
            if (latestInspectionByCode.get(code)) inspectedCount += 1;

            const excess = latestExcessByCode.get(code);
            const issue = latestIssueByCode.get(code);
            const hasExcess = Boolean(excess && (excess.smallCount > 0 || excess.largeCount > 0));
            const hasIssueFlag = Boolean(issue && (issue.noShow || issue.sublease || issue.otherMarket || issue.wrongSeller || (issue.otherIssueNote && issue.otherIssueNote.trim())));
            if (hasExcess || hasIssueFlag) issuesFoundCount += 1;
        });

        const inspection = {
            totalToday: paidStallCodes.size,
            inspected: inspectedCount,
            notInspected: paidStallCodes.size - inspectedCount,
            issuesFound: issuesFoundCount
        };

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

        return res.render('staff/dashboard', {
            user: req.user,
            repair,
            inspection
        });
    } catch (error) {
        console.error('Staff dashboard error:', error);
        return res.status(500).render('staff/dashboard', {
            user: req.user,
            repair: { pending: 0, inProgress: 0, total: 0, recent: [] },
            inspection: { totalToday: 0, inspected: 0, notInspected: 0, issuesFound: 0 },
            error: 'ไม่สามารถโหลดข้อมูลแดชบอร์ดได้'
        });
    }
};
