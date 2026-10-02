const prisma = require('../config/prismaClient');
const { buildMyStallHealth } = require('../controllers/marketController');
const { getRenewalPhase, getRenewalOptions } = require('./stallRenewal');
const { getPaymentDeadlineFromLockAssignedAt, getRoundTimeline, toStartOfDay } = require('./bookingRound');
const { getOpenStatus } = require('./shopOpenStatus');
const { getShopViewStats, getShopViewInsights } = require('./shopViews');
const { getPromo, PROMO_MAX_LENGTH } = require('./shopPromo');
const { buildProfileChecks } = require('./shopCompleteness');
const { getAnnouncementsForUser } = require('../controllers/announcementController');

// ข้อมูลหน้าแรกผู้ขาย (/seller): สถานะร้านคืนนี้, สิ่งที่ต้องทำ (เรียงตามความด่วน), ล็อกของฉัน,
// ตัวเลขสรุป และความเคลื่อนไหวล่าสุด — รวมไว้ที่เดียวให้ route บางลง

const ACTIVE_REQUEST_STATUSES = ['APPROVED', 'IN_PROGRESS', 'SUCCESS'];
const REQUEST_STATUS = {
    PENDING: { text: 'รอตรวจสอบร้าน', tone: 'info' },
    APPROVED: { text: 'ผ่านตรวจแล้ว รอจัดล็อก', tone: 'info' },
    IN_PROGRESS: { text: 'ได้ล็อกแล้ว รอชำระเงิน', tone: 'warn' },
    SUCCESS: { text: 'ชำระเงินแล้ว', tone: 'good' },
    REJECTED: { text: 'ไม่ผ่านการตรวจสอบ', tone: 'bad' }
};
const REPAIR_STATUS = { PENDING: 'รอตรวจสอบ', APPROVED: 'อนุมัติแล้ว', IN_PROGRESS: 'กำลังซ่อม', SUCCESS: 'ซ่อมเสร็จ', REJECTED: 'ไม่อนุมัติ' };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseCodes(text) {
    return String(text || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
}

function fmtDate(value) {
    return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function fmtTime(value) {
    return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function greetingOf(now) {
    const h = now.getHours();
    if (h < 11) return 'สวัสดีตอนเช้า';
    if (h < 16) return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
}

async function buildSellerHome(userId, now = new Date()) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            sellerProfile: { select: { id: true } },
            shop: { include: { menuImages: { select: { id: true } }, productImages: { select: { imageUrl: true }, orderBy: { createdAt: 'asc' } } } }
        }
    });
    const sellerName = String(user?.name || '').trim();
    const shop = user?.shop || {};

    // คำขอจองของร้านนี้ — ส่วนใหญ่ไม่ได้ผูก sellerId จึงเทียบชื่อผู้ขายด้วย (เหมือนผังตลาด)
    const requests = await prisma.bookingRequest.findMany({
        where: {
            OR: [
                ...(user?.sellerProfile?.id ? [{ sellerId: user.sellerProfile.id }] : []),
                ...(sellerName ? [{ sellerName }] : [])
            ]
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, zone: true, assignedStallCode: true, createdAt: true, lockAssignedAt: true, paymentConfirmedAt: true }
    });

    // ล็อกของฉัน: คำขอล่าสุดที่ได้ล็อกแล้วเป็นตัวกำหนดสถานะของล็อกนั้น
    const requestByCode = new Map();
    requests.filter((r) => ACTIVE_REQUEST_STATUSES.includes(r.status)).forEach((r) => {
        parseCodes(r.assignedStallCode).forEach((code) => { if (!requestByCode.has(code)) requestByCode.set(code, r); });
    });
    const codes = [...requestByCode.keys()];
    const [stallRows, health, openStatus, viewStats, notices, repairs, announcement] = await Promise.all([
        codes.length
            ? prisma.stall.findMany({ where: { stallCode: { in: codes } }, select: { stallCode: true, status: true, bookingEndDate: true, row: { select: { zone: { select: { code: true } } } } } })
            : [],
        buildMyStallHealth(userId, codes),
        getOpenStatus(userId, now),
        getShopViewStats(userId),
        prisma.stallRenewalNotice.findMany({ where: { userId, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } }, orderBy: { createdAt: 'desc' }, take: 3 }),
        prisma.maintenanceReport.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, category: true, location: true, status: true, createdAt: true } }),
        getAnnouncementsForUser('SELLER').then((list) => list[0] || null)
    ]);
    const stallByCode = new Map(stallRows.map((s) => [s.stallCode.toUpperCase(), s]));

    const today = toStartOfDay(now);
    const stalls = codes.map((code) => {
        const stall = stallByCode.get(code) || {};
        const request = requestByCode.get(code);
        const end = stall.bookingEndDate || null;
        const phase = end ? getRenewalPhase(end, now) : null;
        const renewal = end ? getRenewalOptions(end, now) : null;
        const daysLeft = end ? Math.round((toStartOfDay(end) - today) / DAY_MS) : null;
        const released = stall.status && stall.status !== 'BOOKED';
        return {
            code,
            zone: stall.row?.zone?.code || code.charAt(0),
            requestStatus: request.status,
            requestText: REQUEST_STATUS[request.status]?.text || request.status,
            endDate: end,
            endLabel: end ? fmtDate(end) : '-',
            daysLeft,
            phase: released ? 'released' : phase,
            cutoffAt: renewal ? renewal.cutoffAt : null,
            canExtend: !!(renewal && renewal.isOpen && renewal.fullRoundDays > 0),
            renewalOpen: !!(renewal && renewal.isOpen && now >= renewal.opensAt),
            paymentDeadline: request.status === 'IN_PROGRESS' ? getPaymentDeadlineFromLockAssignedAt(request.lockAssignedAt) : null,
            health: health[code] || {},
            // ล็อกที่ยังใช้งาน = ชำระแล้วและสัญญายังไม่หมด / ที่เหลือพับไว้ใน "ล็อกที่หมดสัญญา/ถูกปล่อย"
            isCurrent: !released && phase !== 'lapsed'
        };
    }).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

    // นับถอยหลังถึงเส้นตาย 20:00 ของล็อกที่ใกล้หมดสิทธิ์ที่สุด (ยังต่อได้)
    const countdownStall = stalls.find((s) => s.cutoffAt && (s.phase === 'active' || s.phase === 'grace') && s.requestStatus === 'SUCCESS');

    const profile = buildProfileChecks(shop);
    const currentZones = stalls.filter((s) => s.isCurrent).map((s) => s.zone);
    const [viewInsights, promo] = await Promise.all([
        getShopViewInsights(userId, currentZones.length ? currentZones : stalls.map((s) => s.zone), now),
        getPromo(userId, now)
    ]);

    // ---------- สิ่งที่ต้องทำ เรียงจากด่วนสุด ----------
    const todo = [];
    // เตือนชำระเงินเฉพาะล็อกที่ยังไม่ถูกปล่อยและเส้นตายยังไม่ผ่าน
    stalls.filter((s) => s.paymentDeadline && new Date(s.paymentDeadline) > now && s.phase !== 'released').forEach((s) => todo.push({
        tone: 'bad', icon: 'bi-cash-coin',
        title: `ชำระเงินล็อก ${s.code}`,
        desc: `ภายใน ${fmtDate(s.paymentDeadline)} ${fmtTime(s.paymentDeadline)} น. ไม่งั้นล็อกอาจถูกปล่อยให้คนอื่น`,
        href: '/booking-status', cta: 'ชำระเงิน'
    }));
    stalls.filter((s) => s.phase === 'grace').forEach((s) => todo.push({
        tone: 'bad', icon: 'bi-alarm',
        title: `ต่อล็อก ${s.code} ก่อน 20:00 วันนี้`,
        desc: s.canExtend ? 'เลยเวลาแล้วล็อกจะถูกเปิดให้คนอื่นจอง' : 'วันนี้สิ้นรอบแล้ว ต่อข้ามรอบไม่ได้ ให้จองรอบใหม่',
        href: s.canExtend ? '/booking-stall/extend' : '/select-zone', cta: s.canExtend ? 'ต่อล็อก' : 'จองรอบใหม่'
    }));
    stalls.filter((s) => s.phase === 'active' && s.renewalOpen && s.requestStatus === 'SUCCESS').forEach((s) => todo.push({
        tone: 'warn', icon: 'bi-arrow-repeat',
        title: `ต่อล็อก ${s.code} ได้แล้ว`,
        desc: `ขายวันสุดท้าย ${s.endLabel} ต่อได้ถึง 20:00 น. ของวันนั้น`,
        href: '/booking-stall/extend', cta: 'ต่อล็อก'
    }));
    // เฉพาะล็อกที่เคยชำระแล้ว (SUCCESS) — ล็อกที่ไม่ได้จ่ายแล้วถูกปล่อยไม่ใช่ "สัญญาหมด"
    const lapsed = stalls.filter((s) => s.requestStatus === 'SUCCESS' && (s.phase === 'lapsed' || s.phase === 'released'));
    if (lapsed.length) todo.push({
        tone: 'warn', icon: 'bi-calendar-x',
        title: `สัญญาล็อก ${lapsed.map((s) => s.code).join(', ')} หมดแล้ว`,
        desc: 'ถ้าจะขายต่อ จองรอบใหม่ได้ที่หน้าเลือกโซน',
        href: '/select-zone', cta: 'จองรอบใหม่'
    });
    stalls.filter((s) => s.health.cleanliness && !s.health.cleanliness.passed).forEach((s) => todo.push({
        tone: 'warn', icon: 'bi-droplet-half',
        title: `ผลตรวจความสะอาดล็อก ${s.code} ไม่ผ่าน`,
        desc: `ตรวจเมื่อ ${fmtDate(s.health.cleanliness.at)} ปรับปรุงก่อนรอบตรวจถัดไป`,
        href: `/market-map?stall=${s.code}`, cta: 'ดูรายละเอียด'
    }));
    const pendingReq = requests.find((r) => r.status === 'PENDING' || r.status === 'APPROVED');
    if (pendingReq) todo.push({
        tone: 'info', icon: 'bi-hourglass-split',
        title: REQUEST_STATUS[pendingReq.status].text,
        desc: `คำขอจองเมื่อ ${fmtDate(pendingReq.createdAt)} ระบบจะแจ้งเมื่อมีความคืบหน้า`,
        href: '/booking-status', cta: 'ดูสถานะ'
    });
    if (!stalls.length && !pendingReq) todo.push({
        tone: 'info', icon: 'bi-shop',
        title: 'ยังไม่มีล็อกในตลาด',
        desc: 'เลือกโซนที่ตรงกับประเภทสินค้า แล้วส่งคำขอจองแผง',
        href: '/select-zone', cta: 'จองแผง'
    });
    if (profile.done < profile.total) {
        const missing = profile.checks.find((c) => !c.done);
        todo.push({
            tone: 'neutral', icon: 'bi-stars',
            title: `เติมข้อมูลร้าน: ${missing.label}`,
            desc: `${missing.why} · ครบแล้ว ${profile.done}/${profile.total}`,
            href: `/shop-profile#${missing.id}`, cta: 'เติมข้อมูล'
        });
    }

    // ---------- ความเคลื่อนไหวล่าสุด ----------
    const activity = [
        ...requests.slice(0, 3).map((r) => ({
            at: r.paymentConfirmedAt || r.lockAssignedAt || r.createdAt,
            icon: 'bi-journal-check',
            tone: REQUEST_STATUS[r.status]?.tone || 'info',
            title: `คำขอจอง${r.assignedStallCode ? ` ล็อก ${r.assignedStallCode}` : ` โซน ${String(r.zone || '-').toUpperCase()}`}`,
            sub: REQUEST_STATUS[r.status]?.text || r.status,
            href: '/booking-status'
        })),
        ...repairs.map((r) => ({
            at: r.createdAt, icon: 'bi-tools', tone: r.status === 'SUCCESS' ? 'good' : 'info',
            title: `แจ้งซ่อม ${r.category} · ${r.location}`, sub: REPAIR_STATUS[r.status] || r.status, href: '/repair'
        })),
        ...notices.map((n) => ({
            at: n.createdAt, icon: 'bi-bell', tone: 'warn',
            title: `แอดมินเตือนต่อล็อก ${n.stallCode}`, sub: `สัญญาถึง ${fmtDate(n.bookingEndDate)}`, href: '/notifications'
        }))
    ].sort((a, b) => new Date(b.at) - new Date(a.at))
        .map((a) => ({ ...a, when: `${fmtDate(a.at)} ${fmtTime(a.at)}` }))
        // คำขอที่ส่งซ้ำพร้อมกัน (หัวข้อ/สถานะ/เวลาเดียวกัน) แสดงแถวเดียว
        .filter((a, i, list) => list.findIndex((b) => b.title === a.title && b.sub === a.sub && b.when === a.when) === i)
        .slice(0, 6);

    const minDaysLeft = stalls.filter((s) => s.daysLeft !== null && s.daysLeft >= 0).reduce((m, s) => Math.min(m, s.daysLeft), Infinity);

    return {
        greeting: greetingOf(now),
        sellerName: user?.name || '',
        todayLabel: now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }),
        shop: {
            name: shop.shopName || 'ยังไม่ได้ตั้งชื่อร้าน',
            productType: shop.productType || '-',
            zoneLabel: shop.shopZoneLabel || '',
            isVerified: !!shop.isVerified,
            summary: shop.shopSummary || shop.productDetail || '',
            image: shop.productImage || shop.productImages?.[0]?.imageUrl || shop.shopCoverImage || null,
            tags: profile.tags,
            menuCount: (shop.menuImages || []).length
        },
        // ปุ่มปิดร้านมีความหมายเฉพาะร้านที่มีล็อกใช้งานอยู่ (สัญญายังไม่หมด/ยังไม่ถูกปล่อย)
        openStatus: stalls.some((st) => st.isCurrent) ? openStatus : null,
        stalls,
        countdown: countdownStall ? { code: countdownStall.code, cutoffAt: countdownStall.cutoffAt, endLabel: countdownStall.endLabel } : null,
        todo,
        kpi: {
            stallCount: stalls.filter((s) => s.requestStatus === 'SUCCESS' && s.phase !== 'released' && s.phase !== 'lapsed').length,
            minDaysLeft: Number.isFinite(minDaysLeft) ? minDaysLeft : null,
            pendingCount: requests.filter((r) => ['PENDING', 'APPROVED', 'IN_PROGRESS'].includes(r.status)).length
        },
        viewStats,
        viewInsights,
        // โปรวันนี้ตั้งได้เฉพาะร้านที่มีล็อกใช้งาน (ลูกค้าเห็นบนผัง)
        promo: stalls.some((st) => st.isCurrent) ? { text: promo ? promo.text : '', maxLength: PROMO_MAX_LENGTH } : null,
        profile,
        roundTimeline: getRoundTimeline(now),
        announcement: announcement ? { ...announcement, when: fmtDate(announcement.createdAt) } : null,
        activity
    };
}

module.exports = { buildSellerHome };
