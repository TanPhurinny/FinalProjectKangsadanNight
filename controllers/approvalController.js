const { deleteImage } = require('../utils/imageStorage');
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildZonesData } = require('./marketController');
const zoneAccess = require('../utils/zoneAccess');
const stallSpacing = require('../utils/stallSpacing');
const stallOccupancy = require('../utils/stallOccupancy');
const { getRenewalPhase, getRenewalCutoff, getExtensionOrigin, releaseOrRestoreStalls, isUnpaidPastDeadline } = require('../utils/stallRenewal');

const { toStartOfDay, addDays, getBookingRoundMetaForDate, getRoundWindow, isRoundEditable, getPaymentDeadlineFromLockAssignedAt } = require('../utils/bookingRound');
const { verifySlip } = require('../utils/slipVerification');
const { BOOKING_REQUEST_TAG_PREFIX, buildBookingRequestTag } = require('../utils/bookingRequestTag');
const { sendStallExpiringSoonEmail } = require('../config/mailer');

function normalizeZone(zone) {
    return String(zone || '').trim().toUpperCase();
}

function toThaiDate(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: '2-digit'
        });
    } catch (_) {
        return '-';
    }
}

function extractAssignedStallFromDescription(descriptionText) {
    const text = String(descriptionText || '');
    const match = text.match(/\[ASSIGNED_STALL:([^\]]+)\]/i);
    return match ? String(match[1] || '').trim().toUpperCase() : '';
}

// assignedStallCode เก็บได้ทั้งล็อกเดียว ("A901") หรือหลายล็อกคั่นด้วย comma ("A901,A902")
// เผื่อคำขอเดียวขอมากกว่า 1 ล็อก (stallCount ใน Booking ที่ผูกกับคำขอนี้ > 1)
function parseStallCodes(assignedStallCodeText) {
    return String(assignedStallCodeText || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

function joinStallCodes(stallCodes) {
    return Array.from(new Set(stallCodes.filter(Boolean))).join(',');
}

// คำขอ "ต่อล็อค" (routes/sellerRoute.js POST /booking-stall/extend) ใส่ tag นี้ไว้หน้า description
function extractExtendOfRequestId(descriptionText) {
    const match = String(descriptionText || '').match(/\[EXTEND_OF:(\d+)\]/i);
    return match ? Number.parseInt(match[1], 10) : null;
}

// รอบของคำขอยึดวันเริ่มเช่าจริงของ Booking ที่ผูกไว้ (fallback วันที่ส่งคำขอ) — ใช้ตัวเดียวกันทั้งหน้ารายการ
// (getApprovalsPage แบ่งรอบ) และทุกปุ่มที่เช็ค isRoundEditable ไม่งั้นคำขอที่จองล่วงหน้าข้ามรอบจะโผล่ในรอบที่แก้ได้
// แต่กดอะไรก็เจอ history_round_locked
async function isRequestEditable(requestRecord) {
    const linkedBooking = await prisma.booking.findFirst({
        where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(requestRecord.id) } },
        select: { rentalStartDate: true }
    });
    const basisDate = linkedBooking?.rentalStartDate || requestRecord.createdAt;
    return isRoundEditable(getBookingRoundMetaForDate(basisDate).roundNumber);
}

// กดจากหน้ารอบไหน กลับไปหน้ารอบนั้น (ฟอร์มส่ง round มาด้วย) — ไม่งั้นแอดมินที่ไล่ปิดงานรอบเก่าจะถูกเด้งกลับรอบปัจจุบันทุกครั้ง
function approvalsUrl(req, query) {
    const round = Number.parseInt(req.body?.round || req.query?.round, 10);
    return `/admin/approvals?${Number.isInteger(round) && round > 0 ? `round=${round}&` : ''}${query}`;
}

// ความสนใจล็อคเต็ง (แผงหัวมุม/แผงพิเศษ) ที่ฝังไว้ในข้อความตอนจอง (routes/sellerRoute.js POST /booking-stall)
function extractCornerZoneNote(descriptionText) {
    const match = String(descriptionText || '').match(/\[สนใจแผงพิเศษ:\s*([^\]]+)\]/);
    return match ? String(match[1] || '').trim() : null;
}

// เหตุผลที่แอดมินปฏิเสธคำขอ (ไม่บังคับกรอก) — ฝังไว้หน้า description เหมือน tag อื่นๆ ในไฟล์นี้
function extractRejectReason(descriptionText) {
    const match = String(descriptionText || '').match(/\[REJECT_REASON:\s*([^\]]+)\]/);
    return match ? String(match[1] || '').trim() : null;
}

// ต่อท้ายแทนการแทรกหน้า — tag [EXTEND_OF:] ต้องอยู่ต้น description เสมอ (หลายจุดเช็คด้วย startsWith)
// [REJECTED_AT: <ms>] = เวลาที่ปฏิเสธ/ยกเลิก (BookingRequest ไม่มี updatedAt) — แจ้งเตือนผู้ขายใช้นับว่า "เพิ่งถูกปฏิเสธ"
// แม้คำขอจะส่งมานานแล้ว (เช่นคำขอรอบเก่าที่แอดมินเพิ่งกดปิดทั้งรอบ)
function withRejectReason(descriptionText, reason, rejectedAt = new Date()) {
    const cleanReason = String(reason || '').replace(/[\[\]]/g, '').trim().slice(0, 300);
    const base = String(descriptionText || '')
        .replace(/\s*\[REJECT_REASON:[^\]]+\]/g, '')
        .replace(/\s*\[REJECTED_AT:\s*\d+\]/g, '')
        .trim();
    return [base, cleanReason ? `[REJECT_REASON: ${cleanReason}]` : '', `[REJECTED_AT: ${rejectedAt.getTime()}]`].filter(Boolean).join(' ');
}

// ประวัติการดำเนินการของแอดมิน ฝังเป็น [LOG:<ms>|<ชื่อ>|<การกระทำ>] ต่อท้าย description (ไม่มีตาราง audit แยก)
// หน้าต่างรายละเอียดแสดงเป็นไทม์ไลน์ "ใครทำอะไรเมื่อไร" — ชื่อ/ข้อความตัดอักขระ [ ] | ออกกันพัง tag
function withActionLog(descriptionText, actorName, action, at = new Date()) {
    const clean = (text) => String(text || '').replace(/[\[\]|]/g, ' ').trim().slice(0, 120);
    return `${String(descriptionText || '').trim()} [LOG:${at.getTime()}|${clean(actorName) || 'ระบบ'}|${clean(action)}]`.trim();
}

function parseActionLogs(descriptionText) {
    const logs = [];
    const pattern = /\[LOG:(\d+)\|([^|\]]*)\|([^\]]*)\]/g;
    let match;
    while ((match = pattern.exec(String(descriptionText || ''))) !== null) {
        logs.push({ at: Number(match[1]), actor: match[2], action: match[3] });
    }
    return logs;
}

// ตัด tag ภายในทั้งหมดออกจาก description ก่อนโชว์เป็นโน้ตจริงให้แอดมินอ่าน
function stripInternalTags(descriptionText) {
    return String(descriptionText || '')
        .replace(/\[BOOKING_REQUEST_ID:\d+\]\s*/gi, '')
        .replace(/\[EXTEND_OF:\d+\]\s*/gi, '')
        .replace(/\[ASSIGNED_STALL:[^\]]+\]\s*/gi, '')
        .replace(/\[สนใจแผงพิเศษ:[^\]]+\]\s*/g, '')
        .replace(/\[REJECT_REASON:[^\]]+\]\s*/g, '')
        .replace(/\[REJECTED_AT:\s*\d+\]\s*/g, '')
        .replace(/\[LOG:[^\]]*\]\s*/g, '')
        .trim();
}

const PRODUCT_TYPE_LABEL = {
    FASHION: 'แฟชั่น',
    FOOD: 'อาหาร',
    EVENT_BOOTH: 'กิจกรรม/บูธพิเศษ'
};

