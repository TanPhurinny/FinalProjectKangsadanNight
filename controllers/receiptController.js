const prisma = require('../config/prismaClient');
const { buildBookingRequestTag } = require('../utils/bookingRequestTag');
const { bahtText } = require('../utils/bahtText');

const VAT_RATE = 0.07;

const COMPANY_INFO = {
    nameTh: 'บริษัท กังสดาลไนท์ จำกัด (สำนักงานใหญ่)',
    nameEn: 'KANGSADAN NIGHT CO.,LTD.',
    address: '157/100 ถ.กัลปพฤษ์ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000',
    taxId: '152346',
    phone: '080-35338357',
    logo: '/img/favicon.png'
};

function formatDateThai(dateValue) {
    if (!dateValue) return '-';
    try {
        // ใช้ปี ค.ศ. (calendar: 'gregory') ให้ตรงกับตัวอย่างใบเสร็จที่ผู้ใช้ให้มา (23 มีนาคม 2026)
        // ไม่ใช่ปี พ.ศ. ที่ toLocaleDateString('th-TH') คืนให้เป็นค่าเริ่มต้น
        return new Date(dateValue).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', calendar: 'gregory' });
    } catch (_) {
        return '-';
    }
}

function formatTimeThai(dateValue) {
    if (!dateValue) return '-';
    try {
        return new Date(dateValue).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        return '-';
    }
}

function buildReceiptNumber(requestId, issuedAt) {
    const date = issuedAt ? new Date(issuedAt) : new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `R${yyyy}${mm}/${String(requestId).padStart(5, '0')}`;
}

// คืนข้อมูลใบเสร็จของ BookingRequest หนึ่งใบ หรือ null ถ้ายังไม่ผ่านการยืนยันชำระเงิน (SUCCESS)
// ใช้ร่วมกันทั้งฝั่งแอดมิน (controllers/receiptController.js -> routes/adminRoutes.js) และฝั่งผู้ขาย (routes/sellerRoute.js)
async function buildReceiptData(requestId, printedByName) {
    const parsedId = Number.parseInt(requestId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return null;

    const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id: parsedId } });
    if (!bookingRequest || String(bookingRequest.status || '').toUpperCase() !== 'SUCCESS') return null;

    const tag = buildBookingRequestTag(parsedId);
    const bookings = tag
        ? await prisma.booking.findMany({ where: { storeDetailSnapshot: { startsWith: tag } }, orderBy: { id: 'asc' } })
        : [];
    if (!bookings.length) return null;

    const first = bookings[0];
    const stallCount = bookings.length;
    const rentalDays = first.rentalDays || 1;
    const dailyStallPrice = first.dailyStallPrice || 0;
    const lightUnitPrice = first.lightUnitPrice || 0;
    const smallAppliancePrice = first.smallAppliancePrice || 0;
    const largeAppliancePrice = first.largeAppliancePrice || 0;

    const sum = (field) => bookings.reduce((total, b) => total + Number(b[field] || 0), 0);
    const rentTotal = sum('rentTotal');
    const lightTotal = sum('lightTotal');
    const applianceTotal = sum('applianceTotal');
    const grandTotal = sum('grandTotal');
    const smallApplianceCount = sum('smallApplianceCount');
    const largeApplianceCount = sum('largeApplianceCount');

    const items = [];
    if (rentTotal > 0) {
        items.push({
            name: 'ค่าเช่าแผง', qty: stallCount, unit: 'แผง', days: rentalDays,
            unitPrice: dailyStallPrice, discount: 0, total: rentTotal
        });
    }
    if (lightTotal > 0) {
        items.push({
            name: 'ค่าไฟฟ้า', qty: stallCount, unit: 'จุด', days: rentalDays,
            unitPrice: lightUnitPrice, discount: 0, total: lightTotal
        });
    }
    if (smallApplianceCount > 0) {
        items.push({
            name: 'ค่าเครื่องใช้ไฟฟ้า (เล็ก)', qty: smallApplianceCount, unit: 'เครื่อง', days: rentalDays,
            unitPrice: smallAppliancePrice, discount: 0, total: smallApplianceCount * smallAppliancePrice * rentalDays
        });
    }
    if (largeApplianceCount > 0) {
        items.push({
            name: 'ค่าเครื่องใช้ไฟฟ้า (ใหญ่)', qty: largeApplianceCount, unit: 'เครื่อง', days: rentalDays,
            unitPrice: largeAppliancePrice, discount: 0, total: largeApplianceCount * largeAppliancePrice * rentalDays
        });
    }

    const discount = 0;
    const totalBeforeDiscount = grandTotal;
    const amountAfterDiscount = totalBeforeDiscount - discount;
    const amountBeforeVat = amountAfterDiscount / (1 + VAT_RATE);
    const vatAmount = amountAfterDiscount - amountBeforeVat;
    const netTotal = amountAfterDiscount;

    const customer = await prisma.user.findUnique({ where: { id: first.userId } });
    const latestApplication = await prisma.sellerApplication.findFirst({
        where: { userId: first.userId },
        orderBy: { createdAt: 'desc' }
    });
    const addressParts = latestApplication
        ? [latestApplication.houseNumber, latestApplication.subdistrict, latestApplication.district, latestApplication.province].filter(Boolean)
        : [];

    return {
        company: COMPANY_INFO,
        receiptNumber: buildReceiptNumber(parsedId, bookingRequest.paymentConfirmedAt),
        issuedDateLabel: formatDateThai(bookingRequest.paymentConfirmedAt),
        issuedTimeLabel: formatTimeThai(bookingRequest.paymentConfirmedAt),
        // "พนักงานและผู้พิมพ์" ต้องเป็นชื่อแอดมินที่ยืนยันสลิปจริง (บันทึกไว้ตอน confirmPayment)
        // ไม่ใช่ผู้ใช้ที่บังเอิญล็อกอินอยู่ตอนเปิดดู/พิมพ์ — printedByName ที่รับเข้ามาใช้เป็น fallback
        // สำหรับ BookingRequest เก่าที่ยืนยันไปก่อนจะมีคอลัมน์นี้ (confirmedByName เป็น null)
        printedByName: bookingRequest.confirmedByName || printedByName || '-',
        customerName: customer?.name || first.storeDetailSnapshot || '-',
        customerAddress: addressParts.join(' ') || '-',
        items,
        totalBeforeDiscount,
        discount,
        amountBeforeVat,
        vatAmount,
        vatRate: VAT_RATE,
        netTotal,
        netTotalText: bahtText(netTotal),
        requestId: parsedId,
        ownerUserId: first.userId
    };
}

module.exports = { buildReceiptData };
