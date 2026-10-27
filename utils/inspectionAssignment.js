const prisma = require('../config/prismaClient');
const { businessDateOf } = require('./shopOpenStatus');
const { buildPreferredWalkOrder } = require('./inspectionWalkOrder');
const { buildTodayInspectionLayer } = require('./inspectionToday');

// บันทึกว่า "วันขายนี้ใครตรวจร้านไหนไปแล้ว" (ตาราง InspectionAssignment) — เจ้าหน้าที่หลายคนแบ่งร้านกันเองนอกระบบ
// ระบบแค่บอกทั้งทีมว่าร้านไหนตรวจแล้วโดยใคร (ผังภาพรวมในโหมดเดินตรวจดึงสถานะทุก 20 วิ) ไม่ล็อกร้าน ไม่แจกงาน
//
// - วันขายตัดตี 5 เหมือน ShopOpenStatus (ตลาดขายเลยเที่ยงคืน)
// - 1 ร้านต่อวันมีแถวเดียว (unique businessDate+stallId) = คนตรวจคนแรก — บันทึกผลซ้ำได้ แต่ไม่เปลี่ยนเจ้าของ
//   เครดิตปุ่ม "ส่งงาน" (staffInspectionController.submitDay) นับจากแถวนี้

function parseStallCodes(text) {
    return String(text || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

// ร้านที่ต้องตรวจวันนี้ = ล็อกที่มีคำขอ SUCCESS และ Stall ยัง BOOKED (ตรงกับ inspectionEnabled ของหน้าตรวจตลาด)
// เรียงตามเส้นทางเดินจริง ล็อกที่ไม่อยู่ในเส้นทางต่อท้ายตามรหัส
async function getInspectableStalls() {
    const paidRequests = await prisma.bookingRequest.findMany({
        where: { status: 'SUCCESS', assignedStallCode: { not: null } },
        select: { assignedStallCode: true }
    });
    const paidCodes = new Set(paidRequests.flatMap((request) => parseStallCodes(request.assignedStallCode)));
    if (!paidCodes.size) return [];

    const stalls = await prisma.stall.findMany({
        where: { stallCode: { in: Array.from(paidCodes) }, status: 'BOOKED' },
        select: { id: true, stallCode: true }
    });

    const orderIndex = new Map(buildPreferredWalkOrder().map((code, idx) => [code, idx]));
    const orderOf = (code) => (orderIndex.has(code) ? orderIndex.get(code) : Number.POSITIVE_INFINITY);
    return stalls.sort((a, b) => (orderOf(a.stallCode) - orderOf(b.stallCode)) || a.stallCode.localeCompare(b.stallCode));
}

// เรียกหลังบันทึกผลตรวจร้าน (สถานะร้าน/ความสะอาด) — ร้านนี้ยังไม่มีใครตรวจวันนี้ = นับเป็นของคนบันทึก
async function recordInspected(stall, userId, now = new Date()) {
    await prisma.inspectionAssignment.create({
        data: {
            businessDate: businessDateOf(now),
            stallId: stall.id,
            stallCode: stall.stallCode,
            assignedToId: userId,
            assignedAt: now,
            completedAt: now
        }
    }).catch((error) => {
        // มีคนตรวจร้านนี้ไปแล้ววันนี้ — ผลตรวจใหม่บันทึกแล้ว แค่ไม่เปลี่ยนคนตรวจ
        if (error.code !== 'P2002') throw error;
    });
}

// สถานะทั้งทีมของวันขายนี้: ตรวจแล้วกี่ร้าน แต่ละคนกี่ร้าน ร้านไหนตรวจโดยใคร เวลาเท่าไร
// พร้อมผลตรวจล่าสุดของวันนี้ (hasIssue + ค่าสถานะร้าน) ให้ผังภาพรวมลงสีถูกและการ์ดเติมค่าล่าสุดที่เพื่อนบันทึกไว้
async function getWalkStatus(userId, now = new Date()) {
    const businessDate = businessDateOf(now);
    const [stalls, rows, todayLayer] = await Promise.all([
        getInspectableStalls(),
        prisma.inspectionAssignment.findMany({ where: { businessDate } }),
        buildTodayInspectionLayer()
    ]);

    // แถวของล็อกที่ไม่ต้องตรวจแล้ว (ถูกปล่อยระหว่างวัน) ไม่นับ
    const inspectableIds = new Set(stalls.map((stall) => stall.id));
    const activeRows = rows.filter((row) => inspectableIds.has(row.stallId));

    const inspectorIds = Array.from(new Set(activeRows.map((row) => row.assignedToId)));
    const inspectors = inspectorIds.length
        ? await prisma.user.findMany({ where: { id: { in: inspectorIds } }, select: { id: true, name: true, username: true } })
        : [];
    const nameById = new Map(inspectors.map((user) => [user.id, user.name || user.username || '-']));

    const byStall = {};
    activeRows.forEach((row) => {
        const today = todayLayer.byCode[String(row.stallCode).trim().toUpperCase()] || null;
        byStall[row.stallId] = {
            stallCode: row.stallCode,
            inspectorName: nameById.get(row.assignedToId) || '-',
            inspectedAt: row.completedAt || row.assignedAt,
            mine: row.assignedToId === userId,
            hasIssue: today ? today.status === 'issue' : false,
            issue: today ? today.issue : null
        };
    });

    const team = inspectorIds.map((id) => ({
        name: nameById.get(id) || '-',
        done: activeRows.filter((row) => row.assignedToId === id).length,
        isMe: id === userId
    }));

    return {
        businessDate,
        totalCount: stalls.length,
        doneCount: activeRows.length,
        uninspectedCount: stalls.length - activeRows.length,
        team,
        byStall
    };
}

module.exports = {
    getInspectableStalls,
    recordInspected,
    getWalkStatus
};
