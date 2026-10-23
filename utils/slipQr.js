const jsQR = require('jsqr');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

// ตรวจในเครื่องว่าสลิปมี QR ตรวจสลิปของธนาคาร (mini QR ที่แอปธนาคารพิมพ์ไว้บนสลิป) หรือไม่ — ไม่ต้องยิง SlipOK
// สลิปที่ไม่มี QR เช่น TrueMoney Wallet, ใบเสร็จ 7-Eleven/Counter Service, ใบรับเงินของบริษัท
// SlipOK ตรวจไม่ได้อยู่แล้ว เลยส่งให้แอดมินตรวจเองแทน ไม่ต้องเปลืองโควตา API
// คืนค่า:
//   'payment'     -> เจอ QR ตรวจสลิปของธนาคาร (ส่งต่อให้ SlipOK)
//   'not_payment' -> เจอ QR แต่ไม่ใช่ QR ตรวจสลิป (เช่น QR โฆษณา/ลิงก์)
//   'none'        -> ไม่เจอ QR เลย
//   'unknown'     -> อ่านรูปไม่ได้ (webp/gif/ไฟล์เสีย) — ปล่อยให้ SlipOK ตัดสินเอง

// payload ของ QR ตรวจสลิป (มาตรฐานสมาคมธนาคารไทย) ขึ้นต้นด้วยแท็ก 00 ที่มี API ID 000001 และมีรหัสประเทศ 5102TH
// เช่น 0041000600000101030040220...5102TH9104XXXX
function isSlipPayload(text) {
    const value = String(text || '').trim();
    return /^00\d{2}0006000001/.test(value) || /5102TH91\d{2}[0-9A-F]{4}$/i.test(value);
}

function decodeImage(buffer) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        // จำกัดหน่วยความจำไว้กันรูปใหญ่ผิดปกติ (สลิปจริงไม่เกินไม่กี่ล้านพิกเซล)
        return jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        return PNG.sync.read(buffer);
    }
    return null;
}

// ย่อรูปลงครึ่งหนึ่ง (เฉลี่ย 2x2 พิกเซล) — รูปถ่ายจากกล้องที่ใหญ่มาก jsQR มักอ่านติดง่ายขึ้นเมื่อย่อ
function halve({ data, width, height }) {
    const w = Math.floor(width / 2);
    const h = Math.floor(height / 2);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            for (let c = 0; c < 4; c++) {
                const i = ((y * 2) * width + x * 2) * 4 + c;
                out[(y * w + x) * 4 + c] = (data[i] + data[i + 4] + data[i + width * 4] + data[i + width * 4 + 4]) >> 2;
            }
        }
    }
    return { data: out, width: w, height: h };
}

function detectSlipQr(buffer) {
    let image = null;
    try {
        image = buffer && buffer.length ? decodeImage(buffer) : null;
    } catch (error) {
        console.warn('อ่านรูปสลิปเพื่อหา QR ไม่สำเร็จ:', error.message);
    }
    if (!image || !image.width || !image.height) return 'unknown';

    let current = { data: new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.length), width: image.width, height: image.height };
    let foundOther = false;
    // ลองขนาดจริงก่อน แล้วค่อยย่อทีละครึ่งจนด้านยาวเหลือราว 600px
    for (let attempt = 0; attempt < 4; attempt++) {
        const code = jsQR(current.data, current.width, current.height);
        if (code && code.data) {
            if (isSlipPayload(code.data)) return 'payment';
            foundOther = true;
        }
        if (Math.max(current.width, current.height) < 1200) break;
        current = halve(current);
    }
    return foundOther ? 'not_payment' : 'none';
}

module.exports = { detectSlipQr, isSlipPayload };
