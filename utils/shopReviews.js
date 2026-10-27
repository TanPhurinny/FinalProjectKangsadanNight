const prisma = require('../config/prismaClient');
const { getStallOwnerIndex } = require('./shopViews');
const { shopsRelation } = require('./shops');

// รีวิวร้านค้า (ตาราง ShopReview) — ใช้ทั้งการ์ดร้านบนผังตลาด หน้าร้านค้าของฉัน และหน้าแอดมิน /admin/shop-reviews
// รีวิวผูกกับเจ้าของร้าน (shopUserId) ไม่ใช่รหัสล็อก: หาเจ้าของจากรหัสล็อกด้วยดัชนีเดียวกับสถิติคนดูร้าน
const COMMENT_MAX = 500;
const REPLY_MAX = 500;
const REASON_MAX = 300;
// role ที่รีวิวได้ — สมาชิกที่ล็อกอินแล้วเท่านั้น แอดมิน/staff ดูแลรีวิวแต่ไม่ให้คะแนนร้านเอง
const REVIEWER_ROLES = ['CUSTOMER', 'SELLER'];

class ReviewError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function cleanText(value, max) {
    const text = String(value || '').replace(/\r\n/g, '\n').trim();
    return text ? text.slice(0, max) : null;
}

// ชื่อผู้รีวิวที่แสดงต่อสาธารณะ — ย่อนามสกุลเหลือตัวแรก ไม่เปิดเผยชื่อเต็ม/username
function displayName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'สมาชิก';
    return parts.length > 1 ? `${parts[0]} ${Array.from(parts[1])[0]}.` : parts[0];
}

async function resolveShopOwner(stallCode) {
    const code = String(stallCode || '').trim().toUpperCase();
    const owner = (await getStallOwnerIndex()).get(code);
    if (!owner || !owner.userId) throw new ReviewError('ไม่พบร้านค้าในล็อกนี้', 404);
    return { code, shopUserId: owner.userId, shopName: owner.shopName };
}

function canReview(viewer, shopUserId) {
    if (!viewer) return { ok: false, reason: 'login' };
    if (!REVIEWER_ROLES.includes(viewer.role)) return { ok: false, reason: 'role' };
    if (viewer.id === shopUserId) return { ok: false, reason: 'owner' };
    return { ok: true, reason: null };
}

// คะแนนเฉลี่ย + จำนวนรีวิวของหลายร้านพร้อมกัน (ไม่นับรีวิวที่แอดมินซ่อน) → Map<shopUserId, { avg, count }>
async function getRatingSummaries(shopUserIds) {
    const ids = [...new Set((shopUserIds || []).filter(Boolean))];
    const result = new Map();
    if (!ids.length) return result;
    const rows = await prisma.shopReview.groupBy({
        by: ['shopUserId'],
        where: { shopUserId: { in: ids }, isHidden: false },
        _avg: { rating: true },
        _count: { _all: true }
    });
    rows.forEach((row) => result.set(row.shopUserId, {
        avg: Math.round((row._avg.rating || 0) * 10) / 10,
        count: row._count._all
    }));
    return result;
}

function publicReview(review, viewerId) {
    return {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        author: displayName(review.user?.name),
        avatar: review.user?.avatarUrl || null,
        createdAt: review.createdAt,
        reply: review.sellerReply ? { text: review.sellerReply, at: review.sellerRepliedAt } : null,
        mine: !!viewerId && review.userId === viewerId
    };
}

const REVIEW_USER_SELECT = { select: { name: true, avatarUrl: true } };

// รีวิวทั้งหมดของร้าน (ที่ไม่ถูกซ่อน) + สรุปดาว 5→1 + รีวิวของผู้ดูเอง (ถ้ามี แม้ถูกซ่อนก็ส่งให้เจ้าของรีวิวรู้)
async function listShopReviews(shopUserId, viewer) {
    const [reviews, mine] = await Promise.all([
        prisma.shopReview.findMany({
            where: { shopUserId, isHidden: false },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { user: REVIEW_USER_SELECT }
        }),
        viewer ? prisma.shopReview.findUnique({ where: { shopUserId_userId: { shopUserId, userId: viewer.id } } }) : null
    ]);
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; });
    const count = reviews.length;
    const avg = count ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0;
    return {
        summary: { avg, count, breakdown },
        reviews: reviews.map((r) => publicReview(r, viewer?.id)),
        mine: mine ? { rating: mine.rating, comment: mine.comment, isHidden: mine.isHidden, hiddenReason: mine.hiddenReason } : null,
        canReview: canReview(viewer, shopUserId)
    };
}

