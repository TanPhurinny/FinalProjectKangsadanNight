const prisma = require('../config/prismaClient');
const { BOOKING_REQUEST_TAG_PREFIX, extractBookingRequestId } = require('./bookingRequestTag');
const { getBookingRoundMetaForDate, getRoundWindow, toStartOfDay, addDays } = require('./bookingRound');
const { buildQuotationNumber, splitEvenly } = require('../controllers/quotationController');
const { shopsRelation, primaryShop, shopsOfRequests } = require('./shops');

// รายงานการเช่า/ชำระเงินย้อนหลัง (หลายรอบ) — ใช้ร่วมกันทั้งหน้าร้านค้า /rental-statement,
// หน้าแอดมิน /admin/rental-statements และหน้าเตรียมเขียนสัญญาเช่า /admin/lease-contracts/:id
//
// ยอดเงินอยู่ใน Booking ที่ผูกกับ BookingRequest ผ่าน tag ใน storeDetailSnapshot และทุกแถว Booking ของคำขอเดียว
// เก็บยอดรวมของทั้งคำขอซ้ำกัน (1 แถวต่อ 1 ล็อก) — อ่านจากแถวแรกของคำขอพอ ห้าม sum ข้ามแถว (ดู buildQuotationData)
// ดึงทุกอย่างเป็น batch ไม่เรียก buildQuotationData ทีละคำขอ (ช้ามากเมื่อมีหลายร้อยคำขอ)

const STATUS_LABEL = { PAID: 'ชำระแล้ว', OUTSTANDING: 'ค้างชำระ' };

function parseStallCodes(text) {
    return String(text || '').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean);
}

function isExtendRequest(description) {
    return /\[EXTEND_OF:\d+\]/i.test(String(description || ''));
}

