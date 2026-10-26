const prisma = require('../config/prismaClient');
const { updateRoleSchema, bulkUpdateRoleSchema } = require('../utils/validationSchemas');

// ข้อความแจ้งผลหลังทำรายการ — หน้า EJS แสดงเป็น toast ตามรหัสนี้
const SUCCESS_MESSAGES = {
    role_updated: 'เปลี่ยนบทบาทเรียบร้อยแล้ว',
    bulk_role_updated: 'เปลี่ยนบทบาทผู้ใช้ที่เลือกเรียบร้อยแล้ว',
    deleted: 'ลบผู้ใช้งานเรียบร้อยแล้ว'
};

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

// รูปที่เก็บเป็น URL เต็ม (Cloudinary) หรือ path /uploads/... ใช้ได้ทันที ค่าอื่นถือว่าไม่มีรูป
function imageOrNull(value) {
    const text = String(value || '');
    return /^https?:\/\//i.test(text) || text.startsWith('/') ? text : null;
}

// ล็อกที่ผู้ใช้ถืออยู่ตอนนี้ = คำขอ SUCCESS ที่มีรหัสล็อก และล็อกนั้นยัง BOOKED อยู่
// (คำขอ SUCCESS ของล็อกที่ถูกปล่อยแล้วค้างไว้โดยตั้งใจ ดู utils/stallRenewal.js จึงต้องเช็คสถานะล็อกด้วย)
async function loadCurrentStalls(userIds) {
    if (!userIds.length) return new Map();
    const requests = await prisma.bookingRequest.findMany({
        where: { userId: { in: userIds }, status: 'SUCCESS', assignedStallCode: { not: null } },
        select: { userId: true, assignedStallCode: true },
        orderBy: { createdAt: 'desc' }
    });
    const codes = [...new Set(requests.map((r) => r.assignedStallCode))];
    const stalls = codes.length
        ? await prisma.stall.findMany({
            where: { stallCode: { in: codes }, status: 'BOOKED' },
            select: { stallCode: true, bookingEndDate: true }
        })
        : [];
    const stallByCode = new Map(stalls.map((s) => [s.stallCode, s]));

    const result = new Map();
    requests.forEach((r) => {
        const stall = stallByCode.get(r.assignedStallCode);
        if (!stall) return;
        const list = result.get(r.userId) || [];
        if (!list.some((s) => s.code === stall.stallCode)) {
            list.push({ code: stall.stallCode, endDate: toIso(stall.bookingEndDate) });
        }
        result.set(r.userId, list);
    });
    return result;
}

// 1. แสดงรายชื่อผู้ใช้งานทั้งหมด
// เลือกเฉพาะฟิลด์ที่หน้าใช้ — ห้าม include ทั้งแถว User เพราะข้อมูลถูกฝังลงหน้า HTML (เคยหลุด hash รหัสผ่านไปฝั่ง client)
exports.getUsersPage = async (req, res) => {
    try {
        const rows = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                createdAt: true,
                birthDate: true,
                phoneNumber: true,
                email: true,
                avatarUrl: true,
                isBlacklisted: true,
                blacklistedAt: true,
                blacklistReason: true,
                shop: {
                    select: {
                        shopName: true,
                        productType: true,
                        productSubtype: true,
                        productSubtypeOther: true,
                        productDetail: true,
                        productImage: true,
                        logoImage: true,
                        isVerified: true
                    }
                },
                _count: {
                    select: {
                        bookingRequests: true,
                        requests: true,
                        communityPosts: true,
                        eventBoothRequests: true
                    }
                }
            },
            orderBy: [{ role: 'asc' }, { name: 'asc' }]
        });

        const stallsByUser = await loadCurrentStalls(rows.map((u) => u.id));

        const users = rows.map((u) => ({
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            createdAt: toIso(u.createdAt),
            birthDate: toIso(u.birthDate),
            phoneNumber: u.phoneNumber || null,
            email: u.email || null,
            avatarUrl: imageOrNull(u.avatarUrl),
            isBlacklisted: Boolean(u.isBlacklisted),
            blacklistedAt: toIso(u.blacklistedAt),
            blacklistReason: u.blacklistReason || null,
            shop: u.shop ? {
                shopName: u.shop.shopName || null,
                productType: u.shop.productType || null,
                productSubtype: u.shop.productSubtypeOther || u.shop.productSubtype || null,
                productDetail: u.shop.productDetail || null,
                image: imageOrNull(u.shop.logoImage) || imageOrNull(u.shop.productImage),
                isVerified: Boolean(u.shop.isVerified)
            } : null,
            stalls: stallsByUser.get(u.id) || [],
            counts: {
                bookingRequests: u._count.bookingRequests,
                repairs: u._count.requests,
                posts: u._count.communityPosts,
                eventBooths: u._count.eventBoothRequests
            }
        }));

        res.render('admin/users', {
            user: req.user,
            users,
            error: req.query.error || null,
            successMessage: SUCCESS_MESSAGES[req.query.success] || null
        });
    } catch (err) {
        console.error("Fetch Users Error:", err);
        res.redirect('/admin/dashboard?error=' + encodeURIComponent("ไม่สามารถดึงข้อมูลผู้ใช้ได้"));
    }
};

