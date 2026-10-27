const prisma = require('../config/prismaClient');
const rentalStatement = require('../utils/rentalStatement');
const leaseContract = require('../utils/leaseContract');
const { sendLeaseContractEmail } = require('../config/mailer');
const { shopsRelation, primaryShop, resolveShopForUser } = require('../utils/shops');

// 1 สัญญา = 1 ร้าน: ผู้ใช้ที่มีหลายร้านเลือกร้านก่อน (shopId) แล้วสัญญารวมเฉพาะแผงของร้านนั้น
// คำขอสัญญาเช่า: ร้านเลือกช่วงวันในหน้า /documents/lease-contract → ระบบสร้างร่างสัญญาจากประวัติการจองที่ชำระแล้ว
// ในช่วงนั้น (utils/leaseContract.js) → แอดมินตรวจร่างที่ /admin/lease-contracts/:id แล้วอนุมัติ (ออกเลขที่สัญญา)
// หรือไม่อนุมัติพร้อมเหตุผล → ร้านเปิด/พิมพ์สัญญาที่อนุมัติแล้วได้ที่ /lease-contracts/:id

const MAX_NOTE_LENGTH = 500;
const MAX_PERIOD_DAYS = 731;

function toView(request) {
    return {
        ...request,
        // ชื่อร้านของสัญญา — คำขอเก่าที่ยังไม่มี shopId ใช้ร้านหลักของผู้ใช้
        shopName: request.shop?.shopName || primaryShop(request.user)?.shopName || null,
        statusLabel: leaseContract.STATUS_LABEL[request.status] || request.status,
        periodText: leaseContract.periodText(request),
        createdAtText: rentalStatement.formatThaiDate(request.createdAt),
        issuedAtText: request.issuedAt ? rentalStatement.formatThaiDate(request.issuedAt) : null
    };
}

// ---------- ฝั่งร้านค้า ----------

async function getLeaseRequestsForUser(userId) {
    const requests = await prisma.leaseContractRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { shop: { select: { shopName: true } }, user: { select: { shops: shopsRelation({ select: { shopName: true } }) } } }
    });
    return requests.map(toView);
}

// คืน error code หรือ null — routes/sellerRoute.js POST /lease-contracts
async function createLeaseRequest(userId, body) {
    const periodStart = rentalStatement.parseDateKey(body.periodStart);
    const periodEnd = rentalStatement.parseDateKey(body.periodEnd);
    if (!periodStart || !periodEnd || periodStart > periodEnd) return 'invalid_period';
    if ((periodEnd - periodStart) / 86400000 + 1 > MAX_PERIOD_DAYS) return 'period_too_long';
    const note = String(body.note || '').trim();
    if (note.length > MAX_NOTE_LENGTH) return 'note_too_long';

    // ร้านที่ขอสัญญา (ต้องเป็นร้านของผู้ใช้ ไม่ส่งมา = ร้านหลัก)
    const shop = await resolveShopForUser(userId, body.shopId, { select: { id: true } });
    if (!shop) return 'shop_not_found';

    // สัญญาสร้างจากการเช่าที่ชำระแล้วของร้านนี้เท่านั้น — ช่วงที่ไม่มีเลยไม่มีอะไรให้ทำสัญญา
    if (!(await leaseContract.countPaidRowsInPeriod(userId, periodStart, periodEnd, shop.id))) return 'no_paid_rentals';

    // กันกดส่งซ้ำ: ร้านเดียวกันมีคำขอที่ยังรอแอดมินและช่วงทับกันอยู่แล้ว (ร้านอื่นของผู้ใช้ขอช่วงเดียวกันได้)
    // คำขอเก่าที่ยังไม่มี shopId นับเป็นร้านหลัก
    const primary = await resolveShopForUser(userId, null, { select: { id: true } });
    const overlap = await prisma.leaseContractRequest.findFirst({
        where: {
            userId,
            status: 'PENDING',
            periodStart: { lte: periodEnd },
            periodEnd: { gte: periodStart },
            OR: [{ shopId: shop.id }, ...(primary?.id === shop.id ? [{ shopId: null }] : [])]
        }
    });
    if (overlap) return 'duplicate_pending';

    await prisma.leaseContractRequest.create({ data: { userId, shopId: shop.id, periodStart, periodEnd, note: note || null } });
    return null;
}

