// ข้อมูลร้านที่จองล็อกแล้วแต่ละล็อก ใช้ร่วมกันทั้งหน้า /admin/slots (ดูผังอย่างเดียว) และ /admin/booking-stall
// (จัดแผงให้คำขอจอง) เพื่อไม่ให้สอง tooltip เพี้ยนไปคนละแบบ — แยกไว้เป็น util เดี่ยว (ไม่ใช่ method ใน
// controller ไหน) กัน circular require เพราะ approvalController.js ก็ require marketController.js อยู่แล้ว
// (marketController.js เอง require ตัวนี้ไปใช้ใน getSlotsPage() ด้วย ถ้าใส่ไว้ในตัวใดตัวหนึ่งจะ require วนกัน)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCT_TYPE_LABEL = {
    FASHION: 'แฟชั่น',
    FOOD: 'อาหาร',
    EVENT_BOOTH: 'บูธกิจกรรม'
};

const BOOKING_STATUS_LABEL = { IN_PROGRESS: 'รอชำระเงิน', SUCCESS: 'ชำระเงินแล้ว', APPROVED: 'อนุมัติแล้ว' };

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

// ต้อง require lazy (ไม่ใส่ไว้บนสุดของไฟล์) เพราะ getBookingRoundMetaForDate มาจาก utils/bookingRound.js
// ซึ่งไม่ได้ require กลับมาที่ไฟล์นี้ ไม่มีปัญหา circular แต่ใส่ตรงนี้เพื่อให้เห็นชัดว่าใช้แค่ฟังก์ชันเดียว
const { getBookingRoundMetaForDate } = require('./bookingRound');
const eventBooth = require('./eventBooth');
const { shopsRelation, primaryShop } = require('./shops');

