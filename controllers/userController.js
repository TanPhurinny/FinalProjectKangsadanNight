const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. แสดงรายชื่อผู้ใช้งานทั้งหมด
exports.getUsersPage = async (req, res) => {
    try {
        const allUsers = await prisma.user.findMany({
            // สำคัญ: ดึงข้อมูล shop มาด้วยเพื่อให้หน้า EJS แสดงรายละเอียดร้านค้าได้
            include: {
                shop: true,
                bookings: {
                    include: {
                        slot: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
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

// 4. ดูโปรไฟล์ของตัวเอง
exports.getProfile = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const profileUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { shop: true }
        });

        if (!profileUser) {
            return res.redirect('/admin/dashboard?error=' + encodeURIComponent("ไม่พบข้อมูลผู้ใช้"));
        }

        res.render('admin/profile', {
            user: req.session.user,
            profileUser: profileUser,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error("Get Profile Error:", err);
        res.redirect('/admin/dashboard?error=' + encodeURIComponent("ไม่สามารถดึงข้อมูลโปรไฟล์ได้"));
    }
};

// 5. อัปเดตโปรไฟล์ของตัวเอง
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { name, email, phoneNumber, birthDate, password, newPassword, confirmPassword } = req.body;

        // ตรวจสอบอีเมล Gmail
        if (email && !/^[^\s@]+@gmail\.com$/i.test(String(email || '').trim())) {
            return res.redirect('/profile?error=' + encodeURIComponent("กรุณาใช้เฉพาะอีเมล Gmail เท่านั้น"));
        }

        // ตรวจสอบ Email ซ้ำ
        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email: email,
                    NOT: { id: userId }
                }
            });
            if (existingUser) {
                return res.redirect('/profile?error=' + encodeURIComponent("อีเมลนี้ถูกใช้งานแล้ว"));
            }
        }

        // เตรียม data สำหรับอัปเดต
        const updateData = {
            name: name || undefined,
            email: email || null,
            phoneNumber: phoneNumber || null,
            birthDate: birthDate ? new Date(birthDate) : null
        };

        // ตรวจสอบและอัปเดตรหัสผ่านถ้ามีการเปลี่ยน
        if (newPassword || confirmPassword) {
            const currentUser = await prisma.user.findUnique({ where: { id: userId } });
            
            if (currentUser.password !== password) {
                return res.redirect('/profile?error=' + encodeURIComponent("รหัสผ่านปัจจุบันไม่ถูกต้อง"));
            }

            if (newPassword !== confirmPassword) {
                return res.redirect('/profile?error=' + encodeURIComponent("รหัสผ่านใหม่ไม่ตรงกัน"));
            }

            if (newPassword.length < 6) {
                return res.redirect('/profile?error=' + encodeURIComponent("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร"));
            }

            updateData.password = newPassword;
        }

        await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        // อัปเดต session
        if (name) {
            req.session.user.name = name;
        }

        res.redirect('/profile?success=' + encodeURIComponent("อัปเดตโปรไฟล์สำเร็จ"));
    } catch (err) {
        console.error("Update Profile Error:", err);
        res.redirect('/profile?error=' + encodeURIComponent("ไม่สามารถอัปเดตโปรไฟล์ได้"));
    }
};