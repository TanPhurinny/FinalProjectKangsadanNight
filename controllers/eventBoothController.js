// คำขอจัดบูธกิจกรรม (โซน G) — ขั้นตอนคล้ายการจองแผง แต่ส่งได้โดยไม่ต้อง login และไม่ต้องสมัครร้าน
// ผู้ขอ: กรอกฟอร์ม /event-booth → ได้ลิงก์ติดตาม /event-booth/track/:token → แอดมินอนุมัติ (จัดบูธ) → แนบสลิป → แอดมินยืนยัน
// แอดมิน/staff: /admin/event-booths (badge รวมใน navbar ผ่าน countApprovalTodo ของ approvalController)
// กติกาบูธว่าง/ทับช่วงวันอยู่ที่ utils/eventBooth.js ที่ผังตลาดใช้ร่วมกัน
const prisma = require('../config/prismaClient');
const eventBooth = require('../utils/eventBooth');
const { eventBoothRequestSchema } = require('../utils/validationSchemas');
const { toStartOfDay, addDays } = require('../utils/bookingRound');
const { getBillableDays } = require('../utils/bookingHolidays');
const { getPaymentSettings, computePaymentDueAt } = require('../utils/paymentDeadline');
const { verifySlip } = require('../utils/slipVerification');
const { deleteImage } = require('../utils/imageStorage');
const { buildPromptPayQrDataUrl, PROMPTPAY_ID } = require('../utils/promptpayQr');
const { sendEventBoothStatusEmail } = require('../config/mailer');

const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

function publicBaseUrl(req) {
    return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function trackUrlOf(req, request) {
    return `${publicBaseUrl(req)}/event-booth/track/${request.trackingToken}`;
}

function toThaiDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function toThaiDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toDateInput(value) {
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ส่งอีเมลแจ้งผู้ขอแบบไม่รอ/ไม่ให้ล้มทั้งคำขอ (อีเมลพังไม่ควรทำให้บันทึกสถานะไม่สำเร็จ)
function notifyRequester(req, request, subject, lines) {
    if (!request.email) return;
    sendEventBoothStatusEmail(request.email, { subject, lines, trackUrl: trackUrlOf(req, request) })
        .catch((error) => console.error('Event booth email error:', error.message));
}

// ผู้ใช้ที่ login แล้วส่งคำขอ → กระดิ่งผู้ขายต้องเห็นสถานะใหม่ทันที (ล้าง cache 60 วิ ใน app.js)
function refreshRequesterBell(req, request) {
    if (request.userId && req.app.locals.clearSellerNotificationCache) req.app.locals.clearSellerNotificationCache(request.userId);
}

// ช่วงวันที่บูธแต่ละบูธมีงานแล้ว (แสดงในฟอร์มให้เลือกวันที่ว่าง) — ไม่บอกว่าเป็นงานของใคร
async function loadBookedRanges() {
    const rows = await prisma.eventBoothRequest.findMany({
        where: { status: { in: eventBooth.ACTIVE_STATUSES }, assignedStallCode: { not: null }, endDate: { gte: toStartOfDay(new Date()) } },
        orderBy: { startDate: 'asc' },
        select: { assignedStallCode: true, startDate: true, endDate: true }
    });
    const byCode = {};
    rows.forEach((row) => {
        const code = String(row.assignedStallCode).toUpperCase();
        (byCode[code] = byCode[code] || []).push(`${toThaiDate(row.startDate)} – ${toThaiDate(row.endDate)}`);
    });
    return byCode;
}

async function loadBoothStatuses() {
    const stalls = await prisma.stall.findMany({ where: { stallCode: { in: eventBooth.EVENT_BOOTH_CODES } }, select: { stallCode: true, status: true } });
    return Object.fromEntries(stalls.map((stall) => [stall.stallCode, stall.status]));
}

async function renderForm(req, res, { status = 200, error = null, values = null } = {}) {
    let prefill = {};
    if (req.user) {
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, phoneNumber: true, email: true, shop: { select: { shopName: true } } } });
        prefill = {
            companyName: userRecord?.shop?.shopName || '',
            contactName: userRecord?.name || '',
            phone: userRecord?.phoneNumber || '',
            email: userRecord?.email || ''
        };
    }
    const preferred = String(req.query.booth || '').toUpperCase();
    const [bookedRanges, boothStatus] = await Promise.all([loadBookedRanges(), loadBoothStatuses()]);
    const today = toStartOfDay(new Date());

    return res.status(status).render('eventBooth/form', {
        user: req.user || null,
        error,
        values: values || { ...prefill, preferredBooth: eventBooth.isEventBoothCode(preferred) ? preferred : '' },
        booths: eventBooth.EVENT_BOOTHS.map((booth) => ({
            ...booth,
            maintenance: boothStatus[booth.code] === 'MAINTENANCE',
            bookedRanges: bookedRanges[booth.code] || []
        })),
        pricePerDay: eventBooth.getPricePerDay(),
        maxEventDays: eventBooth.MAX_EVENT_DAYS,
        minDate: toDateInput(today),
        maxDate: toDateInput(addDays(today, eventBooth.MAX_ADVANCE_DAYS))
    });
}