async function buildAdminBookingStallPageData(requestId) {
    const bookingRequest = await prisma.bookingRequest.findUnique({
        where: { id: requestId }
    });

    if (!bookingRequest) {
        return null;
    }

    // ใช้ buildZonesData() ชุดเดียวกับหน้าผังตลาด (admin/slots, marketMap) เพื่อให้ตำแหน่งแผง/แถวแนวนอน
    // (โซน C/E/X), รูปตัว L ของโซน D, และสีมุมพิเศษ ตรงกับผังจริงเหมือนกันทุกหน้า
    const zonesData = await buildZonesData();
    const zoneByCode = {};
    zonesData.forEach((zone) => { zoneByCode[zone.code] = zone; });

    const bookedStalls = [];
    zonesData.forEach((zone) => {
        zone.columns.forEach((column) => {
            column.stalls.forEach((stall) => {
                if (stall.status !== 'PLACEHOLDER' && stall.status !== 'AVAILABLE') {
                    bookedStalls.push(stall.code);
                }
            });
        });
    });

    // ข้อมูลร้านที่จองล็อกแล้วแต่ละล็อก (ไว้โชว์ tooltip ให้ครบ + เช็คระยะห่าง subtype เดียวกัน ดู utils/stallSpacing.js)
    // ใช้ util เดียวกับหน้า /admin/slots (utils/stallOccupancy.js) เพื่อไม่ให้ tooltip สองหน้าเพี้ยนไปคนละแบบ
    // ติด stall.occupant ให้ทุกล็อกที่จองแล้วใน zonesData ตรงๆ (แก้ object ในตัว)
    const occupantInfoByCode = (await stallOccupancy.attachOccupantDetails(zonesData)) || {};
    const occupantSubtypeByCode = {};
    Object.entries(occupantInfoByCode).forEach(([code, info]) => {
        if (info.productSubtype) occupantSubtypeByCode[code] = info.productSubtype;
    });

    const requestedZone = normalizeZone(bookingRequest.zone);
    const assignedStallCode = String(bookingRequest.assignedStallCode || extractAssignedStallFromDescription(bookingRequest.description) || '').trim().toUpperCase();
    // คำขอต่อล็อกที่ยังไม่ได้จัด เลือกล็อกเดิมไว้ให้ก่อน (แอดมินยืนยันได้เลย หรือเปลี่ยนเป็นล็อกอื่นก็ได้)
    const extensionOrigin = await getExtensionOrigin(prisma, bookingRequest.description);
    const extensionStallCodes = extensionOrigin?.codes || [];
    const parsedAssignedCodes = parseStallCodes(assignedStallCode);
    const assignedStallCodes = parsedAssignedCodes.length ? parsedAssignedCodes : extensionStallCodes;

    // จำกัดตัวเลือกโซนบนหน้านี้ให้ตรงกับประเภทสินค้าที่ผู้ขายลงทะเบียนไว้ (กันแอดมินจัดผิดโซน เช่น ร้านอาหารไปได้โซนแฟชั่น)
    // BookingRequest ไม่มี userId ผูกไว้ตรงๆ (sellerId ชี้โมเดล Seller ซึ่งระบบสมัครจริงไม่ได้ใช้ ปล่อยเป็น null เสมอ)
    // ข้อมูลประเภทสินค้าจริงอยู่ที่ ShopDetail.productType ของ User จึงต้องเทียบจากเบอร์โทรที่บันทึกไว้ตอนส่งคำขอแทน
    // เบอร์โทรอาจซ้ำกันได้ระหว่างบัญชี (เช่น ข้อมูลทดสอบ/แอดมินใช้เบอร์เดียวกับผู้ขาย) และบางคำขอเก่าเบอร์
    // ที่บันทึกไว้ก็ตกเลข 0 นำหน้าไปจนไม่ตรงเป๊ะกับ User.phoneNumber เลย จึงหาแบบ OR ทั้งเบอร์และชื่อผู้ส่งคำขอ
    // (sellerName) ไว้ก่อน แล้วค่อยเลือกตัวที่ชื่อตรงเป๊ะเป็นอันดับแรก กันจับผิดคน/พลาดคนที่ควรจะเจอ
    const candidateUsers = await prisma.user.findMany({
        where: {
            OR: [
                bookingRequest.phone ? { phoneNumber: bookingRequest.phone } : null,
                bookingRequest.sellerName ? { name: bookingRequest.sellerName } : null
            ].filter(Boolean)
        },
        include: { shop: true }
    });
    const applicantUser = candidateUsers.find((u) => u.name === bookingRequest.sellerName)
        || candidateUsers.find((u) => u.phoneNumber === bookingRequest.phone)
        || candidateUsers[0]
        || null;
    // ShopDetail ยังไม่ถูกสร้างจนกว่าแอดมินจะยืนยันสลิปสำเร็จ (ดูคอมเมนต์ที่ confirmSlipPayment) แต่หน้านี้
    // ใช้ตอน "จัดล็อก" ซึ่งเกิดก่อนจ่ายเงินเสมอ — ถ้ายังไม่มี ShopDetail ต้องย้อนไปดูใบสมัคร (SellerApplication)
    // ล่าสุดของผู้ใช้แทน ไม่งั้นประเภทสินค้าจะว่างเปล่าทุกคำขอที่ยังไม่เคยจ่ายเงินมาก่อน
    let applicantProductType = applicantUser?.shop?.productType || null;
    let applicantProductSubtype = applicantUser?.shop?.productSubtype || null;
    if (!applicantProductType || !applicantProductSubtype) {
        const latestApplication = await prisma.sellerApplication.findFirst({
            where: applicantUser?.id ? { userId: applicantUser.id } : { phoneNumber: bookingRequest.phone },
            orderBy: { createdAt: 'desc' }
        });
        applicantProductType = applicantProductType || latestApplication?.productType || null;
        applicantProductSubtype = applicantProductSubtype || latestApplication?.productSubtype || null;
    }
    // ถ้าไม่มีข้อมูลประเภทสินค้า (คำขอเก่า/หาผู้ใช้ที่ตรงเบอร์ไม่เจอ) ไม่จำกัด ให้เลือกได้ทุกโซนเหมือนเดิมเพื่อไม่บล็อกแอดมินผิดที่
    let allowedZones = applicantProductType
        ? zoneAccess.allowedZonesFor(applicantProductType).map((z) => String(z).toUpperCase())
        : [];
    // เผื่อกรณีโซนที่ขอมาจริง หรือล็อกที่เคยจัดไว้แล้ว ไม่ตรงกับประเภทสินค้า (ข้อมูลเก่า/ผิดพลาดตั้งแต่ตอนสมัคร)
    // ยังต้องเลือก/ยืนยันล็อกเดิมได้เสมอ ไม่ถูกบล็อกโดยตัวกรองนี้
    if (allowedZones.length) {
        const mustIncludeZones = [requestedZone, ...assignedStallCodes.map((code) => (code.match(/^[A-Z]+/) || [])[0])].filter(Boolean);
        allowedZones = Array.from(new Set([...allowedZones, ...mustIncludeZones]));
    }

    // Booking ที่ผูกกับคำขอนี้มี 1 แถวต่อ 1 ล็อกที่ขอ (ดู POST /booking-stall ใน sellerRoute.js)
    // ดึงมาทั้งแถว (ไม่ใช่แค่นับ) เพื่อโชว์ระยะเวลาเช่า/ค่าไฟ/เครื่องใช้ไฟฟ้า/ยอดรวมให้แอดมินเห็นก่อนจัดแผงจริง
    // ทุกแถวของคำขอเดียวกันมีระยะเวลา/ราคาต่อวันเท่ากันหมด ต่างกันแค่ล็อก จึงอ่านค่าจากแถวแรกพอ
    const requestTag = buildBookingRequestTag(bookingRequest.id);
    const linkedBookings = requestTag
        ? await prisma.booking.findMany({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
        : [];
    const linkedBookingCount = linkedBookings.length;
    const requestedStallCount = Math.max(1, linkedBookingCount, assignedStallCodes.length);
    const bookingDetail = linkedBookings[0] || null;
    // แต่ละแถวเก็บ grandTotal ของทั้งคำขอซ้ำกันทุกแถวอยู่แล้ว (ดูคอมเมนต์ด้านบน) ห้าม sum ซ้ำ ไม่งั้นราคาจะคูณเกินตามจำนวนล็อก
    const grandTotalAllStalls = Number(bookingDetail?.grandTotal || 0);

    // ล็อกที่เคยจัดให้คำขอนี้แล้วไม่ถือว่า "จองแล้ว" ในสายตาแอดมินคนนี้ (จะได้เลือกซ้ำ/ยืนยันใหม่ได้)
    // ล็อกเดิมของคำขอต่อล็อกก็นับเป็นของคำขอนี้ด้วย
    const ownStallCodes = [...assignedStallCodes, ...extensionStallCodes];
    const bookedStallsExcludingOwn = bookedStalls.filter((code) => !ownStallCodes.includes(code));

    // ติด spacingWarning (คำแนะนำระยะห่าง ดู utils/stallSpacing.js — ไม่บล็อกการเลือก แค่ให้แอดมินเห็น) ไว้ที่
    // ล็อกว่างแต่ละล็อกทุกโซน (occupant ของล็อกที่จองแล้วติดไปแล้วโดย attachOccupantDetails() ด้านบน)
    if (applicantProductSubtype) {
        zonesData.forEach((zone) => {
            zone.columns.forEach((column) => {
                column.stalls.forEach((stall) => {
                    if (stall.status !== 'AVAILABLE') return;
                    const conflicts = stallSpacing.findConflicts({
                        zoneColumns: zone.columns,
                        candidateCode: stall.code,
                        productSubtype: applicantProductSubtype,
                        productType: applicantProductType,
                        occupantSubtypeByCode
                    });
                    if (conflicts.length) {
                        stall.spacingWarning = { distance: conflicts[0].distance, nearestCode: conflicts[0].code };
                    }
                });
            });
        });
    }

    return {
        bookingRequest: {
            id: bookingRequest.id,
            shop: bookingRequest.productName,
            sellerName: bookingRequest.sellerName,
            phone: bookingRequest.phone,
            zone: requestedZone,
            zoneText: requestedZone ? `โซน ${requestedZone}` : '-',
            note: stripInternalTags(bookingRequest.description) || '-',
            cornerZoneNote: extractCornerZoneNote(bookingRequest.description),
            productImage: bookingRequest.productImage || null,
            // productType เก็บได้ทั้งค่า enum (FOOD/FASHION) หรือข้อความไทยดิบ เช่น "อื่นๆ" (ตัวเลือกในฟอร์มสมัคร)
            // หรือค่าเก่าที่เคยเป็นข้อความไทยตรงๆ อยู่แล้ว ("อาหาร") ถ้าไม่เจอใน map ให้ใช้ค่าดิบแทนที่จะโชว์ "-" ทั้งที่มีข้อมูลจริง
            productTypeText: PRODUCT_TYPE_LABEL[applicantProductType] || applicantProductType || '-',
            productSubtype: applicantProductSubtype,
            minStallSpacing: stallSpacing.getMinSpacing(applicantProductType),
            dateText: toThaiDate(bookingRequest.createdAt),
            status: String(bookingRequest.status || 'PENDING').toUpperCase(),
            rentalDays: bookingDetail?.rentalDays ?? null,
            rentalPeriodText: bookingDetail?.rentalStartDate && bookingDetail?.rentalEndDate
                ? `${toThaiDate(bookingDetail.rentalStartDate)} - ${toThaiDate(bookingDetail.rentalEndDate)}`
                : '-',
            dailyStallPrice: bookingDetail?.dailyStallPrice ?? null,
            lightEnabled: !!bookingDetail?.lightEnabled,
            smallApplianceCount: bookingDetail?.smallApplianceCount ?? 0,
            largeApplianceCount: bookingDetail?.largeApplianceCount ?? 0,
            grandTotalAllStalls,
            assignedStallCode,
            assignedStallCodes,
            requestedStallCount,
            allowedZones
        },
        zoneByCode,
        bookedStalls: bookedStallsExcludingOwn
    };
}

// ขั้นตอนของคำขอในมุมแอดมิน = "ต้องทำอะไรต่อ" (แทนการโชว์ status ดิบ ซึ่ง IN_PROGRESS ตัวเดียวมีได้ 3 ความหมาย)
const STAGE_ORDER = ['slip', 'overdue', 'assign', 'awaiting', 'done', 'rejected'];
// icon = Font Awesome ใช้ชุดเดียวกันทั้งปุ่มกรอง หัวกลุ่มรายการ และหน้าต่างรายละเอียด (สีกล่องไอคอนกำหนดใน approvals.css .stage-ic--*)
const STAGE_META = {
    assign: { label: 'ยังไม่ได้จัดล็อก', icon: 'fa-store', hint: 'เลือกล็อกให้ผู้ขาย หรือปฏิเสธคำขอ', todo: true },
    slip: { label: 'ส่งสลิปแล้ว รอตรวจ', icon: 'fa-file-invoice-dollar', hint: 'ผู้ขายโอนเงินแล้ว ตรวจยอดในสลิปแล้วกดยืนยันการชำระเงิน', todo: true },
    overdue: { label: 'ไม่จ่ายตามกำหนด', icon: 'fa-triangle-exclamation', hint: 'จัดล็อกให้แล้วเกิน 6 ชม. ผู้ขายยังไม่ส่งสลิป — ยกเลิกเพื่อคืนล็อก หรือรอต่อ', todo: true },
    awaiting: { label: 'รอผู้ขายโอนเงิน', icon: 'fa-money-bill-transfer', hint: 'จัดล็อกให้แล้ว ผู้ขายต้องส่งสลิปภายใน 6 ชม.', todo: false },
    done: { label: 'จ่ายเงินแล้ว', icon: 'fa-circle-check', hint: 'ยืนยันการชำระเงินแล้ว ล็อกเป็นของผู้ขาย', todo: false },
    rejected: { label: 'ปฏิเสธ/ยกเลิกแล้ว', icon: 'fa-circle-xmark', hint: '', todo: false }
};

function getRequestStage(request, now) {
    const status = String(request.status || 'PENDING').toUpperCase();
    if (status === 'SUCCESS') return 'done';
    if (status === 'REJECTED') return 'rejected';
    if (status === 'IN_PROGRESS') {
        if (request.paymentSlipImage) return 'slip';
        return isUnpaidPastDeadline(request, now) ? 'overdue' : 'awaiting';
    }
    return 'assign'; // PENDING / APPROVED (APPROVED เป็นสถานะเก่า ยังต้องจัดล็อกเหมือนกัน)
}

function formatThaiDateTime(date) {
    return new Date(date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ล็อกเดิม/วันหมดสัญญาเดิม/เส้นตาย 20:00 ของคำขอต่อ — cutoffState: passed = เลย 20:00 แล้ว (ล็อกถูกกันไว้ให้คำขอนี้),
// soon = เหลือไม่ถึง 24 ชม., ok = ยังมีเวลา (ใช้เฉพาะคำขอที่ยังรอจัดล็อก)
function buildExtensionInfo(originalRequest, originalBooking, stage, now) {
    const codes = parseStallCodes(originalRequest?.assignedStallCode || extractAssignedStallFromDescription(originalRequest?.description));
    const endDate = originalBooking?.rentalEndDate || null;
    const cutoff = endDate ? getRenewalCutoff(endDate) : null;
    let cutoffState = null;
    if (cutoff && stage === 'assign') {
        const msLeft = cutoff.getTime() - now.getTime();
        cutoffState = msLeft <= 0 ? 'passed' : msLeft <= 24 * 60 * 60 * 1000 ? 'soon' : 'ok';
    }
    return {
        originalStallCodes: codes,
        originalStallText: codes.join(', ') || '-',
        originalEndText: endDate ? toThaiDate(endDate) : '-',
        cutoffText: cutoff ? formatThaiDateTime(cutoff) : null,
        cutoffMs: cutoff ? cutoff.getTime() : null,
        cutoffState
    };
}

function getStageSortKey(stage, request, paymentDeadline, extension) {
    const created = new Date(request.createdAt).getTime();
    const rank = STAGE_ORDER.indexOf(stage);
    if (stage === 'assign') return [rank, extension?.cutoffMs ?? (created + 1e13)]; // คำขอต่อตามเส้นตาย แล้วคำขอใหม่ตามลำดับที่ส่ง
    if (stage === 'awaiting' || stage === 'overdue') return [rank, paymentDeadline ? paymentDeadline.getTime() : created];
    if (stage === 'slip') return [rank, created];
    return [rank, -created]; // จบแล้ว: ล่าสุดก่อน
}

// จำนวนงานที่แอดมินต้องจัดการ (รอจัดล็อก + รอตรวจสลิป + เลยกำหนดจ่าย) สำหรับตัวเลขบนเมนู "รายการอนุมัติ"
// นับเฉพาะรอบปัจจุบันและรอบถัดไป ให้ตรงกับที่เห็นตอนเปิดหน้า (คำขอค้างรอบเก่าเข้าไปปิดได้จากการเลื่อนรอบ)
// urgent = มีอย่างน้อย 1 รายการที่รอตรวจสลิปหรือเลยกำหนดจ่าย (ตัวเลขเป็นสีแดง)
exports.countApprovalTodo = async () => {
    const requests = await prisma.bookingRequest.findMany({
        where: { status: { in: ['PENDING', 'APPROVED', 'IN_PROGRESS'] } },
        select: { id: true, createdAt: true, status: true, paymentSlipImage: true, lockAssignedAt: true }
    });
    const linkedBookings = requests.length
        ? await prisma.booking.findMany({
            where: { OR: requests.map((request) => ({ storeDetailSnapshot: { startsWith: buildBookingRequestTag(request.id) } })) },
            select: { storeDetailSnapshot: true, rentalStartDate: true }
        })
        : [];
    const startByRequestId = new Map();
    linkedBookings.forEach((booking) => {
        const match = /^\[BOOKING_REQUEST_ID:(\d+)\]/.exec(String(booking.storeDetailSnapshot || ''));
        if (match) startByRequestId.set(Number(match[1]), booking.rentalStartDate);
    });
    const now = new Date();
    let total = 0;
    let urgent = 0;
    requests.forEach((request) => {
        const basisDate = startByRequestId.get(request.id) || request.createdAt;
        if (!isRoundEditable(getBookingRoundMetaForDate(basisDate).roundNumber)) return;
        const stage = getRequestStage(request, now);
        if (!STAGE_META[stage].todo) return;
        total += 1;
        if (stage !== 'assign') urgent += 1;
    });
    return { total, urgent };
};

// ประวัติร้านสำหรับหน้าต่างรายละเอียด (โหลดตอนเปิดหน้าต่าง ไม่โหลดพร้อมหน้ารายการ):
// บัญชี/Blacklist, จำนวนคำขอที่ผ่าน/ถูกปฏิเสธ/ถูกยกเลิก, วันมาขาย/ขาดขาย (จากบันทึกตรวจตลาดในช่วงที่ร้านเช่าล็อกจริง)
exports.getRequestHistory = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.params.id, 10);
        const request = requestId ? await prisma.bookingRequest.findUnique({ where: { id: requestId } }) : null;
        if (!request) return res.status(404).json({ ok: false });

        const linkedBooking = await prisma.booking.findFirst({
            where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(request.id) } },
            select: { userId: true }
        });
        const seller = linkedBooking?.userId
            ? await prisma.user.findUnique({
                where: { id: linkedBooking.userId },
                select: { id: true, name: true, createdAt: true, isBlacklisted: true, blacklistReason: true, shop: { select: { shopName: true } } }
            })
            : null;

        // คำขอทั้งหมดของร้านนี้: จับคู่จาก Booking.userId (แม่นกว่า) + ชื่อผู้ขาย (คำขอเก่าที่ไม่มี Booking)
        const userBookings = seller
            ? await prisma.booking.findMany({ where: { userId: seller.id, storeDetailSnapshot: { startsWith: BOOKING_REQUEST_TAG_PREFIX } }, select: { storeDetailSnapshot: true, rentalStartDate: true, rentalEndDate: true } })
            : [];
        const bookingByReq = new Map();
        userBookings.forEach((booking) => {
            const match = /^\[BOOKING_REQUEST_ID:(\d+)\]/.exec(String(booking.storeDetailSnapshot || ''));
            if (match && !bookingByReq.has(Number(match[1]))) bookingByReq.set(Number(match[1]), booking);
        });
        const requests = await prisma.bookingRequest.findMany({
            where: { OR: [{ id: { in: Array.from(bookingByReq.keys()) } }, { sellerName: request.sellerName }] },
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, description: true, lockAssignedAt: true, assignedStallCode: true, createdAt: true }
        });
        const others = requests.filter((item) => item.id !== request.id);
        const counts = { total: others.length, paid: 0, rejected: 0, cancelled: 0, extensions: 0 };
        const recentRejections = [];
        others.forEach((item) => {
            if (extractExtendOfRequestId(item.description)) counts.extensions += 1;
            if (item.status === 'SUCCESS') counts.paid += 1;
            if (item.status === 'REJECTED') {
                if (item.lockAssignedAt) counts.cancelled += 1;
                else counts.rejected += 1;
                if (recentRejections.length < 3) {
                    recentRejections.push({ id: item.id, dateText: toThaiDate(item.createdAt), reason: extractRejectReason(item.description) || 'ไม่ระบุเหตุผล', cancelled: Boolean(item.lockAssignedAt) });
                }
            }
        });

        // วันมาขาย/ขาดขาย: นับเฉพาะวันที่อยู่ในช่วงเช่าของคำขอที่จ่ายแล้วของร้านนี้ (ล็อกเดียวกันอาจเป็นของร้านอื่นในช่วงอื่น)
        const paidRequests = requests.filter((item) => item.status === 'SUCCESS' && bookingByReq.has(item.id));
        const stallCodes = Array.from(new Set(paidRequests.flatMap((item) => parseStallCodes(item.assignedStallCode))));
        const { loadStallDayStatuses } = require('./scoreReportController').reportHelpers;
        const statusByStall = await loadStallDayStatuses(stallCodes);
        const dayStatus = new Map();
        paidRequests.forEach((item) => {
            const booking = bookingByReq.get(item.id);
            if (!booking?.rentalStartDate || !booking?.rentalEndDate) return;
            const startKey = toStartOfDay(booking.rentalStartDate).getTime();
            const endKey = toStartOfDay(booking.rentalEndDate).getTime();
            parseStallCodes(item.assignedStallCode).forEach((code) => {
                (statusByStall.get(code) || new Map()).forEach((slot, dateKey) => {
                    const [y, m, d] = dateKey.split('-').map(Number);
                    const time = new Date(y, m - 1, d).getTime();
                    if (time < startKey || time > endKey) return;
                    if (slot.present) dayStatus.set(dateKey, 'present');
                    else if (slot.noShow && dayStatus.get(dateKey) !== 'present') dayStatus.set(dateKey, 'absent');
                });
            });
        });
        let presentDays = 0;
        let absentDays = 0;
        dayStatus.forEach((status) => { if (status === 'present') presentDays += 1; else absentDays += 1; });

        return res.json({
            ok: true,
            seller: seller
                ? { id: seller.id, name: seller.shop?.shopName || seller.name, memberSinceText: toThaiDate(seller.createdAt), isBlacklisted: seller.isBlacklisted, blacklistReason: seller.blacklistReason || '' }
                : null,
            counts,
            attendance: { presentDays, absentDays, recordedDays: presentDays + absentDays },
            recentRejections
        });
    } catch (err) {
        return res.status(500).json({ ok: false });
    }
};

