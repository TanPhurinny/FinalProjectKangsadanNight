// ลาหยุด / ปล่อยเช่าช่วงแผง (ตาราง StallLeaveRequest) — กติกาทั้งหมดอยู่ที่ไฟล์นี้
// - ทำได้เฉพาะแผงที่ร้านเช่าและชำระแล้ว (Booking SUCCESS ครอบทุกวันในช่วงที่ขอ) และแผงยังไม่ถูกปล่อย (Stall.status = BOOKED)
// - วันแรกต้องยังไม่เลยเส้นตาย: แจ้งวันนี้ได้ถึง NOTICE_CUTOFF_HOUR:00 ของวันขายนั้น เลยแล้วเริ่มได้พรุ่งนี้ (วันขายตัดตี 5 เหมือน shopOpenStatus)
// - ช่วงวันห้ามซ้อนกับคำขอที่ยังมีผล (รอ/อนุมัติแล้ว) ของแผงเดียวกัน
// - ไม่มีเงินเข้าออก: ลาหยุดไม่คืนค่าเช่า, เช่าช่วงร้านตกลงเงินกันเอง ใบกำกับภาษียังเป็นของเจ้าของแผง
// - ไม่ใช้กับบูธกิจกรรมโซน G
const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays } = require('./bookingRound');
const { businessDateOf } = require('./shopOpenStatus');
const { extractBookingRequestId } = require('./bookingRequestTag');
const { shopsOfRequests } = require('./shops');
const { isEventBoothCode } = require('./eventBooth');
const crypto = require('crypto');
const { PRODUCT_TYPE_LABELS, loadCustomSubtypes, isAllowedSubtype } = require('./productSubtypes');

const NOTICE_CUTOFF_HOUR = 12;
const MAX_RANGE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
// สถานะที่ยังกันช่วงวันของแผงไว้ (ห้ามขอซ้อน)
const ACTIVE_STATUSES = ['WAITING_SUBTENANT', 'PENDING', 'APPROVED'];
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// ลิงก์ให้คนนอกกรอกข้อมูลเอง ใช้ได้ 72 ชม. (และไม่เกินวันเริ่มเช่าช่วง — ดู expireStale)
const GUEST_LINK_HOURS = 72;
const GUEST_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const GUEST_MAX_IMAGES = 3;

const KIND_LABEL = {
    LEAVE: 'ลาหยุด',
    SUBLET_MEMBER: 'เช่าช่วง (ร้านสมาชิก)',
    SUBLET_GUEST: 'เช่าช่วง (ร้านนอกตลาด)'
};
const STATUS_LABEL = {
    WAITING_SUBTENANT: 'รอผู้รับเช่าช่วง',
    PENDING: 'รอแอดมินพิจารณา',
    APPROVED: 'อนุมัติแล้ว',
    REJECTED: 'ไม่อนุมัติ',
    CANCELLED: 'ยกเลิกแล้ว',
    EXPIRED: 'ลิงก์หมดอายุ'
};
const ERROR_MESSAGES = {
    invalid_stall: 'ไม่พบแผงนี้ในร้านของคุณ',
    invalid_dates: 'กรุณาเลือกวันเริ่มและวันสิ้นสุดให้ถูกต้อง',
    range_too_long: `ขอได้ครั้งละไม่เกิน ${MAX_RANGE_DAYS} วัน`,
    too_late: `เลยเวลาแจ้งของวันนี้แล้ว (ต้องแจ้งก่อน ${NOTICE_CUTOFF_HOUR}:00 น. ของวันนั้น) เลือกวันเริ่มเป็นพรุ่งนี้ขึ้นไป`,
    not_covered: 'ช่วงวันที่เลือกต้องอยู่ในสัญญาเช่าที่ชำระเงินแล้วของแผงนี้',
    overlap: 'แผงนี้มีคำขอลาหยุด/เช่าช่วงในช่วงวันนี้อยู่แล้ว',
    event_booth: 'บูธกิจกรรมโซน G ลาหยุด/ให้เช่าช่วงไม่ได้',
    missing_reason: 'กรุณากรอกเหตุผล',
    not_found: 'ไม่พบคำขอ',
    cannot_cancel: 'คำขอนี้ยกเลิกไม่ได้แล้ว (ถึงวันเริ่มแล้วหรือปิดไปแล้ว)',
    not_pending: 'คำขอนี้ไม่ได้อยู่ในขั้นรอแอดมินแล้ว',
    stall_released: 'แผงนี้ถูกปล่อย/สัญญาหมดแล้ว อนุมัติไม่ได้',
    missing_subtenant: 'กรุณาเลือกร้านที่จะให้เช่าช่วง',
    invalid_subtenant: 'ร้านที่เลือกรับเช่าช่วงไม่ได้ (ไม่พบร้าน เป็นร้านของคุณเอง หรือถูกระงับสิทธิ์)',
    not_waiting: 'คำขอนี้ไม่ได้รอให้คุณตอบรับแล้ว',
    link_invalid: 'ลิงก์นี้ใช้ไม่ได้แล้ว (หมดอายุ ถูกยกเลิก หรือกรอกข้อมูลไปแล้ว)',
    guest_name: 'กรุณากรอกชื่อ-นามสกุล',
    guest_phone: 'เบอร์โทรไม่ถูกต้อง (ตัวเลข 9–10 หลัก)',
    guest_idcard: 'เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก)',
    guest_product: 'กรุณาเลือกประเภทและชนิดสินค้าที่จะขาย',
    guest_detail: 'กรุณาอธิบายสินค้าที่จะขายสั้นๆ',
    guest_images: `กรุณาแนบรูปสินค้า 1–${GUEST_MAX_IMAGES} รูป`,
    guest_terms: 'กรุณายอมรับกติกาการเช่าช่วงของตลาด',
    upload_failed: 'อัปโหลดรูปไม่สำเร็จ (ไฟล์รูปไม่เกิน 5MB)',
    action_failed: 'บันทึกไม่สำเร็จ กรุณาลองใหม่'
};

