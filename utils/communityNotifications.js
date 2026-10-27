const prisma = require('../config/prismaClient');
const { shopsRelation, primaryShop } = require('./shops');

// แจ้งเตือน "มีคนถูกใจ/คอมเมนต์โพสต์ของคุณ" สำหรับกระดิ่งผู้ขาย (รวมเข้าชุดเดียวกับ loadSellerBookingStatus)
// ไม่มีตารางแจ้งเตือนแยก — คำนวณสดจากถูกใจ/คอมเมนต์ของคนอื่นที่ใหม่กว่า CommunityPost.ownerSeenAt
// เจ้าของเปิดดูคอมเมนต์ของโพสต์นั้น (หรือกดลิงก์จากแจ้งเตือน) แล้วตั้ง ownerSeenAt = ตอนนี้ แจ้งเตือนจะหายไปเอง
const LOOKBACK_DAYS = 14;
const SNIPPET_LENGTH = 40;

// หน้า /notifications ใส่ desc ลง HTML ตรง ๆ (statusbook.js) — ข้อความที่มาจากผู้ใช้ต้อง escape ที่นี่
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function snippet(content) {
    const text = String(content || '').replace(/\s+/g, ' ').trim();
    return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text;
}

function displayName(user) {
    return primaryShop(user)?.shopName || user?.name || 'ผู้ใช้งาน';
}

// "ร้าน A, ร้าน B และอีก 3 คน"
function joinNames(names) {
    const unique = [...new Set(names)];
    if (unique.length <= 2) return unique.join(', ');
    return `${unique.slice(0, 2).join(', ')} และอีก ${unique.length - 2} คน`;
}

async function buildCommunityNotifications(userId) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const activityFilter = { userId: { not: userId }, createdAt: { gte: since } };
    const userInclude = { select: { name: true, shops: shopsRelation({ select: { shopName: true } }) } };

    const posts = await prisma.communityPost.findMany({
        where: {
            userId,
            OR: [
                { comments: { some: activityFilter } },
                { likes: { some: activityFilter } }
            ]
        },
        select: {
            id: true,
            content: true,
            createdAt: true,
            ownerSeenAt: true,
            comments: { where: activityFilter, select: { createdAt: true, user: userInclude } },
            likes: { where: activityFilter, select: { createdAt: true, user: userInclude } }
        }
    });

    return posts
        .map((post) => {
            const seenAt = post.ownerSeenAt || post.createdAt;
            const comments = post.comments.filter((comment) => comment.createdAt > seenAt);
            const likes = post.likes.filter((like) => like.createdAt > seenAt);
            if (!comments.length && !likes.length) return null;

            const latestAt = new Date(Math.max(...[...comments, ...likes].map((item) => item.createdAt.getTime())));
            const parts = [];
            if (comments.length) parts.push(`${joinNames(comments.map((c) => displayName(c.user)))} คอมเมนต์ ${comments.length} ครั้ง`);
            if (likes.length) parts.push(`${joinNames(likes.map((l) => displayName(l.user)))} ถูกใจ`);

            return {
                id: `community-${post.id}`,
                type: comments.length ? 'community-comment' : 'community-like',
                title: comments.length ? 'มีคอมเมนต์ใหม่ในโพสต์ของคุณ' : 'มีคนถูกใจโพสต์ของคุณ',
                desc: escapeHtml(`โพสต์ "${snippet(post.content)}" — ${parts.join(' · ')}`),
                date: latestAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
                time: latestAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
                sortAt: latestAt.getTime(),
                status: 'SUCCESS',
                isRead: false,
                isNew: true,
                link: `/community/activity/${post.id}`,
                linkIcon: comments.length ? 'bi-chat-dots' : 'bi-heart',
                linkLabel: 'ดูโพสต์'
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.sortAt - a.sortAt);
}

// เจ้าของโพสต์เห็นความเคลื่อนไหวแล้ว — ถ้าไม่ใช่เจ้าของไม่ทำอะไร คืน true ถ้าอัปเดต
async function markPostSeenByOwner(postId, userId) {
    const result = await prisma.communityPost.updateMany({
        where: { id: postId, userId },
        data: { ownerSeenAt: new Date() }
    });
    return result.count > 0;
}

module.exports = {
    buildCommunityNotifications,
    markPostSeenByOwner
};
