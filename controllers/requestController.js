const prisma = require('../config/prismaClient');
const { repairStatusUpdateSchema } = require('../utils/validationSchemas');

const STATUS_LABELS = {
    PENDING: 'รอรับเรื่อง',
    IN_PROGRESS: 'กำลังดำเนินการ',
    SUCCESS: 'ซ่อมเสร็จแล้ว',
    REJECTED: 'ปฏิเสธ',
    APPROVED: 'อนุมัติแล้ว'
};

exports.getRequestsPage = async (req, res) => {
    try {
        const reports = await prisma.maintenanceReport.findMany({
            include: {
                user: { select: { name: true, phoneNumber: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const requestRows = reports.map((report) => {
            const statusCode = String(report.status || 'PENDING').toUpperCase();
            const createdAtText = new Date(report.createdAt).toLocaleString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            return {
                id: report.id,
                location: report.location,
                category: report.category,
                description: report.description,
                image: report.image,
                sellerName: report.user?.name || 'ไม่ระบุ',
                phone: report.user?.phoneNumber || '-',
                status: statusCode,
                statusLabel: STATUS_LABELS[statusCode] || statusCode,
                createdAt: report.createdAt,
                createdAtText
            };
        });

        const counts = {
            all: requestRows.length,
            pending: requestRows.filter((report) => report.status === 'PENDING').length,
            inProgress: requestRows.filter((report) => report.status === 'IN_PROGRESS').length,
            success: requestRows.filter((report) => report.status === 'SUCCESS').length,
            rejected: requestRows.filter((report) => report.status === 'REJECTED').length
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
    const parsed = repairStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.redirect('/admin/requests?error=invalid_status');
    }
    const { id, status } = parsed.data;

    try {
        await prisma.maintenanceReport.update({
            where: { id },
            data: { status }
        });
        res.redirect('/admin/requests?success=updated');
    } catch (err) {
        res.redirect('/admin/requests?error=update_failed');
    }
};