// การ์ดแจ้งเตือนในกระดิ่งร้านค้า — แจ้งเมื่ออนุมัติ/ไม่อนุมัติ (ตอน PENDING ยังไม่มีความคืบหน้าให้แจ้ง)
function buildLeaseContractNotifications(requests, formatDate, formatTime) {
    return (requests || [])
        .filter((request) => request.status === 'ISSUED' || request.status === 'CANCELLED')
        .map((request) => {
            const isIssued = request.status === 'ISSUED';
            const when = request.issuedAt || request.createdAt;
            const period = leaseContract.periodText(request);
            return {
                id: `lease-contract-${request.id}-${request.status}`,
                type: isIssued ? 'lease-contract-issued' : 'lease-contract-cancelled',
                title: isIssued ? 'สัญญาเช่าได้รับการอนุมัติแล้ว' : 'คำขอสัญญาเช่าไม่ได้รับการอนุมัติ',
                desc: isIssued
                    ? `สัญญาเช่าเลขที่ ${request.documentNumber} ช่วง ${period} พร้อมให้ดูและพิมพ์แล้ว${request.adminNote ? ` — ${request.adminNote}` : ''}`
                    : `คำขอสัญญาเช่าช่วง ${period} ไม่ได้รับการอนุมัติ${request.adminNote ? ` เหตุผล: ${request.adminNote}` : ''}`,
                date: formatDate(when),
                time: formatTime(when),
                at: when ? new Date(when).toISOString() : null,
                status: isIssued ? 'SUCCESS' : 'REJECTED',
                isRead: false,
                isNew: true,
                link: isIssued ? `/lease-contracts/${request.id}` : '/documents/lease-contract',
                linkLabel: isIssued ? 'ดูสัญญาเช่า' : 'ขอใหม่',
                linkIcon: isIssued ? 'bi-file-earmark-text' : 'bi-file-earmark-plus'
            };
        });
}

// สัญญาที่อนุมัติแล้วของร้านตัวเอง (หน้าเอกสารสำหรับพิมพ์)
async function getSellerDocument(req, res) {
    const id = Number.parseInt(req.params.id, 10);
    const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
    if (!request || request.userId !== req.user.id || request.status !== 'ISSUED') {
        return res.redirect('/documents/lease-contract?leaseError=not_found');
    }
    try {
        const contract = await leaseContract.buildLeaseContractData(request);
        if (!contract) return res.redirect('/documents/lease-contract?leaseError=not_found');
        return res.render('seller/leaseContract', { user: req.user, contract });
    } catch (error) {
        console.error('lease contract document error', error);
        return res.redirect('/documents/lease-contract?leaseError=action_failed');
    }
}

// ---------- ฝั่งแอดมิน ----------

async function countPendingLeaseContracts() {
    return prisma.leaseContractRequest.count({ where: { status: 'PENDING' } });
}

