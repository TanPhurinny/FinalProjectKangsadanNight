const { z } = require('zod');
const prisma = require('../config/prismaClient');
const {
    PRODUCT_SUBTYPE_GROUPS,
    PRODUCT_TYPE_LABELS,
    normalizeSubtypeKey,
    loadCustomSubtypes,
    invalidateCustomSubtypes,
    getProductSubtypeGroups,
    getExistingSubtypeKeys
} = require('../utils/productSubtypes');

// คำที่มีร้านพิมพ์เองตั้งแต่เท่านี้ขึ้นไป ขึ้นป้าย "ควรเพิ่มเข้ารายการ"
const SUGGEST_MIN_SHOPS = 3;
const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_LABELS);

// productType เก่าบางแถวเป็นข้อความไทย ("อาหาร") — แปลงให้เทียบกับค่าในรายการได้
function normalizeProductType(value) {
    const raw = String(value || '').trim();
    const aliases = { 'อาหาร': 'FOOD', food: 'FOOD', 'แฟชั่น': 'FASHION', fashion: 'FASHION' };
    return aliases[raw] || aliases[raw.toLowerCase()] || raw;
}

// ช่อง "อื่นๆ (ระบุเอง)" พิมพ์ได้หลายคำคั่นจุลภาค (ปุ่ม "เพิ่มเป็นอื่นๆ" ในฟอร์มต่อด้วย ", ")
function splitTerms(text) {
    return String(text || '')
        .split(',')
        .map((term) => term.replace(/\s+/g, ' ').trim())
        .filter((term) => term && term.length <= 100);
}