// กลับไปหน้าเดิม และเปิดแผงรายละเอียดของผู้ใช้คนนั้นค้างไว้ (ถ้าส่ง userId มา)
function backToUsers(res, query, userId) {
    res.redirect('/admin/users?' + query + (userId ? '#user-' + userId : ''));
}

function errorQuery(message) {
    return 'error=' + encodeURIComponent(message);
}

// 2. อัปเดตบทบาทผู้ใช้งาน (Update Role)
exports.updateRole = async (req, res) => {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
        return backToUsers(res, errorQuery("ข้อมูลไม่ถูกต้อง"));
    }
    const { userId, newRole } = parsed.data;

    try {
        // ป้องกันแอดมินลดสิทธิ์ตัวเองโดยไม่ตั้งใจจนล็อกตัวเองออกจากระบบจัดการ
        if (userId === req.user.id && newRole !== 'ADMIN') {
            return backToUsers(res, errorQuery("คุณไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้"), userId);
        }

        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole }
        });

        backToUsers(res, 'success=role_updated', userId);
    } catch (err) {
        console.error("Update Role Error:", err);
        backToUsers(res, errorQuery("แก้ไขสิทธิ์ไม่สำเร็จ"), userId);
    }
};

// 3. เปลี่ยนบทบาทหลายคนพร้อมกัน — ข้ามบัญชีตัวเองเสมอ (กันล็อกตัวเองออกเหมือนข้อ 2)
exports.bulkUpdateRole = async (req, res) => {
    const parsed = bulkUpdateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
        return backToUsers(res, errorQuery("กรุณาเลือกผู้ใช้และบทบาทให้ถูกต้อง"));
    }
    const { newRole } = parsed.data;
    const userIds = parsed.data.userIds.filter((id) => id !== req.user.id);
    if (!userIds.length) {
        return backToUsers(res, errorQuery("คุณไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้"));
    }

    try {
        await prisma.user.updateMany({
            where: { id: { in: userIds } },
            data: { role: newRole }
        });
        backToUsers(res, 'success=bulk_role_updated');
    } catch (err) {
        console.error("Bulk Update Role Error:", err);
        backToUsers(res, errorQuery("เปลี่ยนบทบาทไม่สำเร็จ"));
    }
};

// 4. ลบผู้ใช้งาน (Delete User) — รับเฉพาะ POST กันลิงก์ GET ลบผู้ใช้โดยไม่ตั้งใจ
exports.deleteUser = async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
        return backToUsers(res, errorQuery("ข้อมูลไม่ถูกต้อง"));
    }
    try {
        // ตรวจสอบว่าแอดมินไม่ได้ลบตัวเอง
        if (userId === req.user.id) {
            return backToUsers(res, errorQuery("คุณไม่สามารถลบตัวเองได้"), userId);
        }

        await prisma.user.delete({
            where: { id: userId }
        });

        backToUsers(res, 'success=deleted');
    } catch (err) {
        console.error("Delete User Error:", err);
        backToUsers(res, errorQuery("ไม่สามารถลบผู้ใช้งานได้ (อาจมีข้อมูลการจองผูกอยู่)"), userId);
    }
};