// ให้หน้ารายการเช็คทุก 1 นาทีว่ามีคำขอใหม่เข้ามาหลังเปิดหน้าไหม (เทียบ createdAt กับเวลาที่โหลดหน้า)
exports.pollNewRequests = async (req, res) => {
    try {
        const since = new Date(Number(req.query.since) || Date.now());
        const newCount = await prisma.bookingRequest.count({ where: { createdAt: { gt: since } } });
        const slipCount = await prisma.bookingRequest.count({ where: { status: 'IN_PROGRESS', paymentSlipImage: { not: null }, paymentConfirmedAt: null } });
        return res.json({ ok: true, newCount, slipCount, todo: await exports.countApprovalTodo() });
    } catch (err) {
        return res.status(500).json({ ok: false });
    }
};

exports.getApprovalsPage = async (req, res) => {
    try {
        const currentRoundMeta = getBookingRoundMetaForDate(new Date());
        const requestedRound = req.query.round ? Number(req.query.round) : currentRoundMeta.roundNumber;
        const selectedRoundNumber = Number.isInteger(requestedRound) && requestedRound > 0 ? requestedRound : currentRoundMeta.roundNumber;
        const selectedRoundWindow = getRoundWindow(selectedRoundNumber);

        const allRequests = await prisma.bookingRequest.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Join ข้อมูลการจองจริง (วันที่/จำนวนวัน/ราคา ฯลฯ) เข้ากับคำขอ — ผูกด้วย tag เดียวกับที่
        // confirmBookingStall ใช้คำนวณราคาจริง และที่ extend-lock ใช้หา "ล็อกที่กำลังใช้อยู่"
        // ดึงทั้งหมดโดยไม่จำกัดช่วงเวลา เพราะต้องใช้ rentalStartDate ของแต่ละคำขอมาตัดสินว่าคำขอนั้น
        // อยู่รอบไหน (ผู้ขายอาจส่งคำขอก่อนรอบเปิดไม่กี่วัน แต่จองวันที่ของรอบถัดไป — ต้องยึดวันที่จองจริง
        // ไม่ใช่วันที่ส่งคำขอ ไม่งั้นคำขอจะไปโผล่ผิดรอบ)
        const allTaggedBookings = await prisma.booking.findMany({
            where: { storeDetailSnapshot: { startsWith: BOOKING_REQUEST_TAG_PREFIX } },
            select: {
                storeDetailSnapshot: true,
                rentalStartDate: true,
                rentalEndDate: true,
                rentalDays: true,
                billableDays: true,
                stallCount: true,
                dailyStallPrice: true,
                grandTotal: true,
                smallApplianceCount: true,
                largeApplianceCount: true
            }
        });

        const bookingByRequestId = new Map();
        allTaggedBookings.forEach((booking) => {
            const match = String(booking.storeDetailSnapshot || '').match(/^\[BOOKING_REQUEST_ID:(\d+)\]/);
            if (match) {
                bookingByRequestId.set(Number.parseInt(match[1], 10), booking);
            }
        });

        // รอบของคำขอยึดตามวันที่เริ่มเช่าจริง (rentalStartDate) ถ้ามีการจองผูกไว้แล้ว
        // ถ้ายังไม่มี (กรณีข้อมูลเก่า/ไม่ครบ) ค่อย fallback ไปใช้วันที่ส่งคำขอแทน
        const bookingRequests = allRequests.filter((request) => {
            const linkedBooking = bookingByRequestId.get(request.id);
            const roundBasisDate = linkedBooking ? linkedBooking.rentalStartDate : request.createdAt;
            const roundBasis = new Date(roundBasisDate);
            if (Number.isNaN(roundBasis.getTime())) {
                return false;
            }
            return roundBasis >= selectedRoundWindow.cycleStart && roundBasis <= selectedRoundWindow.cycleEnd;
        });

        const sellerNames = Array.from(
            new Set(
                bookingRequests
                    .map((request) => String(request.sellerName || '').trim())
                    .filter(Boolean)
            )
        );

        const sellerProfiles = sellerNames.length
            ? await prisma.user.findMany({
                where: { name: { in: sellerNames } },
                select: {
                    name: true,
                    shop: {
                        select: {
                            productImage: true,
                            shopCoverImage: true
                        }
                    }
                }
            })
            : [];

        const sellerImageMap = new Map();
        sellerProfiles.forEach((profile) => {
            const sellerName = String(profile.name || '').trim();
            if (!sellerName || sellerImageMap.has(sellerName)) {
                return;
            }
            sellerImageMap.set(
                sellerName,
                profile.shop?.productImage || profile.shop?.shopCoverImage || null
            );
        });

        const zoneCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
        const statusCounts = { PENDING: 0, IN_PROGRESS: 0, SUCCESS: 0, APPROVED: 0, REJECTED: 0 };
        const stageCounts = { assign: 0, slip: 0, overdue: 0, awaiting: 0, done: 0, rejected: 0 };
        const kindCounts = { new: 0, extend: 0 };
        const requestById = new Map(allRequests.map((request) => [request.id, request]));
        const now = new Date();

        const bookingRows = bookingRequests.map((request) => {
            const zoneCode = String(request.zone || '').trim().toUpperCase();
            const statusCode = String(request.status || 'PENDING').toUpperCase();
            const assignedStallCode = String(request.assignedStallCode || extractAssignedStallFromDescription(request.description) || '').trim().toUpperCase();
            const createdAtText = new Date(request.createdAt).toLocaleDateString('th-TH', {
                day: '2-digit',
                month: 'short',
                year: '2-digit'
            });
            const linkedBooking = bookingByRequestId.get(request.id) || null;
            const extendOfRequestId = extractExtendOfRequestId(request.description);
            const cornerZoneNote = extractCornerZoneNote(request.description);
            const rejectReason = extractRejectReason(request.description);

            if (zoneCode && zoneCounts[zoneCode] !== undefined) {
                zoneCounts[zoneCode] += 1;
            }

            if (statusCounts[statusCode] !== undefined) {
                statusCounts[statusCode] += 1;
            }

            const stage = getRequestStage(request, now);
            stageCounts[stage] += 1;
            kindCounts[extendOfRequestId ? 'extend' : 'new'] += 1;
            const paymentDeadline = statusCode === 'IN_PROGRESS' ? getPaymentDeadlineFromLockAssignedAt(request.lockAssignedAt) : null;
            const extension = extendOfRequestId
                ? buildExtensionInfo(requestById.get(extendOfRequestId), bookingByRequestId.get(extendOfRequestId), stage, now)
                : null;

            return {
                actionLogs: parseActionLogs(request.description).map((log) => ({ ...log, atText: formatThaiDateTime(log.at) })),
                createdAtFullText: formatThaiDateTime(request.createdAt),
                kind: extendOfRequestId ? 'extend' : 'new',
                stage,
                stageLabel: STAGE_META[stage].label,
                stageIcon: STAGE_META[stage].icon,
                paymentDeadlineText: paymentDeadline ? formatThaiDateTime(paymentDeadline) : null,
                paymentDeadlineMs: paymentDeadline ? paymentDeadline.getTime() : null,
                extension,
                sortKey: getStageSortKey(stage, request, paymentDeadline, extension),
                id: request.id,
                productName: request.productName,
                description: stripInternalTags(request.description),
                sellerName: request.sellerName,
                phone: request.phone,
                zone: zoneCode,
                zoneLabel: zoneCode ? `โซน ${zoneCode}` : 'ไม่ระบุโซน',
                status: statusCode.toLowerCase(),
                statusLabel:
                    statusCode === 'APPROVED'
                        ? 'อนุมัติแล้ว'
                        : statusCode === 'REJECTED'
                            ? 'ปฏิเสธ'
                            : statusCode === 'IN_PROGRESS'
                                ? 'จัดล็อกแล้ว รอชำระเงิน'
                                : statusCode === 'SUCCESS'
                                    ? 'ชำระเงินแล้ว'
                                    : 'รออนุมัติ',
                createdAtText,
                createdAtRaw: request.createdAt,
                assignedStallCode,
                paymentSlipImage: request.paymentSlipImage || null,
                paymentConfirmedAt: request.paymentConfirmedAt || null,
                slipVerified: typeof request.slipVerified === 'boolean' ? request.slipVerified : null,
                slipVerifyReason: request.slipVerifyReason || null,
                productImage: request.productImage || sellerImageMap.get(String(request.sellerName || '').trim()) || null,
                isExtension: Boolean(extendOfRequestId),
                extendOfRequestId,
                cornerZoneNote,
                rejectReason,
                requestedStallCount: linkedBooking ? (linkedBooking.stallCount || 1) : 1,
                isFinalPrice: Boolean(assignedStallCode),
                booking: linkedBooking
                    ? {
                        rentalStartDateText: toThaiDate(linkedBooking.rentalStartDate),
                        rentalEndDateText: toThaiDate(linkedBooking.rentalEndDate),
                        rentalDays: linkedBooking.rentalDays,
                        billableDays: linkedBooking.billableDays ?? linkedBooking.rentalDays,
                        stallCount: linkedBooking.stallCount,
                        dailyStallPrice: Number(linkedBooking.dailyStallPrice || 0),
                        grandTotal: Number(linkedBooking.grandTotal || 0),
                        smallApplianceCount: linkedBooking.smallApplianceCount || 0,
                        largeApplianceCount: linkedBooking.largeApplianceCount || 0
                    }
                    : null
            };
        });

        // เรียงตามสิ่งที่ต้องทำก่อน: ตรวจสลิป > เลยกำหนดจ่าย > รอจัดล็อก (คำขอต่อที่ใกล้ 20:00 ขึ้นก่อน) > รอผู้ขายจ่าย > จบแล้ว
        bookingRows.sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1]);
        const stageSections = STAGE_ORDER.map((stage) => ({
            stage,
            ...STAGE_META[stage],
            rows: bookingRows.filter((row) => row.stage === stage)
        }));

        const previousRoundNumber = selectedRoundNumber - 1;
        const nextRoundNumber = selectedRoundNumber + 1;
        const isCurrentRound = selectedRoundNumber === currentRoundMeta.roundNumber;
        // แก้ไขได้ทั้งรอบปัจจุบันและรอบอนาคต (ผู้ขายส่งคำขอจองล่วงหน้าข้ามรอบได้) — ที่แก้ไม่ได้มีแค่รอบที่ผ่านไปแล้ว
        // ใช้ isRoundEditable ตัวเดียวกับที่ confirmApproval/confirmBookingStall เช็คฝั่ง backend กันไม่ให้ front/back ไม่ตรงกัน
        const isEditable = isRoundEditable(selectedRoundNumber);
        const roundSummary = {
            selectedRoundNumber,
            currentRoundNumber: currentRoundMeta.roundNumber,
            previousRoundNumber,
            nextRoundNumber,
            isCurrentRound,
            isEditable,
            selectedRoundWindow: selectedRoundWindow,
            currentRoundWindow: getRoundWindow(currentRoundMeta.roundNumber)
        };

        res.render('admin/approvals', {
            user: req.user,
            bookingRequests: bookingRows,
            stageSections,
            stageCounts,
            kindCounts,
            counts: {
                all: bookingRows.length,
                pending: statusCounts.PENDING,
                approved: statusCounts.APPROVED,
                inProgress: statusCounts.IN_PROGRESS,
                success: statusCounts.SUCCESS,
                rejected: statusCounts.REJECTED,
                zones: zoneCounts
            },
            selectedRoundNumber,
            previousRoundNumber,
            nextRoundNumber,
            currentRoundNumber: currentRoundMeta.roundNumber,
            roundMeta: selectedRoundWindow,
            previousRoundMeta: getRoundWindow(previousRoundNumber),
            nextRoundMeta: getRoundWindow(nextRoundNumber),
            isCurrentRound,
            isEditable,
            error: req.query.error || null,
            errorReason: req.query.reason || null,
            errorRequestId: req.query.requestId || null,
            closedCount: req.query.closed || null,
            slipAmount: req.query.slipAmount || null,
            expectedAmount: req.query.expectedAmount || null,
            success: req.query.success || null
        });
    } catch (err) {
        const fallbackRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
        res.render('admin/approvals', {
            user: req.user,
            bookingRequests: [],
            counts: { all: 0, pending: 0, approved: 0, inProgress: 0, success: 0, rejected: 0, zones: {} },
            selectedRoundNumber: fallbackRoundNumber,
            previousRoundNumber: fallbackRoundNumber - 1,
            nextRoundNumber: fallbackRoundNumber + 1,
            currentRoundNumber: fallbackRoundNumber,
            roundMeta: getRoundWindow(fallbackRoundNumber),
            previousRoundMeta: getRoundWindow(fallbackRoundNumber - 1),
            nextRoundMeta: getRoundWindow(fallbackRoundNumber + 1),
            isCurrentRound: true,
            isEditable: false,
            error: 'load_approvals_failed',
            errorReason: null,
            errorRequestId: null,
            slipAmount: null,
            expectedAmount: null,
            success: null
        });
    }
};

