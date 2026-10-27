const prisma = require('../config/prismaClient');
const { businessDateOf } = require('./shopOpenStatus');
const { buildPreferredWalkOrder } = require('./inspectionWalkOrder');

// ใบงานเดินตรวจตลาด (ตาราง InspectionAssignment) — ให้พนักงานหลายคนเดินตรวจพร้อมกันได้โดยไม่ตรวจร้านซ้ำกัน
//
// - ทุกร้านที่จองและชำระแล้วต้องถูกตรวจทุกวันขาย (ตัดวันตี 5 เหมือน ShopOpenStatus เพราะตลาดขายเลยเที่ยงคืน)
// - กด "รับร้าน" → ตัดเส้นทางเดินตรวจ (inspectionWalkOrder) เป็นช่วงต่อเนื่องละ BATCH_SIZE ร้าน แล้วสุ่มเลือกช่วงให้
//   แต่ละคนได้ร้านคนละชุดแบบสุ่ม (ร้านค้าเดาไม่ได้ว่าใครมาตรวจเมื่อไร) แต่ในชุดยังเดินต่อกันได้ ไม่ต้องข้ามตลาดไปมา
// - กันแจกซ้ำด้วย unique (businessDate, stallId) ที่ระดับ DB — สองคนกดพร้อมกัน คนที่ insert ทีหลังจะไม่ได้แถวนั้น
// - หน้าตรวจตลาดที่เปิดอยู่ขยับ heartbeatAt ทุกครั้งที่ดึงสถานะ — ถ้าขาดเกิน STALE_MINUTES (มือถือดับ/กลับบ้าน)
//   ร้านที่ยังไม่ตรวจของคนนั้นจะกลับเข้ากองกลางให้คนอื่นรับต่อ ไม่ต้องมี cron
const BATCH_SIZE = 15;
const STALE_MINUTES = 30;

function parseStallCodes(text) {
    return String(text || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
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
        select: { id: true, stallCode: true, row: { select: { zone: { select: { code: true } } } } }
    });

    const orderIndex = new Map(buildPreferredWalkOrder().map((code, idx) => [code, idx]));
    return stalls
        .map((stall) => ({
            id: stall.id,
            stallCode: stall.stallCode,
            zoneCode: stall.row?.zone?.code || '',
            order: orderIndex.has(stall.stallCode) ? orderIndex.get(stall.stallCode) : Number.POSITIVE_INFINITY
        }))
        .sort((a, b) => (a.order - b.order) || a.stallCode.localeCompare(b.stallCode));
}

async function releaseStale(businessDate, now = new Date()) {
    await prisma.inspectionAssignment.deleteMany({
        where: {
            businessDate,
            completedAt: null,
            heartbeatAt: { lt: new Date(now.getTime() - STALE_MINUTES * 60 * 1000) }
        }
    });
}

// ขยับ heartbeat ของร้านที่ยังไม่ตรวจทั้งหมดของคนนี้ — เรียกตอนดึงสถานะ/บันทึก บอกว่ายังเดินตรวจอยู่
async function touchHeartbeat(userId, businessDate, now = new Date()) {
    await prisma.inspectionAssignment.updateMany({
        where: { businessDate, assignedToId: userId, completedAt: null },
        data: { heartbeatAt: now }
    });
}

// แจกร้านชุดใหม่ให้ userId — ถ้ายังมีร้านค้างตรวจในมืออยู่จะไม่แจกเพิ่ม (ตรวจชุดเดิมให้จบก่อน)
// zone: 'ALL' หรือรหัสโซน (สุ่มเฉพาะในโซนนั้น) — คืน { claimedCount } (0 = ไม่มีร้านเหลือให้รับ)
async function claimBatch(userId, { zone = 'ALL', size = BATCH_SIZE, now = new Date() } = {}) {
    const businessDate = businessDateOf(now);
    await releaseStale(businessDate, now);

    const pendingMine = await prisma.inspectionAssignment.count({
        where: { businessDate, assignedToId: userId, completedAt: null }
    });
    if (pendingMine > 0) return { claimedCount: 0, hasPending: true };

    const lastBatch = await prisma.inspectionAssignment.findFirst({
        where: { businessDate, assignedToId: userId },
        orderBy: { batchNo: 'desc' },
        select: { batchNo: true }
    });
    const batchNo = (lastBatch?.batchNo || 0) + 1;
    const zoneFilter = String(zone || 'ALL').toUpperCase();

    // ลองซ้ำได้ถ้าโดนคนอื่นแย่งช่วงเดียวกันไปพร้อมกันจนไม่เหลือสักร้าน
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const [stalls, taken] = await Promise.all([
            getInspectableStalls(),
            prisma.inspectionAssignment.findMany({ where: { businessDate }, select: { stallId: true } })
        ]);
        const takenIds = new Set(taken.map((row) => row.stallId));
        const pool = stalls.filter((stall) =>
            !takenIds.has(stall.id) && (zoneFilter === 'ALL' || stall.zoneCode.toUpperCase() === zoneFilter));
        if (!pool.length) return { claimedCount: 0, hasPending: false };

        const chunks = [];
        for (let i = 0; i < pool.length; i += size) chunks.push(pool.slice(i, i + size));
        const picked = shuffle(chunks)[0];

        const result = await prisma.inspectionAssignment.createMany({
            data: picked.map((stall) => ({
                businessDate,
                stallId: stall.id,
                stallCode: stall.stallCode,
                assignedToId: userId,
                batchNo,
                assignedAt: now,
                heartbeatAt: now
            })),
            skipDuplicates: true
        });
        if (result.count > 0) return { claimedCount: result.count, hasPending: false };
    }
    return { claimedCount: 0, hasPending: false };
}

