// รายการเครื่องใช้ไฟฟ้า/พัดลมที่ผู้ขายแจ้งตอนจองแผง — จุดเดียวที่กำหนดราคาและประเภท
// ใช้ร่วมกันทั้งฟอร์มจอง (ส่งเป็น JSON ให้ฝั่ง client), POST /booking-stall, ต่อล็อก, ใบเสนอราคา และหน้าแอดมิน
// ราคาคิดต่อเครื่อง/ตัว ต่อวัน รวมทั้งคำขอ (ไม่คูณจำนวนล็อก — ผู้ขายนับเครื่องที่ขนมาทั้งหมดแล้ว)

const SMALL_APPLIANCE_MAX_WATT = 1200;

const APPLIANCE_KINDS = {
    SMALL: { label: 'เครื่องเล็ก', shortLabel: 'เล็ก', price: 20, unit: 'เครื่อง', isFan: false },
    LARGE: { label: 'เครื่องใหญ่', shortLabel: 'ใหญ่', price: 40, unit: 'เครื่อง', isFan: false },
    FAN_SMALL: { label: 'พัดลม 10–18 นิ้ว', shortLabel: 'พัดลม ≤18"', price: 20, unit: 'ตัว', isFan: true },
    FAN_LARGE: { label: 'พัดลม 18–24 นิ้ว', shortLabel: 'พัดลม >18"', price: 40, unit: 'ตัว', isFan: true }
};
const APPLIANCE_KIND_KEYS = Object.keys(APPLIANCE_KINDS);

// ไทล์ให้แตะเลือกในฟอร์มจอง (ไอคอน Font Awesome) แยกตามขนาด — ผู้ขายเลือกขนาดก่อนแล้วค่อยเลือกเครื่อง
// เครื่องที่ไม่มีในรายการ พิมพ์ชื่อเองในขนาดที่เลือก (ฟอร์มเตือนถ้าชื่อดูเหมือนอีกขนาด)
const APPLIANCE_PRESETS = [
    { name: 'กระทะไฟฟ้า', kind: 'LARGE', icon: 'fa-fire-burner' },
    { name: 'เตาไฟฟ้า', kind: 'LARGE', icon: 'fa-fire-burner' },
    { name: 'เตาอบไฟฟ้า', kind: 'LARGE', icon: 'fa-temperature-high' },
    { name: 'หม้อทอดไฟฟ้า', kind: 'LARGE', icon: 'fa-fire' },
    { name: 'ตู้แช่', kind: 'LARGE', icon: 'fa-snowflake' },
    { name: 'เตาปิ้งย่างไฟฟ้า', kind: 'LARGE', icon: 'fa-fire' },
    { name: 'เครื่องปั่น', kind: 'SMALL', icon: 'fa-blender' },
    { name: 'เครื่องปิ้งขนมปัง', kind: 'SMALL', icon: 'fa-bread-slice' },
    { name: 'กาน้ำร้อนไฟฟ้า', kind: 'SMALL', icon: 'fa-mug-hot' },
    { name: 'หม้อหุงข้าว', kind: 'SMALL', icon: 'fa-bowl-rice' },
    { name: 'ไมโครเวฟ', kind: 'SMALL', icon: 'fa-plug' },
    { name: 'เครื่องทำวาฟเฟิล', kind: 'SMALL', icon: 'fa-cookie' },
    { name: 'ตู้เย็นเล็ก', kind: 'SMALL', icon: 'fa-snowflake' },
    { name: 'พัดลมตั้งโต๊ะ', kind: 'FAN_SMALL', icon: 'fa-fan' },
    { name: 'พัดลมตั้งพื้น', kind: 'FAN_SMALL', icon: 'fa-fan' },
    { name: 'พัดลมอุตสาหกรรม', kind: 'FAN_LARGE', icon: 'fa-fan' },
    { name: 'พัดลมตั้งพื้นตัวใหญ่', kind: 'FAN_LARGE', icon: 'fa-fan' }
];

const MAX_ITEMS = 30;
const MAX_QTY_PER_ITEM = 20;
const MAX_NAME_LENGTH = 60;