// เติม stall.occupant ให้ทุกล็อกที่ "จองแล้ว" (ไม่ใช่ AVAILABLE/PLACEHOLDER) ในทุกโซนของ zonesData ที่ส่งเข้ามา
// (แก้ไข object ตรงๆ ในตัว ไม่ return ค่าใหม่ — เรียกแล้วใช้ zonesData ตัวเดิมต่อได้เลย)
// หาผ่าน Slot.slotNumber(=stallCode) -> Booking ล่าสุด -> User -> ShopDetail (ยังไม่มี ShopDetail ถ้ายังไม่จ่ายเงิน
// จึง fallback ไปดูใบสมัคร SellerApplication ล่าสุดแทน)
// options.bookingIdByCode: { A101: bookingId } — ใช้ Booking ตัวที่ครอบ "วันที่กำลังดู" บนผัง (ดู utils/stallDayStatus.js)
// แทน Booking ล่าสุด ไม่ส่งมา = ใช้ Booking ล่าสุดของล็อกเหมือนเดิม
async function attachOccupantDetails(zonesData, options = {}) {
    const bookingIdByCode = options.bookingIdByCode || null;
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

    if (!bookedStalls.length) return {};

    const occupantInfoByCode = {};

    const occupiedSlots = await prisma.slot.findMany({
        where: { slotNumber: { in: bookedStalls } },
        select: {
            slotNumber: true,
            bookings: {
                where: { status: { in: ['IN_PROGRESS', 'SUCCESS', 'APPROVED'] } },
                orderBy: { id: 'desc' },
                ...(bookingIdByCode ? {} : { take: 1 }),
                select: {
                    id: true,
                    userId: true,
                    status: true,
                    rentalStartDate: true,
                    rentalEndDate: true,
                    dailyStallPrice: true,
                    storeDetailSnapshot: true,
                    user: {
                        select: {
                            name: true,
                            phoneNumber: true,
                            shops: shopsRelation({ select: { shopName: true, productType: true, productSubtype: true, productImage: true, shopCoverImage: true } })
                        }
                    }
                }
            }
        }
    });

    const missingUserIds = [];
    occupiedSlots.forEach((slot) => {
        const wantedId = bookingIdByCode ? bookingIdByCode[slot.slotNumber] : null;
        const occupantBooking = (wantedId && slot.bookings.find((b) => b.id === wantedId)) || slot.bookings[0];
        if (!occupantBooking) return;
        const shop = primaryShop(occupantBooking.user) || null;
        const requestIdMatch = String(occupantBooking.storeDetailSnapshot || '').match(/^\[BOOKING_REQUEST_ID:(\d+)\]/);
        const info = {
            userId: occupantBooking.userId,
            bookingId: occupantBooking.id,
            bookingStatus: occupantBooking.status,
            shopName: shop?.shopName || null,
            productType: shop?.productType || null,
            productSubtype: shop?.productSubtype || null,
            productImage: shop?.productImage || shop?.shopCoverImage || null,
            renterName: occupantBooking.user?.name || null,
            phone: occupantBooking.user?.phoneNumber || null,
            rentalStartDate: occupantBooking.rentalStartDate,
            rentalEndDate: occupantBooking.rentalEndDate,
            dailyStallPrice: occupantBooking.dailyStallPrice,
            requestId: requestIdMatch ? Number.parseInt(requestIdMatch[1], 10) : null
        };
        occupantInfoByCode[slot.slotNumber] = info;
        if (!info.productSubtype) {
            missingUserIds.push({ code: slot.slotNumber, userId: occupantBooking.userId });
        }
    });

    // ร้านที่จองแล้วแต่ยังไม่มี ShopDetail (ยังไม่จ่ายเงิน) — ย้อนไปดูใบสมัครล่าสุดแทน
    await Promise.all(missingUserIds.map(async ({ code, userId }) => {
        const latestApplication = await prisma.sellerApplication.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { shopName: true, productType: true, productSubtype: true, shopCoverImage: true }
        });
        if (!latestApplication) return;
        occupantInfoByCode[code].shopName = occupantInfoByCode[code].shopName || latestApplication.shopName;
        occupantInfoByCode[code].productType = occupantInfoByCode[code].productType || latestApplication.productType;
        occupantInfoByCode[code].productSubtype = occupantInfoByCode[code].productSubtype || latestApplication.productSubtype;
        occupantInfoByCode[code].productImage = occupantInfoByCode[code].productImage || latestApplication.shopCoverImage;
    }));

    // "ลูกค้าใหม่" (ไม่เคยมีคำขอมาก่อนเลย) กับ "จำนวนล็อกที่ร้านนี้ถือรวม" — เช็คจาก Booking ทุกแถวของ userId นี้
    // (ทุกโซน) นับ requestId ที่ต่างกัน (parse จาก storeDetailSnapshot tag [BOOKING_REQUEST_ID:n]) เป็นตัวแทน
    // "จำนวนครั้งที่เคยส่งคำขอ" — ถ้ามีแค่ครั้งเดียว (ครั้งนี้ครั้งเดียว) ถือว่าลูกค้าใหม่
    const occupantUserIds = Array.from(new Set(Object.values(occupantInfoByCode).map((info) => info.userId).filter(Boolean)));
    const requestIdsByUserId = new Map();
    const activeStallCountByUserId = new Map();
    if (occupantUserIds.length) {
        const allBookingsForOccupants = await prisma.booking.findMany({
            where: { userId: { in: occupantUserIds } },
            select: { userId: true, status: true, storeDetailSnapshot: true }
        });
        allBookingsForOccupants.forEach((b) => {
            const requestIdMatch = String(b.storeDetailSnapshot || '').match(/^\[BOOKING_REQUEST_ID:(\d+)\]/);
            if (requestIdMatch) {
                const set = requestIdsByUserId.get(b.userId) || new Set();
                set.add(requestIdMatch[1]);
                requestIdsByUserId.set(b.userId, set);
            }
            if (['IN_PROGRESS', 'SUCCESS', 'APPROVED'].includes(String(b.status || '').toUpperCase())) {
                activeStallCountByUserId.set(b.userId, (activeStallCountByUserId.get(b.userId) || 0) + 1);
            }
        });
    }

    const now = new Date();

    // เตรียมข้อความไทยให้พร้อมโชว์ (วันที่/ประเภทสินค้า/สถานะจ่ายเงิน) ฝั่ง frontend จะได้ไม่ต้อง format เอง
    Object.values(occupantInfoByCode).forEach((info) => {
        info.productTypeText = PRODUCT_TYPE_LABEL[info.productType] || info.productType || null;
        info.rentalPeriodText = info.rentalStartDate && info.rentalEndDate
            ? `${toThaiDate(info.rentalStartDate)} - ${toThaiDate(info.rentalEndDate)}`
            : null;
        info.paymentStatusText = BOOKING_STATUS_LABEL[info.bookingStatus] || info.bookingStatus || null;
        info.isUnpaid = info.bookingStatus !== 'SUCCESS';
        info.daysUntilExpiry = info.rentalEndDate
            ? Math.ceil((new Date(info.rentalEndDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            : null;
        info.stallCountForShop = activeStallCountByUserId.get(info.userId) || 1;
        // ถ้าหา requestId จาก tag ไม่เจอเลยสักแถว ถือว่าข้อมูลไม่พอ ไม่ฟันธงว่าใหม่ กันขึ้นป้ายผิด
        const requestIds = requestIdsByUserId.get(info.userId);
        info.isNewCustomer = !!requestIds && requestIds.size <= 1;
        // สีพื้นของล็อกบนผัง: ม่วง = รอจ่าย/รอยืนยันสลิป, เขียว = ยืนยันสลิปแล้ว (ลูกค้าใหม่แสดงเป็นจุดที่มุมล็อกแยกต่างหาก)
        // APPROVED ยังไม่ผ่านการยืนยันสลิป จึงนับเป็นรอจ่ายด้วย
        info.statusBadge = info.bookingStatus === 'SUCCESS' ? 'paid' : 'unpaid';
        // ลิงก์ไปหน้าอนุมัติ — เปิดไปที่ "รอบ" ของคำขอนี้เลย (หน้า /admin/approvals รองรับ query ?round=N อยู่แล้ว)
        // ไม่ได้ auto-scroll ไปเจาะจงคำขอ (หน้านั้นยังไม่รองรับ) แค่พาไปถูกรอบ แอดมินหาชื่อร้านต่อเอง
        info.approvalsUrl = info.rentalStartDate
            ? `/admin/approvals?round=${getBookingRoundMetaForDate(info.rentalStartDate).roundNumber}`
            : '/admin/approvals';
    });

    await attachEventBoothOccupants(zonesData, occupantInfoByCode, options.eventRequestIdByCode || null);

    zonesData.forEach((zone) => {
        zone.columns.forEach((column) => {
            column.stalls.forEach((stall) => {
                if (occupantInfoByCode[stall.code]) stall.occupant = occupantInfoByCode[stall.code];
            });
        });
    });

    return occupantInfoByCode;
}

// บูธกิจกรรม (โซน G) ไม่มี Slot/Booking — ผู้ใช้บูธมาจาก EventBoothRequest (ใช้ใบที่ครอบวันที่กำลังดูถ้าส่ง id มา
// ไม่งั้นใช้ใบที่ครอบวันนี้) แล้วแปลงเป็นรูปแบบ occupant เดียวกับล็อกปกติ ให้การ์ดล็อกฝั่งแอดมินแสดงได้เลย
async function attachEventBoothOccupants(zonesData, occupantInfoByCode, eventRequestIdByCode) {
    const codes = [];
    zonesData.forEach((zone) => zone.columns.forEach((column) => column.stalls.forEach((stall) => {
        if (stall.isEventBooth && stall.status === 'BOOKED') codes.push(stall.code);
    })));
    if (!codes.length) return;

    let requestByCode = {};
    if (eventRequestIdByCode) {
        const ids = codes.map((code) => eventRequestIdByCode[code]).filter(Boolean);
        const rows = ids.length ? await prisma.eventBoothRequest.findMany({ where: { id: { in: ids } } }) : [];
        rows.forEach((row) => { requestByCode[String(row.assignedStallCode).toUpperCase()] = row; });
    } else {
        const today = await eventBooth.getEventBoothStatusForDate(new Date());
        Object.entries(today).forEach(([code, entry]) => { requestByCode[code] = entry.request; });
    }

    codes.forEach((code) => {
        const request = requestByCode[code];
        if (!request) return;
        const paid = request.status === 'SUCCESS';
        occupantInfoByCode[code] = {
            userId: request.userId || null,
            eventRequestId: request.id,
            isEventBooth: true,
            bookingStatus: request.status,
            shopName: request.eventTitle,
            productType: 'EVENT_BOOTH',
            productTypeText: 'บูธกิจกรรม',
            productSubtype: request.companyName,
            productImage: null,
            renterName: `${request.contactName} (${request.companyName})`,
            phone: request.phone,
            rentalStartDate: request.startDate,
            rentalEndDate: request.endDate,
            rentalPeriodText: `${toThaiDate(request.startDate)} - ${toThaiDate(request.endDate)}`,
            dailyStallPrice: request.pricePerDay,
            paymentStatusText: eventBooth.STATUS_LABEL[request.status] || request.status,
            isUnpaid: !paid,
            daysUntilExpiry: Math.ceil((new Date(request.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
            stallCountForShop: 1,
            isNewCustomer: false,
            statusBadge: paid ? 'paid' : 'unpaid',
            approvalsUrl: `/admin/event-booths?focus=${request.id}`,
            requestId: null
        };
    });
}

module.exports = { attachOccupantDetails, PRODUCT_TYPE_LABEL };