async function saveReview(viewer, stallCode, input) {
    const { code, shopUserId } = await resolveShopOwner(stallCode);
    const check = canReview(viewer, shopUserId);
    if (!check.ok) {
        const messages = {
            login: 'กรุณาเข้าสู่ระบบก่อนรีวิวร้าน',
            role: 'บัญชีแอดมิน/เจ้าหน้าที่รีวิวร้านไม่ได้',
            owner: 'รีวิวร้านของตัวเองไม่ได้'
        };
        throw new ReviewError(messages[check.reason], check.reason === 'login' ? 401 : 403);
    }
    const rating = Number.parseInt(input?.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError('กรุณาให้คะแนน 1–5 ดาว');
    const comment = cleanText(input?.comment, COMMENT_MAX);

    // แก้รีวิวเดิม = ล้างคำตอบเก่าของร้าน (คำตอบอาจไม่ตรงกับข้อความใหม่) และล้างการรายงาน ให้แอดมินดูเฉพาะข้อความล่าสุด
    // รีวิวที่แอดมินซ่อนไว้ยังซ่อนต่อ ผู้รีวิวแก้ข้อความเพื่อเลี่ยงการซ่อนไม่ได้
    return prisma.shopReview.upsert({
        where: { shopUserId_userId: { shopUserId, userId: viewer.id } },
        create: { shopUserId, userId: viewer.id, stallCode: code, rating, comment },
        update: {
            stallCode: code,
            rating,
            comment,
            sellerReply: null,
            sellerRepliedAt: null,
            reportCount: 0,
            reportReason: null,
            reportedAt: null
        }
    });
}

async function deleteMyReview(viewer, stallCode) {
    if (!viewer) throw new ReviewError('กรุณาเข้าสู่ระบบ', 401);
    const { shopUserId } = await resolveShopOwner(stallCode);
    await prisma.shopReview.deleteMany({ where: { shopUserId, userId: viewer.id } });
}

// เจ้าของร้านตอบรีวิว (ข้อความว่าง = ลบคำตอบ)
async function replyToReview(sellerId, reviewId, text) {
    const review = await prisma.shopReview.findUnique({ where: { id: Number(reviewId) || 0 } });
    if (!review || review.shopUserId !== sellerId) throw new ReviewError('ไม่พบรีวิวนี้ในร้านของคุณ', 404);
    const reply = cleanText(text, REPLY_MAX);
    return prisma.shopReview.update({
        where: { id: review.id },
        data: { sellerReply: reply, sellerRepliedAt: reply ? new Date() : null }
    });
}

// เจ้าของร้านรายงานรีวิวไม่เหมาะสม → ขึ้นในหน้าแอดมิน (ร้านลบรีวิวเองไม่ได้)
async function reportReview(sellerId, reviewId, reason) {
    const review = await prisma.shopReview.findUnique({ where: { id: Number(reviewId) || 0 } });
    if (!review || review.shopUserId !== sellerId) throw new ReviewError('ไม่พบรีวิวนี้ในร้านของคุณ', 404);
    const text = cleanText(reason, REASON_MAX);
    if (!text) throw new ReviewError('กรุณาระบุเหตุผลที่รายงาน');
    return prisma.shopReview.update({
        where: { id: review.id },
        data: { reportCount: { increment: 1 }, reportReason: text, reportedAt: new Date() }
    });
}

// หน้าร้านค้าของฉัน: สรุปคะแนน + รีวิวทั้งหมดรวมที่ถูกซ่อน (ผู้ขายเห็นว่ารีวิวไหนแอดมินซ่อนแล้ว)
async function getSellerReviewPanel(shopUserId) {
    const reviews = await prisma.shopReview.findMany({
        where: { shopUserId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: REVIEW_USER_SELECT }
    });
    const visible = reviews.filter((r) => !r.isHidden);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
        avg: visible.length ? Math.round((visible.reduce((s, r) => s + r.rating, 0) / visible.length) * 10) / 10 : 0,
        count: visible.length,
        newThisWeek: visible.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
        unanswered: visible.filter((r) => !r.sellerReply && r.comment).length,
        reviews: reviews.map((r) => ({
            ...publicReview(r, null),
            isHidden: r.isHidden,
            hiddenReason: r.hiddenReason,
            reported: r.reportCount > 0
        }))
    };
}