class StallLeaveError extends Error {
    constructor(code) {
        super(ERROR_MESSAGES[code] || code);
        this.code = code;
    }
}

function toDateKey(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateKey(value) {
    if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return null;
    const date = toStartOfDay(`${value}T00:00:00`);
    return date && toDateKey(date) === value ? date : null;
}

function thaiDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function thaiTime(value) {
    return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function dayCount(start, end) {
    return Math.round((toStartOfDay(end) - toStartOfDay(start)) / DAY_MS) + 1;
}

function rangeText(row) {
    const days = dayCount(row.startDate, row.endDate);
    return days === 1 ? thaiDate(row.startDate) : `${thaiDate(row.startDate)} – ${thaiDate(row.endDate)} (${days} วัน)`;
}

// วันแรกสุดที่ยังขอได้: วันขายนี้ถ้ายังไม่เลยเที่ยง ไม่งั้นพรุ่งนี้
function earliestStartDate(now = new Date()) {
    const today = businessDateOf(now);
    const cutoff = new Date(today.getTime() + NOTICE_CUTOFF_HOUR * 60 * 60 * 1000);
    return now < cutoff ? today : addDays(today, 1);
}

// แผงที่ร้านนี้ถืออยู่และชำระแล้ว (สัญญายังไม่หมด) — แต่ละแผงมีช่วงสัญญา (อาจหลายช่วงต่อกันจากการต่อล็อก)
// shopId = ร้านของคำขอจอง (คำขอเก่าที่ไม่มี shopId = ร้านหลัก)
async function loadShopStalls(userId, shopId, now = new Date()) {
    const today = businessDateOf(now);
    const bookings = await prisma.booking.findMany({
        where: { userId, status: 'SUCCESS', rentalEndDate: { gte: today } },
        select: { rentalStartDate: true, rentalEndDate: true, storeDetailSnapshot: true, slot: { select: { slotNumber: true } } }
    });
    const requestIds = [...new Set(bookings.map((b) => extractBookingRequestId(b.storeDetailSnapshot)).filter(Boolean))];
    const requests = requestIds.length
        ? await prisma.bookingRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, userId: true, shopId: true } })
        : [];
    const shopOf = await shopsOfRequests(requests);

    const byCode = new Map();
    bookings.forEach((booking) => {
        const code = String(booking.slot?.slotNumber || '').trim().toUpperCase();
        const requestId = extractBookingRequestId(booking.storeDetailSnapshot);
        if (!code || isEventBoothCode(code) || !booking.rentalStartDate || !booking.rentalEndDate) return;
        const shop = requestId ? shopOf.get(requestId) : null;
        if (!shop || shop.id !== Number(shopId)) return;
        if (!byCode.has(code)) byCode.set(code, { code, ranges: [] });
        byCode.get(code).ranges.push({ start: toStartOfDay(booking.rentalStartDate), end: toStartOfDay(booking.rentalEndDate), requestId });
    });
    if (!byCode.size) return [];

    // แผงที่ถูกปล่อยแล้ว (คำขอ SUCCESS ค้างไว้ตามตั้งใจ ดู utils/stallRenewal.js) ไม่นับ
    const stalls = await prisma.stall.findMany({ where: { stallCode: { in: [...byCode.keys()] } }, select: { stallCode: true, status: true } });
    const booked = new Set(stalls.filter((s) => s.status === 'BOOKED').map((s) => s.stallCode.toUpperCase()));
    return [...byCode.values()]
        .filter((stall) => booked.has(stall.code))
        .map((stall) => {
            stall.ranges.sort((a, b) => a.start - b.start);
            return {
                ...stall,
                contractStart: stall.ranges[0].start,
                contractEnd: stall.ranges.reduce((max, r) => (r.end > max ? r.end : max), stall.ranges[0].end)
            };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
}

// ตรวจช่วงวันที่ขอ — คืน bookingRequestId ของสัญญาที่ครอบวันแรก
function checkCoverage(stall, start, end) {
    let requestId = null;
    for (let day = start; day <= end; day = addDays(day, 1)) {
        const range = stall.ranges.find((r) => r.start <= day && r.end >= day);
        if (!range) throw new StallLeaveError('not_covered');
        if (!requestId) requestId = range.requestId;
    }
    return requestId;
}

async function assertNoOverlap(stallCode, start, end, excludeId = null, statuses = ACTIVE_STATUSES) {
    const clash = await prisma.stallLeaveRequest.findFirst({
        where: {
            stallCode,
            status: { in: statuses },
            startDate: { lte: end },
            endDate: { gte: start },
            ...(excludeId ? { id: { not: excludeId } } : {})
        },
        select: { id: true }
    });
    if (clash) throw new StallLeaveError('overlap');
}

// ตรวจทุกเงื่อนไขของคำขอใหม่ — คืน { stall, start, end, bookingRequestId }
async function validateRequest({ userId, shopId, stallCode, startKey, endKey, now = new Date() }) {
    const code = String(stallCode || '').trim().toUpperCase();
    if (isEventBoothCode(code)) throw new StallLeaveError('event_booth');
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey || startKey);
    if (!start || !end || end < start) throw new StallLeaveError('invalid_dates');
    if (dayCount(start, end) > MAX_RANGE_DAYS) throw new StallLeaveError('range_too_long');
    if (start < earliestStartDate(now)) throw new StallLeaveError('too_late');
    const stall = (await loadShopStalls(userId, shopId, now)).find((s) => s.code === code);
    if (!stall) throw new StallLeaveError('invalid_stall');
    const bookingRequestId = checkCoverage(stall, start, end);
    await assertNoOverlap(code, start, end);
    return { stall, start, end, bookingRequestId };
}

