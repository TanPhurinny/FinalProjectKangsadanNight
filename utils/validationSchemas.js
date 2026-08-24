const { z } = require('zod');

const USER_ROLE_VALUES = ['ADMIN', 'STAFF', 'SELLER', 'CUSTOMER'];
const REPAIR_STATUS_VALUES = ['PENDING', 'IN_PROGRESS', 'SUCCESS', 'REJECTED'];

function upperCaseEnum(values) {
    return z.preprocess((value) => String(value ?? '').trim().toUpperCase(), z.enum(values));
}

// '' / undefined / null หมายถึง "ไม่ได้ส่งมา" ให้ปล่อยผ่านเป็น undefined (ตัวเรียกใช้จะ
// ไปใช้ค่า default ของตัวเองต่อ เช่น safeInt(value, fallback)) ไม่ใช่ error - ป้องกันแค่
// ค่าที่ "ส่งมาจริง" แต่ผิดชนิด/เกินขอบเขตเท่านั้น เพื่อไม่ให้กระทบสูตรคำนวณราคาเดิม
function optionalBoundedInt(min, max) {
    return z.preprocess((value) => {
        if (value === undefined || value === null || value === '') return undefined;
        return value;
    }, z.coerce.number().int().min(min).max(max).optional());
}

// z.coerce.boolean() จะมองค่า string ที่ไม่ว่างเป็น true เสมอ (เช่น "false" -> true) จึงต้องแปลง string เหล่านี้เองก่อน
function strictBoolean() {
    return z.preprocess((value) => {
        if (typeof value === 'boolean') return value;
        if (value === 'false' || value === '0') return false;
        if (value === 'true' || value === '1') return true;
        return value;
    }, z.boolean());
}

const MAX_STALL_COUNT = 20;
const MAX_APPLIANCE_COUNT = 50;

// ตรวจสอบแค่ "รูปร่าง" ของ input ก่อนเข้าสู่การคำนวณราคาจริงใน sellerRoute.js
// (กันค่าประหลาด/เกินขอบเขตที่จะทำให้เกิดลูปสร้าง record มหาศาลหรือราคาผิดเพี้ยน)
// ไม่ได้แทนที่ safeInt/resolveCornerZonePrice เดิม แค่ปฏิเสธ request ก่อนถึงมันถ้าข้อมูลไม่สมเหตุสมผล
const bookingStallInputSchema = z.object({
    stallCount: optionalBoundedInt(1, MAX_STALL_COUNT),
    smallApplianceCount: optionalBoundedInt(0, MAX_APPLIANCE_COUNT),
    largeApplianceCount: optionalBoundedInt(0, MAX_APPLIANCE_COUNT),
    light: z.string().optional(),
    cornerZone: z.union([z.string(), z.number()]).optional(),
    storeDetail: z.string().max(2000).optional(),
    dateStart: z.string().trim().min(1).max(20),
    dateEnd: z.string().trim().min(1).max(20)
}).refine((value) => {
    const start = new Date(value.dateStart);
    const end = new Date(value.dateEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    if (end < start) return false;
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return diffDays >= 3;
}, {
    message: 'รอบการจองต้องมีระยะเวลาตั้งแต่ 3 วันขึ้นไป',
    path: ['dateEnd']
});

const updateRoleSchema = z.object({
    userId: z.coerce.number().int().positive(),
    newRole: upperCaseEnum(USER_ROLE_VALUES)
});

const repairReportSchema = z.object({
    location: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(2000)
});

const repairStatusUpdateSchema = z.object({
    id: z.coerce.number().int().positive(),
    status: upperCaseEnum(REPAIR_STATUS_VALUES),
    reason: z.string().trim().max(500).optional()
});

const announcementSchema = z.object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(5000),
    category: z.string().trim().max(100).optional()
});

const thaiIdRegex = /^\d{13}$/;
const thaiPhoneRegex = /^0\d{9,10}$/;

const THAI_BANK_NAMES = [
    'ธนาคารกรุงเทพ',
    'ธนาคารกสิกรไทย',
    'ธนาคารกรุงไทย',
    'ธนาคารไทยพาณิชย์',
    'ธนาคารกรุงศรีอยุธยา',
    'ธนาคารทหารไทยธนชาต',
    'ธนาคารเกียรตินาคินภัทร',
    'ธนาคารซีไอเอ็มบี ไทย',
    'ธนาคารยูโอบี',
    'ธนาคารออมสิน',
    'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
    'ธนาคารอาคารสงเคราะห์ (ธอส.)',
    'ธนาคารอิสลามแห่งประเทศไทย'
];