exports.confirmApproval = async (req, res) => {
    const { requestId, status, reason } = req.body;
    try {
        const normalizedStatus = String(status || '').toUpperCase();
        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(normalizedStatus)) {
            return res.redirect(approvalsUrl(req, 'error=invalid_status'));
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: parseInt(requestId) }
        });

        if (!requestRecord) {
            return res.redirect(approvalsUrl(req, 'error=request_not_found'));
        }

        // รอบที่ผ่านไปแล้วยังปฏิเสธได้ (ปิดคำขอค้าง) แต่อนุมัติไม่ได้ เพราะวันเช่าผ่านไปแล้ว
        if (normalizedStatus !== 'REJECTED' && !(await isRequestEditable(requestRecord))) {
            return res.redirect(approvalsUrl(req, 'error=history_round_locked'));
        }

        // ปุ่มนี้ใช้แค่ตอนคำขอยังไม่ได้จัดล็อก (PENDING/APPROVED) — ถ้าจัดล็อกไปแล้ว (IN_PROGRESS/SUCCESS)
        // ต้องปฏิเสธผ่าน rejectBookingStall เท่านั้น เพราะจุดนั้นปล่อยล็อกที่จัดไว้คืนด้วย ตรงนี้ทำแค่
        // เปลี่ยน status เฉยๆ ไม่แตะ Stall เลย ถ้าปล่อยให้เรียกได้จะทิ้งล็อกค้างสถานะ BOOKED แบบไม่มีเจ้าของ
        const currentStatus = String(requestRecord.status || '').toUpperCase();
        if (!['PENDING', 'APPROVED'].includes(currentStatus)) {
            return res.redirect(approvalsUrl(req, 'error=invalid_state_transition'));
        }

        const trimmedReason = String(reason || '').trim();
        const updateData = { status: normalizedStatus };
        if (normalizedStatus === 'REJECTED') {
            updateData.description = withRejectReason(requestRecord.description, trimmedReason);
        }
        updateData.description = withActionLog(
            updateData.description || requestRecord.description,
            req.user?.name,
            normalizedStatus === 'REJECTED' ? `ปฏิเสธคำขอ${trimmedReason ? ` (${trimmedReason})` : ''}` : 'อนุมัติคำขอ'
        );

        await prisma.bookingRequest.update({
            where: { id: parseInt(requestId) },
            data: updateData
        });
        res.redirect(approvalsUrl(req, `success=${normalizedStatus === 'REJECTED' ? 'request_rejected' : 'status_updated'}`));
    } catch (err) {
        res.redirect(approvalsUrl(req, 'error=update_failed'));
    }
};

