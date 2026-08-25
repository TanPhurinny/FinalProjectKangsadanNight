// Tag ที่ฝังไว้ใน Booking.storeDetailSnapshot เพื่อผูก Booking กลับไปหา BookingRequest
// ที่มันเกิดมาจาก (ไม่มี FK ตรง เพราะ 1 BookingRequest สร้าง Booking ได้หลายแถว — 1 แถวต่อ 1 ล็อกที่ขอ)
// ใช้ร่วมกันระหว่าง routes/sellerRoute.js, controllers/approvalController.js, controllers/receiptController.js
const BOOKING_REQUEST_TAG_PREFIX = '[BOOKING_REQUEST_ID:';

function buildBookingRequestTag(requestId) {
    const parsed = Number.parseInt(requestId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return '';
    return `${BOOKING_REQUEST_TAG_PREFIX}${parsed}]`;
}

function stripBookingRequestTag(snapshotText) {
    return String(snapshotText || '').replace(/^\[BOOKING_REQUEST_ID:\d+\]\s*/i, '').trim();
}

// ดึง requestId กลับออกมาจาก storeDetailSnapshot ของ Booking (ทิศตรงข้ามกับ buildBookingRequestTag)
function extractBookingRequestId(snapshotText) {
    const match = String(snapshotText || '').match(/^\[BOOKING_REQUEST_ID:(\d+)\]/i);
    return match ? Number.parseInt(match[1], 10) : null;
}

module.exports = { BOOKING_REQUEST_TAG_PREFIX, buildBookingRequestTag, stripBookingRequestTag, extractBookingRequestId };
