const path = require('path');
const multer = require('multer');
const prisma = require('../config/prismaClient');
const { createImageStorage, deleteImage, readStoredFile } = require('../utils/imageStorage');
const rentalStatement = require('../utils/rentalStatement');
const { sendLeaseContractEmail } = require('../config/mailer');

// คำขอสัญญาเช่า: ร้านกดขอในหน้า /rental-statement (เลือกช่วงเดือน) → แอดมินเปิดหน้ารายละเอียดดูข้อมูลผู้เช่า
// + ล็อก/ยอดชำระในช่วงที่ขอ (อ่านอย่างเดียว) แล้วเขียนสัญญาเองนอกระบบ → แนบไฟล์ PDF/รูปกลับให้ร้านดาวน์โหลด
// ระบบไม่ได้สร้างตัวสัญญาให้ (แอดมินเลือกเขียนเอง)

const STATUS_LABEL = { PENDING: 'รอแอดมินดำเนินการ', ISSUED: 'ออกสัญญาแล้ว', CANCELLED: 'ยกเลิก' };
const MAX_NOTE_LENGTH = 500;
const MAX_PERIOD_MONTHS = 24;

const contractUpload = multer({
    storage: createImageStorage({ folder: 'lease-contracts', prefix: 'lease' }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed = /pdf|jpeg|jpg|png|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) return cb(null, true);
        return cb(new Error('invalid_file_type'));
    }
});

// "YYYY-MM" → วันแรก/วันสุดท้ายของเดือน
function parseMonth(text, endOfMonth) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(text || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return null;
    return endOfMonth ? new Date(year, month + 1, 0) : new Date(year, month, 1);
}

function toMonthKey(dateValue) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriod(start, end) {
    const opts = { month: 'short', year: 'numeric' };
    const a = new Date(start).toLocaleDateString('th-TH', opts);
    const b = new Date(end).toLocaleDateString('th-TH', opts);
    return a === b ? a : `${a} – ${b}`;
}

function isPdf(url) {
    return /\.pdf($|\?)/i.test(String(url || ''));
}

function toView(request) {
    return {
        ...request,
        statusLabel: STATUS_LABEL[request.status] || request.status,
        periodText: formatPeriod(request.periodStart, request.periodEnd),
        createdAtText: rentalStatement.formatThaiDate(request.createdAt),
        issuedAtText: request.issuedAt ? rentalStatement.formatThaiDate(request.issuedAt) : null,
        fileIsPdf: isPdf(request.contractFileUrl),
        // ช่วงรายงานการเช่าที่ตรงกับช่วงที่ขอ (ลิงก์ไปหน้ารายงาน)
        rangeQuery: `from=${rentalStatement.toDateKey(request.periodStart)}&to=${rentalStatement.toDateKey(request.periodEnd)}`
    };
}

// ---------- ฝั่งร้านค้า ----------

async function getLeaseRequestsForUser(userId) {
    const requests = await prisma.leaseContractRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return requests.map(toView);
}

// คืน error code หรือ null — routes/sellerRoute.js POST /lease-contracts
async function createLeaseRequest(userId, body) {
    const periodStart = parseMonth(body.periodStart, false);
    const periodEnd = parseMonth(body.periodEnd, true);
    if (!periodStart || !periodEnd) return 'invalid_period';
    if (periodStart > periodEnd) return 'invalid_period';
    const months = (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 + periodEnd.getMonth() - periodStart.getMonth() + 1;
    if (months > MAX_PERIOD_MONTHS) return 'period_too_long';
    const note = String(body.note || '').trim();
    if (note.length > MAX_NOTE_LENGTH) return 'note_too_long';

    // กันกดส่งซ้ำ: มีคำขอที่ยังรอแอดมินและช่วงทับกันอยู่แล้ว
    const overlap = await prisma.leaseContractRequest.findFirst({
        where: { userId, status: 'PENDING', periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } }
    });
    if (overlap) return 'duplicate_pending';

    await prisma.leaseContractRequest.create({ data: { userId, periodStart, periodEnd, note: note || null } });
    return null;
}