// แอดมินตรวจสลิปโอนเงินที่ผู้ขายส่งมาแล้วกดยืนยัน — จุดเดียวที่ทำให้ status เป็น SUCCESS
// และตั้ง paymentConfirmedAt ซึ่งเป็นเงื่อนไขที่ระบบใช้เปิดเผยเลขล็อกให้ลูกค้าเห็น
// (ก่อนหน้านี้ไม่มีปุ่มนี้เลย ทำให้สถานะค้างที่ IN_PROGRESS และเลขล็อกไม่ถูกเปิดเผยตลอดไป)
// SellerApplication.productImages/menuImages เก็บ URL เป็น JSON array — แปลงกลับแบบไม่พังถ้าข้อมูลเสีย
function parseImageUrlList(value) {
    try {
        const list = JSON.parse(value || '[]');
        return Array.isArray(list) ? list.filter((url) => typeof url === 'string' && url) : [];
    } catch (_) {
        return [];
    }
}

// รูปสินค้า/รูปเมนูจากใบสมัคร → แกลเลอรีร้าน (ShopProductImage/ShopMenuImage) เฉพาะแกลเลอรีที่ยังว่าง
// ผู้ขายจัดการรูปเองต่อใน /shop-profile แล้ว ยืนยันสลิปรอบหลัง ๆ จะไม่เพิ่มรูปเดิมซ้ำ
async function copyApplicationGalleries(shop, application) {
    const productUrls = parseImageUrlList(application.productImages);
    const menuUrls = parseImageUrlList(application.menuImages);
    if (!productUrls.length && !menuUrls.length) return;

    const [productCount, menuCount] = await Promise.all([
        prisma.shopProductImage.count({ where: { shopDetailId: shop.id } }),
        prisma.shopMenuImage.count({ where: { shopDetailId: shop.id } })
    ]);
    if (productUrls.length && productCount === 0) {
        await prisma.shopProductImage.createMany({
            data: productUrls.map((imageUrl) => ({ shopDetailId: shop.id, imageUrl }))
        });
        // productImage (รูปเดี่ยว) ต้องเป็นรูปแรกของแกลเลอรีเสมอ — กติกาเดียวกับ POST /shop-profile
        await prisma.shopDetail.update({ where: { id: shop.id }, data: { productImage: productUrls[0] } });
    }
    if (menuUrls.length && menuCount === 0) {
        await prisma.shopMenuImage.createMany({
            data: menuUrls.map((imageUrl) => ({ shopDetailId: shop.id, imageUrl }))
        });
    }
}

// แกนของ "ยืนยันการชำระเงิน" — ใช้ทั้งปุ่มเดี่ยว (confirmPayment) และปุ่มยืนยันสลิปที่ยอดตรงทีละหลายใบ (confirmVerifiedSlips)
// requestRecord = แถว BookingRequest เต็ม (ต้องเป็น IN_PROGRESS + มีสลิป ผู้เรียกเช็คก่อน)
async function markPaymentConfirmed(requestRecord, actorName, actionLabel = 'ยืนยันการชำระเงิน') {
    await prisma.bookingRequest.update({
        where: { id: requestRecord.id },
        data: {
            status: 'SUCCESS',
            paymentConfirmedAt: new Date(),
            description: withActionLog(requestRecord.description, actorName, actionLabel),
            // เก็บชื่อแอดมิน/พนักงานที่กดยืนยันสลิปไว้ ให้ใบเสนอราคา (controllers/quotationController.js) แสดง
            // "พนักงานและผู้พิมพ์" เป็นคนที่ยืนยันจริง ไม่ใช่คนที่บังเอิญล็อกอินอยู่ตอนเปิดดูใบเสนอราคา
            confirmedByName: actorName || null
        }
    });

    // คำขอต่อล็อก: ถ้าล็อกเดิมเคยถูกคืนวันสิ้นสุดเพราะจ่ายช้า (restoreUnpaidExtensions) ขยายให้ใหม่ตามที่จ่ายจริง
    // เฉพาะล็อกที่ยังเป็นของสัญญาเดิมหรือยังว่างอยู่ ถ้าถูกจัดให้คนอื่นไปแล้วไม่เขียนทับ
    const paidExtensionOrigin = await getExtensionOrigin(prisma, requestRecord.description);
    if (paidExtensionOrigin) {
        const paidCodes = parseStallCodes(requestRecord.assignedStallCode).filter((code) => paidExtensionOrigin.codes.includes(code));
        const extensionBooking = await prisma.booking.findFirst({
            where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(requestRecord.id) } },
            select: { rentalEndDate: true }
        });
        if (paidCodes.length && extensionBooking?.rentalEndDate) {
            await prisma.stall.updateMany({
                where: {
                    stallCode: { in: paidCodes },
                    OR: [{ status: 'AVAILABLE' }, { status: 'BOOKED', bookingEndDate: paidExtensionOrigin.endDate }]
                },
                data: { isAvailable: false, status: 'BOOKED', bookingStartDate: paidExtensionOrigin.startDate, bookingEndDate: extensionBooking.rentalEndDate }
            });
        }
    }

    // Booking ที่ผูกกับคำขอนี้ต้องตามสถานะไปเป็น SUCCESS ด้วย ไม่งั้นหน้า seller
    // dashboard/booking-status/booking-history จะยังค้างแสดงว่า "รอดำเนินการ" ทั้งที่จ่ายเงินจบแล้ว
    const successRequestTag = buildBookingRequestTag(requestRecord.id);
    if (successRequestTag) {
        await prisma.booking.updateMany({
            where: { storeDetailSnapshot: { startsWith: successRequestTag } },
            data: { status: 'SUCCESS' }
        });
    }

    // จ่ายเงินสำเร็จ = ได้ล็อกจริงแล้ว เลื่อนสถานะลูกค้าทั่วไปเป็นผู้ขาย (ไม่แตะ ADMIN/STAFF/SELLER เดิม)
    const paidRequestTag = buildBookingRequestTag(requestRecord.id);
    if (paidRequestTag) {
        const paidBooking = await prisma.booking.findFirst({
            where: { storeDetailSnapshot: { startsWith: paidRequestTag } },
            select: { userId: true, zoneCode: true, selectedZoneLabel: true }
        });
        const paidZoneLabel = paidBooking?.selectedZoneLabel || (paidBooking?.zoneCode ? `โซน ${paidBooking.zoneCode}` : null);
        if (paidBooking?.userId) {
            await prisma.user.updateMany({
                where: { id: paidBooking.userId, role: 'CUSTOMER' },
                data: { role: 'SELLER' }
            });

            // ซิงก์ข้อมูลร้านค้าเข้า ShopDetail จากใบสมัคร (SellerApplication) ตัวล่าสุดของผู้ใช้นี้
            // เส้นทางนี้ (จองแผงเอง -> แอดมินยืนยันสลิป) ผู้ใช้อาจยังไม่ผ่าน /admin/seller-applications
            // มาก่อน (isSellerOrApplicant อนุญาตให้จองได้ตั้งแต่ใบสมัครยังรอตรวจสอบ) การยืนยันจ่ายเงินสำเร็จ
            // ของแอดมินในเส้นทางนี้จึงถือเป็นการอนุมัติโดยพฤตินัย — ไม่ปล่อยให้ผู้ขายกรอกชื่อร้าน/
            // ประเภทสินค้าเองใหม่ใน /shop-profile จนไม่ตรงกับที่สมัครมา
            const latestApplication = await prisma.sellerApplication.findFirst({
                where: { userId: paidBooking.userId },
                orderBy: { createdAt: 'desc' }
            });
            if (latestApplication) {
                const isFirstApproval = String(latestApplication.status || '').toUpperCase() === 'PENDING';
                if (isFirstApproval) {
                    await prisma.sellerApplication.update({
                        where: { id: latestApplication.id },
                        data: { status: 'APPROVED', reviewedAt: new Date() }
                    });
                }
                // ชื่อร้าน/ประเภทสินค้า(+เฉพาะ) ยึดตามใบสมัครเสมอ (ผู้ขายแก้เองไม่ได้ ใช้จัดโซน/ระยะห่างล็อก)
                // ส่วนรายละเอียด/แนะนำร้าน/เมนูเด่น/รูปปก ผู้ขายแก้ต่อได้ใน /shop-profile — เติมจากใบสมัครเฉพาะช่องที่ยังว่าง
                // ไม่งั้นทุกครั้งที่ยืนยันสลิปรอบใหม่จะเขียนทับของที่ผู้ขายแก้ไว้กลับเป็นค่าตอนสมัคร
                const existingShop = await prisma.shopDetail.findUnique({
                    where: { userId: paidBooking.userId },
                    select: { productDetail: true, shopSummary: true, shopTags: true, shopCoverImage: true }
                });
                const fillIfEmpty = (field) => (existingShop?.[field] ? {} : { [field]: latestApplication[field] || null });
                const applicationShopData = {
                    shopName: latestApplication.shopName,
                    productType: latestApplication.productType,
                    productSubtype: latestApplication.productSubtype,
                    productSubtypeOther: latestApplication.productSubtypeOther
                };
                const syncedShop = await prisma.shopDetail.upsert({
                    where: { userId: paidBooking.userId },
                    update: {
                        ...applicationShopData,
                        ...fillIfEmpty('productDetail'),
                        ...fillIfEmpty('shopSummary'),
                        ...fillIfEmpty('shopTags'),
                        ...fillIfEmpty('shopCoverImage'),
                        isVerified: true,
                        ...(paidZoneLabel ? { shopZoneLabel: paidZoneLabel } : {})
                    },
                    create: {
                        userId: paidBooking.userId,
                        ...applicationShopData,
                        productDetail: latestApplication.productDetail,
                        shopSummary: latestApplication.shopSummary,
                        shopTags: latestApplication.shopTags,
                        shopCoverImage: latestApplication.shopCoverImage,
                        isVerified: true,
                        shopZoneLabel: paidZoneLabel || null
                    }
                });
                await copyApplicationGalleries(syncedShop, latestApplication);
                // เบอร์ในใบสมัครคือเบอร์ที่ผู้สมัครยืนยันตอนสมัคร — ที่อื่นอ่านจาก User.phoneNumber
                // (การ์ดล็อกบนผังตลาด, จับคู่คำขอจองล็อกกับผู้ใช้ด้านบน) ซิงก์แค่ตอนอนุมัติครั้งแรก
                // รอบต่อ ๆ ไปผู้ขายอาจแก้เบอร์ในโปรไฟล์แล้ว ไม่เขียนทับ
                if (isFirstApproval && latestApplication.phoneNumber) {
                    await prisma.user.update({
                        where: { id: paidBooking.userId },
                        data: { phoneNumber: latestApplication.phoneNumber }
                    });
                }
            } else if (paidZoneLabel) {
                // ไม่มีใบสมัครใหม่ (เช่น ผู้ขายเดิมต่อ/จองล็อกใหม่ในรอบถัดไป) แต่มี ShopDetail อยู่แล้ว
                // ก็ยังต้องอัปเดตโซนให้ตรงกับล็อกล่าสุดที่จ่ายเงินจริง
                await prisma.shopDetail.updateMany({
                    where: { userId: paidBooking.userId },
                    data: { shopZoneLabel: paidZoneLabel }
                });
            }
        }
    }
}

