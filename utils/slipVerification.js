const { readImageBuffer } = require('./imageStorage');
const { detectSlipQr } = require('./slipQr');
const path = require('path');

// ตรวจสลิปโอนเงินอัตโนมัติผ่าน SlipOK (https://slipok.com) — อ่าน QR บนสลิปแล้วเช็คกับธนาคารจริง
// ต้องสมัครเอาเอง (สร้างบัญชีแทนไม่ได้) แล้วตั้ง SLIPOK_BRANCH_ID / SLIPOK_API_KEY ใน .env
// ถ้ายังไม่ตั้งค่า ฟังก์ชันนี้จะ return null เฉยๆ — /admin/approvals ยังทำงานแบบให้แอดมินตรวจเองได้ตามปกติ
// หมายเหตุ: endpoint/response shape อ้างอิงจากเอกสาร SlipOK ตอนเขียนโค้ดนี้ (ไม่เคยยิงจริงเพราะไม่มี API key)
// แนะนำให้ทดสอบยิงจริงอีกครั้งหลังใส่ key แล้ว เผื่อ SlipOK เปลี่ยน endpoint/response format ภายหลัง
const SLIPOK_ENDPOINT = 'https://api.slipok.com/api/line/apikey';

// ผลตรวจที่ "ตรวจอัตโนมัติไม่ได้ ให้แอดมินตรวจเอง" เก็บเป็น slipVerified = null + reason ขึ้นต้นด้วย prefix นี้
// (ไม่ใช่ false เพราะไม่ได้แปลว่าสลิปปลอม แค่ระบบอ่านไม่ได้) — หน้าแอดมิน/ผู้ขายเช็ค prefix นี้เพื่อโชว์ป้าย "ตรวจเอง"
const MANUAL_REVIEW_PREFIX = '[ตรวจเอง]';
const NO_QR_REASON = `${MANUAL_REVIEW_PREFIX} สลิปนี้ไม่มี QR code ตรวจสลิป (เช่น TrueMoney Wallet, 7-Eleven/Counter Service, ใบเสร็จบริษัท) ระบบตรวจอัตโนมัติไม่ได้ แอดมินจะตรวจเอง`;
const NOT_SLIP_QR_REASON = `${MANUAL_REVIEW_PREFIX} QR บนรูปนี้ไม่ใช่ QR ตรวจสลิปของธนาคาร ระบบตรวจอัตโนมัติไม่ได้ แอดมินจะตรวจเอง`;

// รหัส error ของ SlipOK ที่เป็นปัญหาฝั่งระบบ/ธนาคาร ไม่ใช่ความผิดของสลิป -> ให้แอดมินตรวจเอง (ไม่ฟ้องว่าสลิปมีปัญหา)
// 1000-1004 = ข้อมูล/สิทธิ์/แพ็กเกจหมดอายุ/โควตาหมด, 1009 = ธนาคารขัดข้อง, 1010 = ธนาคารดีเลย์ ลองใหม่ภายหลัง
const SLIPOK_SERVICE_CODES = new Set([1000, 1001, 1002, 1003, 1004, 1009, 1010]);
// 1006 = รูปไม่ถูกต้อง, 1007 = ไม่มี QR, 1008 = QR ไม่ใช่ QR ตรวจสลิป
const SLIPOK_NO_QR_CODES = new Set([1006, 1007, 1008]);

function manualResult(kind, reason) {
    return { ok: null, manual: kind, reason };
}

function isManualReviewReason(reason) {
    return String(reason || '').startsWith(MANUAL_REVIEW_PREFIX);
}

function isConfigured() {
    return Boolean(String(process.env.SLIPOK_BRANCH_ID || '').trim() && String(process.env.SLIPOK_API_KEY || '').trim());
}