function cleanReason(value) {
    const reason = String(value || '').trim().slice(0, 1000);
    if (!reason) throw new StallLeaveError('missing_reason');
    return reason;
}

// ลาหยุด: ร้านเลือกแผง/วัน/เหตุผล → รอแอดมิน
async function createLeave({ user, shop, stallCode, startKey, endKey, reason, now = new Date() }) {
    const text = cleanReason(reason);
    const checked = await validateRequest({ userId: user.id, shopId: shop.id, stallCode, startKey, endKey, now });
    return prisma.stallLeaveRequest.create({
        data: {
            kind: 'LEAVE',
            status: 'PENDING',
            userId: user.id,
            shopId: shop.id,
            bookingRequestId: checked.bookingRequestId,
            stallCode: checked.stall.code,
            startDate: checked.start,
            endDate: checked.end,
            reason: text
        }
    });
}

// คำขอที่ยังรอผู้รับเช่าช่วง (ยังไม่ตอบรับ/ยังไม่กรอกข้อมูล) แล้วเลยวันเริ่ม หรือลิงก์คนนอกหมดอายุ → EXPIRED
// อัปเดตตอนอ่าน ไม่ต้องมี job
async function expireStale(now = new Date()) {
    await prisma.stallLeaveRequest.updateMany({
        where: {
            status: 'WAITING_SUBTENANT',
            OR: [{ startDate: { lt: earliestStartDate(now) } }, { guestTokenExpiresAt: { lt: now } }]
        },
        data: { status: 'EXPIRED' }
    });
}

// ร้านสมาชิกที่รับเช่าช่วงได้: ร้านของผู้ขาย (SELLER) ที่ไม่ใช่ของตัวเองและไม่ติด blacklist
function subtenantShopWhere(excludeUserId, userExtra = {}) {
    return { userId: { not: excludeUserId }, user: { role: 'SELLER', isBlacklisted: false, ...userExtra } };
}

function maskPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 4 ? `xxx-xxx-${digits.slice(-4)}` : '';
}

// ค้นร้านสมาชิก: ชื่อร้านค้นบางส่วนได้ / เบอร์โทรต้องตรงทั้งเบอร์ (กันการไล่ดูข้อมูลสมาชิกด้วยเลขบางส่วน)
// คืนเฉพาะข้อมูลที่จำเป็นต่อการเลือก — ไม่คืนเบอร์เต็ม ชื่อจริง หรือที่อยู่
async function searchMemberShops(query, excludeUserId) {
    const q = String(query || '').trim().slice(0, 60);
    const digits = q.replace(/[\s-]/g, '');
    let where;
    if (/^\d{9,10}$/.test(digits)) {
        // เบอร์ในระบบเก็บทั้งแบบตัวเลขล้วนและแบบมีขีด (089-111-2222)
        const dashed = digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
        where = subtenantShopWhere(excludeUserId, { phoneNumber: { in: [...new Set([digits, dashed])] } });
    } else if (q.length >= 2 && !/^\d+$/.test(digits)) {
        where = { ...subtenantShopWhere(excludeUserId), shopName: { contains: q } };
    } else {
        return [];
    }
    const shops = await prisma.shopDetail.findMany({
        where,
        take: 10,
        orderBy: { shopName: 'asc' },
        select: { id: true, shopName: true, productType: true, productSubtype: true, logoImage: true, productImage: true, user: { select: { phoneNumber: true } } }
    });
    return shops.map((shop) => ({
        id: shop.id,
        shopName: shop.shopName || 'ร้านไม่มีชื่อ',
        productType: shop.productType || '',
        productSubtype: shop.productSubtype || '',
        image: shop.logoImage || shop.productImage || null,
        phoneMasked: maskPhone(shop.user?.phoneNumber)
    }));
}

