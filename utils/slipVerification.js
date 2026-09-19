const { readImageBuffer } = require('./imageStorage');
const path = require('path');

// ตรวจสลิปโอนเงินอัตโนมัติผ่าน SlipOK (https://slipok.com) — อ่าน QR บนสลิปแล้วเช็คกับธนาคารจริง
// ต้องสมัครเอาเอง (สร้างบัญชีแทนไม่ได้) แล้วตั้ง SLIPOK_BRANCH_ID / SLIPOK_API_KEY ใน .env
// ถ้ายังไม่ตั้งค่า ฟังก์ชันนี้จะ return null เฉยๆ — /admin/approvals ยังทำงานแบบให้แอดมินตรวจเองได้ตามปกติ
// หมายเหตุ: endpoint/response shape อ้างอิงจากเอกสาร SlipOK ตอนเขียนโค้ดนี้ (ไม่เคยยิงจริงเพราะไม่มี API key)
// แนะนำให้ทดสอบยิงจริงอีกครั้งหลังใส่ key แล้ว เผื่อ SlipOK เปลี่ยน endpoint/response format ภายหลัง
const SLIPOK_ENDPOINT = 'https://api.slipok.com/api/line/apikey';

function isConfigured() {
    return Boolean(String(process.env.SLIPOK_BRANCH_ID || '').trim() && String(process.env.SLIPOK_API_KEY || '').trim());
}

// verifySlip(slipImagePath, expectedAmount)
// คืนค่า:
//   null                                 -> ยังไม่ตั้งค่า SlipOK ไว้ (ให้แอดมินตรวจเอง ไม่บล็อกอะไร)
//   { ok: true,  amount, raw }           -> ตรวจผ่าน ยอดตรง
//   { ok: false, reason, amount?, raw? } -> ตรวจไม่ผ่าน หรือยอดไม่ตรง (บล็อกการยืนยันอัตโนมัติ)
async function verifySlip(slipImagePath, expectedAmount) {
    if (!isConfigured()) {
        console.warn('SLIPOK_BRANCH_ID / SLIPOK_API_KEY ยังไม่ได้ตั้งค่า ข้ามการตรวจสลิปอัตโนมัติ');
        return null;
    }

    const branchId = String(process.env.SLIPOK_BRANCH_ID).trim();
    const apiKey = String(process.env.SLIPOK_API_KEY).trim();
    // ค่าที่เก็บใน DB เป็น URL เต็มของ Cloudinary หรือ path แบบ '/uploads/payment-slips/xxx.jpg' (ไฟล์ในเครื่อง)
    let fileBuffer = null;
    try {
        fileBuffer = await readImageBuffer(slipImagePath);
    } catch (error) {
        console.error('อ่านไฟล์สลิปไม่สำเร็จ:', error.message);
    }

    if (!fileBuffer) {
        return { ok: false, reason: 'ไม่พบไฟล์สลิปในระบบ' };
    }

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
        return { ok: false, reason: 'เรียก API ตรวจสลิปไม่สำเร็จ (เครือข่ายขัดข้องหรือ SlipOK ล่ม)' };
    }
}

module.exports = { verifySlip, isConfigured };