function toDateKey(dateValue) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(text) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatThaiDate(dateValue) {
    if (!dateValue) return '-';
    return new Date(dateValue).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBaht(value) {
    return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ช่วงรายงานจาก query: ?round=เลขรอบ หรือ ?from=YYYY-MM-DD&to=YYYY-MM-DD
// ค่าเริ่มต้น = 1 ม.ค. ของปีนี้ ถึงวันนี้ (ตามตัวอย่างใน feedback "เช่ามาตั้งแต่ ม.ค. ถึงปัจจุบัน")
function parseStatementRange(query = {}) {
    const today = toStartOfDay(new Date());
    const round = Number.parseInt(query.round, 10);
    if (Number.isInteger(round) && round > 0) {
        const { cycleStart, cycleEnd } = getRoundWindow(round);
        return buildRange(cycleStart, cycleEnd, round);
    }
    let from = parseDateKey(query.from) || new Date(today.getFullYear(), 0, 1);
    let to = parseDateKey(query.to) || today;
    if (from > to) [from, to] = [to, from];
    return buildRange(from, to, null);
}

function buildRange(from, to, round) {
    return {
        from: toStartOfDay(from),
        to: toStartOfDay(to),
        fromKey: toDateKey(from),
        toKey: toDateKey(to),
        round,
        label: round
            ? `รอบที่ ${round} (${formatThaiDate(from)} – ${formatThaiDate(to)})`
            : `${formatThaiDate(from)} – ${formatThaiDate(to)}`
    };
}

// แถวรายงาน 1 แถว = 1 คำขอ (BookingRequest) ที่จัดล็อกแล้ว — ชำระแล้ว (SUCCESS) หรือค้างชำระ (IN_PROGRESS)
// นับเข้าช่วงเมื่อช่วงเช่าทับกับช่วงรายงาน
// ทุกแถวบอกร้าน (shopId/shopName) — 1 ผู้ใช้มีได้หลายร้าน คำขอเก่าที่ยังไม่มี shopId นับเป็นร้านหลักของเจ้าของ
// shopId = กรองเฉพาะร้านนั้น (สัญญาเช่า 1 ฉบับต่อ 1 ร้าน)
async function loadStatementRows({ userId = null, shopId = null, stallCode = null, range }) {
    const rangeEndExclusive = addDays(range.to, 1);
    const bookings = await prisma.booking.findMany({
        where: {
            storeDetailSnapshot: { startsWith: BOOKING_REQUEST_TAG_PREFIX },
            // Booking.userId มีค่าทุกแถว ส่วน BookingRequest.userId ของคำขอเก่าอาจยังไม่ได้ backfill
            ...(userId ? { userId: Number(userId) } : {}),
            rentalStartDate: { lt: rangeEndExclusive },
            OR: [{ rentalEndDate: { gte: range.from } }, { rentalEndDate: null }]
        },
        orderBy: { id: 'asc' },
        select: {
            userId: true, storeDetailSnapshot: true, rentalStartDate: true, rentalEndDate: true, rentalDays: true,
            billableDays: true, rentTotal: true, lightTotal: true, applianceTotal: true, grandTotal: true
        }
    });
    const bookingByRequest = new Map();
    bookings.forEach((booking) => {
        const requestId = extractBookingRequestId(booking.storeDetailSnapshot);
        if (requestId && !bookingByRequest.has(requestId)) bookingByRequest.set(requestId, booking);
    });
    if (!bookingByRequest.size) return [];

    const code = stallCode ? String(stallCode).trim().toUpperCase() : null;
    const requests = await prisma.bookingRequest.findMany({
        where: {
            id: { in: Array.from(bookingByRequest.keys()) },
            status: { in: ['SUCCESS', 'IN_PROGRESS'] },
            assignedStallCode: code ? { contains: code } : { not: null }
        },
        select: {
            id: true, userId: true, shopId: true, zone: true, assignedStallCode: true, status: true, description: true,
            paymentConfirmedAt: true, confirmedByName: true, sellerName: true, productName: true
        }
    });
    const shopByRequest = await shopsOfRequests(requests, (request) => request.userId || bookingByRequest.get(request.id)?.userId);
    const wantedShopId = shopId ? Number(shopId) : null;

    const ids = requests.map((request) => request.id);
    const taxItems = ids.length
        ? await prisma.taxInvoiceRequestItem.findMany({
            where: { bookingRequestId: { in: ids }, taxInvoiceRequest: { status: 'ISSUED' } },
            select: { bookingRequestId: true, taxInvoiceRequest: { select: { id: true, documentNumber: true } } }
        })
        : [];
    const taxByRequest = new Map(taxItems.map((item) => [item.bookingRequestId, item.taxInvoiceRequest]));

    const rows = [];
    requests.forEach((request) => {
        const stallCodes = parseStallCodes(request.assignedStallCode);
        if (!stallCodes.length || (code && !stallCodes.includes(code))) return;
        const booking = bookingByRequest.get(request.id);
        const ownerId = request.userId || booking.userId;
        if (userId && ownerId !== Number(userId)) return;
        const shop = shopByRequest.get(request.id) || null;
        if (wantedShopId && shop?.id !== wantedShopId) return;
        const isPaid = request.status === 'SUCCESS';
        const grandTotal = Number(booking.grandTotal || 0);
        const stallCount = stallCodes.length;
        const rentalDays = booking.rentalDays || 1;
        const billableDays = booking.billableDays ?? rentalDays;
        const taxInvoice = taxByRequest.get(request.id) || null;
        rows.push({
            requestId: request.id,
            userId: ownerId,
            sellerName: request.sellerName || '-',
            shopId: shop?.id || null,
            shopName: shop?.shopName || request.productName || '-',
            zone: request.zone || '-',
            roundNumber: booking.rentalStartDate ? getBookingRoundMetaForDate(booking.rentalStartDate).roundNumber : null,
            rentalStartDate: booking.rentalStartDate,
            rentalEndDate: booking.rentalEndDate,
            rentalStartText: formatThaiDate(booking.rentalStartDate),
            rentalEndText: formatThaiDate(booking.rentalEndDate),
            rentalDays,
            billableDays,
            stallCodes,
            stallCount,
            rentTotal: Number(booking.rentTotal || 0),
            lightTotal: Number(booking.lightTotal || 0),
            applianceTotal: Number(booking.applianceTotal || 0),
            grandTotal,
            // ส่วนของล็อกที่ดูอยู่ (หน้าต่อล็อก) — แบ่งยอดคำขอเท่าๆ กันตามจำนวนล็อก แบบเดียวกับใบกำกับภาษีรายล็อก
            stallShare: code ? splitEvenly(grandTotal, stallCount)[stallCodes.indexOf(code)] : grandTotal,
            status: isPaid ? 'PAID' : 'OUTSTANDING',
            statusLabel: STATUS_LABEL[isPaid ? 'PAID' : 'OUTSTANDING'],
            paidAt: isPaid ? request.paymentConfirmedAt : null,
            paidAtText: isPaid ? formatThaiDate(request.paymentConfirmedAt) : '-',
            confirmedByName: isPaid ? (request.confirmedByName || '-') : '-',
            receiptNumber: isPaid ? buildQuotationNumber(request.id, request.paymentConfirmedAt) : null,
            taxInvoiceId: taxInvoice?.id || null,
            taxInvoiceNumber: taxInvoice?.documentNumber || null,
            isExtension: isExtendRequest(request.description)
        });
    });
    rows.sort((a, b) => new Date(a.rentalStartDate || 0) - new Date(b.rentalStartDate || 0) || a.requestId - b.requestId);
    return rows;
}

function summarizeRows(rows) {
    const paidRows = rows.filter((row) => row.status === 'PAID');
    const sum = (list, key) => list.reduce((total, row) => total + Number(row[key] || 0), 0);
    return {
        requestCount: rows.length,
        paidCount: paidRows.length,
        outstandingCount: rows.length - paidRows.length,
        paid: sum(paidRows, 'grandTotal'),
        outstanding: sum(rows.filter((row) => row.status === 'OUTSTANDING'), 'grandTotal'),
        rentTotal: sum(paidRows, 'rentTotal'),
        lightTotal: sum(paidRows, 'lightTotal'),
        applianceTotal: sum(paidRows, 'applianceTotal'),
        rounds: new Set(paidRows.map((row) => row.roundNumber).filter(Boolean)).size,
        stallDays: paidRows.reduce((total, row) => total + row.stallCount * row.billableDays, 0),
        stallCodes: Array.from(new Set(paidRows.flatMap((row) => row.stallCodes))).sort()
    };
}

// สรุปต่อล็อกจากแถวที่ชำระแล้ว (ล็อกไหน เช่ากี่รอบ กี่วัน ยอดส่วนของล็อกนั้น)
function groupByStall(rows) {
    const map = new Map();
    rows.filter((row) => row.status === 'PAID').forEach((row) => {
        const shares = splitEvenly(row.grandTotal, row.stallCount);
        row.stallCodes.forEach((stallCode, index) => {
            if (!map.has(stallCode)) map.set(stallCode, { stallCode, rounds: new Set(), days: 0, amount: 0, firstStart: null, lastEnd: null });
            const entry = map.get(stallCode);
            if (row.roundNumber) entry.rounds.add(row.roundNumber);
            entry.days += row.billableDays;
            entry.amount += shares[index];
            if (row.rentalStartDate && (!entry.firstStart || row.rentalStartDate < entry.firstStart)) entry.firstStart = row.rentalStartDate;
            if (row.rentalEndDate && (!entry.lastEnd || row.rentalEndDate > entry.lastEnd)) entry.lastEnd = row.rentalEndDate;
        });
    });
    return Array.from(map.values())
        .map((entry) => ({
            ...entry,
            rounds: entry.rounds.size,
            periodText: `${formatThaiDate(entry.firstStart)} – ${formatThaiDate(entry.lastEnd)}`
        }))
        .sort((a, b) => a.stallCode.localeCompare(b.stallCode));
}

// ข้อมูลผู้เช่า — ที่อยู่/เลขบัตร/บัญชีจากใบสมัครร้านล่าสุด (เหมือนที่อยู่ในใบเสนอราคา)
// shopId = ชื่อร้าน/ประเภทสินค้าของร้านนั้น (ต้องเป็นร้านของผู้ใช้) ไม่ระบุ = ร้านหลัก
async function loadSellerInfo(userId, shopId = null) {
    const wantedShopId = shopId ? Number(shopId) : null;
    const [user, application, wantedShop] = await Promise.all([
        prisma.user.findUnique({
            where: { id: Number(userId) },
            select: { id: true, name: true, email: true, phoneNumber: true, role: true, createdAt: true, shops: shopsRelation({ select: { id: true, shopName: true, productType: true } }) }
        }),
        prisma.sellerApplication.findFirst({ where: { userId: Number(userId) }, orderBy: { createdAt: 'desc' } }),
        wantedShopId
            ? prisma.shopDetail.findFirst({ where: { id: wantedShopId, userId: Number(userId) }, select: { id: true, shopName: true, productType: true } })
            : null
    ]);
    if (!user) return null;
    const shop = wantedShop || primaryShop(user);
    const address = application
        ? [application.houseNumber, application.subdistrict, application.district, application.province].filter(Boolean).join(' ')
        : '';
    return {
        id: user.id,
        name: user.name,
        email: user.email || '-',
        phone: user.phoneNumber || application?.phoneNumber || '-',
        shopId: shop?.id || null,
        shopName: shop?.shopName || application?.shopName || '-',
        productType: shop?.productType || application?.productType || '-',
        sellerName: application?.sellerName || user.name,
        idCardNumber: application?.idCardNumber || '-',
        address: address || '-',
        memberSinceText: formatThaiDate(user.createdAt)
    };
}

// shopId = เฉพาะร้านนั้น ไม่ระบุ = ทุกร้านของผู้ใช้ (แต่ละแถวบอกร้านอยู่แล้ว)
async function buildSellerStatement(userId, range, shopId = null) {
    const [seller, rows] = await Promise.all([loadSellerInfo(userId, shopId), loadStatementRows({ userId, shopId, range })]);
    if (!seller) return null;
    return { seller, range, shopId: shopId ? Number(shopId) : null, rows, totals: summarizeRows(rows), byStall: groupByStall(rows) };
}

// ภาพรวมทุกร้านในช่วง — 1 แถวต่อร้าน
async function buildMarketStatement(range) {
    const rows = await loadStatementRows({ range });
    const byUser = new Map();
    rows.forEach((row) => {
        const key = row.userId || `name:${row.sellerName}`;
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key).push(row);
    });
    const userIds = Array.from(byUser.keys()).filter((key) => Number.isInteger(key));
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, shops: shopsRelation({ select: { shopName: true } }) } })
        : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    const sellers = Array.from(byUser.entries()).map(([key, list]) => {
        const user = userById.get(key);
        return {
            userId: user ? user.id : null,
            name: user?.name || list[0].sellerName,
            // ผู้ใช้ 1 คนมีได้หลายร้าน — แสดงทุกร้านที่มีการเช่าในช่วงนี้
            shopName: Array.from(new Set(list.map((row) => row.shopName).filter((name) => name && name !== '-'))).join(', ') || primaryShop(user)?.shopName || '-',
            ...summarizeRows(list)
        };
    }).sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name, 'th'));
    return { range, rows, sellers, totals: summarizeRows(rows) };
}

