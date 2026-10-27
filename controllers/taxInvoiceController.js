const prisma = require('../config/prismaClient');
const { buildQuotationData } = require('./quotationController');
const { validateNewTaxProfile } = require('../utils/taxProfileValidation');
const { bahtText } = require('../utils/bahtText');
const rentalStatement = require('../utils/rentalStatement');

// สถานะที่ถือว่า "ยังจับจองอยู่" กับใบเสนอราคานั้น ไม่ให้ถูกเลือกไปผูกกับคำขออื่นซ้ำ
const ACTIVE_TAX_INVOICE_STATUSES = ['PENDING', 'ISSUED'];

function buildTaxInvoiceNumber(requestId, issuedAt) {
    const date = issuedAt ? new Date(issuedAt) : new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `T${yyyy}${mm}/${String(requestId).padStart(5, '0')}`;
}

// ทุกช่วงเวลา — ขอใบกำกับภาษีย้อนหลังได้ทุกใบที่ชำระแล้ว ไม่จำกัดรอบ
const ALL_TIME_RANGE = { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) };

// ใบเสร็จ/ใบเสนอราคา (BookingRequest ที่ชำระแล้ว) ของ user ที่ "ขอใบกำกับภาษีได้" — ยังไม่ถูกผูกกับ
// คำขอที่ยัง PENDING/ISSUED อยู่ (คำขอที่ถูกยกเลิกแล้วไม่นับ ปลดล็อกให้เลือกใหม่ได้)
// ดึงเป็น batch จาก utils/rentalStatement.js (ยอดเท่ากับ netTotal ของใบเสนอราคา) แต่ละรายการบอกร้าน แผง รอบ ช่วงเช่า
// ให้ผู้ใช้ที่มีหลายร้านจัดกลุ่มตามร้านได้ — ใบกำกับภาษี 1 ใบรวมใบเสร็จข้ามร้านได้ถ้าออกในนามเดียวกัน
async function getEligibleQuotationsForUser(userId) {
    const rows = (await rentalStatement.loadStatementRows({ userId, range: ALL_TIME_RANGE }))
        .filter((row) => row.status === 'PAID');
    if (!rows.length) return [];

    const linkedItems = await prisma.taxInvoiceRequestItem.findMany({
        where: {
            bookingRequestId: { in: rows.map((row) => row.requestId) },
            taxInvoiceRequest: { status: { in: ACTIVE_TAX_INVOICE_STATUSES } }
        },
        select: { bookingRequestId: true }
    });
    const linkedIds = new Set(linkedItems.map((item) => item.bookingRequestId));

    return rows
        .filter((row) => !linkedIds.has(row.requestId))
        .sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0) || b.requestId - a.requestId)
        .map((row) => ({
            id: row.requestId,
            quotationNumber: row.receiptNumber,
            issuedDateLabel: row.paidAtText,
            netTotal: row.grandTotal,
            shopId: row.shopId,
            shopName: row.shopName,
            stallCodes: row.stallCodes,
            zone: row.zone,
            roundNumber: row.roundNumber,
            rentalPeriodText: `${row.rentalStartText} – ${row.rentalEndText}`,
            isExtension: row.isExtension
        }));
}

// จัดกลุ่มใบเสร็จที่ขอได้ตามร้าน (หน้า /documents/tax-invoice) — เรียงตามชื่อร้าน
function groupEligibleByShop(eligible) {
    const groups = new Map();
    (eligible || []).forEach((q) => {
        const key = q.shopId || `name:${q.shopName}`;
        if (!groups.has(key)) groups.set(key, { shopId: q.shopId, shopName: q.shopName, items: [], total: 0 });
        const group = groups.get(key);
        group.items.push(q);
        group.total += Number(q.netTotal) || 0;
    });
    return Array.from(groups.values()).sort((a, b) => String(a.shopName).localeCompare(String(b.shopName), 'th'));
}