// แจ้งเตือนผู้ขายเรื่องรีวิว (รวมเข้า loadSellerBookingStatus เหมือน utils/communityNotifications.js) — คำนวณสดจากรีวิว NOTIFY_DAYS วันล่าสุด
// รีวิวแต่ละอันเป็นแจ้งเตือนของตัวเองในหมวด "ร้านและชุมชน" (ตอบแล้วถือว่าอ่านแล้ว) — นับในเลขกระดิ่ง
// ไม่ขึ้นในแถบต้องทำ (แถบนั้นเก็บไว้เฉพาะงานสำคัญที่มีเส้นตาย เช่น ชำระเงิน/ต่อล็อก)
const NOTIFY_DAYS = 14;
const MAX_REVIEW_ITEMS = 30;
const escapeNotificationHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function buildReviewNotifications(shopUserId) {
    const since = new Date(Date.now() - NOTIFY_DAYS * 24 * 60 * 60 * 1000);
    const recent = await prisma.shopReview.findMany({
        where: { shopUserId, isHidden: false, OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] },
        orderBy: { createdAt: 'desc' },
        take: MAX_REVIEW_ITEMS,
        include: { user: REVIEW_USER_SELECT }
    });
    // รีวิวที่ถูกแก้ไขจะล้างคำตอบเดิม (ดู saveReview) — ใช้เวลาแก้ล่าสุดเป็นเวลาของแจ้งเตือน key จึงเปลี่ยนและกลับเป็นยังไม่อ่าน
    const items = recent.map((r) => {
        const at = new Date(r.updatedAt > r.createdAt ? r.updatedAt : r.createdAt);
        const replied = Boolean(r.sellerReply);
        return {
            id: `shop-review-item-${r.id}`,
            type: 'shop-review-item',
            title: `${displayName(r.user?.name)} รีวิว ${r.rating} ดาว${replied ? ' · ตอบแล้ว' : ''}`,
            desc: escapeNotificationHtml(r.comment ? String(r.comment).replace(/\s+/g, ' ').trim() : 'ให้คะแนนอย่างเดียว ไม่ได้เขียนความเห็น'),
            date: at.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
            time: at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
            sortAt: at.getTime(),
            status: 'SUCCESS',
            isRead: replied,
            isNew: !replied,
            link: '/shop-profile#shop-reviews',
            linkIcon: 'bi-star',
            linkLabel: replied ? 'ดูรีวิว' : 'ตอบรีวิว'
        };
    });

    return items;
}

// --- แอดมิน ---
const ADMIN_FILTERS = ['all', 'reported', 'hidden', 'low'];

async function listReviewsForAdmin({ filter = 'all', q = '' } = {}) {
    const where = {};
    if (filter === 'reported') Object.assign(where, { reportCount: { gt: 0 }, isHidden: false });
    else if (filter === 'hidden') where.isHidden = true;
    else if (filter === 'low') where.rating = { lte: 2 };
    const term = String(q || '').trim();
    if (term) {
        where.OR = [
            { comment: { contains: term } },
            { stallCode: { contains: term.toUpperCase() } },
            { user: { name: { contains: term } } },
            { shop: { name: { contains: term } } },
            { shop: { shops: { some: { shopName: { contains: term } } } } }
        ];
    }
    const [reviews, counts] = await Promise.all([
        prisma.shopReview.findMany({
            where,
            orderBy: [{ reportedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
            take: 200,
            include: {
                user: { select: { id: true, name: true, username: true, role: true } },
                shop: { select: { id: true, name: true, shops: shopsRelation({ select: { shopName: true } }) } }
            }
        }),
        countReviewsForAdmin()
    ]);
    return { reviews, counts };
}

async function countReviewsForAdmin() {
    const [all, reported, hidden, low] = await Promise.all([
        prisma.shopReview.count(),
        countReportedReviews(),
        prisma.shopReview.count({ where: { isHidden: true } }),
        prisma.shopReview.count({ where: { rating: { lte: 2 } } })
    ]);
    return { all, reported, hidden, low };
}

// badge บนเมนูแอดมิน — รีวิวที่ร้านรายงานและยังไม่ได้ตัดสิน
function countReportedReviews() {
    return prisma.shopReview.count({ where: { reportCount: { gt: 0 }, isHidden: false } });
}

async function setReviewHidden(reviewId, hidden, reason) {
    const id = Number(reviewId) || 0;
    const text = cleanText(reason, REASON_MAX);
    if (hidden && !text) throw new ReviewError('กรุณาระบุเหตุผลที่ซ่อนรีวิว');
    // เลิกซ่อน = ถือว่าตรวจแล้วไม่ผิด ล้างการรายงานด้วย ไม่ให้ค้างในแท็บ "ถูกรายงาน"
    return prisma.shopReview.update({
        where: { id },
        data: hidden
            ? { isHidden: true, hiddenReason: text, hiddenAt: new Date() }
            : { isHidden: false, hiddenReason: null, hiddenAt: null, reportCount: 0, reportReason: null, reportedAt: null }
    });
}

// ตรวจแล้วรีวิวไม่ผิด แต่ไม่ต้องซ่อน — ล้างการรายงานออก
async function dismissReport(reviewId) {
    return prisma.shopReview.update({
        where: { id: Number(reviewId) || 0 },
        data: { reportCount: 0, reportReason: null, reportedAt: null }
    });
}

module.exports = {
    ReviewError,
    COMMENT_MAX,
    REPLY_MAX,
    ADMIN_FILTERS,
    getRatingSummaries,
    resolveShopOwner,
    listShopReviews,
    saveReview,
    deleteMyReview,
    replyToReview,
    reportReview,
    getSellerReviewPanel,
    buildReviewNotifications,
    listReviewsForAdmin,
    countReviewsForAdmin,
    countReportedReviews,
    setReviewHidden,
    dismissReport
};
