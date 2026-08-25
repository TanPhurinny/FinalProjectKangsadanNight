// แปลงจำนวนเงิน (บาท) เป็นคำอ่านภาษาไทยแบบที่ใช้พิมพ์บนใบเสร็จ/ใบกำกับภาษี
// เช่น 4102 -> "สี่พันหนึ่งร้อยสองบาทถ้วน", 1250.50 -> "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"
const DIGIT_WORDS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE_WORDS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function readGroup(numStr) {
    let result = '';
    const len = numStr.length;

    for (let i = 0; i < len; i += 1) {
        const digit = Number(numStr[i]);
        const place = len - i - 1; // 0=หน่วย, 1=สิบ, 2=ร้อย, ...
        if (digit === 0) continue;

        if (place === 0 && digit === 1 && len > 1) {
            result += 'เอ็ด';
        } else if (place === 1 && digit === 1) {
            result += 'สิบ';
        } else if (place === 1 && digit === 2) {
            result += 'ยี่สิบ';
        } else {
            result += DIGIT_WORDS[digit] + (PLACE_WORDS[place] || '');
        }
    }

    return result;
}

function readInteger(value) {
    let numStr = String(Math.trunc(value));
    if (numStr === '0') return 'ศูนย์';

    const groups = [];
    while (numStr.length > 0) {
        groups.unshift(numStr.slice(-6));
        numStr = numStr.slice(0, -6);
    }

    return groups
        .map((group, index) => {
            const remainingGroups = groups.length - index - 1;
            const text = readGroup(String(Number(group)));
            return text ? text + 'ล้าน'.repeat(remainingGroups) : '';
        })
        .join('');
}

function bahtText(amount) {
    const value = Math.max(0, Number(amount) || 0);
    const baht = Math.trunc(value);
    const satang = Math.round((value - baht) * 100);

    const bahtWords = readInteger(baht) + 'บาท';
    if (satang === 0) return bahtWords + 'ถ้วน';
    return bahtWords + readGroup(String(satang)) + 'สตางค์';
}

module.exports = { bahtText };
