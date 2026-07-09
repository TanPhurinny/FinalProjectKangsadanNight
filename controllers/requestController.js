const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getRequestsPage = async (req, res) => {
    try {
        const maintenanceRequests = await prisma.maintenanceReport.findMany({
            include: { user: true },
            orderBy: { createdAt: 'desc' }
        });
        res.render('admin/requests', { 
            user: req.user,
            requests: maintenanceRequests,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.redirect('/admin/dashboard?error=db_error');
    }
};

exports.updateStatus = async (req, res) => {
    const { id, status } = req.body;
    try {
        await prisma.maintenanceReport.update({ 
            where: { id: parseInt(id) }, 
            data: { status: status } 
        });
        res.redirect('/admin/requests?success=updated');
    } catch (err) {
        res.redirect('/admin/requests?error=update_failed');
    }
};