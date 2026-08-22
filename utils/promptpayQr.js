const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

// เบอร์พร้อมเพย์รับเงินของตลาด (ชั่วคราวใช้เบอร์นี้ไปก่อน)
const PROMPTPAY_ID = '0935024898';

async function buildPromptPayQrDataUrl(amount) {
    const numericAmount = Number(amount);
    const payload = generatePayload(PROMPTPAY_ID, Number.isFinite(numericAmount) && numericAmount > 0 ? { amount: numericAmount } : undefined);
    return QRCode.toDataURL(payload, { margin: 1, width: 240 });
}

module.exports = { buildPromptPayQrDataUrl, PROMPTPAY_ID };