async function createTaxInvoiceRequest({ requestedByUserId, bookingRequestIds, taxInvoiceProfileId, newProfileData }) {
    const parsedIds = (bookingRequestIds || [])
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0);
    if (!parsedIds.length) {
        return { error: 'missing_booking_requests' };
    }

    const eligible = await getEligibleQuotationsForUser(requestedByUserId);
    const eligibleIds = new Set(eligible.map((row) => row.id));
    const invalidIds = parsedIds.filter((id) => !eligibleIds.has(id));
    if (invalidIds.length) {
        return { error: 'booking_request_not_eligible' };
    }

    let profileId = Number.parseInt(taxInvoiceProfileId, 10);
    if (!Number.isInteger(profileId) || profileId <= 0) {
        if (!newProfileData) return { error: 'missing_profile_data' };
        const checked = validateNewTaxProfile(newProfileData);
        if (checked.error) return { error: checked.error };
        const createdProfile = await prisma.taxInvoiceProfile.create({
            data: { userId: requestedByUserId, ...checked.value }
        });
        profileId = createdProfile.id;
    } else {
        const profile = await prisma.taxInvoiceProfile.findUnique({ where: { id: profileId } });
        if (!profile || profile.userId !== requestedByUserId) {
            return { error: 'profile_not_found' };
        }
    }

    const created = await prisma.taxInvoiceRequest.create({
        data: {
            taxInvoiceProfileId: profileId,
            requestedByUserId,
            items: { create: parsedIds.map((bookingRequestId) => ({ bookingRequestId })) }
        }
    });

    return { taxInvoiceRequestId: created.id };
}

