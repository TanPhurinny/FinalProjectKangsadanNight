// ตรวจ/จัดรูปแบบข้อมูลผู้เสียภาษีที่ผู้ขายกรอกในฟอร์ม "ขอใบกำกับภาษี" (ฝั่ง server — ฝั่ง client ใน
// public/js/seller/taxInvoiceForm.js ใช้กติกาชุดเดียวกัน) ไม่เชื่อค่าจากฟอร์มตรงๆ เพราะแก้ HTML ข้ามได้

const HEAD_OFFICE = 'สำนักงานใหญ่';
const LIMITS = { nameMax: 120, addressMin: 10, addressMax: 300 };

function digitsOnly(text) {
    return String(text || '').replace(/\D/g, '');
}

// 0-0000-00000-00-0
function formatTaxId(digits) {
    const d = digitsOnly(digits).slice(0, 13);
    return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)].filter(Boolean).join('-');
}

// เลขท้าย (check digit) ของเลข 13 หลักแบบเดียวกับเลขบัตรประชาชน/เลขนิติบุคคล
function hasValidCheckDigit(digits) {
    const d = digitsOnly(digits);
    if (d.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(d[i]) * (13 - i);
    return ((11 - (sum % 11)) % 10) === Number(d[12]);
}

// เบอร์ไทย 9 หลัก (โทรศัพท์บ้าน/กรุงเทพ) หรือ 10 หลัก (มือถือ) ขึ้นต้นด้วย 0
function formatPhone(digits) {
    const d = digitsOnly(digits).slice(0, 10);
    if (d.length <= 2) return d;
    if (d.startsWith('02')) return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join('-');
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join('-');
}

function isValidPhone(digits) {
    return /^0\d{8,9}$/.test(digitsOnly(digits));
}

// สาขา: "สำนักงานใหญ่" หรือ "สาขาที่ 00012" (เลข 5 หลักตามที่กรมสรรพากรกำหนด)
function normalizeBranch(text) {
    const value = String(text || '').trim();
    if (!value) return HEAD_OFFICE;
    if (value === HEAD_OFFICE) return HEAD_OFFICE;
    const match = value.match(/^สาขา(?:ที่|เลขที่)?\s*(\d{1,5})$/);
    return match ? `สาขาที่ ${match[1].padStart(5, '0')}` : null;
}

// คืน { error } (รหัสสำหรับหน้า shop-profile) หรือ { value } ที่จัดรูปแบบแล้วพร้อมบันทึก
function validateNewTaxProfile(input) {
    const type = input.taxpayerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY';

    const name = String(input.taxpayerName || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > LIMITS.nameMax) return { error: 'invalid_taxpayer_name' };

    const taxIdDigits = digitsOnly(input.taxId);
    if (taxIdDigits.length !== 13) return { error: 'invalid_tax_id' };

    const address = String(input.address || '').replace(/[ \t]+/g, ' ').trim();
    if (address.length < LIMITS.addressMin || address.length > LIMITS.addressMax) return { error: 'invalid_address' };

    let phone = null;
    if (String(input.phoneNumber || '').trim()) {
        if (!isValidPhone(input.phoneNumber)) return { error: 'invalid_phone' };
        phone = formatPhone(input.phoneNumber);
    }

    let branch = null;
    if (type === 'COMPANY') {
        branch = normalizeBranch(input.branch);
        if (!branch) return { error: 'invalid_branch' };
    }

    return { value: { taxpayerType: type, taxpayerName: name, taxId: formatTaxId(taxIdDigits), branch, address, phoneNumber: phone } };
}

module.exports = {
    HEAD_OFFICE,
    LIMITS,
    digitsOnly,
    formatTaxId,
    hasValidCheckDigit,
    formatPhone,
    isValidPhone,
    normalizeBranch,
    validateNewTaxProfile
};