// แปลง JSON ที่ฟอร์มส่งมาเป็นรายการที่เชื่อถือได้ — คืน { items } หรือ { error } (ข้อความไทยพร้อมแสดง)
function parseApplianceItems(rawValue) {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return { items: [] };

    let parsed;
    try {
        parsed = JSON.parse(String(rawValue));
    } catch (error) {
        return { error: 'ข้อมูลรายการเครื่องใช้ไฟฟ้าไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง' };
    }
    if (!Array.isArray(parsed)) return { error: 'ข้อมูลรายการเครื่องใช้ไฟฟ้าไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง' };
    if (parsed.length > MAX_ITEMS) return { error: `แจ้งเครื่องใช้ไฟฟ้าได้ไม่เกิน ${MAX_ITEMS} รายการต่อคำขอ` };

    const items = [];
    for (const row of parsed) {
        if (!row || typeof row !== 'object') return { error: 'ข้อมูลรายการเครื่องใช้ไฟฟ้าไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง' };
        const name = String(row.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
        const kind = String(row.kind || '').toUpperCase();
        const qty = Number.parseInt(row.qty, 10);
        const wattRaw = Number.parseInt(row.watt, 10);
        const watt = Number.isFinite(wattRaw) && wattRaw > 0 && wattRaw <= 20000 ? wattRaw : null;

        if (!name) return { error: 'กรุณาระบุชื่อเครื่องใช้ไฟฟ้า/พัดลมให้ครบทุกรายการ (เช่น หม้อทอด, พัดลม 16 นิ้ว)' };
        if (!APPLIANCE_KINDS[kind]) return { error: `กรุณาเลือกประเภทของ "${name}"` };
        if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
            return { error: `จำนวนของ "${name}" ต้องอยู่ระหว่าง 1–${MAX_QTY_PER_ITEM}` };
        }
        // กรอกวัตต์เกินเกณฑ์แต่เลือกเครื่องเล็ก → นับเป็นเครื่องใหญ่ตามเกณฑ์ตลาด (กันเลือกผิดแล้วโดนเก็บเพิ่มหน้างาน)
        const finalKind = kind === 'SMALL' && watt && watt > SMALL_APPLIANCE_MAX_WATT ? 'LARGE' : kind;
        items.push({ name, kind: finalKind, qty, watt });
    }
    return { items };
}

// ยอดรวมจำนวนแยกตามประเภท จากรายการที่ผ่าน parseApplianceItems แล้ว
function summarizeApplianceItems(items) {
    const counts = { SMALL: 0, LARGE: 0, FAN_SMALL: 0, FAN_LARGE: 0 };
    (items || []).forEach((item) => {
        if (counts[item.kind] !== undefined) counts[item.kind] += Number(item.qty) || 0;
    });
    return {
        smallApplianceCount: counts.SMALL,
        largeApplianceCount: counts.LARGE,
        smallFanCount: counts.FAN_SMALL,
        largeFanCount: counts.FAN_LARGE
    };
}

// ค่าเครื่องใช้ไฟฟ้า + พัดลมต่อวัน (รวมทั้งคำขอ) — ใช้ราคาที่ล็อกไว้ใน booking ถ้ามี ไม่งั้นใช้ราคาปัจจุบัน
function dailyApplianceFee(counts, prices) {
    const p = prices || {};
    return (Number(counts.smallApplianceCount) || 0) * (p.smallAppliancePrice ?? APPLIANCE_KINDS.SMALL.price)
        + (Number(counts.largeApplianceCount) || 0) * (p.largeAppliancePrice ?? APPLIANCE_KINDS.LARGE.price)
        + (Number(counts.smallFanCount) || 0) * (p.smallFanPrice ?? APPLIANCE_KINDS.FAN_SMALL.price)
        + (Number(counts.largeFanCount) || 0) * (p.largeFanPrice ?? APPLIANCE_KINDS.FAN_LARGE.price);
}

// อ่านรายการจาก booking ที่บันทึกแล้ว — booking เก่าที่ไม่มีชื่อจะสร้างแถวจากจำนวนแทน (name ว่าง)
function readBookingApplianceItems(booking) {
    if (!booking) return [];
    if (booking.applianceItems) {
        const { items } = parseApplianceItems(booking.applianceItems);
        if (items && items.length) return items;
    }
    const fallback = [];
    if (booking.smallApplianceCount) fallback.push({ name: '', kind: 'SMALL', qty: booking.smallApplianceCount, watt: null });
    if (booking.largeApplianceCount) fallback.push({ name: '', kind: 'LARGE', qty: booking.largeApplianceCount, watt: null });
    if (booking.smallFanCount) fallback.push({ name: '', kind: 'FAN_SMALL', qty: booking.smallFanCount, watt: null });
    if (booking.largeFanCount) fallback.push({ name: '', kind: 'FAN_LARGE', qty: booking.largeFanCount, watt: null });
    return fallback;
}

// ข้อความสั้นสำหรับหน้าแอดมิน/สถานะการจอง เช่น "หม้อทอดไฟฟ้า ×1 (ใหญ่), พัดลม 16 นิ้ว ×2 (พัดลม ≤18")"
function describeBookingAppliances(booking) {
    const items = readBookingApplianceItems(booking);
    if (!items.length) return 'ไม่มี';
    return items.map((item) => {
        const kind = APPLIANCE_KINDS[item.kind];
        const name = item.name || (kind ? kind.label : 'ไม่ระบุ');
        return `${name} ×${item.qty}${item.name && kind ? ` (${kind.shortLabel})` : ''}`;
    }).join(', ');
}

module.exports = {
    SMALL_APPLIANCE_MAX_WATT,
    APPLIANCE_KINDS,
    APPLIANCE_KIND_KEYS,
    APPLIANCE_PRESETS,
    MAX_QTY_PER_ITEM,
    parseApplianceItems,
    summarizeApplianceItems,
    dailyApplianceFee,
    readBookingApplianceItems,
    describeBookingAppliances
};