async function buildStallStatement(stallCode, range) {
    const code = String(stallCode || '').trim().toUpperCase();
    const rows = await loadStatementRows({ stallCode: code, range });
    const userIds = Array.from(new Set(rows.map((row) => row.userId).filter(Boolean)));
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, shops: shopsRelation({ select: { shopName: true } }) } })
        : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    rows.forEach((row) => {
        const user = userById.get(row.userId);
        row.tenantName = user?.name || row.sellerName;
    });
    const paidRows = rows.filter((row) => row.status === 'PAID');
    return {
        stallCode: code,
        range,
        rows,
        totals: {
            ...summarizeRows(rows),
            // ยอดของล็อกนี้ล็อกเดียว (ไม่ใช่ยอดทั้งคำขอที่อาจรวมหลายล็อก)
            stallPaid: paidRows.reduce((total, row) => total + row.stallShare, 0),
            stallOutstanding: rows.filter((row) => row.status === 'OUTSTANDING').reduce((total, row) => total + row.stallShare, 0),
            tenants: new Set(paidRows.map((row) => row.userId).filter(Boolean)).size
        }
    };
}

// CSV ใส่ BOM UTF-8 ให้ Excel เปิดภาษาไทยได้ไม่เพี้ยน
function toCsv(headers, records) {
    const escape = (value) => {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [headers.map(escape).join(',')].concat(records.map((record) => record.map(escape).join(',')));
    return `﻿${lines.join('\r\n')}`;
}

function statementRowsToCsv(rows, { withSeller = false } = {}) {
    const headers = [
        ...(withSeller ? ['ผู้เช่า'] : []),
        'ร้าน', 'เลขคำขอ', 'รอบที่', 'ล็อก', 'เริ่มเช่า', 'สิ้นสุด', 'วันคิดเงิน', 'ค่าเช่าแผง', 'ค่าไฟ', 'ค่าเครื่องใช้ไฟฟ้า', 'ยอดรวม',
        'สถานะ', 'วันที่ชำระ', 'ผู้ยืนยัน', 'เลขที่ใบเสร็จ', 'เลขที่ใบกำกับภาษี'
    ];
    const records = rows.map((row) => [
        ...(withSeller ? [row.tenantName || row.sellerName] : []),
        row.shopName || '', row.requestId, row.roundNumber || '', row.stallCodes.join(' '), toDateKeyOrBlank(row.rentalStartDate), toDateKeyOrBlank(row.rentalEndDate),
        row.billableDays, row.rentTotal.toFixed(2), row.lightTotal.toFixed(2), row.applianceTotal.toFixed(2), row.grandTotal.toFixed(2),
        row.statusLabel, toDateKeyOrBlank(row.paidAt), row.status === 'PAID' ? row.confirmedByName : '', row.receiptNumber || '', row.taxInvoiceNumber || ''
    ]);
    return toCsv(headers, records);
}

function toDateKeyOrBlank(dateValue) {
    return dateValue ? toDateKey(dateValue) : '';
}

// query string ของช่วงรายงาน — ส่งต่อให้ลิงก์ CSV/ลิงก์ข้ามหน้าได้ช่วงเดียวกัน
function rangeQueryString(range) {
    return range.round ? `round=${range.round}` : `from=${range.fromKey}&to=${range.toKey}`;
}

function csvFilename(prefix, range) {
    return `${prefix}_${range.fromKey}_${range.toKey}.csv`;
}

module.exports = {
    parseStatementRange,
    loadStatementRows,
    loadSellerInfo,
    summarizeRows,
    groupByStall,
    buildSellerStatement,
    buildMarketStatement,
    buildStallStatement,
    statementRowsToCsv,
    toCsv,
    csvFilename,
    rangeQueryString,
    formatThaiDate,
    formatBaht,
    parseDateKey,
    toDateKey
};
