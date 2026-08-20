// คำนวณราคาต่อวันของแต่ละล็อคในผังตลาด โดยดึงประเภท+สีจาก data/lots.csv
// (รายชื่อล็อคมุมพิเศษ/ล็อคที่มีข้อมูลระบุไว้ชัดเจน) และ fallback เป็นค่าเริ่มต้นของแต่ละโซน
// สำหรับล็อคที่ไม่มีอยู่ใน CSV (ยังไม่ได้ตรวจสอบ/ไม่ใช่ล็อคมุมพิเศษ)
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'lots.csv');

const BASE_PRICES = {
    'แฟชั่น 3x3': 209,
    'อาหาร 3x3': 259,
    'อาหาร 2x2': 249
};

const COLOR_SURCHARGE = {
    'ชมพู': 69,
    'ฟ้า': 29,
    'ฟ้า-A9': 20,
    'เหลือง': 89,
    'ไม่มี': 0
};

// ประเภทเริ่มต้นของแต่ละโซนสำหรับล็อคที่ไม่มีข้อมูลใน CSV (อิงจากประเภทส่วนใหญ่ของล็อคในโซนนั้นตาม CSV)
// โซน D และ X ไม่มีข้อมูลใน CSV และไม่มีกติการาคาที่ระบุมา จึงไม่กำหนดค่าเริ่มต้นให้ (ไม่คำนวณราคา)
const ZONE_DEFAULT_TYPE = {
    A: 'แฟชั่น 3x3',
    B: 'อาหาร 3x3',
    C: 'แฟชั่น 3x3',
    E: 'แฟชั่น 3x3',
    F: 'อาหาร 2x2'
};

function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const map = {};
    for (let i = 1; i < lines.length; i += 1) {
        const [code, type, color] = lines[i].split(',');
        if (!code) continue;
        map[code.trim().toUpperCase()] = {
            type: (type || '').trim(),
            color: (color || '').trim()
        };
    }
    return map;
}

let LOT_MAP = {};
try {
    LOT_MAP = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
} catch (error) {
    console.error('lotPricing: ไม่สามารถอ่าน data/lots.csv ได้', error.message);
}

function computePrice(type, color) {
    const base = BASE_PRICES[type];
    if (base === undefined) return null;
    const surcharge = COLOR_SURCHARGE[color] !== undefined ? COLOR_SURCHARGE[color] : 0;
    return base + surcharge;
}

// คืนค่า { type, color, pricePerDay } ของล็อคที่ระบุ (pricePerDay เป็น null ถ้าไม่มีกติการาคาสำหรับล็อคนี้)
function getLotPricing(stallCode) {
    const code = String(stallCode || '').trim().toUpperCase();
    const entry = LOT_MAP[code];

    if (entry) {
        return { type: entry.type, color: entry.color, pricePerDay: computePrice(entry.type, entry.color) };
    }

    const zoneCode = (code.match(/^[A-Z]+/) || [])[0];
    const defaultType = ZONE_DEFAULT_TYPE[zoneCode];
    if (!defaultType) return { type: null, color: null, pricePerDay: null };

    return { type: defaultType, color: 'ไม่มี', pricePerDay: computePrice(defaultType, 'ไม่มี') };
}

module.exports = { getLotPricing, BASE_PRICES, COLOR_SURCHARGE };