exports.confirmPayment = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        if (!requestId) {
            return res.redirect(approvalsUrl(req, 'error=missing_request_id'));
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId }
        });

        if (!requestRecord) {
            return res.redirect(approvalsUrl(req, 'error=request_not_found'));
        }

        if (String(requestRecord.status || '').toUpperCase() !== 'IN_PROGRESS' || !requestRecord.paymentSlipImage) {
            return res.redirect(approvalsUrl(req, 'error=no_slip_to_confirm'));
        }

        // ตรวจสลิปอัตโนมัติผ่าน SlipOK ก่อนยืนยัน (ถ้าตั้งค่า SLIPOK_API_KEY ไว้) — เทียบยอดในสลิป
        // กับราคาจริงของการจอง (Booking ที่ผูกด้วย tag เดียวกับที่ confirmBookingStall ใช้คำนวณราคา)
        // ปกติผลตรวจถูกเก็บไว้แล้วตั้งแต่ตอน /booking-payment/confirm อัปโหลดสลิป (กันยิง API ซ้ำ) —
        // ยิงใหม่เฉพาะกรณีไม่มีผลเก็บไว้เลย (slipVerified === null เช่นตอนอัปโหลด SlipOK ยังไม่ได้ตั้งค่า)
        const force = String(req.body.force || '') === '1';
        if (!force) {
            let verifyResult = requestRecord.slipVerified === null
                ? null
                : { ok: requestRecord.slipVerified, reason: requestRecord.slipVerifyReason, amount: requestRecord.slipVerifiedAmount };

            // ต้องรู้ยอดที่ต้องชำระจริงเสมอ (ไม่ใช่แค่ตอนยิง SlipOK ใหม่) เพื่อโชว์เทียบยอดสลิป vs ยอดจริง
            // บนหน้า approvals ตอนแจ้งเตือนตรวจสลิปไม่ผ่าน — ดู views/admin/approvals.ejs
            const requestTag = buildBookingRequestTag(requestId);
            const linkedBooking = requestTag
                ? await prisma.booking.findFirst({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
                : null;
            const expectedAmount = linkedBooking ? Number(linkedBooking.grandTotal || 0) : null;

            if (verifyResult === null) {
                verifyResult = await verifySlip(requestRecord.paymentSlipImage, expectedAmount);
            }

            if (verifyResult && verifyResult.ok === false) {
                const reason = encodeURIComponent(verifyResult.reason || 'ตรวจสลิปไม่ผ่าน');
                const amountParams = (verifyResult.amount != null && expectedAmount != null)
                    ? `&slipAmount=${encodeURIComponent(verifyResult.amount)}&expectedAmount=${encodeURIComponent(expectedAmount)}`
                    : '';
                return res.redirect(approvalsUrl(req, `error=slip_verification_failed&reason=${reason}${amountParams}&requestId=${requestId}`));
            }
        }

        await markPaymentConfirmed(requestRecord, req.user?.name);

        return res.redirect(approvalsUrl(req, 'success=payment_confirmed'));
    } catch (err) {
        return res.redirect(approvalsUrl(req, 'error=confirm_payment_failed'));
    }
};

// แอดมินตรวจแล้วพบว่าสลิปที่ผู้ขายส่งมาไม่ถูกต้อง (ยอดผิด/สลิปคนละคน/รูปไม่ชัด ฯลฯ)
// ต่างจาก rejectBookingStall (ปฏิเสธทั้งคำขอ ปล่อยล็อกคืน) ตรงนี้แค่ล้างสลิปเดิมทิ้ง
// เก็บล็อกที่จัดให้ไว้เหมือนเดิม (status ยังเป็น IN_PROGRESS) ให้ผู้ขายอัปโหลดสลิปใหม่ได้
exports.rejectPaymentSlip = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        const reason = String(req.body.reason || '').trim();
        if (!requestId) {
            return res.redirect(approvalsUrl(req, 'error=missing_request_id'));
        }
        if (!reason) {
            return res.redirect(approvalsUrl(req, 'error=missing_reject_slip_reason'));
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId }
        });

        if (!requestRecord) {
            return res.redirect(approvalsUrl(req, 'error=request_not_found'));
        }

        if (String(requestRecord.status || '').toUpperCase() !== 'IN_PROGRESS' || !requestRecord.paymentSlipImage) {
            return res.redirect(approvalsUrl(req, 'error=no_slip_to_confirm'));
        }

        // ลบไฟล์สลิปเดิมออกจากที่เก็บ กันไฟล์ค้างไม่มีใครอ้างถึง — เว้นไว้ถ้าคำขออื่นยังใช้รูปเดียวกัน (เช่นข้อมูลสาธิต)
        const sharedSlipCount = await prisma.bookingRequest.count({
            where: { paymentSlipImage: requestRecord.paymentSlipImage, id: { not: requestRecord.id } }
        });
        if (!sharedSlipCount) await deleteImage(requestRecord.paymentSlipImage);

        await prisma.bookingRequest.update({
            where: { id: requestId },
            data: {
                paymentSlipImage: null,
                slipVerified: null,
                slipVerifiedAmount: null,
                slipVerifyReason: `[แอดมินปฏิเสธสลิป] ${reason}`,
                description: withActionLog(requestRecord.description, req.user?.name, `แจ้งสลิปไม่ถูกต้อง (${reason})`)
            }
        });

        return res.redirect(approvalsUrl(req, 'success=slip_rejected'));
    } catch (err) {
        return res.redirect(approvalsUrl(req, 'error=reject_slip_failed'));
    }
};

exports.getBookingStallPage = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.query.requestId, 10);
        if (!requestId) {
            return res.redirect(approvalsUrl(req, 'error=missing_request_id'));
        }

        const pageData = await buildAdminBookingStallPageData(requestId);
        if (!pageData) {
            return res.redirect(approvalsUrl(req, 'error=request_not_found'));
        }

        return res.render('admin/booking_stall', {
            user: req.user,
            pageData
        });
    } catch (err) {
        return res.redirect(approvalsUrl(req, 'error=load_booking_stall_failed'));
    }
};

