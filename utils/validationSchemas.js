const { z } = require('zod');
const { isAllowedSubtype } = require('./productSubtypes');
const { CLEANLINESS_ITEM_IDS } = require('./cleanlinessChecklist');

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
    // รายการเครื่องใช้ไฟฟ้า/พัดลมแบบ JSON — ตรวจเนื้อหาจริงที่ parseApplianceItems (utils/bookingAppliances.js)
    applianceItems: z.string().max(8000).optional(),
    roundChoice: z.string().max(10).optional(),
    dateStart: z.string().trim().min(1).max(20),
    dateEnd: z.string().trim().min(1).max(20)
}).refine((value) => {
    // เช็คแค่ว่าเป็นวันที่จริงและวันสิ้นสุดไม่ก่อนวันเริ่ม — จำนวนวันขั้นต่ำขึ้นกับช่วงของรอบ
    // (ช่วงรายวันจองทีละ 1 วันได้) ซึ่ง POST /booking-stall เช็คด้วย getBookingPhaseForRound อยู่แล้ว
    // เดิมบังคับ 3 วันตรงนี้ ทำให้จองทีละวันไม่ผ่านทั้งที่กติกาอนุญาต
    const start = new Date(value.dateStart);
    const end = new Date(value.dateEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return end >= start;
}, {
    message: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มขาย',
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

// checkbox หลายตัวชื่อเดียวกัน (productSubtype) — HTML ส่งมาเป็น string เดี่ยวถ้าติ๊กอันเดียว,
// array ถ้าติ๊กหลายอัน, undefined ถ้าไม่ติ๊กเลย แปลงให้เป็น array เสมอก่อน validate แต่ละค่า
// กับลิสต์ที่อนุญาต (utils/productSubtypes.js รวมที่แอดมินเพิ่ม — route ต้อง await loadCustomSubtypes() ก่อน parse)
// กันส่งค่ามั่วมาจากนอกฟอร์ม แล้ว join คืนเป็น
// comma-separated string ให้ตรงกับที่เก็บใน DB (ดู utils/stallSpacing.js ตอนเทียบระยะห่างล็อก)
const productSubtypeField = z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return [];
    return Array.isArray(value) ? value : [value];
}, z.array(z.string().trim().min(1).max(100)).max(20))
    .refine((values) => values.every((v) => isAllowedSubtype(v)), {
        message: 'ประเภทสินค้าเฉพาะที่เลือกไม่ถูกต้อง'
    })
    .transform((values) => Array.from(new Set(values)).join(','));

const sellerApplicationSchema = z.object({
    shopName: z.string().trim().min(1).max(200),
    sellerName: z.string().trim().min(1).max(200),
    phoneNumber: z.string().trim().regex(thaiPhoneRegex, 'เบอร์โทรศัพท์ต้องเป็นตัวเลขไทยที่ถูกต้อง'),
    bankName: z.enum(THAI_BANK_NAMES, { errorMap: () => ({ message: 'กรุณาเลือกธนาคาร' }) }),
    bankAccountNumber: z.string().trim().min(4).max(30),
    bankAccountName: z.string().trim().min(2).max(200),
    productType: z.string().trim().min(1, 'กรุณาเลือกประเภทสินค้า').max(100),
    productSubtype: productSubtypeField,
    productSubtypeOther: z.string().trim().max(200).optional(),
    productDetail: z.string().trim().min(1, 'กรุณากรอกรายละเอียดสินค้า').max(2000),
    // สองช่องนี้ไม่บังคับ — ตอนอนุมัติคัดลอกเข้า ShopDetail ตรง ๆ (ขอบเขตเดียวกับ shopProfileSchema)
    shopSummary: z.string().trim().max(500).optional(),
    shopTags: z.string().trim().max(300).optional(),
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

// บันทึกผลตรวจเช็คลิสต์ความสะอาด (5 หมวด/17 ข้อ) — ต้องตอบครบทุกข้อในคราวเดียว (กดบันทึกทั้งชุด ไม่ auto-save ทีละข้อ)
const cleanlinessInspectionInputSchema = z.object({
    stallId: z.coerce.number().int().positive(),
    itemResults: z.record(z.string(), strictBoolean())
        .refine((obj) => CLEANLINESS_ITEM_IDS.every((id) => id in obj), { message: 'กรุณาตรวจครบทุกข้อ' }),
    note: z.string().trim().max(1000).optional()
});

// ฟอร์มขอจัดบูธกิจกรรม (/event-booth) — ส่งได้โดยไม่ต้อง login จึงจำกัดความยาวทุกช่อง
const trimmedText = (min, max, message) => z.preprocess((value) => String(value ?? '').trim(), z.string().min(min, message).max(max, message));
const eventBoothRequestSchema = z.object({
    companyName: trimmedText(2, 150, 'กรุณากรอกชื่อบริษัท/หน่วยงาน (2–150 ตัวอักษร)'),
    firstName: trimmedText(1, 50, 'กรุณากรอกชื่อผู้ติดต่อ (ไม่เกิน 50 ตัวอักษร)'),
    lastName: trimmedText(1, 50, 'กรุณากรอกนามสกุลผู้ติดต่อ (ไม่เกิน 50 ตัวอักษร)'),
    phone: z.preprocess((value) => String(value ?? '').replace(/[\s-]/g, ''), z.string().regex(/^0\d{8,9}$/, 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0')),
    email: z.preprocess((value) => {
        const text = String(value ?? '').trim();
        return text === '' ? undefined : text;
    }, z.string().email('รูปแบบอีเมลไม่ถูกต้อง').max(150).optional()),
    eventTitle: trimmedText(2, 150, 'กรุณากรอกชื่องาน/กิจกรรม (2–150 ตัวอักษร)'),
    description: z.preprocess((value) => String(value ?? '').trim(), z.string().max(2000, 'รายละเอียดยาวเกิน 2,000 ตัวอักษร')),
    dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาเลือกวันเริ่มงาน'),
    dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาเลือกวันสิ้นสุดงาน'),
    preferredBooth: z.preprocess((value) => String(value ?? '').trim().toUpperCase(), z.enum(['', 'G101', 'G201']))
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
    eventBoothRequestSchema,
    sellerApplicationSchema,
    shopProfileSchema,
    electricExcessInputSchema,
    inspectionCheckInputSchema,
    stallIssueInputSchema,
    cleanlinessInspectionInputSchema,
    THAI_BANK_NAMES
};