// ร้านที่เลือกไว้ในฟอร์ม (กลับมาหน้าเดิมหลังส่งไม่ผ่าน) — รูปแบบเดียวกับผลค้นหา
async function searchMemberShopById(subShopId, excludeUserId) {
    const id = Number.parseInt(subShopId, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    const shop = await prisma.shopDetail.findFirst({
        where: { id, ...subtenantShopWhere(excludeUserId) },
        select: { id: true, shopName: true, productType: true, productSubtype: true, logoImage: true, productImage: true, user: { select: { phoneNumber: true } } }
    });
    if (!shop) return null;
    return {
        id: shop.id,
        shopName: shop.shopName || 'ร้านไม่มีชื่อ',
        productType: shop.productType || '',
        productSubtype: shop.productSubtype || '',
        image: shop.logoImage || shop.productImage || null,
        phoneMasked: maskPhone(shop.user?.phoneNumber)
    };
}

async function findSubtenantShop(subShopId, excludeUserId) {
    const id = Number.parseInt(subShopId, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    return prisma.shopDetail.findFirst({ where: { id, ...subtenantShopWhere(excludeUserId) }, select: { id: true, userId: true, shopName: true } });
}

// เช่าช่วงให้ร้านสมาชิก: รอร้านผู้รับตอบรับก่อน (WAITING_SUBTENANT) แล้วค่อยถึงแอดมิน
async function createMemberSublet({ user, shop, stallCode, startKey, endKey, reason, subShopId, now = new Date() }) {
    const text = cleanReason(reason);
    if (!subShopId) throw new StallLeaveError('missing_subtenant');
    const subShop = await findSubtenantShop(subShopId, user.id);
    if (!subShop) throw new StallLeaveError('invalid_subtenant');
    const checked = await validateRequest({ userId: user.id, shopId: shop.id, stallCode, startKey, endKey, now });
    return prisma.stallLeaveRequest.create({
        data: {
            kind: 'SUBLET_MEMBER',
            status: 'WAITING_SUBTENANT',
            userId: user.id,
            shopId: shop.id,
            bookingRequestId: checked.bookingRequestId,
            stallCode: checked.stall.code,
            startDate: checked.start,
            endDate: checked.end,
            reason: text,
            subShopId: subShop.id
        }
    });
}

// ร้านผู้รับเช่าช่วง (สมาชิก) ตอบรับ → ส่งต่อให้แอดมิน / ปฏิเสธ → ปิดคำขอ แจ้งเจ้าของแผง
async function respondAsSubtenant(subUserId, id, accept, now = new Date()) {
    await expireStale(now);
    const row = await prisma.stallLeaveRequest.findUnique({ where: { id: Number(id) || 0 } });
    if (!row || row.kind !== 'SUBLET_MEMBER' || !row.subShopId) throw new StallLeaveError('not_found');
    const subShop = await prisma.shopDetail.findFirst({ where: { id: row.subShopId, userId: subUserId }, select: { id: true, shopName: true } });
    if (!subShop) throw new StallLeaveError('not_found');
    if (row.status !== 'WAITING_SUBTENANT') throw new StallLeaveError('not_waiting');
    return prisma.stallLeaveRequest.update({
        where: { id: row.id },
        data: accept
            ? { status: 'PENDING', subtenantAcceptedAt: now }
            : { status: 'REJECTED', reviewedAt: now, rejectReason: `ร้าน ${subShop.shopName || 'ผู้รับเช่าช่วง'} ปฏิเสธการรับเช่าช่วง` }
    });
}

// คำขอที่ร้านอื่นขอให้ร้านของผู้ใช้นี้เช่าช่วง (หน้า /stall-leave ส่วน "คำขอให้ร้านคุณเช่าช่วง")
async function listIncoming(userId, now = new Date()) {
    await expireStale(now);
    const myShops = await prisma.shopDetail.findMany({ where: { userId }, select: { id: true } });
    if (!myShops.length) return [];
    const rows = await prisma.stallLeaveRequest.findMany({
        where: { kind: 'SUBLET_MEMBER', subShopId: { in: myShops.map((s) => s.id) }, createdAt: { gte: addDays(now, -90) } },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
    const names = await shopNamesOf(rows);
    return rows.map((row) => ({ ...decorate(row, names, now), canRespond: row.status === 'WAITING_SUBTENANT' }));
}

// --- เช่าช่วงให้คนนอก (ไม่ใช่สมาชิกตลาด) ---
// เจ้าของแผงสร้างคำขอ → ได้ลิงก์ /sublet/guest/:token ส่งให้คนนอกกรอกข้อมูล/รูปสินค้าเอง → PENDING (ถึงแอดมิน)

function newGuestToken() {
    return crypto.randomBytes(24).toString('hex');
}

async function createGuestSublet({ user, shop, stallCode, startKey, endKey, reason, now = new Date() }) {
    const text = cleanReason(reason);
    const checked = await validateRequest({ userId: user.id, shopId: shop.id, stallCode, startKey, endKey, now });
    return prisma.stallLeaveRequest.create({
        data: {
            kind: 'SUBLET_GUEST',
            status: 'WAITING_SUBTENANT',
            userId: user.id,
            shopId: shop.id,
            bookingRequestId: checked.bookingRequestId,
            stallCode: checked.stall.code,
            startDate: checked.start,
            endDate: checked.end,
            reason: text,
            guestToken: newGuestToken(),
            guestTokenExpiresAt: new Date(now.getTime() + GUEST_LINK_HOURS * 60 * 60 * 1000)
        }
    });
}

// คำขอของลิงก์คนนอก (ทุกสถานะ — หน้าลิงก์บอกสถานะต่อได้หลังกรอกแล้ว)
async function findGuestRequest(token, now = new Date()) {
    if (!GUEST_TOKEN_PATTERN.test(String(token || ''))) return null;
    await expireStale(now);
    const row = await prisma.stallLeaveRequest.findUnique({ where: { guestToken: token } });
    if (!row || row.kind !== 'SUBLET_GUEST') return null;
    const names = await shopNamesOf([row]);
    return decorate(row, names, now);
}

// เลขบัตรประชาชนไทย 13 หลัก + หลักตรวจสอบ
function isValidThaiId(value) {
    if (!/^\d{13}$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(value[i]) * (13 - i);
    return (11 - (sum % 11)) % 10 === Number(value[12]);
}

// ตรวจข้อมูลที่คนนอกกรอก — คืนค่าที่ทำความสะอาดแล้ว (โยน StallLeaveError ถ้าไม่ผ่าน)
async function cleanGuestInput(body, imageUrls) {
    await loadCustomSubtypes();
    const name = String(body.guestName || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const phone = String(body.guestPhone || '').replace(/[\s-]/g, '');
    const idCard = String(body.guestIdCard || '').replace(/[\s-]/g, '');
    const productType = String(body.guestProductType || '');
    const productSubtype = String(body.guestProductSubtype || '').trim();
    const detail = String(body.guestProductDetail || '').trim().slice(0, 1000);
    if (name.length < 2) throw new StallLeaveError('guest_name');
    if (!/^0\d{8,9}$/.test(phone)) throw new StallLeaveError('guest_phone');
    if (!isValidThaiId(idCard)) throw new StallLeaveError('guest_idcard');
    if (!PRODUCT_TYPE_LABELS[productType]) throw new StallLeaveError('guest_product');
    // "อื่นๆ" ไม่มีรายการให้เลือกครบทุกอย่าง — ไม่บังคับชนิดสินค้า แต่ถ้าเลือกต้องเป็นรายการในระบบ
    if (productSubtype ? !isAllowedSubtype(productSubtype) : productType !== 'อื่นๆ') throw new StallLeaveError('guest_product');
    if (detail.length < 5) throw new StallLeaveError('guest_detail');
    if (!imageUrls.length || imageUrls.length > GUEST_MAX_IMAGES) throw new StallLeaveError('guest_images');
    if (body.acceptTerms !== 'on' && body.acceptTerms !== '1') throw new StallLeaveError('guest_terms');
    return { name, phone, idCard, productType, productSubtype, detail };
}

async function submitGuestInfo(token, body, imageUrls, now = new Date()) {
    const row = await findGuestRequest(token, now);
    if (!row || row.status !== 'WAITING_SUBTENANT') throw new StallLeaveError('link_invalid');
    const input = await cleanGuestInput(body, imageUrls);
    // กันส่งซ้ำพร้อมกัน 2 ครั้ง: อัปเดตเฉพาะตอนที่ยังรอข้อมูลอยู่
    const result = await prisma.stallLeaveRequest.updateMany({
        where: { id: row.id, status: 'WAITING_SUBTENANT' },
        data: {
            status: 'PENDING',
            subtenantAcceptedAt: now,
            guestName: input.name,
            guestPhone: input.phone,
            guestIdCard: input.idCard,
            guestProductType: input.productType,
            guestProductSubtype: input.productSubtype || null,
            guestProductDetail: input.detail,
            guestImages: JSON.stringify(imageUrls),
            guestTermsAcceptedAt: now
        }
    });
    if (!result.count) throw new StallLeaveError('link_invalid');
    return prisma.stallLeaveRequest.findUnique({ where: { id: row.id } });
}

function guestImagesOf(row) {
    try {
        const list = JSON.parse(row.guestImages || '[]');
        return Array.isArray(list) ? list.filter((u) => typeof u === 'string') : [];
    } catch (error) {
        return [];
    }
}

// คนนอกเคยติด blacklist ไหม: เบอร์ตรงกับผู้ใช้ที่ถูกระงับ หรือเลขบัตรตรงกับใบสมัครร้านของผู้ใช้ที่ถูกระงับ
async function guestBlacklistHit(row) {
    const phone = String(row.guestPhone || '');
    const phones = phone.length === 10 ? [phone, `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`] : [phone];
    const [byPhone, byId] = await Promise.all([
        phone ? prisma.user.count({ where: { isBlacklisted: true, phoneNumber: { in: phones } } }) : 0,
        row.guestIdCard ? prisma.sellerApplication.count({ where: { idCardNumber: row.guestIdCard, user: { isBlacklisted: true } } }) : 0
    ]);
    return byPhone + byId > 0;
}

// เจ้าของแผงยกเลิกได้ก่อนถึงวันเริ่ม (ที่อนุมัติแล้วก็ยกเลิกได้ถ้ายังไม่ถึงวันเริ่ม)
function canCancel(row, now = new Date()) {
    return ACTIVE_STATUSES.includes(row.status) && toStartOfDay(row.startDate) > businessDateOf(now);
}

async function cancelRequest(userId, id, now = new Date()) {
    const row = await prisma.stallLeaveRequest.findFirst({ where: { id: Number(id) || 0, userId } });
    if (!row) throw new StallLeaveError('not_found');
    if (!canCancel(row, now)) throw new StallLeaveError('cannot_cancel');
    return prisma.stallLeaveRequest.update({ where: { id: row.id }, data: { status: 'CANCELLED', cancelledAt: now } });
}

// แอดมินอนุมัติ: ตรวจซ้ำว่าแผงยังเป็นของร้านนี้ครบทุกวัน และไม่ชนคำขอที่อนุมัติไปแล้ว
async function approveRequest(id, admin, now = new Date()) {
    const row = await prisma.stallLeaveRequest.findUnique({ where: { id: Number(id) || 0 } });
    if (!row) throw new StallLeaveError('not_found');
    if (row.status !== 'PENDING') throw new StallLeaveError('not_pending');
    const stall = (await loadShopStalls(row.userId, row.shopId, now)).find((s) => s.code === row.stallCode);
    if (!stall) throw new StallLeaveError('stall_released');
    checkCoverage(stall, toStartOfDay(row.startDate), toStartOfDay(row.endDate));
    await assertNoOverlap(row.stallCode, row.startDate, row.endDate, row.id, ['APPROVED']);
    if (row.kind === 'SUBLET_MEMBER' && !(await findSubtenantShop(row.subShopId, row.userId))) throw new StallLeaveError('invalid_subtenant');
    return prisma.stallLeaveRequest.update({
        where: { id: row.id },
        data: { status: 'APPROVED', reviewedById: admin.id, reviewedByName: admin.name || admin.username || null, reviewedAt: now, rejectReason: null }
    });
}

async function rejectRequest(id, admin, reason, now = new Date()) {
    const text = String(reason || '').trim().slice(0, 1000);
    if (!text) throw new StallLeaveError('missing_reason');
    const row = await prisma.stallLeaveRequest.findUnique({ where: { id: Number(id) || 0 } });
    if (!row) throw new StallLeaveError('not_found');
    if (row.status !== 'PENDING') throw new StallLeaveError('not_pending');
    return prisma.stallLeaveRequest.update({
        where: { id: row.id },
        data: { status: 'REJECTED', rejectReason: text, reviewedById: admin.id, reviewedByName: admin.name || admin.username || null, reviewedAt: now }
    });
}

function countPendingLeaves() {
    return prisma.stallLeaveRequest.count({ where: { status: 'PENDING' } });
}

// ชื่อร้านของคำขอ (ร้านเจ้าของแผง + ร้านผู้รับเช่าช่วง) — โหลดเป็นชุดเดียว
async function shopNamesOf(rows) {
    const ids = [...new Set(rows.flatMap((r) => [r.shopId, r.subShopId]).filter(Boolean))];
    const shops = ids.length ? await prisma.shopDetail.findMany({ where: { id: { in: ids } }, select: { id: true, shopName: true } }) : [];
    return new Map(shops.map((s) => [s.id, s.shopName || 'ร้านไม่มีชื่อ']));
}

function decorate(row, shopNames, now = new Date()) {
    return {
        ...row,
        kindLabel: KIND_LABEL[row.kind] || row.kind,
        statusLabel: STATUS_LABEL[row.status] || row.status,
        shopName: shopNames.get(row.shopId) || '-',
        subShopName: row.subShopId ? (shopNames.get(row.subShopId) || '-') : (row.kind === 'SUBLET_GUEST' ? (row.guestName ? `${row.guestName} (นอกตลาด)` : 'รอคนนอกกรอกข้อมูล') : null),
        guestImageList: row.kind === 'SUBLET_GUEST' ? guestImagesOf(row) : [],
        guestProductTypeLabel: row.guestProductType ? (PRODUCT_TYPE_LABELS[row.guestProductType] || row.guestProductType) : null,
        rangeText: rangeText(row),
        days: dayCount(row.startDate, row.endDate),
        createdText: `${thaiDate(row.createdAt)} ${thaiTime(row.createdAt)}`,
        reviewedText: row.reviewedAt ? `${thaiDate(row.reviewedAt)} ${thaiTime(row.reviewedAt)}` : null,
        canCancel: canCancel(row, now)
    };
}

async function listForOwner(userId, now = new Date()) {
    await expireStale(now);
    const rows = await prisma.stallLeaveRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const names = await shopNamesOf(rows);
    return rows.map((row) => decorate(row, names, now));
}

// หน้าแอดมิน: แท็บ รอพิจารณา / อนุมัติแล้ว (ยังไม่จบ) / ปิดแล้ว
const ADMIN_TABS = [
    { key: 'pending', label: 'รอพิจารณา', where: () => ({ status: 'PENDING' }) },
    { key: 'approved', label: 'อนุมัติแล้ว', where: (today) => ({ status: 'APPROVED', endDate: { gte: today } }) },
    { key: 'closed', label: 'ปิดแล้ว', where: (today) => ({ OR: [{ status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] } }, { status: 'APPROVED', endDate: { lt: today } }] }) }
];

async function loadAdminPage(tabKey, now = new Date()) {
    await expireStale(now);
    const today = businessDateOf(now);
    const active = ADMIN_TABS.find((t) => t.key === tabKey) || ADMIN_TABS[0];
    const [counts, rows] = await Promise.all([
        Promise.all(ADMIN_TABS.map((t) => prisma.stallLeaveRequest.count({ where: t.where(today) }))),
        prisma.stallLeaveRequest.findMany({ where: active.where(today), orderBy: active.key === 'pending' ? { startDate: 'asc' } : { updatedAt: 'desc' }, take: 200 })
    ]);
    const names = await shopNamesOf(rows);
    const owners = rows.length
        ? await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, phoneNumber: true } })
        : [];
    const ownerById = new Map(owners.map((u) => [u.id, u]));
    // จำนวนวันที่แผงนี้ลา/เช่าช่วง (อนุมัติแล้ว) ใน 60 วันที่ผ่านมาถึงอนาคต — ช่วยแอดมินดูว่าร้านลาบ่อยไหม
    const codes = [...new Set(rows.map((r) => r.stallCode))];
    const history = codes.length
        ? await prisma.stallLeaveRequest.findMany({ where: { stallCode: { in: codes }, status: 'APPROVED', endDate: { gte: addDays(today, -60) } }, select: { id: true, stallCode: true, startDate: true, endDate: true } })
        : [];
    const approvedDaysByCode = new Map();
    history.forEach((h) => approvedDaysByCode.set(h.stallCode, (approvedDaysByCode.get(h.stallCode) || 0) + dayCount(h.startDate, h.endDate)));

    return {
        tabs: ADMIN_TABS.map((t, i) => ({ key: t.key, label: t.label, count: counts[i] })),
        activeTab: active.key,
        rows: rows.map((row) => {
            const owner = ownerById.get(row.userId) || {};
            return {
                ...decorate(row, names, now),
                ownerName: owner.name || '-',
                ownerPhone: owner.phoneNumber || '',
                approvedDays: approvedDaysByCode.get(row.stallCode) || 0
            };
        })
    };
}

// คำขอที่อนุมัติแล้วและครอบวันนั้น: Map stallCode → แถว (ผังตลาด/ผังแอดมิน/ตรวจตลาดใช้ต่อ)
async function getApprovedOnDay(day = businessDateOf(new Date())) {
    const date = toStartOfDay(day);
    const rows = await prisma.stallLeaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } }
    });
    return new Map(rows.map((row) => [row.stallCode, row]));
}

