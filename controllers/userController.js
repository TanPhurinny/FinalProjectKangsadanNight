const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getUsersPage = async (req, res) => {
    try {
        const allUsers = await prisma.user.findMany({
            orderBy: { role: 'asc' } // เพิ่มการเรียงลำดับให้อ่านง่ายขึ้น
        });
        res.render('admin/users', { 
            user: req.session.user, 
            allUsers,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
};

exports.updateRole = async (req, res) => {
    const { userId, newRole } = req.body;
    try {
        // ต้องแปลง userId เป็นตัวเลข (Int) เพื่อให้ตรงกับ schema.prisma
        await prisma.user.update({
            where: { id: parseInt(userId) }, 
            data: { role: newRole }
        });
        res.redirect('/admin/users?success=role_updated');
    } catch (err) {
        console.error("Update Role Error:", err);
        res.redirect('/admin/users?error=failed_to_update');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        // ต้องแปลง params.id เป็นตัวเลข (Int) เช่นกัน
        await prisma.user.delete({ 
            where: { id: parseInt(req.params.id) } 
        });
        res.redirect('/admin/users?success=user_deleted');
    } catch (err) {
        console.error("Delete User Error:", err);
        res.redirect('/admin/users?error=delete_failed');
    }
};