// รวมยอด/รายการจากทุกใบเสนอราคาที่ผูกกับคำขอนี้ ให้เป็นเอกสารใบกำกับภาษีใบเดียว
// คืนค่าเฉพาะสถานะ ISSUED เท่านั้น (เหมือน buildQuotationData ที่ gate ที่ SUCCESS) กัน seller/แอดมิน
// เปิดดูเอกสารที่ยังไม่ยืนยันออกจริง
async function buildTaxInvoiceData(taxInvoiceRequestId, options = {}) {
    const parsedId = Number.parseInt(taxInvoiceRequestId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return null;

    const taxRequest = await prisma.taxInvoiceRequest.findUnique({
        where: { id: parsedId },
        include: { taxInvoiceProfile: true, items: true, replaces: true, replacedBy: true }
    });
    if (!taxRequest) return null;
    if (!options.allowAnyStatus && taxRequest.status !== 'ISSUED') return null;

    const quotations = (await Promise.all(
        taxRequest.items.map((item) => buildQuotationData(item.bookingRequestId, taxRequest.issuedByName, { perStall: true }))
    )).filter(Boolean);
    if (!quotations.length) return null;

    // รายการบอกแผงอยู่แล้ว (perStall) — ใบที่รวมหลายร้านให้ขึ้นต้นด้วยชื่อร้านด้วย จะได้แยกได้ว่าแผงไหนของร้านไหน
    const shopNames = Array.from(new Set(quotations.map((quotation) => quotation.shopName).filter(Boolean)));
    const items = quotations.flatMap((quotation) => quotation.items.map((item) => (
        shopNames.length > 1 && quotation.shopName ? { ...item, name: `${quotation.shopName} · ${item.name}` } : item
    )));
    const amountBeforeVat = quotations.reduce((sum, q) => sum + q.amountBeforeVat, 0);
    const vatAmount = quotations.reduce((sum, q) => sum + q.vatAmount, 0);
    const netTotal = quotations.reduce((sum, q) => sum + q.netTotal, 0);
    const totalBeforeDiscount = quotations.reduce((sum, q) => sum + q.totalBeforeDiscount, 0);
    const discount = quotations.reduce((sum, q) => sum + (q.discount || 0), 0);

    return {
        company: quotations[0].company,
        documentNumber: taxRequest.documentNumber || '-',
        issuedDateLabel: taxRequest.issuedAt
            ? new Date(taxRequest.issuedAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', calendar: 'gregory' })
            : '-',
        issuedTimeLabel: taxRequest.issuedAt
            ? new Date(taxRequest.issuedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
            : '-',
        printedByName: taxRequest.issuedByName || '-',
        taxpayerType: taxRequest.taxInvoiceProfile.taxpayerType,
        taxpayerName: taxRequest.taxInvoiceProfile.taxpayerName,
        taxId: taxRequest.taxInvoiceProfile.taxId,
        branch: taxRequest.taxInvoiceProfile.branch || '-',
        address: taxRequest.taxInvoiceProfile.address,
        phoneNumber: taxRequest.taxInvoiceProfile.phoneNumber || '-',
        items,
        shopNames,
        totalBeforeDiscount,
        discount,
        amountBeforeVat,
        vatAmount,
        vatRate: quotations[0].vatRate,
        netTotal,
        netTotalText: bahtText(netTotal),
        status: taxRequest.status,
        rejectReason: taxRequest.rejectReason || null,
        replacesDocumentNumber: taxRequest.replaces?.documentNumber || null,
        replacedByDocumentNumber: taxRequest.replacedBy?.documentNumber || null,
        requestId: taxRequest.id,
        ownerUserId: taxRequest.requestedByUserId
    };
}

// คำขอ + โปรไฟล์ผู้เสียภาษีปัจจุบัน สำหรับหน้ากรอกข้อมูล/ออกใบกำกับภาษีของแอดมิน (รับได้ทั้ง PENDING และ ISSUED
// เพราะหน้า "ยกเลิก & ออกใหม่" ก็ใช้ฟอร์มเดียวกันนี้ prefill ข้อมูลเดิมให้แก้)
async function getTaxInvoiceRequestForFulfill(taxInvoiceRequestId) {
    const parsedId = Number.parseInt(taxInvoiceRequestId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return null;

    const taxRequest = await prisma.taxInvoiceRequest.findUnique({
        where: { id: parsedId },
        include: { taxInvoiceProfile: true, items: true }
    });
    if (!taxRequest || taxRequest.status === 'CANCELLED') return null;

    const quotations = (await Promise.all(
        taxRequest.items.map((item) => buildQuotationData(item.bookingRequestId, null))
    )).filter(Boolean);
    const netTotal = quotations.reduce((sum, q) => sum + q.netTotal, 0);

    return {
        id: taxRequest.id,
        status: taxRequest.status,
        statusLabel: STATUS_LABEL[taxRequest.status] || taxRequest.status,
        profile: taxRequest.taxInvoiceProfile,
        quotationCount: quotations.length,
        netTotal
    };
}

async function issueTaxInvoiceRequest({ taxInvoiceRequestId, issuedByName, profileEdits }) {
    const parsedId = Number.parseInt(taxInvoiceRequestId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return { error: 'missing_request_id' };

    const taxRequest = await prisma.taxInvoiceRequest.findUnique({ where: { id: parsedId } });
    if (!taxRequest) return { error: 'request_not_found' };
    if (taxRequest.status !== 'PENDING') return { error: 'invalid_state_transition' };

    if (!profileEdits || !profileEdits.taxpayerName || !profileEdits.taxId || !profileEdits.address) {
        return { error: 'missing_profile_data' };
    }

    await prisma.taxInvoiceProfile.update({
        where: { id: taxRequest.taxInvoiceProfileId },
        data: {
            taxpayerType: profileEdits.taxpayerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY',
            taxpayerName: String(profileEdits.taxpayerName).trim(),
            taxId: String(profileEdits.taxId).trim(),
            branch: profileEdits.branch ? String(profileEdits.branch).trim() : null,
            address: String(profileEdits.address).trim(),
            phoneNumber: profileEdits.phoneNumber ? String(profileEdits.phoneNumber).trim() : null
        }
    });

    const issuedAt = new Date();
    await prisma.taxInvoiceRequest.update({
        where: { id: parsedId },
        data: {
            status: 'ISSUED',
            documentNumber: buildTaxInvoiceNumber(parsedId, issuedAt),
            issuedAt,
            issuedByName: issuedByName || null
        }
    });

    return { taxInvoiceRequestId: parsedId };
}

async function cancelTaxInvoiceRequest({ taxInvoiceRequestId, reason }) {
    const parsedId = Number.parseInt(taxInvoiceRequestId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return { error: 'missing_request_id' };

    const taxRequest = await prisma.taxInvoiceRequest.findUnique({ where: { id: parsedId } });
    if (!taxRequest) return { error: 'request_not_found' };
    if (taxRequest.status === 'CANCELLED') return { error: 'already_cancelled' };

    await prisma.taxInvoiceRequest.update({
        where: { id: parsedId },
        data: { status: 'CANCELLED', rejectReason: reason ? String(reason).trim() : null }
    });

    return { taxInvoiceRequestId: parsedId };
}

// ยกเลิกเอกสารที่ ISSUED ไปแล้ว (ข้อมูลผิด) แล้วออกใบใหม่แทนที่ทันทีด้วยข้อมูลที่แก้แล้ว — ผูกกับใบเสนอราคาชุดเดิม
// เก็บใบเดิมไว้เป็นประวัติ (CANCELLED) พร้อม replacesRequestId ชี้กลับ ไล่สายย้อนหลังได้เพื่อการตรวจสอบภาษี
async function reissueTaxInvoiceRequest({ taxInvoiceRequestId, issuedByName, profileEdits }) {
    const parsedId = Number.parseInt(taxInvoiceRequestId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return { error: 'missing_request_id' };

    const taxRequest = await prisma.taxInvoiceRequest.findUnique({
        where: { id: parsedId },
        include: { items: true }
    });
    if (!taxRequest) return { error: 'request_not_found' };
    if (taxRequest.status !== 'ISSUED') return { error: 'invalid_state_transition' };

    if (!profileEdits || !profileEdits.taxpayerName || !profileEdits.taxId || !profileEdits.address) {
        return { error: 'missing_profile_data' };
    }

    const correctedProfile = await prisma.taxInvoiceProfile.create({
        data: {
            userId: taxRequest.requestedByUserId,
            taxpayerType: profileEdits.taxpayerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY',
            taxpayerName: String(profileEdits.taxpayerName).trim(),
            taxId: String(profileEdits.taxId).trim(),
            branch: profileEdits.branch ? String(profileEdits.branch).trim() : null,
            address: String(profileEdits.address).trim(),
            phoneNumber: profileEdits.phoneNumber ? String(profileEdits.phoneNumber).trim() : null
        }
    });

    await prisma.taxInvoiceRequest.update({
        where: { id: parsedId },
        data: { status: 'CANCELLED', rejectReason: 'ยกเลิกเพื่อออกใบกำกับภาษีใหม่ (แก้ไขข้อมูลผู้เสียภาษี)' }
    });

    const issuedAt = new Date();
    const reissued = await prisma.taxInvoiceRequest.create({
        data: {
            taxInvoiceProfileId: correctedProfile.id,
            requestedByUserId: taxRequest.requestedByUserId,
            status: 'ISSUED',
            issuedAt,
            issuedByName: issuedByName || null,
            replacesRequestId: parsedId,
            items: { create: taxRequest.items.map((item) => ({ bookingRequestId: item.bookingRequestId })) }
        }
    });

    await prisma.taxInvoiceRequest.update({
        where: { id: reissued.id },
        data: { documentNumber: buildTaxInvoiceNumber(reissued.id, issuedAt) }
    });

    return { taxInvoiceRequestId: reissued.id };
}

function getTaxInvoiceProfilesForUser(userId) {
    return prisma.taxInvoiceProfile.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
}

const STATUS_LABEL = { PENDING: 'รอแอดมินดำเนินการ', ISSUED: 'ออกใบกำกับภาษีแล้ว', CANCELLED: 'ยกเลิกแล้ว' };

// แถวสรุปสำหรับหน้า list (ทั้งฝั่ง seller และแอดมิน) — รวมยอดเงิน/จำนวนใบเสนอราคาที่ผูกไว้ให้เห็นคร่าวๆ
// โดยไม่ต้องโหลดเอกสารเต็ม (buildTaxInvoiceData) ซึ่ง gate เฉพาะ ISSUED เท่านั้น
async function buildTaxInvoiceListRows(where) {
    const requests = await prisma.taxInvoiceRequest.findMany({
        where,
        include: { taxInvoiceProfile: true, requestedBy: true, items: true },
        orderBy: { requestedAt: 'desc' }
    });

    return Promise.all(requests.map(async (request) => {
        const quotations = (await Promise.all(
            request.items.map((item) => buildQuotationData(item.bookingRequestId, null))
        )).filter(Boolean);
        const netTotal = quotations.reduce((sum, q) => sum + q.netTotal, 0);

        return {
            id: request.id,
            shopNames: Array.from(new Set(quotations.map((q) => q.shopName).filter(Boolean))),
            status: request.status,
            statusLabel: STATUS_LABEL[request.status] || request.status,
            requestedAt: request.requestedAt,
            requestedByName: request.requestedBy?.name || '-',
            taxpayerName: request.taxInvoiceProfile?.taxpayerName || '-',
            taxId: request.taxInvoiceProfile?.taxId || '-',
            documentNumber: request.documentNumber || null,
            rejectReason: request.rejectReason || null,
            quotationCount: quotations.length,
            netTotal,
            replacesRequestId: request.replacesRequestId,
            ownerUserId: request.requestedByUserId
        };
    }));
}

module.exports = {
    buildTaxInvoiceNumber,
    getEligibleQuotationsForUser,
    groupEligibleByShop,
    getTaxInvoiceProfilesForUser,
    createTaxInvoiceRequest,
    buildTaxInvoiceData,
    buildTaxInvoiceListRows,
    getTaxInvoiceRequestForFulfill,
    issueTaxInvoiceRequest,
    cancelTaxInvoiceRequest,
    reissueTaxInvoiceRequest
};
