const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getApprovalsPage = async (req, res) => {
    try {
        const pendingRequests = await prisma.bookingRequest.findMany({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' }
        });
        res.render('admin/approvals', { 
            user: req.session.user, 
            pendingRequests: pendingRequests,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.render('admin/dashboard', { 
            user: req.session.user, 
            error: "ไม่สามารถดึงข้อมูลรายการอนุมัติได้" 
        });
    }
};

exports.confirmApproval = async (req, res) => {
    const { requestId, status } = req.body;
    try {
        await prisma.bookingRequest.update({ 
            where: { id: parseInt(requestId) }, 
            data: { status: status } 
        });
        res.redirect('/admin/approvals?success=status_updated');
    } catch (err) {
        res.redirect('/admin/approvals?error=update_failed');
    }
};