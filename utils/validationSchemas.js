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
    status: upperCaseEnum(REPAIR_STATUS_VALUES)
});

const announcementSchema = z.object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(5000),
    category: z.string().trim().max(100).optional()
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
    bookingStallInputSchema
};