exports.confirmBookingStall = async (req, res) => {
    let stallUnavailableCode = null;
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        // selectedStalls: comma-separated stall codes จากหน้า booking_stall.ejs (รองรับคำขอที่ขอมากกว่า 1 ล็อก)
        // ยังรับ selectedStall เดิมไว้เผื่อ form เก่า/ค้าง cache
        const selectedStalls = parseStallCodes(req.body.selectedStalls || req.body.selectedStall);
        if (!requestId || !selectedStalls.length) {
            return res.redirect(approvalsUrl(req, 'error=missing_confirm_payload'));
        }
        if (new Set(selectedStalls).size !== selectedStalls.length) {
            return res.redirect(approvalsUrl(req, 'error=duplicate_stall_selected'));
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: { id: true, createdAt: true, description: true, assignedStallCode: true }
        });

        if (!requestRecord) {
            return res.redirect(approvalsUrl(req, 'error=request_not_found'));
        }

        if (!(await isRequestEditable(requestRecord))) {
            return res.redirect(approvalsUrl(req, 'error=history_round_locked'));
        }

        const requestTag = buildBookingRequestTag(requestId);
        // มี Booking 1 แถวต่อ 1 ล็อกที่ขอ (ดู POST /booking-stall ใน sellerRoute.js ที่สร้าง Booking
        // วนตามจำนวน stallCount) จำนวนแถวที่ผูกกับคำขอนี้จึงบอกว่าต้องเลือกกี่ล็อกจริงบนแผนที่
        const linkedBookings = requestTag
            ? await prisma.booking.findMany({ where: { storeDetailSnapshot: { startsWith: requestTag } }, orderBy: { id: 'asc' } })
            : [];
        const requestedStallCount = Math.max(1, linkedBookings.length);

        // ไม่บังคับให้เลือกครบตามจำนวนที่ขอมาอีกต่อไป (แอดมินอาจจัดให้แค่บางล็อกตามที่มีจริง) — เลือกได้ตั้งแต่
        // 1 ล็อก ไปจนถึงจำนวนที่ขอมาสูงสุด แถวคำขอ (Booking) ส่วนที่เกินจากล็อกที่จัดให้จริงจะถูกยกเลิกด้านล่าง
        if (selectedStalls.length < 1 || selectedStalls.length > requestedStallCount) {
            return res.redirect(approvalsUrl(req, 'error=stall_count_mismatch'));
        }

        const previousAssigned = parseStallCodes(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description));
        // คำขอต่อล็อก: ล็อกเดิมยัง BOOKED โดยคำขอเดิม ต้องจัดให้คำขอต่อได้ (ดู getExtensionOrigin)
        const extensionOrigin = await getExtensionOrigin(prisma, requestRecord.description);
        const extensionStallCodes = extensionOrigin?.codes || [];
        const stallsToRelease = previousAssigned.filter((code) => !selectedStalls.includes(code));
        const cleanedDescription = String(requestRecord.description || '').replace(/^\[ASSIGNED_STALL:[^\]]+\]\s*/i, '').trim();

        const joinedAssignedStallCode = joinStallCodes(selectedStalls);

        // เช็คความว่างของล็อก + ล็อกแถว (FOR UPDATE) และคำนวณราคาไว้ในทรานแซกชันเดียวกับที่เขียนจริง
        // กันสองคำขอ (สองแอดมิน/ดับเบิลคลิก) ผ่านเช็คว่างพร้อมกันแล้วชิงล็อกเดียวกันได้สำเร็จทั้งคู่ (double-booking)
        await prisma.$transaction(async (tx) => {
            const lockedStalls = await tx.$queryRaw`
                SELECT id, stallCode, isAvailable, status, basePrice, extraPrice, electricFeePerDay, extraElectricityCost
                FROM Stall WHERE stallCode IN (${Prisma.join(selectedStalls)}) FOR UPDATE
            `;
            const stallByCode = new Map(lockedStalls.map((s) => [s.stallCode, s]));

            for (const code of selectedStalls) {
                const stall = stallByCode.get(code);
                if (!stall) {
                    stallUnavailableCode = 'stall_not_found';
                    throw new Error('ROLLBACK_STALL_CHECK');
                }
                const isAlreadyBooked = !stall.isAvailable || String(stall.status || '').toUpperCase() !== 'AVAILABLE';
                // ล็อกที่คำขอนี้ถืออยู่แล้วจากการจัดครั้งก่อน ไม่ถือว่า "ไม่ว่าง" สำหรับคำขอนี้เอง (จัดใหม่/ยืนยันซ้ำได้)
                if (isAlreadyBooked && !previousAssigned.includes(code) && !extensionStallCodes.includes(code)) {
                    stallUnavailableCode = 'stall_unavailable';
                    throw new Error('ROLLBACK_STALL_CHECK');
                }
            }

            // ราคาที่เห็นตอนแจ้งความสนใจเป็นแค่ราคาต่ำสุดของทั้งโซน (ประมาณการ) ไม่ใช่ราคาจริง
            // ของล็อกที่จะได้ — ราคาจริงขึ้นกับตำแหน่งล็อกที่แอดมินเลือกให้ (Stall.basePrice + extraPrice)
            // ขอมากกว่า 1 ล็อก แต่ละล็อกอาจราคาไม่เท่ากัน จึงเฉลี่ยราคาต่อล็อกจากผลรวมของทุกล็อกที่เลือกจริง
            // (Booking แต่ละแถวเก็บราคา/ยอดรวมชุดเดียวกันซ้ำกันทุกแถว ตามดีไซน์เดิมที่หน้า seller
            // อ่านแค่แถวเดียว (findFirst) มาแสดงเป็นยอดรวมทั้งคำขอ)
            const totalDailyStallPrice = selectedStalls.reduce((sum, code) => {
                const stall = stallByCode.get(code);
                return sum + Number(stall.basePrice || 0) + Number(stall.extraPrice || 0);
            }, 0);
            const totalDailyLightPrice = selectedStalls.reduce((sum, code) => {
                const stall = stallByCode.get(code);
                return sum + Number(stall.electricFeePerDay || 0) + Number(stall.extraElectricityCost || 0);
            }, 0);
            const averageDailyStallPrice = totalDailyStallPrice / selectedStalls.length;
            const averageDailyLightPrice = totalDailyLightPrice / selectedStalls.length;

            await tx.bookingRequest.update({
                where: { id: requestId },
                data: {
                    // IN_PROGRESS = จัดล็อกให้แล้ว รอผู้ขายอัปโหลดสลิปโอนเงิน (ดู getBookingStep/getBookingStatusText)
                    // เดิม field นี้ตั้งเป็น 'APPROVED' ทำให้ /booking-payment/confirm ที่เช็คว่าต้องเป็น
                    // IN_PROGRESS ก่อนถึงจะอัปโหลดสลิปได้ ไม่มีทางถูกเข้าถึงเลย
                    status: 'IN_PROGRESS',
                    assignedStallCode: joinedAssignedStallCode,
                    description: withActionLog(cleanedDescription, req.user?.name, `จัดล็อก ${joinedAssignedStallCode}`),
                    // เริ่มนับกำหนดชำระเงินใหม่ (ภายใน 6 ชม.) ทุกครั้งที่จัดล็อก แม้เป็นการจัดซ้ำ
                    lockAssignedAt: new Date()
                }
            });

            // บั๊กเดิม: จุดนี้เคยอัปเดตแค่ isAvailable/status ไม่เคยเขียน bookingStartDate/bookingEndDate ลง Stall
            // เลย ทำให้ทุกล็อกที่จัดผ่านหน้านี้ expiryState เป็น null ตลอด (ระบบเตือนใกล้หมดอายุ/ปุ่มปล่อยล็อกที่
            // /admin/slots มองไม่เห็นเลยสักล็อก) ใช้ระยะเวลาเช่าจริงจาก linkedBookings[0] (ทุกแถวของคำขอนี้
            // ระยะเวลาเท่ากันหมด ต่างกันแค่ล็อก ดูคอมเมนต์จุดคำนวณราคาด้านบน)
            const rentalStartDate = linkedBookings[0]?.rentalStartDate || null;
            const rentalEndDate = linkedBookings[0]?.rentalEndDate || null;

            for (const code of selectedStalls) {
                const stall = stallByCode.get(code);
                // ต่อล็อกเดิม: เก็บวันเริ่มของสัญญาเดิมไว้ ขยายแค่วันสิ้นสุด
                const startDate = extensionStallCodes.includes(code) && extensionOrigin.startDate
                    ? extensionOrigin.startDate
                    : rentalStartDate;
                await tx.stall.update({
                    where: { id: stall.id },
                    data: { isAvailable: false, status: 'BOOKED', bookingStartDate: startDate, bookingEndDate: rentalEndDate }
                });
            }

            await releaseOrRestoreStalls(tx, stallsToRelease, extensionOrigin, true);

            // Booking (ตัวที่หน้า seller dashboard/booking-status/booking-history อ่าน) ต้อง
            // ตามสถานะจริงของ BookingRequest ไปด้วย — เดิมโค้ดจุดนี้อัปเดตแค่ราคา ทำให้ Booking.status
            // ค้างที่ PENDING ตลอดแม้แอดมินจะจัดล็อกและยืนยันจ่ายเงินแล้วจริงๆ ก็ตาม
            // จับคู่แถวละ 1 ล็อก (ห้าม wrap ซ้ำ) — ถ้าแอดมินจัดล็อกน้อยกว่าที่ขอมา (เช่น ขอ 2 จัดแค่ 1)
            // แถว Booking ที่เหลือซึ่งไม่ได้ล็อกจริงจะถูกยกเลิก (REJECTED) ไปเลย ไม่ค้างเป็น PENDING/ทับล็อกซ้ำกัน
            const bookingsToAssign = linkedBookings.slice(0, selectedStalls.length);
            const bookingsToReject = linkedBookings.slice(selectedStalls.length);

            if (bookingsToReject.length) {
                await tx.booking.updateMany({
                    where: { id: { in: bookingsToReject.map((b) => b.id) } },
                    data: { status: 'REJECTED' }
                });
            }

            for (let i = 0; i < bookingsToAssign.length; i += 1) {
                const booking = bookingsToAssign[i];
                const code = selectedStalls[i];

                const assignedSlot = await tx.slot.upsert({
                    where: { slotNumber: code },
                    update: { isAvailable: false },
                    create: {
                        slotNumber: code,
                        zone: code.replace(/[0-9].*$/, '') || 'A',
                        price: averageDailyStallPrice,
                        isAvailable: false
                    }
                });

                // คิดเงินตามวันที่คิดเงินจริง (หักวันหยุดแล้ว) แบบเดียวกับตอนผู้ขายจอง — rentalDays ดิบจะทำให้ราคาเพิ่มหลังจัดล็อก
                const chargeDays = booking.billableDays ?? booking.rentalDays;
                const rentTotal = averageDailyStallPrice * booking.stallCount * chargeDays;
                const lightTotal = booking.lightEnabled ? averageDailyLightPrice * booking.stallCount * chargeDays : 0;
                const grandTotal = rentTotal + lightTotal + booking.applianceTotal;

                await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        dailyStallPrice: averageDailyStallPrice,
                        lightUnitPrice: averageDailyLightPrice,
                        rentTotal,
                        lightTotal,
                        grandTotal,
                        status: 'IN_PROGRESS',
                        slotId: assignedSlot.id
                    }
                });
            }
        });

        return res.redirect(approvalsUrl(req, 'success=stall_assigned'));
    } catch (err) {
        if (stallUnavailableCode) {
            return res.redirect(approvalsUrl(req, `error=${stallUnavailableCode}`));
        }
        return res.redirect(approvalsUrl(req, 'error=confirm_booking_stall_failed'));
    }
};

// แกนของ "ปฏิเสธ/ยกเลิกคำขอ" — ใช้ทั้งปุ่มเดี่ยว (rejectBookingStall) และปุ่มปิดคำขอค้างทั้งรอบ (rejectStaleRound)
// requestRecord ต้องมี id, description, assignedStallCode
async function cancelRequestCore(requestRecord, reason, actorName, actionLabel) {
    // ถ้าแอดมินเคยจัดล็อกให้แล้ว (สถานะ IN_PROGRESS) แล้วมาปฏิเสธทีหลัง ต้องปล่อยล็อกจริงทุกล็อก
    // ที่จัดไว้กลับเป็นว่างด้วย ไม่งั้นล็อกจะค้างสถานะ BOOKED ตลอดไปโดยไม่มีเจ้าของ
    // คำขอต่อล็อกที่จัดล็อกเดิมไว้แล้ว ปฏิเสธแล้วล็อกกลับไปเป็นของสัญญาเดิม (วันสิ้นสุดเดิม) ไม่ปล่อยเป็นว่าง
    const assignedCodes = parseStallCodes(requestRecord.assignedStallCode || extractAssignedStallFromDescription(requestRecord.description));
    const extensionOrigin = await getExtensionOrigin(prisma, requestRecord.description);
    // คืนเฉพาะล็อกที่คำขอนี้ยังถืออยู่จริง (วันสิ้นสุดบนล็อกตรงกับวันเช่าของคำขอ) — คำขอรอบเก่าที่ค้างอยู่
    // ล็อกอาจถูกปล่อยแล้วจัดให้คนอื่นไปแล้ว ห้ามไปปล่อยล็อกของคนอื่น (ล็อกเดิมของคำขอต่อคืนเป็นสัญญาเดิมเสมอ)
    const linkedBooking = await prisma.booking.findFirst({
        where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(requestRecord.id) } },
        select: { rentalEndDate: true }
    });
    const heldStalls = assignedCodes.length
        ? await prisma.stall.findMany({ where: { stallCode: { in: assignedCodes } }, select: { stallCode: true, status: true, bookingEndDate: true } })
        : [];
    // ล็อกเดิมของคำขอต่อก็เช็คเหมือนกัน: ต้องยังเป็นวันของคำขอนี้หรือของสัญญาเดิมอยู่ ถึงจะคืนเป็นสัญญาเดิม
    const dayOf = (date) => (date ? toStartOfDay(date).getTime() : null);
    const requestEnd = dayOf(linkedBooking?.rentalEndDate);
    const originEnd = dayOf(extensionOrigin?.endDate);
    const stallCodesToRelease = heldStalls
        .filter((stall) => {
            if (stall.status !== 'BOOKED') return false;
            const stallEnd = dayOf(stall.bookingEndDate);
            if ((extensionOrigin?.codes || []).includes(stall.stallCode)) return stallEnd === requestEnd || stallEnd === originEnd;
            return stallEnd === null || requestEnd === null || stallEnd === requestEnd;
        })
        .map((stall) => stall.stallCode);

    // เหตุผล (ไม่บังคับ) ฝังเป็น tag เดียวกับ confirmApproval ให้ผู้ขาย/หน้ารายการเห็น
    const trimmedReason = String(reason || '').trim();

    await prisma.bookingRequest.update({
        where: { id: requestRecord.id },
        data: {
            status: 'REJECTED',
            assignedStallCode: null,
            description: withActionLog(
                withRejectReason(requestRecord.description, trimmedReason),
                actorName,
                `${actionLabel || (heldStalls.length ? 'ยกเลิกการจัดล็อก' : 'ปฏิเสธคำขอ')}${trimmedReason ? ` (${trimmedReason})` : ''}`
            )
        }
    });

    await releaseOrRestoreStalls(prisma, stallCodesToRelease, extensionOrigin, false);

    const rejectedRequestTag = buildBookingRequestTag(requestRecord.id);
    if (rejectedRequestTag) {
        await prisma.booking.updateMany({
            where: { storeDetailSnapshot: { startsWith: rejectedRequestTag } },
            data: { status: 'REJECTED' }
        });
    }
}

exports.rejectBookingStall = async (req, res) => {
    try {
        const requestId = Number.parseInt(req.body.requestId, 10);
        if (!requestId) {
            return res.redirect(approvalsUrl(req, 'error=missing_request_id'));
        }

        const requestRecord = await prisma.bookingRequest.findUnique({
            where: { id: requestId },
            select: { id: true, createdAt: true, description: true, assignedStallCode: true, status: true }
        });

        if (!requestRecord) {
            return res.redirect(approvalsUrl(req, 'error=request_not_found'));
        }

        // รอบที่ผ่านไปแล้วยกเลิกคำขอที่ยังไม่จบได้ (ปิดงานค้าง) แต่คำขอที่จ่ายเงินแล้วต้องจัดการนอกระบบ (คืนเงิน)
        if (requestRecord.status === 'SUCCESS' && !(await isRequestEditable(requestRecord))) {
            return res.redirect(approvalsUrl(req, 'error=history_round_locked'));
        }

        await cancelRequestCore(requestRecord, req.body.reason, req.user?.name);

        return res.redirect(approvalsUrl(req, 'success=request_rejected'));
    } catch (err) {
        return res.redirect(approvalsUrl(req, 'error=reject_booking_stall_failed'));
    }
};

