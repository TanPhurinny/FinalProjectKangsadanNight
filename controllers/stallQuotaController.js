const prisma = require('../config/prismaClient');
const { PRODUCT_TYPE_LABELS } = require('../utils/productSubtypes');
const {
    MIN_STALLS,
    MAX_STALLS,
    getStallQuotaSettings,
    saveStallQuotaSettings,
    saveShopStallLimit
} = require('../utils/stallQuota');

// หน้าแอดมินตั้งจำนวนแผงสูงสุดต่อร้านต่อรอบ — ค่ากลาง + ค่าเฉพาะร้าน (กติกาอยู่ใน utils/stallQuota.js)
exports.getPage = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const [settings, shops] = await Promise.all([
            getStallQuotaSettings(),
            prisma.shopDetail.findMany({
                where: q ? { OR: [{ shopName: { contains: q } }, { user: { name: { contains: q } } }] } : {},
                orderBy: [{ maxStallsPerRound: 'desc' }, { id: 'asc' }],
                select: {
                    id: true, shopName: true, productType: true, maxStallsPerRound: true,
                    user: { select: { id: true, name: true, username: true } }
                }
            })
        ]);
        const customCount = shops.filter((shop) => shop.maxStallsPerRound !== null).length;
        return res.render('admin/stallQuota', {
            settings,
            shops,
            q,
            customCount,
            minStalls: MIN_STALLS,
            maxStalls: MAX_STALLS,
            productTypeLabels: PRODUCT_TYPE_LABELS,
            error: req.query.error || null,
            success: req.query.success || null,
            message: req.query.message || null
        });
    } catch (err) {
        console.error('Stall quota page error:', err);
        return res.status(500).send('โหลดหน้าโควตาแผงไม่สำเร็จ');
    }
};

exports.updateDefault = async (req, res) => {
    try {
        const result = await saveStallQuotaSettings({ defaultMaxStalls: req.body.defaultMaxStalls }, req.user?.name);
        if (result.error) return res.redirect(`/admin/stall-quota?error=invalid&message=${encodeURIComponent(result.error)}`);
        return res.redirect('/admin/stall-quota?success=default_saved');
    } catch (err) {
        console.error('Stall quota default save error:', err);
        return res.redirect('/admin/stall-quota?error=save_failed');
    }
};

exports.updateShop = async (req, res) => {
    const back = req.body.q ? `&q=${encodeURIComponent(req.body.q)}` : '';
    try {
        const shopId = Number.parseInt(req.params.id, 10);
        if (!shopId) return res.redirect(`/admin/stall-quota?error=not_found${back}`);
        const exists = await prisma.shopDetail.findUnique({ where: { id: shopId }, select: { id: true } });
        if (!exists) return res.redirect(`/admin/stall-quota?error=not_found${back}`);
        const result = await saveShopStallLimit(shopId, req.body.maxStallsPerRound);
        if (result.error) return res.redirect(`/admin/stall-quota?error=invalid&message=${encodeURIComponent(result.error)}${back}`);
        return res.redirect(`/admin/stall-quota?success=shop_saved&message=${encodeURIComponent(result.shop.shopName || `ร้าน #${shopId}`)}${back}`);
    } catch (err) {
        console.error('Stall quota shop save error:', err);
        return res.redirect(`/admin/stall-quota?error=save_failed${back}`);
    }
};