// แจ้งเตือนเจ้าของแผงเมื่อแอดมินตัดสินแล้ว (หน้า /notifications) — 30 วันล่าสุด
async function buildLeaveNotifications(userId, now = new Date()) {
    if (!userId) return [];
    const rows = await prisma.stallLeaveRequest.findMany({
        where: { userId, status: { in: ['APPROVED', 'REJECTED'] }, reviewedAt: { gte: addDays(now, -30) } },
        orderBy: { reviewedAt: 'desc' }
    });
    const ownerItems = rows.map((row) => {
        const approved = row.status === 'APPROVED';
        const kind = KIND_LABEL[row.kind] || 'ลาหยุด';
        // ร้านผู้รับเช่าช่วงปฏิเสธเอง (ไม่มีแอดมินผู้ตัดสิน)
        const declinedBySubtenant = !approved && !row.reviewedById && row.kind !== 'LEAVE';
        return {
            id: `stall-leave-${row.id}`,
            type: approved ? 'stall-leave-approved' : 'stall-leave-rejected',
            title: approved ? `อนุมัติ${kind}แผง ${row.stallCode} แล้ว` : declinedBySubtenant ? `ร้านผู้รับเช่าช่วงปฏิเสธ แผง ${row.stallCode}` : `ไม่อนุมัติ${kind}แผง ${row.stallCode}`,
            desc: approved
                ? `วันที่ ${rangeText(row)}`
                : `วันที่ ${rangeText(row)} — เหตุผล: ${row.rejectReason || '-'}`,
            date: thaiDate(row.reviewedAt),
            time: thaiTime(row.reviewedAt),
            at: row.reviewedAt.toISOString(),
            status: approved ? 'SUCCESS' : 'REJECTED',
            isRead: false,
            isNew: true,
            link: '/stall-leave',
            linkIcon: 'bi-calendar2-x',
            linkLabel: 'ดูคำขอลาหยุด/เช่าช่วง'
        };
    });

    // ร้านของผู้ใช้นี้ถูกขอให้เช่าช่วง: รอตอบรับ (งานต้องทำ) / แอดมินตัดสินแล้ว
    const myShops = await prisma.shopDetail.findMany({ where: { userId }, select: { id: true } });
    const incoming = myShops.length
        ? await prisma.stallLeaveRequest.findMany({
            where: {
                kind: 'SUBLET_MEMBER',
                subShopId: { in: myShops.map((s) => s.id) },
                OR: [
                    { status: 'WAITING_SUBTENANT', startDate: { gte: earliestStartDate(now) } },
                    { status: { in: ['APPROVED', 'REJECTED'] }, reviewedById: { not: null }, reviewedAt: { gte: addDays(now, -30) } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        })
        : [];
    const names = await shopNamesOf(incoming);
    const incomingItems = incoming.map((row) => {
        const waiting = row.status === 'WAITING_SUBTENANT';
        const approved = row.status === 'APPROVED';
        const at = waiting ? row.createdAt : row.reviewedAt;
        return {
            id: `stall-sublet-in-${row.id}`,
            type: waiting ? 'stall-sublet-request' : approved ? 'stall-leave-approved' : 'stall-leave-rejected',
            title: waiting
                ? `ร้าน ${names.get(row.shopId) || '-'} ขอให้ร้านคุณเช่าช่วงแผง ${row.stallCode}`
                : approved ? `อนุมัติให้ร้านคุณขายที่แผง ${row.stallCode}` : `ไม่อนุมัติการเช่าช่วงแผง ${row.stallCode}`,
            desc: waiting
                ? `วันที่ ${rangeText(row)} — ร้าน ${names.get(row.subShopId) || '-'} ตอบรับแล้วคำขอจะส่งให้แอดมินพิจารณา`
                : approved ? `วันที่ ${rangeText(row)} (ร้าน ${names.get(row.subShopId) || '-'})` : `วันที่ ${rangeText(row)} — เหตุผล: ${row.rejectReason || '-'}`,
            ...(waiting ? { action: 'ตอบรับ / ปฏิเสธการเช่าช่วง' } : {}),
            date: thaiDate(at),
            time: thaiTime(at),
            at: at.toISOString(),
            status: waiting ? 'PENDING' : approved ? 'SUCCESS' : 'REJECTED',
            isRead: false,
            isNew: true,
            link: '/stall-leave#incoming',
            linkIcon: 'bi-shop-window',
            linkLabel: waiting ? 'ตอบรับการเช่าช่วง' : 'ดูคำขอเช่าช่วง'
        };
    });
    return [...ownerItems, ...incomingItems];
}

module.exports = {
    NOTICE_CUTOFF_HOUR,
    MAX_RANGE_DAYS,
    ACTIVE_STATUSES,
    KIND_LABEL,
    STATUS_LABEL,
    ERROR_MESSAGES,
    StallLeaveError,
    toDateKey,
    parseDateKey,
    thaiDate,
    rangeText,
    earliestStartDate,
    loadShopStalls,
    validateRequest,
    createLeave,
    expireStale,
    searchMemberShops,
    searchMemberShopById,
    createMemberSublet,
    respondAsSubtenant,
    listIncoming,
    GUEST_LINK_HOURS,
    GUEST_MAX_IMAGES,
    PRODUCT_TYPE_LABELS,
    createGuestSublet,
    findGuestRequest,
    submitGuestInfo,
    guestBlacklistHit,
    isValidThaiId,
    canCancel,
    cancelRequest,
    approveRequest,
    rejectRequest,
    countPendingLeaves,
    listForOwner,
    loadAdminPage,
    getApprovedOnDay,
    buildLeaveNotifications
};