// ยืนยันการชำระเงินทุกใบที่ระบบตรวจสลิปแล้วว่า "สลิปจริง ยอดตรง" (slipVerified = true) ในรอบที่เลือก ครั้งเดียว
// ใบที่ตรวจไม่ผ่าน/ยังไม่ได้ตรวจ ไม่แตะ — แอดมินต้องเปิดดูทีละใบ
exports.confirmVerifiedSlips = async (req, res) => {
    try {
        const roundNumber = Number.parseInt(req.body.round, 10);
        if (!Number.isInteger(roundNumber) || roundNumber <= 0) {
            return res.redirect(approvalsUrl(req, 'error=missing_request_id'));
        }
        const window = getRoundWindow(roundNumber);
        const candidates = await prisma.bookingRequest.findMany({
            where: { status: 'IN_PROGRESS', paymentSlipImage: { not: null }, slipVerified: true, paymentConfirmedAt: null }
        });
        let confirmed = 0;
        for (const request of candidates) {
            const linkedBooking = await prisma.booking.findFirst({
                where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(request.id) } },
                select: { rentalStartDate: true }
            });
            const basis = new Date(linkedBooking?.rentalStartDate || request.createdAt);
            if (basis < window.cycleStart || basis > window.cycleEnd) continue;
            await markPaymentConfirmed(request, req.user?.name, 'ยืนยันการชำระเงิน (ยืนยันพร้อมกันหลายใบ)');
            confirmed += 1;
        }
        return res.redirect(approvalsUrl(req, `success=slips_confirmed&closed=${confirmed}`));
    } catch (err) {
        return res.redirect(approvalsUrl(req, 'error=confirm_payment_failed'));
    }
};

// ปิดคำขอค้างทั้งรอบที่ผ่านไปแล้วในครั้งเดียว (ปฏิเสธที่รอจัดล็อก / ยกเลิกที่จัดแล้วแต่ไม่ส่งสลิป) ด้วยเหตุผลเดียวกัน
// ไม่แตะคำขอที่ส่งสลิปแล้ว (ต้องตรวจสลิปทีละรายการ) และที่จ่ายแล้ว — ทำได้เฉพาะรอบที่ผ่านไปแล้วเท่านั้น
exports.rejectStaleRound = async (req, res) => {
    try {
        const roundNumber = Number.parseInt(req.body.round, 10);
        if (!Number.isInteger(roundNumber) || roundNumber <= 0 || isRoundEditable(roundNumber)) {
            return res.redirect(approvalsUrl(req, 'error=stale_round_invalid'));
        }
        const reason = String(req.body.reason || '').trim() || 'หมดรอบแล้ว ไม่ได้ดำเนินการต่อ';
        const window = getRoundWindow(roundNumber);
        const candidates = await prisma.bookingRequest.findMany({
            where: { status: { in: ['PENDING', 'APPROVED', 'IN_PROGRESS'] }, paymentSlipImage: null },
            select: { id: true, createdAt: true, description: true, assignedStallCode: true, status: true }
        });
        let closed = 0;
        for (const request of candidates) {
            const linkedBooking = await prisma.booking.findFirst({
                where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(request.id) } },
                select: { rentalStartDate: true }
            });
            const basis = new Date(linkedBooking?.rentalStartDate || request.createdAt);
            if (basis < window.cycleStart || basis > window.cycleEnd) continue;
            await cancelRequestCore(request, reason, req.user?.name, 'ปิดคำขอค้างทั้งรอบ');
            closed += 1;
        }
        return res.redirect(approvalsUrl(req, `success=stale_closed&closed=${closed}`));
    } catch (err) {
        return res.redirect(approvalsUrl(req, 'error=stale_close_failed'));
    }
};

// หน้าที่อนุญาตให้ redirect กลับหลังกด "ปล่อยล็อก"/"แจ้งเตือนร้านค้า" — whitelist ไว้กันเป็น open redirect
// (ไม่รับ URL จาก client ตรงๆ, req.body.returnTo ต้องตรงกับค่าใดค่าหนึ่งในนี้เท่านั้น ไม่งั้น fallback ไป /admin/slots)
const STALL_ACTION_RETURN_PATHS = ['/admin/slots', '/admin/slots/expiring'];
function resolveReturnPath(returnTo) {
    return STALL_ACTION_RETURN_PATHS.includes(returnTo) ? returnTo : '/admin/slots';
}

// ปล่อยล็อกที่หมดสัญญาแล้ว (bookingEndDate เลยมาแล้ว) กลับเป็นว่างด้วยตนเอง — ไม่มี auto-release อัตโนมัติ
// ในระบบ เพราะหมดสัญญาในระบบไม่ได้แปลว่าร้านออกจากพื้นที่จริงแล้วเสมอไป (อาจกำลังต่อ/รอจ่ายเพิ่ม) จึงให้
// แอดมินเป็นคนตัดสินใจกดปล่อยเองหลังเช็คหน้างานแล้วว่าร้านออกจริง (ดูปุ่ม "ปล่อยล็อก" ที่หน้า /admin/slots
// และ /admin/slots/expiring) ไม่แตะสถานะ Booking/BookingRequest เดิม แค่ปลดล็อกให้จองใหม่ได้
// แกนของ "ปล่อยล็อก" คืนรหัสผลลัพธ์ (ใช้ร่วมกันทั้งปุ่มเดี่ยวและปุ่มทำหลายล็อกพร้อมกัน)
async function releaseExpiredStallCore(rawCode) {
    const stallCode = String(rawCode || '').trim().toUpperCase();
    if (!stallCode) return { code: 'missing_stall_code', ok: false };

    const stall = await prisma.stall.findUnique({ where: { stallCode } });
    if (!stall) return { code: 'stall_not_found', ok: false };

    // เช็คซ้ำฝั่ง server ว่าหมดสัญญาจริง ไม่เชื่อ client เฉยๆ — กันปล่อยล็อกที่ยังจองอยู่จริงผิดพลาด/ตั้งใจ
    const isExpired = stall.status === 'BOOKED' && stall.bookingEndDate && getRenewalPhase(stall.bookingEndDate) === 'lapsed';
    if (!isExpired) return { code: 'stall_not_expired', ok: false };

    await prisma.$transaction([
        prisma.stall.update({ where: { id: stall.id }, data: { isAvailable: true, status: 'AVAILABLE' } }),
        prisma.slot.updateMany({ where: { slotNumber: stallCode }, data: { isAvailable: true } })
    ]);
    return { code: 'stall_released', ok: true };
}

// ปล่อยล็อกที่หมดสัญญาแล้ว (bookingEndDate เลยมาแล้ว) กลับเป็นว่างด้วยตนเอง — ไม่มี auto-release อัตโนมัติ
// ในระบบ เพราะหมดสัญญาในระบบไม่ได้แปลว่าร้านออกจากพื้นที่จริงแล้วเสมอไป (อาจกำลังต่อ/รอจ่ายเพิ่ม) จึงให้
// แอดมินเป็นคนตัดสินใจกดปล่อยเองหลังเช็คหน้างานแล้วว่าร้านออกจริง (ดูปุ่ม "ปล่อยล็อก" ที่หน้า /admin/slots
// และ /admin/slots/expiring) ไม่แตะสถานะ Booking/BookingRequest เดิม แค่ปลดล็อกให้จองใหม่ได้
exports.releaseExpiredStall = async (req, res) => {
    const returnPath = resolveReturnPath(req.body.returnTo);
    try {
        const result = await releaseExpiredStallCore(req.body.stallCode);
        return res.redirect(`${returnPath}?${result.ok ? 'success' : 'error'}=${result.code}`);
    } catch (err) {
        return res.redirect(`${returnPath}?error=release_stall_failed`);
    }
};

// แกนของ "แจ้งเตือนร้านค้า" คืนรหัสผลลัพธ์ (success=notify_sent / notify_sent_in_app, error=อื่นๆ)
async function notifyStallExpiringCore(rawCode) {
    const stallCode = String(rawCode || '').trim().toUpperCase();
    if (!stallCode) return { code: 'missing_stall_code', ok: false };

    const stall = await prisma.stall.findUnique({ where: { stallCode } });
    if (!stall || stall.status !== 'BOOKED' || !stall.bookingEndDate) return { code: 'stall_not_expiring', ok: false };

    const daysLeft = Math.round((new Date(stall.bookingEndDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));

    // หาผู้เช่าล็อกนี้จริง (Slot -> Booking ล่าสุดที่ยังไม่ถูกปฏิเสธ -> User) เอาแค่อีเมล ไม่ต้องเช็ค subtype/shop
    const slot = await prisma.slot.findUnique({
        where: { slotNumber: stallCode },
        select: {
            bookings: {
                where: { status: { in: ['IN_PROGRESS', 'SUCCESS', 'APPROVED'] } },
                orderBy: { id: 'desc' },
                take: 1,
                select: { userId: true, user: { select: { email: true } } }
            }
        }
    });
    const renter = slot?.bookings[0];
    if (!renter) return { code: 'notify_no_email', ok: false };

    // แจ้งเตือนในระบบ (การ์ดใน /notifications + badge กระดิ่งผู้ขาย) ก่อนส่งอีเมลเสมอ — อีเมลพังหรือไม่มีอีเมลก็ยังแจ้งในระบบได้
    await prisma.stallRenewalNotice.create({
        data: { stallCode, userId: renter.userId, bookingEndDate: stall.bookingEndDate }
    });

    const email = renter.user?.email;
    if (!email) return { code: 'notify_sent_in_app', ok: true };

    await sendStallExpiringSoonEmail(email, stallCode, daysLeft);
    return { code: 'notify_sent', ok: true };
}

// แจ้งเตือนร้านค้าทางอีเมลว่าล็อกใกล้หมดสัญญา ให้มาต่อสัญญาก่อนโดนปล่อยล็อกคืน — แอดมินกดเองเป็นครั้งๆ ไป
// (ดูปุ่ม "แจ้งเตือนร้านค้า" ที่หน้า /admin/slots และ /admin/slots/expiring) ไม่มีระบบส่งอัตโนมัติ/ตามรอบ
// เพราะยังไม่มี cron ในระบบ
exports.notifyStallExpiring = async (req, res) => {
    const returnPath = resolveReturnPath(req.body.returnTo);
    try {
        const result = await notifyStallExpiringCore(req.body.stallCode);
        return res.redirect(`${returnPath}?${result.ok ? 'success' : 'error'}=${result.code}`);
    } catch (err) {
        return res.redirect(`${returnPath}?error=notify_failed`);
    }
};

// ทำหลายล็อกพร้อมกันจากโหมด "เลือกหลายล็อก" บนผัง — ใช้แกนเดียวกับปุ่มเดี่ยว (เช็คเงื่อนไขซ้ำทีละล็อกฝั่ง server)
// ตอบเป็น JSON รายล็อก ล็อกที่ไม่เข้าเงื่อนไขแค่ถูกข้าม ไม่ทำให้ล็อกอื่นล้ม
const BULK_STALL_ACTION_LIMIT = 60;
exports.bulkStallAction = async (req, res) => {
    const action = String(req.body.action || '');
    const core = action === 'release' ? releaseExpiredStallCore : (action === 'notify' ? notifyStallExpiringCore : null);
    if (!core) return res.status(400).json({ error: 'invalid_action' });

    const codes = [...new Set((Array.isArray(req.body.stallCodes) ? req.body.stallCodes : [])
        .map((code) => String(code || '').trim().toUpperCase())
        .filter(Boolean))].slice(0, BULK_STALL_ACTION_LIMIT);
    if (!codes.length) return res.status(400).json({ error: 'missing_stall_codes' });

    const results = [];
    for (const code of codes) {
        try {
            const result = await core(code);
            results.push({ stallCode: code, ok: result.ok, code: result.code });
        } catch (err) {
            results.push({ stallCode: code, ok: false, code: action === 'release' ? 'release_stall_failed' : 'notify_failed' });
        }
    }
    return res.json({
        action,
        okCount: results.filter((r) => r.ok).length,
        failCount: results.filter((r) => !r.ok).length,
        results
    });
};
