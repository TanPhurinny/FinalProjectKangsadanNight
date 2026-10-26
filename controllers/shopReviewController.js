const reviews = require('../utils/shopReviews');

// รีวิวร้านค้า — API JSON สำหรับการ์ดร้านบนผังตลาด/หน้าร้านค้าของฉัน + หน้าแอดมิน /admin/shop-reviews
// กติกา (ใครรีวิวได้, 1 คน 1 รีวิวต่อร้าน, ซ่อน/รายงาน) อยู่ใน utils/shopReviews.js

function sendError(res, error, fallback) {
    if (error instanceof reviews.ReviewError) {
        return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error(fallback, error);
    return res.status(500).json({ success: false, message: fallback });
}

// เปิดอ่านได้โดยไม่ต้องล็อกอิน (ลูกค้าสแกน QR หน้าร้าน) — แต่ส่งรีวิวได้เฉพาะสมาชิก
exports.listForStall = async (req, res) => {
    try {
        const { shopUserId } = await reviews.resolveShopOwner(req.params.code);
        const data = await reviews.listShopReviews(shopUserId, req.user || null);
        return res.json({ success: true, ...data });
    } catch (error) {
        return sendError(res, error, 'โหลดรีวิวไม่สำเร็จ');
    }
};

exports.saveForStall = async (req, res) => {
    try {
        await reviews.saveReview(req.user || null, req.params.code, req.body || {});
        const { shopUserId } = await reviews.resolveShopOwner(req.params.code);
        const data = await reviews.listShopReviews(shopUserId, req.user);
        return res.json({ success: true, message: 'บันทึกรีวิวแล้ว ขอบคุณที่รีวิวร้าน', ...data });
    } catch (error) {
        return sendError(res, error, 'บันทึกรีวิวไม่สำเร็จ กรุณาลองใหม่');
    }
};

exports.deleteForStall = async (req, res) => {
    try {
        await reviews.deleteMyReview(req.user || null, req.params.code);
        const { shopUserId } = await reviews.resolveShopOwner(req.params.code);
        const data = await reviews.listShopReviews(shopUserId, req.user);
        return res.json({ success: true, message: 'ลบรีวิวแล้ว', ...data });
    } catch (error) {
        return sendError(res, error, 'ลบรีวิวไม่สำเร็จ กรุณาลองใหม่');
    }
};

// --- ผู้ขาย (เจ้าของร้าน) ---
function requireSeller(req, res) {
    if (req.user?.role === 'SELLER') return true;
    res.status(403).json({ success: false, message: 'เฉพาะผู้ขายเจ้าของร้าน' });
    return false;
}

exports.reply = async (req, res) => {
    if (!requireSeller(req, res)) return;
    try {
        const review = await reviews.replyToReview(req.user.id, req.params.id, req.body?.text);
        return res.json({
            success: true,
            message: review.sellerReply ? 'ตอบรีวิวแล้ว' : 'ลบคำตอบแล้ว',
            reply: review.sellerReply ? { text: review.sellerReply, at: review.sellerRepliedAt } : null
        });
    } catch (error) {
        return sendError(res, error, 'บันทึกคำตอบไม่สำเร็จ กรุณาลองใหม่');
    }
};

exports.report = async (req, res) => {
    if (!requireSeller(req, res)) return;
    try {
        await reviews.reportReview(req.user.id, req.params.id, req.body?.reason);
        return res.json({ success: true, message: 'ส่งรายงานให้แอดมินตรวจสอบแล้ว' });
    } catch (error) {
        return sendError(res, error, 'ส่งรายงานไม่สำเร็จ กรุณาลองใหม่');
    }
};

// --- แอดมิน/staff ---
exports.getAdminPage = async (req, res) => {
    try {
        const filter = reviews.ADMIN_FILTERS.includes(req.query.filter) ? req.query.filter : 'all';
        const q = String(req.query.q || '').slice(0, 100);
        const { reviews: rows, counts } = await reviews.listReviewsForAdmin({ filter, q });
        return res.render('admin/shopReviews', {
            user: req.user,
            reviews: rows,
            counts,
            filter,
            q,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('getAdminShopReviews error:', error);
        return res.status(500).send('โหลดรายการรีวิวไม่สำเร็จ');
    }
};

function backTo(req, key, message) {
    // กลับไปแท็บ/คำค้นเดิมที่แอดมินเปิดอยู่
    const params = new URLSearchParams();
    if (req.body?.filter) params.set('filter', String(req.body.filter));
    if (req.body?.q) params.set('q', String(req.body.q));
    params.set(key, message);
    return `/admin/shop-reviews?${params.toString()}`;
}

exports.hide = async (req, res) => {
    try {
        await reviews.setReviewHidden(req.params.id, true, req.body?.reason);
        return res.redirect(backTo(req, 'success', 'ซ่อนรีวิวแล้ว ไม่แสดงในผังตลาดและไม่นับคะแนนเฉลี่ย'));
    } catch (error) {
        const message = error instanceof reviews.ReviewError ? error.message : 'ซ่อนรีวิวไม่สำเร็จ';
        if (!(error instanceof reviews.ReviewError)) console.error('hideShopReview error:', error);
        return res.redirect(backTo(req, 'error', message));
    }
};

exports.unhide = async (req, res) => {
    try {
        await reviews.setReviewHidden(req.params.id, false);
        return res.redirect(backTo(req, 'success', 'เลิกซ่อนรีวิวแล้ว'));
    } catch (error) {
        console.error('unhideShopReview error:', error);
        return res.redirect(backTo(req, 'error', 'เลิกซ่อนรีวิวไม่สำเร็จ'));
    }
};

exports.dismissReport = async (req, res) => {
    try {
        await reviews.dismissReport(req.params.id);
        return res.redirect(backTo(req, 'success', 'ตรวจแล้ว ไม่ซ่อนรีวิวนี้'));
    } catch (error) {
        console.error('dismissShopReviewReport error:', error);
        return res.redirect(backTo(req, 'error', 'บันทึกไม่สำเร็จ'));
    }
};
