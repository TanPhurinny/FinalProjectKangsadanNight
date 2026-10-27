// ลาหยุด / ปล่อยเช่าช่วงแผง — ร้าน: /stall-leave (รายการ) + /stall-leave/new (ฟอร์ม) / แอดมิน: /admin/stall-leaves
// กติกาทั้งหมดอยู่ที่ utils/stallLeave.js
const stallLeave = require('../utils/stallLeave');
const { getUserShops, resolveShopForUser } = require('../utils/shops');

function errorCodeOf(error) {
    if (error instanceof stallLeave.StallLeaveError) return error.code;
    console.error('Stall leave error:', error);
    return 'action_failed';
}

function refreshBell(req, userId) {
    if (userId && req.app.locals.clearSellerNotificationCache) req.app.locals.clearSellerNotificationCache(userId);
}

// --- ร้าน ---

exports.getMyRequests = async (req, res) => {
    const rows = await stallLeave.listForOwner(req.user.id);
    res.render('seller/stallLeaveList', {
        user: req.user,
        rows,
        success: req.query.success || null,
        error: req.query.error ? (stallLeave.ERROR_MESSAGES[req.query.error] || 'เกิดข้อผิดพลาด') : null
    });
};

async function renderForm(req, res, { status = 200, error = null, values = {} } = {}) {
    const shopParam = values.shopId || req.query.shop;
    const [shops, shop] = await Promise.all([
        getUserShops(req.user.id, { select: { id: true, shopName: true } }),
        resolveShopForUser(req.user.id, shopParam, { select: { id: true, userId: true, shopName: true } })
    ]);
    const stalls = shop ? await stallLeave.loadShopStalls(req.user.id, shop.id) : [];
    const earliest = stallLeave.earliestStartDate();
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
        maxDays: stallLeave.MAX_RANGE_DAYS,
        values: { stallCode: values.stallCode || String(req.query.stall || '').toUpperCase(), ...values },
        error
    });
}

exports.getForm = (req, res) => renderForm(req, res);

exports.submitForm = async (req, res) => {
    const values = {
        shopId: req.body.shopId,
        stallCode: String(req.body.stallCode || '').trim().toUpperCase(),
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        reason: req.body.reason
    };
    try {
        const shop = await resolveShopForUser(req.user.id, values.shopId, { select: { id: true, userId: true } });
        if (!shop) throw new stallLeave.StallLeaveError('invalid_stall');
        await stallLeave.createLeave({ user: req.user, shop, stallCode: values.stallCode, startKey: values.startDate, endKey: values.endDate, reason: values.reason });
        req.app.locals.clearAdminTodoCache?.();
        return res.redirect('/stall-leave?success=created');
    } catch (error) {
        const code = errorCodeOf(error);
        return renderForm(req, res, { status: 400, error: stallLeave.ERROR_MESSAGES[code] || 'เกิดข้อผิดพลาด', values });
    }
};

exports.cancel = async (req, res) => {
    try {
        await stallLeave.cancelRequest(req.user.id, req.params.id);
        req.app.locals.clearAdminTodoCache?.();
        return res.redirect('/stall-leave?success=cancelled');
    } catch (error) {
        return res.redirect(`/stall-leave?error=${errorCodeOf(error)}`);
    }
};

// --- แอดมิน/staff ---

exports.getAdminPage = async (req, res) => {
    const page = await stallLeave.loadAdminPage(req.query.tab);
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
        refreshBell(req, row.userId);
        return res.redirect('/admin/stall-leaves?success=approved');
    } catch (error) {
        return res.redirect(`/admin/stall-leaves?error=${errorCodeOf(error)}&focus=${Number(req.body.requestId) || ''}`);
    }
};

exports.reject = async (req, res) => {
    try {
        const row = await stallLeave.rejectRequest(req.body.requestId, req.user, req.body.reason);
        refreshBell(req, row.userId);
        return res.redirect('/admin/stall-leaves?success=rejected');
    } catch (error) {
        return res.redirect(`/admin/stall-leaves?error=${errorCodeOf(error)}&focus=${Number(req.body.requestId) || ''}`);
    }
};