// การ์ดแจ้งเตือนในกระดิ่งร้านค้า — แจ้งเมื่อออกสัญญาแล้ว/ยกเลิก (ตอน PENDING ยังไม่มีความคืบหน้าให้แจ้ง)
function buildLeaseContractNotifications(requests, formatDate, formatTime) {
    return (requests || [])
        .filter((request) => request.status === 'ISSUED' || request.status === 'CANCELLED')
        .map((request) => {
            const isIssued = request.status === 'ISSUED';
            const when = request.issuedAt || request.createdAt;
            const period = formatPeriod(request.periodStart, request.periodEnd);
            return {
                id: `lease-contract-${request.id}-${request.status}`,
                type: isIssued ? 'lease-contract-issued' : 'lease-contract-cancelled',
                title: isIssued ? 'สัญญาเช่าพร้อมดาวน์โหลดแล้ว' : 'คำขอสัญญาเช่าถูกยกเลิก',
                desc: isIssued
                    ? `สัญญาเช่าช่วง ${period} แนบไว้แล้ว${request.adminNote ? ` — ${request.adminNote}` : ''}`
                    : `คำขอสัญญาเช่าช่วง ${period} ถูกยกเลิก${request.adminNote ? ` เหตุผล: ${request.adminNote}` : ''}`,
                date: formatDate(when),
                time: formatTime(when),
                status: isIssued ? 'SUCCESS' : 'REJECTED',
                isRead: false,
                isNew: true,
                link: '/rental-statement#lease'
            };
        });
}

// ---------- ฝั่งแอดมิน ----------

async function countPendingLeaseContracts() {
    return prisma.leaseContractRequest.count({ where: { status: 'PENDING' } });
}

