const QRCode = require('qrcode');
const prisma = require('../config/prismaClient');
const { buildZonesData } = require('./marketController');
const { getStallOwnerIndex, recordShopView } = require('../utils/shopViews');

// งานเสริมของผังตลาด: QR ร้าน, ป้ายหน้าร้าน (พิมพ์), ผังตลาดฉบับพิมพ์ และเก็บสถิติการเปิดดูร้าน
// แยกจาก marketController.js ที่ดูแลการสร้างข้อมูลผัง (buildZonesData) อยู่แล้ว

const STALL_CODE_RE = /^[A-Z]\d{3}$/;

function normalizeCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return STALL_CODE_RE.test(code) ? code : null;
}

function publicBaseUrl(req) {
    return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function stallMapUrl(req, code) {
    return `${publicBaseUrl(req)}/market-map?stall=${encodeURIComponent(code)}`;
}

function qrSvg(text) {
    return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#12303a', light: '#ffffff' } });
}

// รูป QR ของล็อก (SVG) — สแกนแล้วเปิดผังตลาดที่ล็อกนี้พร้อมการ์ดร้าน
exports.getStallQr = async (req, res) => {
    const code = normalizeCode(req.params.code);
    if (!code) return res.status(400).send('รหัสล็อกไม่ถูกต้อง');
    try {
        const svg = await qrSvg(stallMapUrl(req, code));
        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'public, max-age=86400');
        if (req.query.download) res.set('Content-Disposition', `attachment; filename="qr-${code}.svg"`);
        return res.send(svg);
    } catch (error) {
        return res.status(500).send('สร้าง QR ไม่สำเร็จ');
    }
};

// ป้ายหน้าร้านขนาด A5 สำหรับพิมพ์ติดหน้าล็อก (ชื่อร้าน + รหัสล็อก + เมนูเด่น + QR)
exports.getStallSign = async (req, res) => {
    const code = normalizeCode(req.params.code);
    if (!code) return res.status(400).send('รหัสล็อกไม่ถูกต้อง');
    try {
        const owner = (await getStallOwnerIndex()).get(code);
        if (!owner) return res.status(404).send('ล็อกนี้ยังไม่มีร้านค้า');
        const shop = owner.userId
            ? await prisma.shopDetail.findUnique({ where: { userId: owner.userId }, select: { shopName: true, shopTags: true, productType: true } })
            : null;
        const tags = String(shop?.shopTags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6);
        return res.render('marketSign', {
            code,
            shopName: shop?.shopName || owner.shopName,
            tags,
            qr: await qrSvg(stallMapUrl(req, code)),
            url: stallMapUrl(req, code)
        });
    } catch (error) {
        console.error('Stall sign error:', error);
        return res.status(500).send('สร้างป้ายไม่สำเร็จ');
    }
};

// ผังตลาดฉบับพิมพ์ (A4) — QR ไปหน้าผัง + รายชื่อร้านแยกตามโซน ไว้ติดบอร์ดทางเข้าตลาด (แอดมิน/staff)
exports.getPrintableMap = async (req, res) => {
    try {
        const [zones, owners] = await Promise.all([buildZonesData(), getStallOwnerIndex()]);
        const userIds = [...new Set([...owners.values()].map((o) => o.userId).filter(Boolean))];
        const shops = userIds.length
            ? await prisma.shopDetail.findMany({ where: { userId: { in: userIds } }, select: { userId: true, shopTags: true, productType: true } })
            : [];
        const shopByUserId = new Map(shops.map((shop) => [shop.userId, shop]));

        const directory = zones.map((zone) => {
            const rows = [];
            zone.columns.forEach((column) => column.stalls.forEach((stall) => {
                if (stall.status !== 'BOOKED') return;
                const owner = owners.get(String(stall.code).toUpperCase());
                if (!owner) return;
                const shop = shopByUserId.get(owner.userId) || {};
                rows.push({
                    code: stall.code,
                    shopName: owner.shopName,
                    tags: String(shop.shopTags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3).join(', ')
                });
            }));
            rows.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
            return { code: zone.code, description: zone.description, rows };
        }).filter((zone) => zone.rows.length);

        return res.render('marketPrint', {
            directory,
            qr: await qrSvg(`${publicBaseUrl(req)}/market-map`),
            url: `${publicBaseUrl(req)}/market-map`,
            printedAt: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
        });
    } catch (error) {
        console.error('Printable map error:', error);
        return res.status(500).send('สร้างผังฉบับพิมพ์ไม่สำเร็จ');
    }
};

// เก็บสถิติการเปิดดูร้าน (ส่งด้วย navigator.sendBeacon) — เฉพาะลูกค้า/ผู้ขายคนอื่น ไม่นับแอดมิน/staff
exports.trackShopView = async (req, res) => {
    try {
        const code = normalizeCode(req.body?.code);
        const kind = String(req.body?.kind || '');
        const role = req.user?.role || 'CUSTOMER';
        if (!code || role === 'ADMIN' || role === 'STAFF') return res.status(204).end();
        await recordShopView(code, kind, req.user?.id || null);
        return res.status(204).end();
    } catch (error) {
        return res.status(204).end();
    }
};
