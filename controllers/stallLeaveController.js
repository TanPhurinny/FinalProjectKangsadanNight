// ลาหยุด / ปล่อยเช่าช่วงแผง — ร้าน: /stall-leave (รายการ) + /stall-leave/new (ฟอร์ม) / แอดมิน: /admin/stall-leaves
// กติกาทั้งหมดอยู่ที่ utils/stallLeave.js
const prisma = require('../config/prismaClient');
const stallLeave = require('../utils/stallLeave');
const stallSpacing = require('../utils/stallSpacing');
const stallOccupancy = require('../utils/stallOccupancy');
const { getUserShops, resolveShopForUser } = require('../utils/shops');
const { getProductSubtypeGroups, loadCustomSubtypes } = require('../utils/productSubtypes');
const { deleteImage } = require('../utils/imageStorage');

const KINDS = ['LEAVE', 'SUBLET_MEMBER', 'SUBLET_GUEST'];

function publicBaseUrl(req) {
    return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function errorCodeOf(error) {
    if (error instanceof stallLeave.StallLeaveError) return error.code;
    console.error('Stall leave error:', error);
    return 'action_failed';
}

function refreshBell(req, ...userIds) {
    if (!req.app.locals.clearSellerNotificationCache) return;
    userIds.filter(Boolean).forEach((id) => req.app.locals.clearSellerNotificationCache(id));
}

async function ownerOfShop(shopId) {
    if (!shopId) return null;
    const shop = await prisma.shopDetail.findUnique({ where: { id: shopId }, select: { userId: true } });
    return shop ? shop.userId : null;
}

// --- ร้าน ---

exports.getMyRequests = async (req, res) => {
    const [rows, incoming] = await Promise.all([
        stallLeave.listForOwner(req.user.id),
        stallLeave.listIncoming(req.user.id)
    ]);
    res.render('seller/stallLeaveList', {
        user: req.user,
        rows,
        guestBaseUrl: `${publicBaseUrl(req)}/sublet/guest/`,
        focusId: Number(req.query.focus) || null,
        incoming,
        success: req.query.success || null,
        error: req.query.error ? (stallLeave.ERROR_MESSAGES[req.query.error] || 'เกิดข้อผิดพลาด') : null
    });
};

// editing = คำขอเดิม (หน้าแก้ไข /stall-leave/:id/edit) — ล็อกประเภทคำขอ ร้าน และแผงไว้ตามคำขอเดิม
async function renderForm(req, res, { status = 200, error = null, values = {}, editing = null } = {}) {
    const shopParam = editing ? editing.shopId : (values.shopId || req.query.shop);
    const [shops, shop] = await Promise.all([
        getUserShops(req.user.id, { select: { id: true, shopName: true } }),
        resolveShopForUser(req.user.id, shopParam, { select: { id: true, userId: true, shopName: true } })
    ]);
    let stalls = shop ? await stallLeave.loadShopStalls(req.user.id, shop.id) : [];
    if (editing) stalls = stalls.filter((s) => s.code === editing.stallCode);
    let earliest = stallLeave.earliestStartDate();
    // วันเริ่มเดิมของคำขอที่กำลังแก้ยังคงไว้ได้ แม้เลยเวลาแจ้งของวันนั้นแล้ว (จนถึง 15:00)
    if (editing && editing.startDate < earliest) earliest = editing.startDate;
    const kind = editing ? editing.kind : KINDS.includes(values.kind) ? values.kind : ({ sublet: 'SUBLET_MEMBER', guest: 'SUBLET_GUEST' }[req.query.kind] || 'LEAVE');
    // ร้านผู้รับเช่าช่วงที่เลือกไว้แล้ว (ส่งฟอร์มไม่ผ่านแล้วกลับมาหน้าเดิม)
    let subShop = null;
    if (values.subShopId) {
        const found = await stallLeave.searchMemberShopById(values.subShopId, req.user.id);
        subShop = found || null;
    }
    return res.status(status).render('seller/stallLeaveForm', {
        user: req.user,
        shops,
        shop,
        stalls: stalls.map((s) => ({
            code: s.code,
            contractStartKey: stallLeave.toDateKey(s.contractStart),
            contractEndKey: stallLeave.toDateKey(s.contractEnd),
            contractText: `${stallLeave.thaiDate(s.contractStart)} – ${stallLeave.thaiDate(s.contractEnd)}`
        })),
        earliestKey: stallLeave.toDateKey(earliest),
        cutoffHour: stallLeave.NOTICE_CUTOFF_HOUR,
        changeCutoffHour: stallLeave.CHANGE_CUTOFF_HOUR,
        editing: editing ? { id: editing.id, status: editing.status, statusLabel: stallLeave.STATUS_LABEL[editing.status], kind: editing.kind } : null,
        maxDays: stallLeave.MAX_RANGE_DAYS,
        kind,
        subShop,
        values: { stallCode: values.stallCode || String(req.query.stall || '').toUpperCase(), ...values },
        error
    });
}

exports.getForm = (req, res) => renderForm(req, res);

exports.submitForm = async (req, res) => {
    const values = {
        kind: KINDS.includes(req.body.kind) ? req.body.kind : 'LEAVE',
        shopId: req.body.shopId,
        stallCode: String(req.body.stallCode || '').trim().toUpperCase(),
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        reason: req.body.reason,
        subShopId: req.body.subShopId
    };
    try {
        const shop = await resolveShopForUser(req.user.id, values.shopId, { select: { id: true, userId: true } });
        if (!shop) throw new stallLeave.StallLeaveError('invalid_stall');
        const input = { user: req.user, shop, stallCode: values.stallCode, startKey: values.startDate, endKey: values.endDate, reason: values.reason };
        if (values.kind === 'SUBLET_GUEST') {
            const row = await stallLeave.createGuestSublet(input);
            return res.redirect(`/stall-leave?success=guest_link&focus=${row.id}#leave-${row.id}`);
        }
        if (values.kind === 'SUBLET_MEMBER') {
            const row = await stallLeave.createMemberSublet({ ...input, subShopId: values.subShopId });
            refreshBell(req, await ownerOfShop(row.subShopId));
            return res.redirect('/stall-leave?success=sublet_sent');
        }
        await stallLeave.createLeave(input);
        req.app.locals.clearAdminTodoCache?.();
        return res.redirect('/stall-leave?success=created');
    } catch (error) {
        const code = errorCodeOf(error);
        return renderForm(req, res, { status: 400, error: stallLeave.ERROR_MESSAGES[code] || 'เกิดข้อผิดพลาด', values });
    }
};

// --- แก้คำขอ (ถึง 15:00 ของวันเริ่ม) ---
async function loadEditable(req) {
    const row = await prisma.stallLeaveRequest.findFirst({ where: { id: Number(req.params.id) || 0, userId: req.user.id } });
    if (!row) throw new stallLeave.StallLeaveError('not_found');
    if (!stallLeave.canCancel(row)) throw new stallLeave.StallLeaveError('cannot_cancel');
    return row;
}

exports.getEditForm = async (req, res) => {
    try {
        const row = await loadEditable(req);
        return renderForm(req, res, {
            editing: row,
            values: {
                stallCode: row.stallCode,
                startDate: stallLeave.toDateKey(row.startDate),
                endDate: stallLeave.toDateKey(row.endDate),
                reason: row.reason,
                subShopId: row.subShopId
            }
        });
    } catch (error) {
        return res.redirect(`/stall-leave?error=${errorCodeOf(error)}`);
    }
};

exports.submitEdit = async (req, res) => {
    const values = {
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        reason: req.body.reason,
        subShopId: req.body.subShopId
    };
    let row;
    try {
        row = await loadEditable(req);
        const { row: updated, previous } = await stallLeave.updateRequest(req.user.id, row.id, {
            startKey: values.startDate, endKey: values.endDate, reason: values.reason, subShopId: values.subShopId
        });
        req.app.locals.clearAdminTodoCache?.();
        refreshBell(req, await ownerOfShop(previous.subShopId), await ownerOfShop(updated.subShopId));
        return res.redirect(`/stall-leave?success=edited&focus=${updated.id}#leave-${updated.id}`);
    } catch (error) {
        const code = errorCodeOf(error);
        if (!row) return res.redirect(`/stall-leave?error=${code}`);
        return renderForm(req, res, { status: 400, error: stallLeave.ERROR_MESSAGES[code] || 'เกิดข้อผิดพลาด', editing: row, values: { ...values, stallCode: row.stallCode } });
    }
};

exports.cancel = async (req, res) => {
    try {
        const row = await stallLeave.cancelRequest(req.user.id, req.params.id);
        req.app.locals.clearAdminTodoCache?.();
        refreshBell(req, await ownerOfShop(row.subShopId));
        return res.redirect('/stall-leave?success=cancelled');
    } catch (error) {
        return res.redirect(`/stall-leave?error=${errorCodeOf(error)}`);
    }
};

// ร้านผู้รับเช่าช่วง (สมาชิก) ตอบรับ/ปฏิเสธ
exports.respond = async (req, res) => {
    try {
        const accept = req.body.accept === '1' || req.body.accept === 'true';
        const row = await stallLeave.respondAsSubtenant(req.user.id, req.params.id, accept);
        req.app.locals.clearAdminTodoCache?.();
        refreshBell(req, row.userId, req.user.id);
        return res.redirect(`/stall-leave?success=${accept ? 'accepted' : 'declined'}#incoming`);
    } catch (error) {
        return res.redirect(`/stall-leave?error=${errorCodeOf(error)}#incoming`);
    }
};

// ค้นร้านสมาชิกสำหรับฟอร์มเช่าช่วง (JSON)
exports.searchMembers = async (req, res) => {
    try {
        const shops = await stallLeave.searchMemberShops(req.query.q, req.user.id);
        return res.json({ success: true, shops });
    } catch (error) {
        console.error('Member search error:', error);
        return res.status(500).json({ success: false, message: 'ค้นหาไม่สำเร็จ กรุณาลองใหม่' });
    }
};

// --- คนนอกกรอกข้อมูลเองผ่านลิงก์ (ไม่ต้อง login) ---

async function renderGuest(req, res, row, { status = 200, error = null, values = {} } = {}) {
    await loadCustomSubtypes();
    return res.status(status).render('stallLeaveGuest', {
        user: req.user || null,
        row,
        token: req.params.token,
        productTypes: stallLeave.PRODUCT_TYPE_LABELS,
        subtypeGroups: getProductSubtypeGroups(),
        maxImages: stallLeave.GUEST_MAX_IMAGES,
        values,
        error,
        submitted: req.query.submitted === '1'
    });
}

exports.getGuestPage = async (req, res) => {
    const row = await stallLeave.findGuestRequest(req.params.token);
    const error = req.query.error ? (stallLeave.ERROR_MESSAGES[req.query.error] || null) : null;
    return renderGuest(req, res, row, { status: row ? 200 : 404, error });
};

exports.submitGuest = async (req, res) => {
    const imageUrls = (req.files || []).map((file) => file.url).filter(Boolean);
    try {
        const row = await stallLeave.submitGuestInfo(req.params.token, req.body || {}, imageUrls);
        req.app.locals.clearAdminTodoCache?.();
        refreshBell(req, row.userId);
        return res.redirect(`/sublet/guest/${req.params.token}?submitted=1`);
    } catch (error) {
        // ส่งไม่ผ่าน: ลบรูปที่อัปโหลดมาแล้วทิ้ง (ให้แนบใหม่)
        await Promise.all(imageUrls.map((url) => deleteImage(url).catch(() => null)));
        const code = errorCodeOf(error);
        const row = await stallLeave.findGuestRequest(req.params.token);
        return renderGuest(req, res, row, { status: row ? 400 : 404, error: stallLeave.ERROR_MESSAGES[code] || 'เกิดข้อผิดพลาด', values: req.body || {} });
    }
};

// --- แอดมิน/staff ---

// ข้อมูลช่วยตัดสินคำขอเช่าช่วง: ร้านผู้รับ (ประเภท/ชนิดสินค้า/ติดต่อ) + ร้านใกล้ๆ ที่ขายของชนิดเดียวกันเกินระยะที่แนะนำ
async function attachSubletInsights(rows) {
    const sublets = rows.filter((r) => r.kind !== 'LEAVE');
    if (!sublets.length) return;
    const subShopIds = [...new Set(sublets.map((r) => r.subShopId).filter(Boolean))];
    const subShops = subShopIds.length
        ? await prisma.shopDetail.findMany({
            where: { id: { in: subShopIds } },
            select: { id: true, shopName: true, productType: true, productSubtype: true, productDetail: true, logoImage: true, productImage: true, user: { select: { name: true, phoneNumber: true, isBlacklisted: true } } }
        })
        : [];
    const subShopById = new Map(subShops.map((s) => [s.id, s]));

    // ผังทั้งตลาด + ชนิดสินค้าของร้านที่อยู่แต่ละแผง (ใช้กติกาเว้นระยะเดียวกับตอนจัดล็อก utils/stallSpacing.js)
    const { buildZonesData } = require('./marketController');
    const zonesData = await buildZonesData();
    const occupantInfoByCode = (await stallOccupancy.attachOccupantDetails(zonesData)) || {};
    const occupantSubtypeByCode = {};
    Object.entries(occupantInfoByCode).forEach(([code, info]) => {
        if (info.productSubtype) occupantSubtypeByCode[code] = info.productSubtype;
    });

    const guestRows = sublets.filter((r) => r.kind === 'SUBLET_GUEST' && r.guestName);
    const guestBlacklisted = new Map(await Promise.all(guestRows.map(async (r) => [r.id, await stallLeave.guestBlacklistHit(r)])));

    sublets.forEach((row) => {
        const sub = row.kind === 'SUBLET_MEMBER' ? subShopById.get(row.subShopId) : null;
        const productType = sub ? sub.productType : row.guestProductType;
        const productSubtype = sub ? sub.productSubtype : row.guestProductSubtype;
        row.subtenant = sub
            ? { name: sub.shopName || '-', contact: sub.user?.name || '-', phone: sub.user?.phoneNumber || '', productType: stallLeave.PRODUCT_TYPE_LABELS[sub.productType] || sub.productType || '-', productSubtype: sub.productSubtype || '-', productDetail: sub.productDetail || '', image: sub.logoImage || sub.productImage || null, blacklisted: !!sub.user?.isBlacklisted }
            : row.guestName
                ? { isGuest: true, name: row.guestName, contact: row.guestName, phone: row.guestPhone || '', idCard: row.guestIdCard || '', productType: row.guestProductTypeLabel || '-', productSubtype: row.guestProductSubtype || '-', productDetail: row.guestProductDetail || '', image: row.guestImageList[0] || null, images: row.guestImageList, blacklisted: guestBlacklisted.get(row.id) || false }
                : null;
        const zone = zonesData.find((z) => z.columns.some((c) => c.stalls.some((s) => String(s.code).toUpperCase() === row.stallCode)));
        row.conflicts = zone && productSubtype
            ? stallSpacing.findConflicts({ zoneColumns: zone.columns, candidateCode: row.stallCode, productSubtype, productType, occupantSubtypeByCode })
                .map((c) => ({ code: c.code, distance: c.distance, shared: c.sharedSubtypes.join(', '), shopName: occupantInfoByCode[c.code]?.shopName || '' }))
            : [];
        row.conflictChecked = Boolean(zone && productSubtype);
    });
}

exports.getAdminPage = async (req, res) => {
    const page = await stallLeave.loadAdminPage(req.query.tab);
    try {
        await attachSubletInsights(page.rows);
    } catch (error) {
        // ข้อมูลช่วยตัดสินพังก็ยังเปิดหน้าได้ แค่ไม่มีคำเตือนสินค้าซ้ำ
        console.error('Sublet insight error:', error);
    }
    res.render('admin/stallLeaves', {
        user: req.user,
        ...page,
        focusId: Number(req.query.focus) || null,
        success: req.query.success || null,
        error: req.query.error ? (stallLeave.ERROR_MESSAGES[req.query.error] || 'เกิดข้อผิดพลาด') : null
    });
};

exports.approve = async (req, res) => {
    try {
        const row = await stallLeave.approveRequest(req.body.requestId, req.user);
        refreshBell(req, row.userId, await ownerOfShop(row.subShopId));
        return res.redirect('/admin/stall-leaves?success=approved');
    } catch (error) {
        return res.redirect(`/admin/stall-leaves?error=${errorCodeOf(error)}&focus=${Number(req.body.requestId) || ''}`);
    }
};

exports.reject = async (req, res) => {
    try {
        const row = await stallLeave.rejectRequest(req.body.requestId, req.user, req.body.reason);
        refreshBell(req, row.userId, await ownerOfShop(row.subShopId));
        return res.redirect('/admin/stall-leaves?success=rejected');
    } catch (error) {
        return res.redirect(`/admin/stall-leaves?error=${errorCodeOf(error)}&focus=${Number(req.body.requestId) || ''}`);
    }
};
