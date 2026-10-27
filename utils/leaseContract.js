const rentalStatement = require('./rentalStatement');
const { bahtText } = require('./bahtText');
const { buildClauses } = require('./leaseContractTemplate');
const { COMPANY_INFO } = require('../controllers/quotationController');
const { getPrimaryShop } = require('./shops');

// สร้างข้อมูลสัญญาเช่าจากประวัติการจองที่ชำระแล้วของร้าน ในช่วงวันที่ร้านขอ (LeaseContractRequest)
// 1 สัญญา = 1 ร้าน (shopId) รวมทุกแผงของร้านนั้น — ผู้ใช้ที่มีหลายร้านขอแยกฉบับต่อร้าน
// คำขอเก่าที่ยังไม่มี shopId = ร้านหลักของผู้ใช้ (loadStatementRows นับคำขอจองเก่าเป็นร้านหลักเหมือนกัน)
// ไม่เก็บเนื้อหาสัญญาไว้ใน DB — สร้างสดทุกครั้ง แต่หลังอนุมัติแล้วนับเฉพาะคำขอที่ชำระก่อนเวลาอนุมัติ (issuedAt)
// สัญญาที่ออกไปแล้วจึงไม่เปลี่ยนตามการจองที่เกิดขึ้นทีหลัง

const STATUS_LABEL = { PENDING: 'รอแอดมินอนุมัติ', ISSUED: 'อนุมัติแล้ว', CANCELLED: 'ไม่อนุมัติ' };

function buildLeaseDocumentNumber(request, issuedAt) {
    const d = new Date(issuedAt || new Date());
    return `L${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}/${String(request.id).padStart(5, '0')}`;
}

function thaiLongDate(dateValue) {
    if (!dateValue) return '-';
    return new Date(dateValue).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

function periodText(request) {
    return `${rentalStatement.formatThaiDate(request.periodStart)} – ${rentalStatement.formatThaiDate(request.periodEnd)}`;
}

function rangeOf(request) {
    return rentalStatement.parseStatementRange({
        from: rentalStatement.toDateKey(request.periodStart),
        to: rentalStatement.toDateKey(request.periodEnd)
    });
}

async function contractShopId(request) {
    if (request.shopId) return request.shopId;
    const primary = await getPrimaryShop(request.userId, { select: { id: true } });
    return primary?.id || null;
}

// แถวที่ชำระแล้วของร้านนี้ในช่วงสัญญา (หลังอนุมัติ = เฉพาะที่ชำระก่อน issuedAt)
async function loadContractRows(request, shopId) {
    const rows = await rentalStatement.loadStatementRows({ userId: request.userId, shopId, range: rangeOf(request) });
    const cutoff = request.status === 'ISSUED' && request.issuedAt ? new Date(request.issuedAt) : null;
    return rows.filter((row) => row.status === 'PAID' && (!cutoff || !row.paidAt || new Date(row.paidAt) <= cutoff));
}

async function buildLeaseContractData(request) {
    const shopId = await contractShopId(request);
    const [seller, rows] = await Promise.all([rentalStatement.loadSellerInfo(request.userId, shopId), loadContractRows(request, shopId)]);
    if (!seller) return null;
    const totals = rentalStatement.summarizeRows(rows);
    const byStall = rentalStatement.groupByStall(rows);
    const isIssued = request.status === 'ISSUED';
    const ctx = {
        marketName: 'กังสดาลไนท์',
        stallCount: byStall.length,
        stallCodesText: byStall.map((s) => s.stallCode).join(', ') || '-',
        productType: seller.productType === 'FOOD' ? 'อาหาร' : (seller.productType === 'FASHION' ? 'แฟชั่น' : seller.productType),
        shopName: seller.shopName,
        periodStartText: thaiLongDate(request.periodStart),
        periodEndText: thaiLongDate(request.periodEnd),
        billableDays: rows.reduce((sum, row) => sum + row.billableDays, 0),
        rounds: totals.rounds,
        paidTotalText: rentalStatement.formatBaht(totals.paid),
        paidTotalBahtText: bahtText(totals.paid)
    };
    return {
        id: request.id,
        status: request.status,
        statusLabel: STATUS_LABEL[request.status] || request.status,
        isDraft: !isIssued,
        documentNumber: isIssued ? request.documentNumber : 'ร่าง (ยังไม่อนุมัติ)',
        issuedDateText: isIssued ? thaiLongDate(request.issuedAt) : thaiLongDate(new Date()),
        issuedByName: request.issuedByName || '-',
        adminNote: request.adminNote || null,
        periodText: periodText(request),
        company: COMPANY_INFO,
        seller,
        rows,
        byStall,
        totals,
        clauses: buildClauses(ctx),
        shopId,
        ownerUserId: request.userId
    };
}

// ร้านมีการเช่าที่ชำระแล้วในช่วงนี้ไหม — ใช้ตรวจตอนร้านกดขอ (ช่วงที่ไม่มีอะไรเลยออกสัญญาไม่ได้)
async function countPaidRowsInPeriod(userId, periodStart, periodEnd, shopId = null) {
    const rows = await rentalStatement.loadStatementRows({
        userId,
        shopId,
        range: rentalStatement.parseStatementRange({ from: rentalStatement.toDateKey(periodStart), to: rentalStatement.toDateKey(periodEnd) })
    });
    return rows.filter((row) => row.status === 'PAID').length;
}

// วันแรก/วันสุดท้ายที่ร้านมีการเช่าที่ชำระแล้ว (ปีนี้ถึงวันนี้) — ใช้เป็นค่าเริ่มต้นของปฏิทินตอนขอสัญญา
async function getPaidSpan(userId, shopId = null) {
    const range = rentalStatement.parseStatementRange({});
    const rows = (await rentalStatement.loadStatementRows({ userId, shopId, range })).filter((row) => row.status === 'PAID' && row.rentalStartDate);
    if (!rows.length) return null;
    const starts = rows.map((row) => new Date(row.rentalStartDate).getTime());
    const ends = rows.map((row) => new Date(row.rentalEndDate || row.rentalStartDate).getTime());
    return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)), count: rows.length };
}

module.exports = {
    STATUS_LABEL,
    buildLeaseDocumentNumber,
    buildLeaseContractData,
    contractShopId,
    countPaidRowsInPeriod,
    getPaidSpan,
    periodText
};