const sellerApplicationSchema = z.object({
    shopName: z.string().trim().min(1).max(200),
    sellerName: z.string().trim().min(1).max(200),
    idCardNumber: z.string().trim().regex(thaiIdRegex, 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'),
    phoneNumber: z.string().trim().regex(thaiPhoneRegex, 'เบอร์โทรศัพท์ต้องเป็นตัวเลขไทยที่ถูกต้อง'),
    bankName: z.enum(THAI_BANK_NAMES, { errorMap: () => ({ message: 'กรุณาเลือกธนาคาร' }) }),
    bankAccountNumber: z.string().trim().min(4).max(30),
    bankAccountName: z.string().trim().min(2).max(200),
    houseNumber: z.string().trim().min(1).max(200),
    subdistrict: z.string().trim().min(1).max(200),
    district: z.string().trim().min(1).max(200),
    province: z.string().trim().min(1).max(200),
    productType: z.string().trim().min(1, 'กรุณาเลือกประเภทสินค้า').max(100),
    productDetail: z.string().trim().min(1, 'กรุณากรอกรายละเอียดสินค้า').max(2000),
    termsAccepted: z.literal('true', { errorMap: () => ({ message: 'กรุณายอมรับกฎระเบียบร้านค้าก่อนสมัคร' }) })
});

// ชื่อร้าน/ประเภทสินค้า "ไม่" อยู่ในฟอร์มนี้โดยตั้งใจ — สองฟิลด์นี้มาจากใบสมัครที่แอดมินอนุมัติแล้วเท่านั้น
// (ซิงก์อัตโนมัติตอนอนุมัติ ดู controllers/sellerApplicationController.js และ approvalController.js)
// ผู้ขายแก้เองไม่ได้ กันร้านที่โชว์จริงไม่ตรงกับที่สมัคร/ผ่านการตรวจสอบมา
const shopProfileSchema = z.object({
    productDetail: z.string().trim().max(2000).optional(),
    shopSummary: z.string().trim().max(500).optional(),
    shopTags: z.string().trim().max(300).optional()
});

// บันทึกจำนวนเครื่องใช้ไฟฟ้าเกินที่พบตอนตรวจตลาดจริง (แยกจากยอดที่แจ้งไว้ตอนจองใน Booking)
// อนุญาตให้ส่ง 0/0 ได้ เพื่อรองรับกรณีแก้ไขล้างค่าที่เคยบันทึกผิดออก
const electricExcessInputSchema = z.object({
    stallId: z.coerce.number().int().positive(),
    smallCount: optionalBoundedInt(0, MAX_APPLIANCE_COUNT).transform((value) => value ?? 0),
    largeCount: optionalBoundedInt(0, MAX_APPLIANCE_COUNT).transform((value) => value ?? 0),
    note: z.string().trim().max(500).optional()
});

// สลับสถานะ "ตรวจสอบแล้ว" ตอนเดินตรวจตลาด (โทรเพื่อดู/ยกเลิกได้ตลอด)
const inspectionCheckInputSchema = z.object({
    stallId: z.coerce.number().int().positive(),
    isInspected: strictBoolean()
});

// บันทึกหัวข้อปัญหาที่พบตอนตรวจตลาด (ไม่มาขาย/ปล่อยเช่าช่วง/ไปเปิดท้ายหรือขายอื่น/ขายไม่ตรง + หมายเหตุปัญหาอื่นๆ)
// ส่งค่าทุก field มาพร้อมกันเสมอ (แถวปัจจุบันทั้งหมด) เพื่อสร้าง event log record ใหม่ที่สมบูรณ์
const stallIssueInputSchema = z.object({
    stallId: z.coerce.number().int().positive(),
    noShow: strictBoolean(),
    sublease: strictBoolean(),
    otherMarket: strictBoolean(),
    wrongSeller: strictBoolean(),
    otherIssueNote: z.string().trim().max(1000).optional()
});

module.exports = {
    USER_ROLE_VALUES,
    REPAIR_STATUS_VALUES,
    MAX_STALL_COUNT,
    MAX_APPLIANCE_COUNT,
    updateRoleSchema,
    repairReportSchema,
    repairStatusUpdateSchema,
    announcementSchema,
    bookingStallInputSchema,
    sellerApplicationSchema,
    shopProfileSchema,
    electricExcessInputSchema,
    inspectionCheckInputSchema,
    stallIssueInputSchema,
    THAI_BANK_NAMES
};
