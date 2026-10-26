// ลำดับเดินตรวจตลาดตามเส้นทางเดินจริง (B → G201 → F → G101 → C → A → E → D → X) — ใช้ทั้งหน้าตรวจตลาด (เรียงแถวในตาราง)
// และโหมดเดินตรวจบนผังตลาดของ staff (ปุ่ม "ร้านถัดไป") ให้สองหน้าเดินลำดับเดียวกัน
function buildRange(prefix, start, end, direction = 'asc') {
    const codes = [];
    if (direction === 'asc') {
        for (let n = start; n <= end; n += 1) {
            codes.push(`${prefix}${n}`);
        }
        return codes;
    }

    for (let n = start; n >= end; n -= 1) {
        codes.push(`${prefix}${n}`);
    }

    return codes;
}

function buildPreferredWalkOrder() {
    const preferred = [
        ...buildRange('B', 604, 601, 'desc'),
        ...buildRange('B', 623, 601, 'desc'),
        ...buildRange('B', 501, 523, 'asc'),
        ...buildRange('B', 423, 401, 'desc'),
        ...buildRange('B', 299, 323, 'asc'),

        // บูธกิจกรรม G201 อยู่ใต้ F536/F636 ติดแถว B1/B2 — ผ่านก่อนเดินขึ้นแถว F6
        'G201',
        ...buildRange('F', 636, 601, 'desc'),
        ...buildRange('F', 501, 536, 'asc'),
        ...buildRange('F', 434, 401, 'desc'),
        ...buildRange('F', 301, 334, 'asc'),
        // บูธกิจกรรม G101 อยู่ใต้ช่องว่างของแถว F1/F2 — ผ่านหลังจบแถว F3 ด้านล่าง
        'G101',
        ...buildRange('F', 217, 201, 'desc'),
        ...buildRange('F', 117, 101, 'desc'),

        ...buildRange('C', 112, 101, 'desc'),

        ...buildRange('A', 923, 901, 'desc'),
        ...buildRange('A', 801, 823, 'asc'),
        ...buildRange('A', 722, 701, 'desc'),
        ...buildRange('A', 601, 622, 'asc'),
        ...buildRange('A', 521, 501, 'desc'),
        ...buildRange('A', 401, 421, 'asc'),
        ...buildRange('A', 319, 301, 'desc'),
        ...buildRange('A', 201, 219, 'asc'),
        ...buildRange('A', 119, 101, 'desc'),

        ...buildRange('E', 101, 104, 'asc'),
        ...buildRange('D', 201, 212, 'asc'),
        ...buildRange('X', 101, 106, 'asc')
    ];

    const seen = new Set();
    return preferred.filter((code) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
    });
}

module.exports = { buildPreferredWalkOrder };