// คืนร้านที่ยังไม่ตรวจของตัวเองเข้ากองกลาง (กด "เลิกตรวจ/คืนร้านที่เหลือ")
async function releaseMine(userId, now = new Date()) {
    const result = await prisma.inspectionAssignment.deleteMany({
        where: { businessDate: businessDateOf(now), assignedToId: userId, completedAt: null }
    });
    return result.count;
}

// ใช้ก่อนบันทึกผลตรวจของร้านหนึ่ง — คืน conflict ถ้าร้านนี้อยู่ในมือคนอื่นที่ยังตรวจไม่เสร็จ (force = ตั้งใจตรวจแทน)
async function checkAssignmentConflict(stallId, userId, { force = false, now = new Date() } = {}) {
    const businessDate = businessDateOf(now);
    await releaseStale(businessDate, now);
    const row = await prisma.inspectionAssignment.findUnique({
        where: { businessDate_stallId: { businessDate, stallId } }
    });
    if (!row || force || row.assignedToId === userId || row.completedAt) return null;

    const holder = await prisma.user.findUnique({ where: { id: row.assignedToId }, select: { name: true, username: true } });
    return { holderName: holder?.name || holder?.username || 'พนักงานคนอื่น' };
}

// บันทึกผลตรวจของร้านแล้ว — ร้านที่ยังไม่มีใครรับ/คนอื่นถือแต่ตั้งใจตรวจแทน จะกลายเป็นของคนบันทึกและเสร็จทันที
// complete=false (เช่น บันทึกไฟเกินกลางทาง) แค่จองร้านไว้ให้ตัวเองถ้ายังไม่มีใครรับ ไม่ปิดงาน
async function recordInspected(stall, userId, { complete = true, now = new Date() } = {}) {
    const businessDate = businessDateOf(now);
    const existing = await prisma.inspectionAssignment.findUnique({
        where: { businessDate_stallId: { businessDate, stallId: stall.id } }
    });

    if (!existing) {
        await prisma.inspectionAssignment.create({
            data: {
                businessDate,
                stallId: stall.id,
                stallCode: stall.stallCode,
                assignedToId: userId,
                batchNo: 0, // 0 = ไม่ได้มาจากการกดรับร้าน (บันทึกจากตาราง/ผังโดยตรง)
                assignedAt: now,
                heartbeatAt: now,
                completedAt: complete ? now : null
            }
        }).catch((error) => {
            // อีกคนเพิ่งรับร้านนี้ไปพร้อมกันพอดี — ผลตรวจบันทึกแล้ว ปล่อยใบงานเป็นของคนนั้น
            if (error.code !== 'P2002') throw error;
        });
    } else if (complete && (!existing.completedAt || existing.assignedToId !== userId)) {
        await prisma.inspectionAssignment.update({
            where: { id: existing.id },
            data: { assignedToId: userId, completedAt: existing.completedAt || now, heartbeatAt: now }
        });
    }
    await touchHeartbeat(userId, businessDate, now);
}

// สถานะเดินตรวจของวันขายนี้ทั้งทีม + ร้านในมือของ userId (เรียงตามเส้นทาง)
async function getWalkStatus(userId, now = new Date()) {
    const businessDate = businessDateOf(now);
    await releaseStale(businessDate, now);
    await touchHeartbeat(userId, businessDate, now);

    const [stalls, rows] = await Promise.all([
        getInspectableStalls(),
        prisma.inspectionAssignment.findMany({ where: { businessDate } })
    ]);
    const inspectableIds = new Set(stalls.map((stall) => stall.id));
    const orderById = new Map(stalls.map((stall, idx) => [stall.id, idx]));

    const holderIds = Array.from(new Set(rows.map((row) => row.assignedToId)));
    const holders = holderIds.length
        ? await prisma.user.findMany({ where: { id: { in: holderIds } }, select: { id: true, name: true, username: true } })
        : [];
    const nameById = new Map(holders.map((user) => [user.id, user.name || user.username || '-']));

    // ใบงานของร้านที่ไม่ต้องตรวจแล้ว (ล็อกถูกปล่อยระหว่างวัน) ไม่นับ
    const activeRows = rows.filter((row) => inspectableIds.has(row.stallId));
    const byStall = {};
    activeRows.forEach((row) => {
        byStall[row.stallId] = {
            stallCode: row.stallCode,
            holderId: row.assignedToId,
            holderName: nameById.get(row.assignedToId) || '-',
            done: Boolean(row.completedAt),
            mine: row.assignedToId === userId
        };
    });

    const mine = activeRows
        .filter((row) => row.assignedToId === userId && row.batchNo > 0)
        .sort((a, b) => (orderById.get(a.stallId) ?? 0) - (orderById.get(b.stallId) ?? 0))
        .map((row) => ({ stallId: row.stallId, stallCode: row.stallCode, done: Boolean(row.completedAt) }));

    const doneCount = activeRows.filter((row) => row.completedAt).length;
    const inProgressCount = activeRows.length - doneCount;
    const team = Array.from(new Set(activeRows.map((row) => row.assignedToId))).map((id) => {
        const own = activeRows.filter((row) => row.assignedToId === id);
        return {
            name: nameById.get(id) || '-',
            done: own.filter((row) => row.completedAt).length,
            total: own.length,
            isMe: id === userId
        };
    });

    return {
        businessDate,
        totalCount: stalls.length,
        doneCount,
        inProgressCount,
        unclaimedCount: stalls.length - activeRows.length,
        mine,
        team,
        byStall
    };
}

module.exports = {
    BATCH_SIZE,
    STALE_MINUTES,
    getInspectableStalls,
    claimBatch,
    releaseMine,
    checkAssignmentConflict,
    recordInspected,
    getWalkStatus
};
