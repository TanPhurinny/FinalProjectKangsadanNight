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
                user: { select: { name: true, phoneNumber: true } },
                assignedTo: { select: { name: true } },
                images: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // เชื่อมตำแหน่งล็อคที่แจ้ง (report.location) กับข้อมูลโซน/แถวจริงจาก Stall — รายงานเก่าที่เป็น
        // free text ที่ไม่ตรงกับรหัสล็อคจริงจะหา stallInfo ไม่เจอ ก็แค่แสดง location แบบ raw text เหมือนเดิม
        const locations = [...new Set(reports.map((r) => String(r.location || '').trim().toUpperCase()).filter(Boolean))];
        const stallRows = locations.length
            ? await prisma.stall.findMany({
                where: { stallCode: { in: locations } },
                include: { row: { include: { zone: true } } }
            })
            : [];
        const stallByCode = new Map(stallRows.map((s) => [s.stallCode.toUpperCase(), s]));

        const requestRows = reports.map((report) => {
            const statusCode = String(report.status || 'PENDING').toUpperCase();
            const dateTimeOpts = {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            };
            const createdAtText = new Date(report.createdAt).toLocaleString('th-TH', dateTimeOpts);
            const updatedAtText = new Date(report.updatedAt).toLocaleString('th-TH', dateTimeOpts);
            const stall = stallByCode.get(String(report.location || '').trim().toUpperCase()) || null;

            return {
                id: report.id,
                location: report.location,
                category: report.category,
                description: report.description,
                // รายงานใหม่เก็บรูปในตาราง images (หลายรูป) รายงานเก่ายังมีแค่คอลัมน์ image เดี่ยว
                image: report.images?.[0]?.imageUrl || report.image,
                stallInfo: stall ? {
                    zoneCode: stall.row?.zone?.code || null,
                    zoneName: stall.row?.zone?.name || null,
                    rowCode: stall.row?.rowCode || null
                } : null,
                sellerName: report.user?.name || 'ไม่ระบุ',
                phone: report.user?.phoneNumber || '-',
                status: statusCode,
                statusLabel: STATUS_LABELS[statusCode] || statusCode,
                rejectReason: report.rejectReason || null,
                createdAt: report.createdAt,
                createdAtText,
                updatedAtText,
                assignedToName: report.assignedTo?.name || null
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
    const { id, status, reason } = parsed.data;

    if (status === 'REJECTED' && !reason) {
        return res.redirect('/admin/requests?error=reason_required');
    }

    try {
        const existing = await prisma.maintenanceReport.findUnique({
            where: { id },
            select: { assignedToId: true }
        });
        if (!existing) {
            return res.redirect('/admin/requests?error=update_failed');
        }

        // ใครก็ตามที่กดเปลี่ยนสถานะเป็นคนแรก (รับเรื่อง/ปฏิเสธ) ถือเป็น "ผู้รับเรื่อง" ของคำร้องนี้
        // ไม่ทับผู้รับเรื่องเดิมถ้ามีคนรับไปแล้ว
        await prisma.maintenanceReport.update({
            where: { id },
            data: {
                status,
                assignedToId: existing.assignedToId || req.user.id,
                rejectReason: status === 'REJECTED' ? reason : null
            }
        });
        res.redirect('/admin/requests?success=updated');
    } catch (err) {
        res.redirect('/admin/requests?error=update_failed');
    }
};
