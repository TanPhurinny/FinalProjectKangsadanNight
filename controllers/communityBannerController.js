const path = require('path');
const fs = require('fs');
const prisma = require('../config/prismaClient');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'community-banners');

exports.getAdminBanners = async (req, res) => {
    try {
        const banners = await prisma.communityBanner.findMany({
            orderBy: { sortOrder: 'asc' }
        });

        return res.render('admin/communityBanners', {
            user: req.user,
            banners,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('getAdminBanners error:', error);
        return res.status(500).send('ไม่สามารถโหลดข้อมูลแบนเนอร์ได้');
    }
};

exports.createBanner = async (req, res) => {
    try {
        if (!req.file) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('กรุณาเลือกรูปแบนเนอร์'));
        }

        const maxOrder = await prisma.communityBanner.aggregate({
            _max: { sortOrder: true }
        });

        await prisma.communityBanner.create({
            data: {
                imageUrl: `/uploads/community-banners/${req.file.filename}`,
                sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
                isActive: true
            }
        });

        return res.redirect('/admin/community-banners?success=' + encodeURIComponent('เพิ่มแบนเนอร์สำเร็จ'));
    } catch (error) {
        console.error('createBanner error:', error);
        return res.redirect('/admin/community-banners?error=' + encodeURIComponent('เพิ่มแบนเนอร์ไม่สำเร็จ'));
    }
};

exports.toggleBannerActive = async (req, res) => {
    try {
        const bannerId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(bannerId)) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('รหัสแบนเนอร์ไม่ถูกต้อง'));
        }

        const banner = await prisma.communityBanner.findUnique({ where: { id: bannerId } });
        if (!banner) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('ไม่พบแบนเนอร์นี้'));
        }

        await prisma.communityBanner.update({
            where: { id: bannerId },
            data: { isActive: !banner.isActive }
        });

        return res.redirect('/admin/community-banners?success=' + encodeURIComponent('อัปเดตสถานะแบนเนอร์สำเร็จ'));
    } catch (error) {
        console.error('toggleBannerActive error:', error);
        return res.redirect('/admin/community-banners?error=' + encodeURIComponent('อัปเดตสถานะไม่สำเร็จ'));
    }
};

exports.moveBanner = async (req, res) => {
    try {
        const bannerId = Number.parseInt(req.params.id, 10);
        const direction = req.params.direction === 'up' ? 'up' : 'down';
        if (!Number.isInteger(bannerId)) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('รหัสแบนเนอร์ไม่ถูกต้อง'));
        }

        const banners = await prisma.communityBanner.findMany({ orderBy: { sortOrder: 'asc' } });
        const index = banners.findIndex((b) => b.id === bannerId);
        if (index === -1) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('ไม่พบแบนเนอร์นี้'));
        }

        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= banners.length) {
            return res.redirect('/admin/community-banners');
        }

        const current = banners[index];
        const target = banners[swapIndex];

        await prisma.$transaction([
            prisma.communityBanner.update({ where: { id: current.id }, data: { sortOrder: target.sortOrder } }),
            prisma.communityBanner.update({ where: { id: target.id }, data: { sortOrder: current.sortOrder } })
        ]);

        return res.redirect('/admin/community-banners');
    } catch (error) {
        console.error('moveBanner error:', error);
        return res.redirect('/admin/community-banners?error=' + encodeURIComponent('ย้ายลำดับไม่สำเร็จ'));
    }
};

exports.deleteBanner = async (req, res) => {
    try {
        const bannerId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(bannerId)) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('รหัสแบนเนอร์ไม่ถูกต้อง'));
        }

        const banner = await prisma.communityBanner.findUnique({ where: { id: bannerId } });
        if (!banner) {
            return res.redirect('/admin/community-banners?error=' + encodeURIComponent('ไม่พบแบนเนอร์นี้'));
        }

        await prisma.communityBanner.delete({ where: { id: bannerId } });

        if (banner.imageUrl.startsWith('/uploads/community-banners/')) {
            const filePath = path.join(__dirname, '..', 'public', banner.imageUrl);
            fs.unlink(filePath, () => {});
        }

        return res.redirect('/admin/community-banners?success=' + encodeURIComponent('ลบแบนเนอร์สำเร็จ'));
    } catch (error) {
        console.error('deleteBanner error:', error);
        return res.redirect('/admin/community-banners?error=' + encodeURIComponent('ลบแบนเนอร์ไม่สำเร็จ'));
    }
};

exports.uploadDir = uploadDir;
