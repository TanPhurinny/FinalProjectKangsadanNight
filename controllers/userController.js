const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. แสดงรายชื่อผู้ใช้งานทั้งหมด
exports.getUsersPage = async (req, res) => {
    try {
        const allUsers = await prisma.user.findMany({
            // สำคัญ: ดึงข้อมูล shop มาด้วยเพื่อให้หน้า EJS แสดงรายละเอียดร้านค้าได้
            include: {
                shop: true 
            },
            orderBy: [
                { role: 'asc' }, // เรียงตามบทบาท
                { name: 'asc' }  // แล้วจึงเรียงตามชื่อ
            ]
        });

        res.render('admin/users', { 
            user: req.session.user, 
            allUsers,
            // รองรับการแสดงผล Success/Error Alert ในหน้า EJS
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error("Fetch Users Error:", err);
        res.redirect('/admin/dashboard?error=' + encodeURIComponent("ไม่สามารถดึงข้อมูลผู้ใช้ได้"));
    }
};

// 2. อัปเดตบทบาทผู้ใช้งาน (Update Role)
exports.updateRole = async (req, res) => {
    const { userId, newRole } = req.body;
    try {
        if (!userId || !newRole) {
            throw new Error("ข้อมูลไม่ครบถ้วน");
        }

        await prisma.user.update({
            where: { id: parseInt(userId) }, 
            data: { role: newRole }
        });

        res.redirect('/admin/users?success=true');
    } catch (err) {
        console.error("Update Role Error:", err);
        res.redirect('/admin/users?error=' + encodeURIComponent("แก้ไขสิทธิ์ไม่สำเร็จ"));
    }
};

// 3. ลบผู้ใช้งาน (Delete User)
exports.deleteUser = async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        // ตรวจสอบว่าแอดมินไม่ได้ลบตัวเอง
        if (userId === req.session.user.id) {
            return res.redirect('/admin/users?error=' + encodeURIComponent("คุณไม่สามารถลบตัวเองได้"));
        }

        await prisma.user.delete({ 
            where: { id: userId } 
        });

        res.redirect('/admin/users?success=true');
    } catch (err) {
        console.error("Delete User Error:", err);
        res.redirect('/admin/users?error=' + encodeURIComponent("ไม่สามารถลบผู้ใช้งานได้"));
    }
};