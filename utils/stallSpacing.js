// กติกาเว้นระยะล็อกสำหรับร้านที่ขายสินค้า "ชนิดเดียวกัน" (มี productSubtype ซ้ำกันอย่างน้อย 1 รายการ)
// อาหารเว้นห่างอย่างน้อย 5 ล็อก, แฟชั่นและอื่นๆ เว้นห่างอย่างน้อย 3 ล็อก — เป็นแค่คำแนะนำ ไม่บล็อกแอดมิน
// (ดุลยพินิจแอดมินเป็นหลัก ถ้านโยบายเปลี่ยนในอนาคตแก้แค่ค่าคงที่นี้พอ)
const { MIN_STALL_SPACING } = require('./productSubtypes');
const MIN_SPACING_BY_CATEGORY = MIN_STALL_SPACING;

// productSubtype เก็บหลายรายการคั่นจุลภาค เช่น "ส้มตำ,ลาบ/น้ำตก" — แยกเป็นรายการก่อนเทียบ
function splitSubtypes(value) {
    return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function getMinSpacing(productType) {
    return MIN_SPACING_BY_CATEGORY[String(productType || '').toUpperCase()] || 0;
}

// รวมล็อกทุกคอลัมน์ของโซนเป็น index ตำแหน่งภายใน "แถวเดียวกัน" (rowCode)
// เทียบระยะห่างเฉพาะล็อกที่อยู่แถวเดียวกันเท่านั้น เพราะแถวคนละแถวไม่ได้อยู่ติดกันจริงตามผัง
function buildRowIndex(zoneColumns) {
    const positionByCode = {};
    (zoneColumns || []).forEach((column) => {
        column.stalls.forEach((stall, i) => {
            positionByCode[stall.code] = { rowCode: column.rowCode, position: i };
        });
    });
    return positionByCode;
}

function distanceBetween(rowIndex, codeA, codeB) {
    const a = rowIndex[codeA];
    const b = rowIndex[codeB];
    if (!a || !b || a.rowCode !== b.rowCode) return null; // คนละแถว ไม่นับระยะ
    return Math.abs(a.position - b.position);
}

// หาล็อกที่ "ชนกติการะยะห่าง" กับ candidateCode — มีสินค้า subtype ซ้ำกันอย่างน้อย 1 รายการ และอยู่ใกล้กว่าเกณฑ์ขั้นต่ำ
// (เดิมเทียบทั้งข้อความ ร้านที่ติ๊กหลายรายการเลยแทบไม่เคยชนกัน เช่น "ส้มตำ" กับ "ส้มตำ,ลาบ/น้ำตก")
// occupantSubtypeByCode: { stallCode: productSubtype } ของล็อกที่จองแล้วทั้งหมด (ข้ามโซนไหนก็ได้ ฟังก์ชันกรองเองผ่าน rowIndex)
// คืน sharedSubtypes = รายการที่ซ้ำกันจริง ไว้บอกแอดมินว่าชนกันเพราะขายอะไร
function findConflicts({ zoneColumns, candidateCode, productSubtype, productType, occupantSubtypeByCode }) {
    const candidateSubtypes = new Set(splitSubtypes(productSubtype));
    if (!candidateSubtypes.size) return [];
    const minSpacing = getMinSpacing(productType);
    if (!minSpacing) return [];

    const rowIndex = buildRowIndex(zoneColumns);
    const conflicts = [];
    Object.entries(occupantSubtypeByCode || {}).forEach(([code, subtype]) => {
        if (code === candidateCode) return;
        const sharedSubtypes = splitSubtypes(subtype).filter((s) => candidateSubtypes.has(s));
        if (!sharedSubtypes.length) return;
        const distance = distanceBetween(rowIndex, candidateCode, code);
        if (distance !== null && distance < minSpacing) {
            conflicts.push({ code, distance, subtype, sharedSubtypes });
        }
    });
    return conflicts.sort((a, b) => a.distance - b.distance);
}

module.exports = { MIN_SPACING_BY_CATEGORY, getMinSpacing, findConflicts };