exports.getAdminListPage = async (req, res) => {
    try {
        const tab = ['PENDING', 'ISSUED', 'CANCELLED'].includes(req.query.tab) ? req.query.tab : 'PENDING';
        const [requests, grouped] = await Promise.all([
            prisma.leaseContractRequest.findMany({
                where: { status: tab },
                orderBy: { createdAt: tab === 'PENDING' ? 'asc' : 'desc' },
                include: { user: { select: { id: true, name: true, phoneNumber: true, shop: { select: { shopName: true } } } } }
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
        return res.redirect('/admin/rental-statements');
    }
};

exports.getAdminDetailPage = async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
        if (!request) return res.redirect('/admin/lease-contracts?error=not_found');
        const range = rentalStatement.parseStatementRange({
            from: rentalStatement.toDateKey(request.periodStart),
            to: rentalStatement.toDateKey(request.periodEnd)
        });
        const statement = await rentalStatement.buildSellerStatement(request.userId, range);
        if (!statement) return res.redirect('/admin/lease-contracts?error=not_found');
        return res.render('admin/leaseContractDetail', {
            user: req.user,
            request: toView(request),
            statement,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('lease contract detail error', error);
        return res.redirect('/admin/lease-contracts?error=action_failed');
    }
};

async function notifySeller(req, request, lines, subject) {
    req.app.locals.clearSellerNotificationCache?.(request.userId);
    try {
        const owner = await prisma.user.findUnique({ where: { id: request.userId }, select: { email: true } });
        if (owner?.email) {
            const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
            await sendLeaseContractEmail(owner.email, { subject, lines, link: `${baseUrl}/rental-statement#lease` });
        }
    } catch (error) {
        console.error('lease contract email error', error.message);
    }
}

// แนบไฟล์สัญญา (ครั้งแรก = ออกสัญญา, ครั้งถัดไป = แนบไฟล์ใหม่แทนไฟล์เดิม)
exports.issue = (req, res) => {
    contractUpload.single('contractFile')(req, res, async (uploadError) => {
        const id = Number.parseInt(req.params.id, 10);
        const back = (query) => res.redirect(`/admin/lease-contracts/${id}?${query}`);
        if (uploadError) {
            return back(`error=${uploadError.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_file_type'}`);
        }
        try {
            const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
            if (!request) {
                if (req.file) await deleteImage(req.file.url);
                return res.redirect('/admin/lease-contracts?error=not_found');
            }
            if (request.status === 'CANCELLED') {
                if (req.file) await deleteImage(req.file.url);
                return back('error=already_cancelled');
            }
            if (!req.file && !request.contractFileUrl) return back('error=missing_file');
            const adminNote = String(req.body.adminNote || '').trim().slice(0, MAX_NOTE_LENGTH) || null;

            await prisma.leaseContractRequest.update({
                where: { id },
                data: {
                    status: 'ISSUED',
                    ...(req.file ? { contractFileUrl: req.file.url } : {}),
                    adminNote,
                    issuedAt: new Date(),
                    issuedByName: req.user?.name || null
                }
            });
            if (req.file && request.contractFileUrl) await deleteImage(request.contractFileUrl);

            const period = formatPeriod(request.periodStart, request.periodEnd);
            await notifySeller(req, request, [
                `สัญญาเช่าช่วง ${period} ของร้านคุณพร้อมแล้ว ดาวน์โหลดได้ในหน้ารายงานการเช่าและชำระเงิน`,
                ...(adminNote ? [`ข้อความจากแอดมิน: ${adminNote}`] : [])
            ], 'สัญญาเช่าพร้อมดาวน์โหลดแล้ว — Kangsadan Night Market');
            return back(request.status === 'ISSUED' ? 'success=replaced' : 'success=issued');
        } catch (error) {
            console.error('lease contract issue error', error);
            if (req.file) await deleteImage(req.file.url);
            return back('error=action_failed');
        }
    });
};

exports.cancel = async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    try {
        const reason = String(req.body.reason || '').trim().slice(0, MAX_NOTE_LENGTH);
        if (!reason) return res.redirect(`/admin/lease-contracts/${id}?error=missing_reason`);
        const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
        if (!request) return res.redirect('/admin/lease-contracts?error=not_found');
        if (request.status === 'CANCELLED') return res.redirect(`/admin/lease-contracts/${id}?error=already_cancelled`);

        // ไฟล์สัญญาที่เคยแนบเก็บไว้ (ไม่ลบ) เผื่อต้องย้อนดูภายหลัง แต่ร้านจะไม่เห็นลิงก์ดาวน์โหลดแล้ว
        await prisma.leaseContractRequest.update({ where: { id }, data: { status: 'CANCELLED', adminNote: reason } });
        await notifySeller(req, request, [
            `คำขอสัญญาเช่าช่วง ${formatPeriod(request.periodStart, request.periodEnd)} ถูกยกเลิก`,
            `เหตุผล: ${reason}`
        ], 'คำขอสัญญาเช่าถูกยกเลิก — Kangsadan Night Market');
        return res.redirect('/admin/lease-contracts?tab=CANCELLED&success=cancelled');
    } catch (error) {
        console.error('lease contract cancel error', error);
        return res.redirect(`/admin/lease-contracts/${id}?error=action_failed`);
    }
};

// ส่งไฟล์สัญญาผ่านแอป (ร้านเจ้าของคำขอหรือแอดมินเท่านั้น) แทนการให้ลิงก์ไฟล์ตรง — ไฟล์มีเลขบัตร/ที่อยู่ผู้เช่า
// ร้านค้าเปิดได้เฉพาะตอนสถานะออกสัญญาแล้ว (ยกเลิกแล้วเปิดไม่ได้) แอดมินเปิดได้ทุกสถานะ
async function sendContractFile(req, res, { asAdmin }) {
    const id = Number.parseInt(req.params.id, 10);
    const request = Number.isInteger(id) ? await prisma.leaseContractRequest.findUnique({ where: { id } }) : null;
    const allowed = request && request.contractFileUrl
        && (asAdmin || (request.userId === req.user?.id && request.status === 'ISSUED'));
    if (!allowed) return res.status(404).send('ไม่พบไฟล์สัญญา');
    try {
        const file = await readStoredFile(request.contractFileUrl);
        if (!file) return res.status(404).send('ไม่พบไฟล์สัญญา');
        const ext = file.contentType === 'application/pdf' ? 'pdf' : (file.contentType.split('/')[1] || 'bin').replace('jpeg', 'jpg');
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="lease-contract-${request.id}.${ext}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(file.buffer);
    } catch (error) {
        console.error('lease contract file error', error);
        return res.status(500).send('เปิดไฟล์สัญญาไม่สำเร็จ');
    }
}

exports.getSellerFile = (req, res) => sendContractFile(req, res, { asAdmin: false });
exports.getAdminFile = (req, res) => sendContractFile(req, res, { asAdmin: true });
exports.getLeaseRequestsForUser = getLeaseRequestsForUser;
exports.createLeaseRequest = createLeaseRequest;
exports.buildLeaseContractNotifications = buildLeaseContractNotifications;
exports.countPendingLeaseContracts = countPendingLeaseContracts;
exports.toMonthKey = toMonthKey;
exports.STATUS_LABEL = STATUS_LABEL;