async function getAdminListPage(req, res) {
    try {
        const tab = ['PENDING', 'ISSUED', 'CANCELLED'].includes(req.query.tab) ? req.query.tab : 'PENDING';
        const [requests, grouped] = await Promise.all([
            prisma.leaseContractRequest.findMany({
                where: { status: tab },
                orderBy: { createdAt: tab === 'PENDING' ? 'asc' : 'desc' },
                include: {
                    shop: { select: { shopName: true } },
                    user: { select: { id: true, name: true, phoneNumber: true, shops: shopsRelation({ select: { shopName: true } }) } }
                }
            }),
            prisma.leaseContractRequest.groupBy({ by: ['status'], _count: { _all: true } })
        ]);
        const counts = { PENDING: 0, ISSUED: 0, CANCELLED: 0 };
        grouped.forEach((g) => { counts[g.status] = g._count._all; });
        return res.render('admin/leaseContracts', {
            user: req.user,
            tab,
            counts,
            rows: requests.map(toView),
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('lease contract list error', error);
        return res.redirect('/admin/documents');
    }
}

// ตรวจร่าง/ดูสัญญา + ปุ่มอนุมัติ/ไม่อนุมัติ (สัญญาแสดงในรูปแบบเดียวกับที่ร้านจะพิมพ์)
async function getAdminDetailPage(req, res) {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
        if (!request) return res.redirect('/admin/lease-contracts?error=not_found');
        const contract = await leaseContract.buildLeaseContractData(request);
        if (!contract) return res.redirect('/admin/lease-contracts?error=not_found');
        return res.render('admin/leaseContractDetail', {
            user: req.user,
            request: toView(request),
            contract,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('lease contract detail error', error);
        return res.redirect('/admin/lease-contracts?error=action_failed');
    }
}

async function notifySeller(req, request, lines, subject, path) {
    req.app.locals.clearSellerNotificationCache?.(request.userId);
    try {
        const owner = await prisma.user.findUnique({ where: { id: request.userId }, select: { email: true } });
        if (owner?.email) {
            const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
            await sendLeaseContractEmail(owner.email, { subject, lines, link: `${baseUrl}${path}` });
        }
    } catch (error) {
        console.error('lease contract email error', error.message);
    }
}

async function issue(req, res) {
    const id = Number.parseInt(req.params.id, 10);
    const back = (query) => res.redirect(`/admin/lease-contracts/${id}?${query}`);
    try {
        const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
        if (!request) return res.redirect('/admin/lease-contracts?error=not_found');
        if (request.status !== 'PENDING') return back('error=not_pending');
        // ตรวจซ้ำตอนอนุมัติ — ร่างต้องมีการเช่าที่ชำระแล้วอย่างน้อย 1 รายการ
        const shopId = await leaseContract.contractShopId(request);
        if (!(await leaseContract.countPaidRowsInPeriod(request.userId, request.periodStart, request.periodEnd, shopId))) {
            return back('error=no_paid_rentals');
        }
        const issuedAt = new Date();
        const documentNumber = leaseContract.buildLeaseDocumentNumber(request, issuedAt);
        const adminNote = String(req.body.adminNote || '').trim().slice(0, MAX_NOTE_LENGTH) || null;
        // updateMany + เงื่อนไข PENDING กันแอดมินสองคนกดอนุมัติ/ไม่อนุมัติพร้อมกัน
        const updated = await prisma.leaseContractRequest.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: 'ISSUED', documentNumber, issuedAt, issuedByName: req.user?.name || null, adminNote }
        });
        if (!updated.count) return back('error=not_pending');

        await notifySeller(req, request, [
            `สัญญาเช่าเลขที่ ${documentNumber} ช่วง ${leaseContract.periodText(request)} ได้รับการอนุมัติแล้ว เปิดดูและพิมพ์ได้ในระบบ`,
            ...(adminNote ? [`ข้อความจากแอดมิน: ${adminNote}`] : [])
        ], 'สัญญาเช่าได้รับการอนุมัติแล้ว — Kangsadan Night Market', `/lease-contracts/${id}`);
        return back('success=issued');
    } catch (error) {
        console.error('lease contract issue error', error);
        return back('error=action_failed');
    }
}

async function cancel(req, res) {
    const id = Number.parseInt(req.params.id, 10);
    try {
        const reason = String(req.body.reason || '').trim().slice(0, MAX_NOTE_LENGTH);
        if (!reason) return res.redirect(`/admin/lease-contracts/${id}?error=missing_reason`);
        const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
        if (!request) return res.redirect('/admin/lease-contracts?error=not_found');
        const updated = await prisma.leaseContractRequest.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: 'CANCELLED', adminNote: reason }
        });
        if (!updated.count) return res.redirect(`/admin/lease-contracts/${id}?error=not_pending`);

        await notifySeller(req, request, [
            `คำขอสัญญาเช่าช่วง ${leaseContract.periodText(request)} ไม่ได้รับการอนุมัติ`,
            `เหตุผล: ${reason}`
        ], 'คำขอสัญญาเช่าไม่ได้รับการอนุมัติ — Kangsadan Night Market', '/documents/lease-contract');
        return res.redirect('/admin/lease-contracts?tab=CANCELLED&success=cancelled');
    } catch (error) {
        console.error('lease contract cancel error', error);
        return res.redirect(`/admin/lease-contracts/${id}?error=action_failed`);
    }
}

module.exports = {
    getLeaseRequestsForUser,
    createLeaseRequest,
    buildLeaseContractNotifications,
    getSellerDocument,
    countPendingLeaseContracts,
    getAdminListPage,
    getAdminDetailPage,
    issue,
    cancel
};