exports.getForm = async (req, res) => {
    try {
        return await renderForm(req, res);
    } catch (error) {
        console.error('Event booth form error:', error);
        return res.status(500).send('เปิดฟอร์มขอจัดบูธกิจกรรมไม่สำเร็จ');
    }
};

exports.submitForm = async (req, res) => {
    const values = {
        companyName: req.body.companyName,
        contactName: req.body.contactName,
        phone: req.body.phone,
        email: req.body.email,
        eventTitle: req.body.eventTitle,
        description: req.body.description,
        dateStart: req.body.dateStart,
        dateEnd: req.body.dateEnd,
        preferredBooth: String(req.body.preferredBooth || '').toUpperCase()
    };
    const reject = (message) => renderForm(req, res, { status: 400, error: message, values });

    try {
        const parsed = eventBoothRequestSchema.safeParse(req.body);
        if (!parsed.success) return reject(parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
        const data = parsed.data;

        const startDate = toStartOfDay(`${data.dateStart}T00:00:00`);
        const endDate = toStartOfDay(`${data.dateEnd}T00:00:00`);
        const today = toStartOfDay(new Date());
        if (!startDate || !endDate || endDate < startDate) return reject('วันสิ้นสุดงานต้องไม่ก่อนวันเริ่มงาน');
        if (startDate < today) return reject('ไม่สามารถเลือกวันที่ผ่านมาแล้วได้');
        if (startDate > addDays(today, eventBooth.MAX_ADVANCE_DAYS)) return reject(`ขอจัดบูธล่วงหน้าได้ไม่เกิน ${eventBooth.MAX_ADVANCE_DAYS} วัน`);
        const days = eventBooth.countDays(startDate, endDate);
        if (days > eventBooth.MAX_EVENT_DAYS) return reject(`จัดบูธได้ครั้งละไม่เกิน ${eventBooth.MAX_EVENT_DAYS} วัน`);

        // วันหยุดตลาดที่แอดมินประกาศไม่คิดเงิน (กติกาเดียวกับการจองแผง) — ช่วงที่เลือกเป็นวันหยุดทั้งหมดส่งไม่ได้
        const billableDays = await getBillableDays(startDate, endDate);
        if (billableDays <= 0) return reject('ช่วงวันที่เลือกเป็นวันหยุดตลาดทั้งหมด กรุณาเลือกวันอื่น');

        const pricePerDay = eventBooth.getPricePerDay();
        const created = await prisma.eventBoothRequest.create({
            data: {
                trackingToken: eventBooth.newTrackingToken(),
                companyName: data.companyName,
                contactName: data.contactName,
                phone: data.phone,
                email: data.email || null,
                eventTitle: data.eventTitle,
                description: data.description || null,
                startDate,
                endDate,
                days: billableDays,
                preferredStallCode: data.preferredBooth || null,
                pricePerDay,
                totalAmount: pricePerDay * billableDays,
                userId: req.user?.id || null
            }
        });

        notifyRequester(req, created, `ได้รับคำขอจัดบูธกิจกรรม "${created.eventTitle}" แล้ว`, [
            `ตลาดกังสดาลไนท์ได้รับคำขอจัดบูธกิจกรรม "${created.eventTitle}" (${toThaiDate(startDate)} – ${toThaiDate(endDate)}) แล้ว`,
            'แอดมินจะพิจารณาและแจ้งผลทางอีเมลนี้ หรือดูสถานะได้จากลิงก์ด้านล่าง'
        ]);
        refreshRequesterBell(req, created);

        return res.redirect(`/event-booth/track/${created.trackingToken}?success=submitted`);
    } catch (error) {
        console.error('Event booth submit error:', error);
        return reject('บันทึกคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
};

async function findByToken(token) {
    if (!TOKEN_PATTERN.test(String(token || ''))) return null;
    return prisma.eventBoothRequest.findUnique({ where: { trackingToken: token } });
}

exports.getTrackPage = async (req, res) => {
    try {
        const request = await findByToken(req.params.token);
        if (!request) return res.status(404).render('eventBooth/track', { user: req.user || null, request: null });

        const awaitingPayment = request.status === 'IN_PROGRESS' && !request.paymentSlipImage;
        return res.render('eventBooth/track', {
            user: req.user || null,
            request,
            statusLabel: eventBooth.STATUS_LABEL[request.status] || request.status,
            booth: eventBooth.EVENT_BOOTHS.find((b) => b.code === request.assignedStallCode) || null,
            preferredBooth: eventBooth.EVENT_BOOTHS.find((b) => b.code === request.preferredStallCode) || null,
            dates: { start: toThaiDate(request.startDate), end: toThaiDate(request.endDate), created: toThaiDateTime(request.createdAt), due: toThaiDateTime(request.paymentDueAt) },
            isPastDue: awaitingPayment && request.paymentDueAt && new Date(request.paymentDueAt) < new Date(),
            promptPayQr: awaitingPayment ? await buildPromptPayQrDataUrl(request.totalAmount) : null,
            promptPayId: PROMPTPAY_ID,
            trackUrl: trackUrlOf(req, request),
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Event booth track error:', error);
        return res.status(500).send('เปิดหน้าติดตามคำขอไม่สำเร็จ');
    }
};

// แนบสลิปได้ตอนอนุมัติแล้ว (IN_PROGRESS) และยังไม่มีสลิป — ตรวจสลิปอัตโนมัติด้วย SlipOK แบบเดียวกับการจองแผง
exports.uploadSlip = async (req, res) => {
    const back = (query) => res.redirect(`/event-booth/track/${encodeURIComponent(req.params.token)}?${query}`);
    try {
        const request = await findByToken(req.params.token);
        if (!request) {
            if (req.file) await deleteImage(req.file.url).catch(() => {});
            return res.status(404).send('ไม่พบคำขอ');
        }
        if (!req.file) return back('error=missing_slip');
        if (request.status !== 'IN_PROGRESS' || request.paymentSlipImage) {
            await deleteImage(req.file.url).catch(() => {});
            return back('error=not_awaiting_payment');
        }

        const verifyResult = await verifySlip(req.file.url, request.totalAmount);
        await prisma.eventBoothRequest.update({
            where: { id: request.id },
            data: {
                paymentSlipImage: req.file.url,
                slipVerified: verifyResult ? verifyResult.ok : null,
                slipVerifyReason: verifyResult ? (verifyResult.reason || null) : null,
                slipVerifiedAmount: verifyResult && Number.isFinite(verifyResult.amount) ? verifyResult.amount : null
            }
        });
        refreshRequesterBell(req, request);
        return back('success=slip_uploaded');
    } catch (error) {
        console.error('Event booth slip upload error:', error);
        return back('error=upload_failed');
    }
};

exports.removeSlip = async (req, res) => {
    const back = (query) => res.redirect(`/event-booth/track/${encodeURIComponent(req.params.token)}?${query}`);
    try {
        const request = await findByToken(req.params.token);
        if (!request) return res.status(404).send('ไม่พบคำขอ');
        if (request.status !== 'IN_PROGRESS' || !request.paymentSlipImage) return back('error=no_slip_to_remove');
        await prisma.eventBoothRequest.update({
            where: { id: request.id },
            data: { paymentSlipImage: null, slipVerified: null, slipVerifyReason: null, slipVerifiedAmount: null }
        });
        await deleteImage(request.paymentSlipImage).catch(() => {});
        return back('success=slip_removed');
    } catch (error) {
        console.error('Event booth slip remove error:', error);
        return back('error=remove_slip_failed');
    }
};

// ---------------- แอดมิน/staff ----------------

const ADMIN_TABS = [
    { key: 'pending', label: 'รออนุมัติ', match: (r) => r.status === 'PENDING' },
    { key: 'awaiting_payment', label: 'รอชำระเงิน', match: (r) => r.status === 'IN_PROGRESS' && !r.paymentSlipImage },
    { key: 'slip', label: 'รอยืนยันสลิป', match: (r) => r.status === 'IN_PROGRESS' && Boolean(r.paymentSlipImage) },
    { key: 'success', label: 'ชำระแล้ว', match: (r) => r.status === 'SUCCESS' },
    { key: 'rejected', label: 'ไม่อนุมัติ', match: (r) => r.status === 'REJECTED' }
];

exports.getAdminPage = async (req, res) => {
    try {
        const [requests, boothStatus] = await Promise.all([
            prisma.eventBoothRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
            loadBoothStatuses()
        ]);
        const now = new Date();
        const rows = requests.map((r) => ({
            ...r,
            tab: (ADMIN_TABS.find((t) => t.match(r)) || ADMIN_TABS[0]).key,
            statusLabel: eventBooth.STATUS_LABEL[r.status] || r.status,
            startText: toThaiDate(r.startDate),
            endText: toThaiDate(r.endDate),
            createdText: toThaiDateTime(r.createdAt),
            dueText: toThaiDateTime(r.paymentDueAt),
            isPastDue: r.status === 'IN_PROGRESS' && !r.paymentSlipImage && r.paymentDueAt && new Date(r.paymentDueAt) < now,
            isGuest: !r.userId
        }));
        const counts = Object.fromEntries(ADMIN_TABS.map((t) => [t.key, rows.filter((r) => r.tab === t.key).length]));
        const requestedTab = String(req.query.tab || '');
        const focusId = Number.parseInt(req.query.focus, 10) || null;
        const focusRow = focusId ? rows.find((r) => r.id === focusId) : null;
        const activeTab = focusRow ? focusRow.tab
            : ADMIN_TABS.some((t) => t.key === requestedTab) ? requestedTab
            : (counts.pending ? 'pending' : counts.slip ? 'slip' : 'pending');

        return res.render('admin/eventBooths', {
            user: req.user,
            tabs: ADMIN_TABS.map(({ key, label }) => ({ key, label, count: counts[key] })),
            activeTab,
            rows,
            focusId,
            booths: eventBooth.EVENT_BOOTHS.map((b) => ({ ...b, maintenance: boothStatus[b.code] === 'MAINTENANCE' })),
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Admin event booths error:', error);
        return res.status(500).send('โหลดหน้าคำขอบูธกิจกรรมไม่สำเร็จ');
    }
};

function adminBack(res, request, query) {
    const focus = request ? `&focus=${request.id}` : '';
    return res.redirect(`/admin/event-booths?${query}${focus}`);
}

async function findForAdmin(req) {
    const id = Number.parseInt(req.body.requestId, 10);
    return id ? prisma.eventBoothRequest.findUnique({ where: { id } }) : null;
}

// อนุมัติ = จัดบูธให้ (IN_PROGRESS) แล้วผู้ขอชำระเงิน — เช็คบูธไม่อยู่ระหว่างซ่อมและไม่ทับช่วงวันกับงานอื่น
exports.approve = async (req, res) => {
    try {
        const request = await findForAdmin(req);
        if (!request) return adminBack(res, null, 'error=not_found');
        if (request.status !== 'PENDING') return adminBack(res, request, 'error=not_pending');

        const stallCode = String(req.body.stallCode || '').trim().toUpperCase();
        if (!eventBooth.isEventBoothCode(stallCode)) return adminBack(res, request, 'error=invalid_booth');

        const stall = await prisma.stall.findUnique({ where: { stallCode }, select: { status: true } });
        if (!stall) return adminBack(res, request, 'error=invalid_booth');
        if (stall.status === 'MAINTENANCE') return adminBack(res, request, 'error=booth_maintenance');

        const overlap = await eventBooth.findOverlappingRequest(stallCode, request.startDate, request.endDate, request.id);
        if (overlap) return adminBack(res, request, `error=booth_overlap&overlap=${overlap.id}`);

        const now = new Date();
        const paymentDueAt = computePaymentDueAt(now, request.startDate, await getPaymentSettings());
        const updated = await prisma.eventBoothRequest.update({
            where: { id: request.id },
            data: { status: 'IN_PROGRESS', assignedStallCode: stallCode, paymentDueAt, decidedByName: req.user?.name || req.user?.username || null }
        });

        notifyRequester(req, updated, `อนุมัติคำขอจัดบูธกิจกรรม "${updated.eventTitle}" แล้ว — กรุณาชำระเงิน`, [
            `แอดมินอนุมัติและจัดบูธ ${stallCode} ให้งาน "${updated.eventTitle}" (${toThaiDate(updated.startDate)} – ${toThaiDate(updated.endDate)}) แล้ว`,
            `ยอดชำระ ${updated.totalAmount.toLocaleString('th-TH')} บาท กรุณาชำระและแนบสลิปภายใน ${toThaiDateTime(paymentDueAt)}`
        ]);
        refreshRequesterBell(req, updated);
        return adminBack(res, updated, 'success=approved');
    } catch (error) {
        console.error('Event booth approve error:', error);
        return adminBack(res, null, 'error=action_failed');
    }
};

// ไม่อนุมัติได้ทั้งตอนรออนุมัติ และตอนอนุมัติแล้วแต่ยังไม่ยืนยันชำระ (เช่น เลยกำหนดชำระ) — บูธกลับมาว่างทันที
exports.reject = async (req, res) => {
    try {
        const request = await findForAdmin(req);
        if (!request) return adminBack(res, null, 'error=not_found');
        if (!['PENDING', 'IN_PROGRESS'].includes(request.status)) return adminBack(res, request, 'error=cannot_reject');

        const reason = String(req.body.reason || '').trim().slice(0, 500);
        if (!reason) return adminBack(res, request, 'error=missing_reason');

        const updated = await prisma.eventBoothRequest.update({
            where: { id: request.id },
            data: { status: 'REJECTED', rejectReason: reason, decidedByName: req.user?.name || req.user?.username || null }
        });
        notifyRequester(req, updated, `ผลการพิจารณาคำขอจัดบูธกิจกรรม "${updated.eventTitle}"`, [
            `ขออภัย คำขอจัดบูธกิจกรรม "${updated.eventTitle}" ไม่ได้รับการอนุมัติ`,
            `เหตุผล: ${reason}`
        ]);
        refreshRequesterBell(req, updated);
        return adminBack(res, updated, 'success=rejected');
    } catch (error) {
        console.error('Event booth reject error:', error);
        return adminBack(res, null, 'error=action_failed');
    }
};

exports.confirmPayment = async (req, res) => {
    try {
        const request = await findForAdmin(req);
        if (!request) return adminBack(res, null, 'error=not_found');
        if (request.status !== 'IN_PROGRESS' || !request.paymentSlipImage) return adminBack(res, request, 'error=no_slip');

        const updated = await prisma.eventBoothRequest.update({
            where: { id: request.id },
            data: { status: 'SUCCESS', paymentConfirmedAt: new Date(), decidedByName: req.user?.name || req.user?.username || null }
        });
        notifyRequester(req, updated, `ยืนยันการชำระเงินบูธกิจกรรม ${updated.assignedStallCode} แล้ว`, [
            `แอดมินยืนยันการชำระเงินของงาน "${updated.eventTitle}" แล้ว บูธ ${updated.assignedStallCode} พร้อมใช้งานวันที่ ${toThaiDate(updated.startDate)} – ${toThaiDate(updated.endDate)}`
        ]);
        refreshRequesterBell(req, updated);
        return adminBack(res, updated, 'success=payment_confirmed');
    } catch (error) {
        console.error('Event booth confirm payment error:', error);
        return adminBack(res, null, 'error=action_failed');
    }
};

// ตีกลับสลิป (ยอดไม่ตรง/ไม่ใช่สลิปจริง) — ลบสลิปให้ผู้ขอแนบใหม่ คงสถานะรอชำระ เก็บเหตุผลไว้ให้ผู้ขอเห็น
exports.rejectSlip = async (req, res) => {
    try {
        const request = await findForAdmin(req);
        if (!request) return adminBack(res, null, 'error=not_found');
        if (request.status !== 'IN_PROGRESS' || !request.paymentSlipImage) return adminBack(res, request, 'error=no_slip');

        const reason = String(req.body.reason || '').trim().slice(0, 300) || 'สลิปไม่ถูกต้อง';
        await prisma.eventBoothRequest.update({
            where: { id: request.id },
            data: { paymentSlipImage: null, slipVerified: null, slipVerifiedAmount: null, slipVerifyReason: `แอดมินตีกลับสลิป: ${reason}` }
        });
        await deleteImage(request.paymentSlipImage).catch(() => {});
        notifyRequester(req, request, `กรุณาแนบสลิปบูธกิจกรรม "${request.eventTitle}" ใหม่`, [
            `แอดมินตรวจสลิปของงาน "${request.eventTitle}" แล้วไม่ผ่าน: ${reason}`,
            'กรุณาแนบสลิปใหม่ได้ที่ลิงก์ด้านล่าง'
        ]);
        refreshRequesterBell(req, request);
        return adminBack(res, request, 'success=slip_rejected');
    } catch (error) {
        console.error('Event booth reject slip error:', error);
        return adminBack(res, null, 'error=action_failed');
    }
};