// verifySlip(slipImagePath, expectedAmount)
// คืนค่า:
//   null                                 -> ยังไม่ตั้งค่า SlipOK และสลิปมี QR (ให้แอดมินตรวจเอง ไม่บล็อกอะไร)
//   { ok: true,  amount, raw }           -> ตรวจผ่าน ยอดตรง
//   { ok: false, reason, amount?, raw? } -> ตรวจไม่ผ่าน หรือยอดไม่ตรง (บล็อกการยืนยันอัตโนมัติ)
//   { ok: null,  manual, reason }        -> ตรวจอัตโนมัติไม่ได้ ให้แอดมินตรวจเอง (ไม่บล็อก)
//        manual = 'no_qr'   สลิปไม่มี QR ตรวจสลิป (TrueMoney, 7-Eleven, ใบเสร็จบริษัท ฯลฯ)
//                 'service' SlipOK ใช้ไม่ได้ชั่วคราว (แพ็กเกจหมดอายุ/โควตาหมด/ธนาคารขัดข้อง/เครือข่าย)
async function verifySlip(slipImagePath, expectedAmount) {
    // ค่าที่เก็บใน DB เป็น URL เต็มของ Cloudinary หรือ path แบบ '/uploads/payment-slips/xxx.jpg' (ไฟล์ในเครื่อง)
    let fileBuffer = null;
    try {
        fileBuffer = await readImageBuffer(slipImagePath);
    } catch (error) {
        console.error('อ่านไฟล์สลิปไม่สำเร็จ:', error.message);
    }

    if (!fileBuffer) {
        return isConfigured() ? { ok: false, reason: 'ไม่พบไฟล์สลิปในระบบ' } : null;
    }

    // เช็ค QR ในเครื่องก่อน — สลิปที่ไม่มี QR ตรวจสลิปไม่ต้องส่ง SlipOK (ตรวจไม่ได้อยู่แล้ว เปลืองโควตาเปล่าๆ)
    // ถ้าอ่านรูปไม่ได้ ('unknown' เช่นไฟล์ webp) ปล่อยให้ SlipOK ตัดสินเอง
    const qrKind = detectSlipQr(fileBuffer);
    if (qrKind === 'none') return manualResult('no_qr', NO_QR_REASON);
    if (qrKind === 'not_payment') return manualResult('no_qr', NOT_SLIP_QR_REASON);

    if (!isConfigured()) {
        console.warn('SLIPOK_BRANCH_ID / SLIPOK_API_KEY ยังไม่ได้ตั้งค่า ข้ามการตรวจสลิปอัตโนมัติ');
        return null;
    }

    const branchId = String(process.env.SLIPOK_BRANCH_ID).trim();
    const apiKey = String(process.env.SLIPOK_API_KEY).trim();

    try {
        const form = new FormData();
        form.append('files', new Blob([fileBuffer]), path.basename(String(slipImagePath).split('?')[0]));

        const response = await fetch(`${SLIPOK_ENDPOINT}/${branchId}`, {
            method: 'POST',
            headers: { 'x-authorization': apiKey },
            body: form
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || result.success === false) {
            const code = Number(result?.code);
            if (SLIPOK_NO_QR_CODES.has(code)) {
                return manualResult('no_qr', NO_QR_REASON);
            }
            if (SLIPOK_SERVICE_CODES.has(code) || response.status >= 500 || !result) {
                console.warn('SlipOK ตรวจสลิปไม่ได้ชั่วคราว:', code || response.status, result?.message || '');
                return manualResult('service', `${MANUAL_REVIEW_PREFIX} ระบบตรวจสลิปอัตโนมัติใช้งานไม่ได้ชั่วคราว (${result?.message || `HTTP ${response.status}`}) แอดมินจะตรวจเอง`);
            }
            return { ok: false, reason: result?.message || 'ตรวจสอบสลิปไม่ผ่าน (SlipOK ปฏิเสธหรือสลิปไม่ถูกต้อง)', raw: result };
        }

        const slipAmount = Number(result?.data?.amount);
        const target = Number(expectedAmount);
        const amountMatches = Number.isFinite(slipAmount) && Number.isFinite(target) && Math.abs(slipAmount - target) < 1;

        if (!amountMatches) {
            return { ok: false, reason: `ยอดในสลิป (${slipAmount || '-'}) ไม่ตรงกับยอดที่ต้องชำระ (${target})`, amount: slipAmount, raw: result };
        }

        return { ok: true, amount: slipAmount, raw: result };
    } catch (err) {
        console.error('เรียก SlipOK ล้มเหลว:', err.message);
        return manualResult('service', `${MANUAL_REVIEW_PREFIX} เรียกระบบตรวจสลิปอัตโนมัติไม่สำเร็จ (เครือข่ายขัดข้องหรือ SlipOK ล่ม) แอดมินจะตรวจเอง`);
    }
}

module.exports = { verifySlip, isConfigured, isManualReviewReason, MANUAL_REVIEW_PREFIX };
