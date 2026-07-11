const prisma = require('../config/prismaClient');

const ALLOWED_AUDIENCES = ['CUSTOMER', 'SELLER', 'GUEST'];

function normalizeTargetRoles(rawRoles) {
    const values = Array.isArray(rawRoles) ? rawRoles : [rawRoles];

    const normalized = values
        .filter(Boolean)
        .map((role) => String(role).trim().toUpperCase())
        .filter((role) => ALLOWED_AUDIENCES.includes(role));

    const uniqueRoles = [...new Set(normalized)];
    return uniqueRoles.length > 0 ? uniqueRoles : ['CUSTOMER'];
}

function resolveStoredRoles(announcement) {
    if (Array.isArray(announcement.targetRoles)) {
        const roles = normalizeTargetRoles(announcement.targetRoles);
        if (roles.length > 0) return roles;
    }

    if (announcement.targetRole) {
        return normalizeTargetRoles([announcement.targetRole]);
    }

    return ['CUSTOMER'];
}

function isAnnouncementVisibleToRole(announcement, roleToFetch) {
    const targets = resolveStoredRoles(announcement);
    return targets.includes(roleToFetch);
}

// [READ] ดึงประกาศทั้งหมด
exports.getAdminAnnouncements = async (req, res) => {
    try {
        const announcements = await prisma.announcement.findMany({
            include: { author: true },
            orderBy: { createdAt: 'desc' }
        });

        const normalizedAnnouncements = announcements.map((post) => ({
            ...post,
            targetRoles: resolveStoredRoles(post)
        }));

        res.render('admin/announcements', { 
            announcements: normalizedAnnouncements,
            user: req.user 
        });
    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).send("ไม่สามารถโหลดข้อมูลประกาศได้");
    }
};

// [CREATE] สร้างประกาศใหม่
exports.createAnnouncement = async (req, res) => {
    try {
        const { title, content, category, targetRoles } = req.body;
        const imageName = req.file ? req.file.filename : null;
        const normalizedRoles = normalizeTargetRoles(targetRoles);
        const fallbackRole = normalizedRoles.includes('SELLER') ? 'SELLER' : 'CUSTOMER';

        await prisma.announcement.create({
            data: {
                title,
                content,
                category,
                targetRole: fallbackRole,
                targetRoles: normalizedRoles,
                image: imageName,
                authorId: req.user.id
            }
        });
        res.redirect('/admin/announcements?success=created');
    } catch (error) {
        res.status(500).send("สร้างประกาศไม่สำเร็จ: " + error.message);
    }
};

// [UPDATE] แก้ไขประกาศ (ฉบับสมบูรณ์)
exports.updateAnnouncement = async (req, res) => {
    const { id } = req.params;
    const { title, content, category, targetRoles } = req.body;
    const imageName = req.file ? req.file.filename : null;

    try {
        const normalizedRoles = normalizeTargetRoles(targetRoles);
        const fallbackRole = normalizedRoles.includes('SELLER') ? 'SELLER' : 'CUSTOMER';
        const updateData = {
            title,
            content,
            category,
            targetRole: fallbackRole,
            targetRoles: normalizedRoles
        };
        
        // ถ้ามีการอัปโหลดรูปใหม่ค่อยเปลี่ยน ถ้าไม่มีให้ใช้รูปเดิมใน DB
        if (imageName) {
            updateData.image = imageName;
        }

        await prisma.announcement.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.redirect('/admin/announcements?success=updated');
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send("แก้ไขไม่สำเร็จ");
    }
};

// [DELETE] ลบประกาศ
exports.deleteAnnouncement = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.announcement.delete({
            where: { id: parseInt(id) }
        });
        res.redirect('/admin/announcements?success=deleted');
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).send("ลบไม่สำเร็จ");
    }
};

exports.getAnnouncementsForUser = async (roleToFetch) => {
    const selectedRole = normalizeTargetRoles([roleToFetch])[0];

    const announcements = await prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' }
    });

    return announcements
        .filter((post) => isAnnouncementVisibleToRole(post, selectedRole))
        .map((post) => ({
            ...post,
            targetRoles: resolveStoredRoles(post)
        }));
};