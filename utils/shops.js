const prisma = require('../config/prismaClient');

// 1 ผู้ใช้มีได้หลายร้าน (ShopDetail[]) — "ร้านหลัก" = ร้านที่ id น้อยสุด ใช้ในหน้าที่ยังไม่แยกร้าน
// (avatar คอมมูนิตี้, หน้าผู้ใช้ของแอดมิน, หน้าตรวจตลาด ฯลฯ) ส่วนคำขอจอง/ใบสมัคร/สัญญาเช่ามี shopId ของตัวเอง

const SHOP_ORDER = { orderBy: { id: 'asc' } };

// ใช้แทน include/select `shop` แบบเดิม: shopsRelation() = ร้านหลักทั้งแถว, shopsRelation({ select }) / ({ include })
function shopsRelation(options = {}) {
    return { ...options, ...SHOP_ORDER, take: 1 };
}

function primaryShop(user) {
    return (user && Array.isArray(user.shops) && user.shops[0]) || null;
}

function getUserShops(userId, options = {}) {
    if (!userId) return Promise.resolve([]);
    return prisma.shopDetail.findMany({ where: { userId: Number(userId) }, ...SHOP_ORDER, ...options });
}

async function getPrimaryShop(userId, options = {}) {
    if (!userId) return null;
    return prisma.shopDetail.findFirst({ where: { userId: Number(userId) }, ...SHOP_ORDER, ...options });
}

// ร้านที่ผู้ใช้ขอ (shopId จากฟอร์ม/query) — ต้องเป็นร้านของผู้ใช้คนนั้นจริง ไม่ส่ง shopId มา = ร้านหลัก
async function resolveShopForUser(userId, shopId, options = {}) {
    if (!userId) return null;
    const id = Number.parseInt(shopId, 10);
    if (!Number.isInteger(id) || id <= 0) return getPrimaryShop(userId, options);
    return prisma.shopDetail.findFirst({ where: { id, userId: Number(userId) }, ...options });
}

// ร้านของคำขอจอง: shopId ของคำขอก่อน ถ้าเป็นคำขอเก่า (null) ใช้ร้านหลักของเจ้าของ — โหลดเป็นชุดเดียว
// คืน Map<requestId, ShopDetail|null>
async function shopsOfRequests(requests, ownerOf = (request) => request.userId) {
    const list = (requests || []).filter(Boolean);
    const shopIds = Array.from(new Set(list.map((r) => r.shopId).filter(Boolean)));
    const ownerIds = Array.from(new Set(list.filter((r) => !r.shopId).map(ownerOf).filter(Boolean)));
    const [byId, owned] = await Promise.all([
        shopIds.length ? prisma.shopDetail.findMany({ where: { id: { in: shopIds } } }) : [],
        ownerIds.length ? prisma.shopDetail.findMany({ where: { userId: { in: ownerIds } }, ...SHOP_ORDER }) : []
    ]);
    const shopById = new Map(byId.map((s) => [s.id, s]));
    const primaryByUser = new Map();
    owned.forEach((s) => { if (!primaryByUser.has(s.userId)) primaryByUser.set(s.userId, s); });
    const result = new Map();
    list.forEach((r) => {
        result.set(r.id, r.shopId ? (shopById.get(r.shopId) || null) : (primaryByUser.get(ownerOf(r)) || null));
    });
    return result;
}

module.exports = {
    SHOP_ORDER,
    shopsRelation,
    primaryShop,
    getUserShops,
    getPrimaryShop,
    resolveShopForUser,
    shopsOfRequests
};