function splitSubtypes(text) {
    return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// ร้านละ 1 แหล่งข้อมูล: มี ShopDetail แล้วใช้ของร้าน (ข้อมูลจริงที่ใช้จัดล็อก) ไม่งั้นใช้ใบสมัครล่าสุด
// กันนับคนเดียวซ้ำจากใบสมัครหลายใบ
async function collectOtherTermSources() {
    const [shops, applications] = await Promise.all([
        prisma.shopDetail.findMany({
            select: { userId: true, shopName: true, productType: true, productSubtypeOther: true }
        }),
        prisma.sellerApplication.findMany({
            where: { productSubtypeOther: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: { userId: true, shopName: true, productType: true, productSubtypeOther: true, status: true }
        })
    ]);

    const sources = new Map();
    const usersWithShop = new Set();
    shops.forEach((shop) => {
        usersWithShop.add(shop.userId);
        if (!String(shop.productSubtypeOther || '').trim()) return;
        sources.set(shop.userId, {
            userId: shop.userId,
            shopName: shop.shopName || '-',
            productType: normalizeProductType(shop.productType),
            source: 'shop',
            status: null,
            terms: splitTerms(shop.productSubtypeOther)
        });
    });
    applications.forEach((application) => {
        if (usersWithShop.has(application.userId) || sources.has(application.userId)) return;
        sources.set(application.userId, {
            userId: application.userId,
            shopName: application.shopName || '-',
            productType: normalizeProductType(application.productType),
            source: 'application',
            status: application.status,
            terms: splitTerms(application.productSubtypeOther)
        });
    });
    return Array.from(sources.values());
}

function aggregateTerms(sources, existingKeys) {
    const byKey = new Map();
    sources.forEach((source) => {
        const seenInSource = new Set();
        source.terms.forEach((term) => {
            const key = normalizeSubtypeKey(term);
            if (!key || seenInSource.has(key)) return;
            seenInSource.add(key);
            if (!byKey.has(key)) byKey.set(key, { key, labelCounts: new Map(), typeCounts: new Map(), shops: [] });
            const entry = byKey.get(key);
            entry.labelCounts.set(term, (entry.labelCounts.get(term) || 0) + 1);
            entry.typeCounts.set(source.productType, (entry.typeCounts.get(source.productType) || 0) + 1);
            entry.shops.push({
                userId: source.userId,
                shopName: source.shopName,
                productType: source.productType,
                productTypeLabel: PRODUCT_TYPE_LABELS[source.productType] || source.productType || '-',
                source: source.source,
                status: source.status
            });
        });
    });

    const mostCommon = (counts) => Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return Array.from(byKey.values())
        .map((entry) => {
            const count = entry.shops.length;
            const inList = existingKeys.has(entry.key);
            return {
                key: entry.key,
                label: mostCommon(entry.labelCounts),
                count,
                suggestedType: mostCommon(entry.typeCounts),
                inList,
                suggested: !inList && count >= SUGGEST_MIN_SHOPS,
                shops: entry.shops.sort((a, b) => a.shopName.localeCompare(b.shopName, 'th'))
            };
        })
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'));
}

// ชื่อที่มีอยู่แล้ว (รายการหลักหรือที่แอดมินเพิ่ม) → { name, productType } ตามที่บันทึกไว้จริง
function findExistingSubtype(name, customRows) {
    const key = normalizeSubtypeKey(name);
    for (const [productType, groups] of Object.entries(PRODUCT_SUBTYPE_GROUPS)) {
        for (const group of groups) {
            const match = group.items.find((item) => normalizeSubtypeKey(item) === key);
            if (match) return { name: match, productType, groupName: group.group, isCustom: false };
        }
    }
    const row = customRows.find((r) => normalizeSubtypeKey(r.name) === key);
    return row ? { name: row.name, productType: row.productType, groupName: row.groupName, isCustom: true } : null;
}

exports.getProductSubtypesPage = async (req, res) => {
    try {
        const customRows = await loadCustomSubtypes({ force: true });
        const terms = aggregateTerms(await collectOtherTermSources(), getExistingSubtypeKeys());
        // คำที่มีในรายการแล้ว: ฟอร์มใช้ชื่อ/ประเภท/กลุ่มตามรายการเดิม (แอดมินแค่เลือกร้านที่จะย้าย)
        terms.forEach((term) => {
            term.existing = term.inList ? findExistingSubtype(term.label, customRows) : null;
        });
        const mergedGroups = getProductSubtypeGroups();
        // กลุ่มของแต่ละประเภทให้เลือกตอนเพิ่ม (รวมกลุ่มที่ซ่อนรายการหมดแล้วด้วย จะได้ไม่สร้างกลุ่มชื่อซ้ำ)
        const groupsByType = {};
        PRODUCT_TYPES.forEach((type) => {
            const names = new Set((mergedGroups[type] || []).map((g) => g.group));
            customRows.filter((row) => row.productType === type).forEach((row) => names.add(row.groupName));
            groupsByType[type] = Array.from(names);
        });

        return res.render('admin/productSubtypes', {
            user: req.user,
            terms,
            customRows,
            groupsByType,
            productTypeLabels: PRODUCT_TYPE_LABELS,
            suggestMinShops: SUGGEST_MIN_SHOPS,
            counts: {
                terms: terms.length,
                suggested: terms.filter((t) => t.suggested).length,
                custom: customRows.length
            },
            success: req.query.success || null,
            error: req.query.error || null,
            addedName: req.query.name || null,
            movedCount: Number(req.query.moved) || 0
        });
    } catch (error) {
        console.error('getProductSubtypesPage error:', error);
        return res.status(500).send('ไม่สามารถโหลดรายการสินค้าได้');
    }
};

const addSubtypeSchema = z.object({
    name: z.string().trim().min(1).max(100).refine((v) => !v.includes(','), 'ห้ามมีจุลภาค'),
    productType: z.enum(PRODUCT_TYPES),
    groupName: z.string().trim().max(100).optional(),
    termKey: z.string().trim().max(200).optional(),
    userIds: z.preprocess(
        (value) => (value === undefined || value === '' ? [] : Array.isArray(value) ? value : [value]),
        z.array(z.coerce.number().int().positive()).max(500)
    )
});

// ย้ายคำที่พิมพ์เองของร้านที่เลือก ไปเป็นรายการที่ติ๊ก (productSubtype) → เข้าระบบเว้นระยะล็อก
// แก้ทั้ง ShopDetail และใบสมัครทุกใบของคนนั้น เพราะตอนยืนยันสลิป approvalController จะซิงก์
// productSubtype จากใบสมัครล่าสุดทับ ShopDetail ทุกครั้ง (ถ้าแก้แค่ร้าน ค่าจะเด้งกลับ)
async function moveShopsToSubtype(tx, { userIds, termKey, subtypeName, productType }) {
    if (!userIds.length || !termKey) return 0;
    const rewrite = (record) => {
        const otherTerms = splitTerms(record.productSubtypeOther);
        if (!otherTerms.some((term) => normalizeSubtypeKey(term) === termKey)) return null;
        // ประเภทสินค้าไม่ตรงกับรายการ (เช่นร้านแฟชั่นพิมพ์ชื่อของกิน) ไม่ย้าย — ฟอร์มสมัครจะซ่อน/ล้างติ๊กของประเภทอื่นอยู่แล้ว
        if (normalizeProductType(record.productType) !== productType) return null;
        const remaining = otherTerms.filter((term) => normalizeSubtypeKey(term) !== termKey);
        const subtypes = splitSubtypes(record.productSubtype);
        if (!subtypes.includes(subtypeName)) subtypes.push(subtypeName);
        return {
            productSubtype: subtypes.join(','),
            productSubtypeOther: remaining.length ? remaining.join(', ') : null
        };
    };

    const movedUsers = new Set();
    const [shops, applications] = await Promise.all([
        tx.shopDetail.findMany({
            where: { userId: { in: userIds } },
            select: { id: true, userId: true, productType: true, productSubtype: true, productSubtypeOther: true }
        }),
        tx.sellerApplication.findMany({
            where: { userId: { in: userIds }, productSubtypeOther: { not: null } },
            select: { id: true, userId: true, productType: true, productSubtype: true, productSubtypeOther: true }
        })
    ]);
    for (const shop of shops) {
        const data = rewrite(shop);
        if (!data) continue;
        await tx.shopDetail.update({ where: { id: shop.id }, data });
        movedUsers.add(shop.userId);
    }
    for (const application of applications) {
        const data = rewrite(application);
        if (!data) continue;
        await tx.sellerApplication.update({ where: { id: application.id }, data });
        movedUsers.add(application.userId);
    }
    return movedUsers.size;
}

exports.addProductSubtype = async (req, res) => {
    const parsed = addSubtypeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.redirect('/admin/product-subtypes?error=invalid_input');
    }
    const { name, productType, groupName, termKey, userIds } = parsed.data;

    try {
        const customRows = await loadCustomSubtypes({ force: true });
        const existing = findExistingSubtype(name, customRows);
        // ชื่อมีอยู่แล้ว = ไม่สร้างใหม่ แค่ย้ายร้านเข้ารายการเดิม (ใช้ชื่อ/ประเภทตามที่บันทึกไว้ ไม่ใช่ที่พิมพ์มา)
        if (existing && existing.productType !== productType) {
            return res.redirect('/admin/product-subtypes?error=type_mismatch&name=' + encodeURIComponent(existing.name));
        }
        if (!existing && !groupName) {
            return res.redirect('/admin/product-subtypes?error=invalid_input');
        }
        const subtypeName = existing ? existing.name : name;

        const moved = await prisma.$transaction(async (tx) => {
            if (!existing) {
                await tx.productSubtypeOption.create({
                    data: { name: subtypeName, productType, groupName, createdBy: req.user?.id || null }
                });
            } else if (existing.isCustom) {
                // เพิ่มซ้ำรายการที่เคยซ่อน = เปิดกลับมาแสดง
                await tx.productSubtypeOption.update({ where: { name: existing.name }, data: { isHidden: false } });
            }
            return moveShopsToSubtype(tx, { userIds, termKey: termKey ? normalizeSubtypeKey(termKey) : '', subtypeName, productType });
        });
        invalidateCustomSubtypes();

        const success = existing ? 'moved_to_existing' : 'added';
        return res.redirect(`/admin/product-subtypes?success=${success}&name=${encodeURIComponent(subtypeName)}&moved=${moved}`);
    } catch (error) {
        console.error('addProductSubtype error:', error);
        return res.redirect('/admin/product-subtypes?error=save_failed');
    }
};

exports.toggleProductSubtype = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.redirect('/admin/product-subtypes?error=invalid_input');
    }
    try {
        const row = await prisma.productSubtypeOption.findUnique({ where: { id } });
        if (!row) return res.redirect('/admin/product-subtypes?error=not_found');
        const nextHidden = !row.isHidden;
        await prisma.productSubtypeOption.update({ where: { id }, data: { isHidden: nextHidden } });
        invalidateCustomSubtypes();
        return res.redirect(`/admin/product-subtypes?success=${nextHidden ? 'hidden' : 'shown'}&name=${encodeURIComponent(row.name)}`);
    } catch (error) {
        console.error('toggleProductSubtype error:', error);
        return res.redirect('/admin/product-subtypes?error=save_failed');
    }
};
