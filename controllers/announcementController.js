const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. ดึงประกาศทั้งหมด (สำหรับหน้า Admin)
exports.getAdminAnnouncements = async (req, res) => {
    try {
        const posts = await prisma.announcement.findMany({
            include: { author: true }, // ดึงข้อมูลผู้โพสต์มาโชว์ด้วย
            orderBy: { createdAt: 'desc' } // เอาประกาศใหม่ขึ้นก่อน
        });
        res.render('admin/announcements', { posts, user: req.session.user });
    } catch (error) {
        console.error("Error loading announcements:", error);
        res.status(500).send("ไม่สามารถโหลดข้อมูลประกาศได้");
    }
};

// 2. สร้างประกาศใหม่ (รองรับการอัปโหลดรูปภาพผ่าน Multer)
exports.createAnnouncement = async (req, res) => {
    const { title, content, category, targetRole } = req.body;
    // รับชื่อไฟล์ที่ Multer ตั้งให้จาก req.file
    const imageName = req.file ? req.file.filename : null; 

    try {
        await prisma.announcement.create({
            data: {
                title,
                content,
                category,
                targetRole, // ระบุว่าเป็นกลุ่ม CUSTOMER หรือ SELLER
                image: imageName, // เก็บชื่อไฟล์ภาพ
                authorId: req.session.user.id // ID ของแอดมินที่ล็อกอินอยู่
            }
        });
        res.redirect('/admin/announcements');
    } catch (error) {
        console.error("Error creating announcement:", error);
        res.status(500).send("ไม่สามารถสร้างประกาศได้: " + error.message);
    }
};

// 3. ลบประกาศ
exports.deleteAnnouncement = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.announcement.delete({
            where: { id: parseInt(id) }
        });
        res.redirect('/admin/announcements');
    } catch (error) {
        console.error("Error deleting announcement:", error);
        res.status(500).send("ไม่สามารถลบประกาศได้");
    }
};

// 4. ดึงข้อมูลประกาศตาม Role (สำหรับใช้ใน routes/authRoutes.js เพื่อโชว์หน้าแรก)
exports.getAnnouncementsForUser = async (role) => {
    try {
        return await prisma.announcement.findMany({
            where: { targetRole: role },
            orderBy: { createdAt: 'desc' },
            take: 10 // ดึงมาแค่ 10 รายการล่าสุด
        });
    } catch (error) {
        console.error("Error fetching announcements for user:", error);
        return [];
    }
};