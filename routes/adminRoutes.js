const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { createImageStorage } = require('../utils/imageStorage');
const { isStaffOrAdmin, isAdminOnly } = require('../middlewares/auth');
const prisma = require('../config/prismaClient');

// --- 1. Import Controllers ---
const userCtrl = require('../controllers/userController');
const approvalCtrl = require('../controllers/approvalController');
const productSubtypeCtrl = require('../controllers/productSubtypeController');
const requestCtrl = require('../controllers/requestController');
const marketCtrl = require('../controllers/marketController');
const announceCtrl = require('../controllers/announcementController');
const scoreReportCtrl = require('../controllers/scoreReportController');
const { buildQuotationData } = require('../controllers/quotationController');
const bannerCtrl = require('../controllers/communityBannerController');
const taxInvoiceCtrl = require('../controllers/taxInvoiceController');
const bookingHolidayCtrl = require('../controllers/bookingHolidayController');
const eventBoothCtrl = require('../controllers/eventBoothController');
const rentalStatementCtrl = require('../controllers/rentalStatementController');
const leaseContractCtrl = require('../controllers/leaseContractController');

// --- 2. การตั้งค่า Multer สำหรับอัปโหลดรูปประกาศ ---
const storage = createImageStorage({ folder: 'announcements', prefix: 'ann' });

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'));
        }
    }
});

// --- 2.1 การตั้งค่า Multer สำหรับอัปโหลดรูปแบนเนอร์คอมมูนิตี้ ---
const bannerStorage = createImageStorage({ folder: 'community-banners', prefix: 'banner' });

const uploadBanner = multer({
    storage: bannerStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'));
        }
    }
});

// --- 3. Middleware ตรวจสอบสิทธิ์ ---
router.use(isStaffOrAdmin);

// --- 4. Market & Dashboard ---
router.get('/dashboard', marketCtrl.getDashboardPage);
router.get('/slots', marketCtrl.getSlotsPage);
router.get('/slots/expiring', marketCtrl.getExpiringStallsPage);
router.post('/slots/release-stall', approvalCtrl.releaseExpiredStall);
router.post('/slots/notify-expiring', approvalCtrl.notifyStallExpiring);
router.post('/slots/bulk-action', approvalCtrl.bulkStallAction);
router.get('/slots/stall-history/:code', marketCtrl.getStallHistory);

// --- 5. Announcements (จัดการประกาศ) ---
// ดึงข้อมูลหน้าประกาศ
router.get('/announcements', announceCtrl.getAdminAnnouncements);

// สร้างประกาศใหม่ (POST /admin/announcements)
router.post('/announcements', upload.single('image'), announceCtrl.createAnnouncement);

// แก้ไขประกาศ (เพิ่ม Route นี้เข้าไป!)
router.post('/announcements/:id/update', upload.single('image'), announceCtrl.updateAnnouncement);

// ลบประกาศ (แก้ไขจากเดิมที่อาจจะส่ง ID ผิด)
router.post('/announcements/:id/delete', announceCtrl.deleteAnnouncement);

// --- 5.1 Community Banners (จัดการแบนเนอร์วิ่งหน้าคอมมูนิตี้) ---
router.get('/community-banners', bannerCtrl.getAdminBanners);
router.post('/community-banners', uploadBanner.single('image'), bannerCtrl.createBanner);
router.post('/community-banners/:id/toggle', bannerCtrl.toggleBannerActive);
router.post('/community-banners/:id/move/:direction', bannerCtrl.moveBanner);
router.post('/community-banners/:id/delete', bannerCtrl.deleteBanner);

// --- 6. User Management (เฉพาะ Admin) ---
router.get('/users', isAdminOnly, userCtrl.getUsersPage);
router.post('/users/update-role', isAdminOnly, userCtrl.updateRole);
router.get('/users/delete/:id', isAdminOnly, userCtrl.deleteUser);

// --- 6.1 คะแนนร้านค้าจากการตรวจตลาด + Blacklist (เฉพาะ Admin) ---
router.get('/sellers/scores', isAdminOnly, scoreReportCtrl.getSellerScoresPage);
router.post('/sellers/blacklist', isAdminOnly, scoreReportCtrl.toggleBlacklist);

// --- 6.2 วันหยุดรอบการจอง (เฉพาะ Admin เพราะกระทบราคา/การคิดเงิน) ---
router.get('/booking-holidays', isAdminOnly, bookingHolidayCtrl.getAdminHolidays);
router.post('/booking-holidays', isAdminOnly, bookingHolidayCtrl.createHoliday);
router.post('/booking-holidays/:id/delete', isAdminOnly, bookingHolidayCtrl.deleteHoliday);

// รายการ "ขายอะไรบ้าง" ที่แอดมินเพิ่มเองจากคำที่ผู้ขายพิมพ์ในช่อง "อื่นๆ (ระบุเอง)"
router.get('/product-subtypes', isAdminOnly, productSubtypeCtrl.getProductSubtypesPage);
router.post('/product-subtypes', isAdminOnly, productSubtypeCtrl.addProductSubtype);
router.post('/product-subtypes/:id/toggle', isAdminOnly, productSubtypeCtrl.toggleProductSubtype);

// --- 6.5 คำขอจัดบูธกิจกรรม (โซน G) — ขั้นตอนแยกจากการจองแผง ดู controllers/eventBoothController.js ---
router.get('/event-booths', eventBoothCtrl.getAdminPage);
router.post('/event-booths/approve', eventBoothCtrl.approve);
router.post('/event-booths/reject', eventBoothCtrl.reject);
router.post('/event-booths/confirm-payment', eventBoothCtrl.confirmPayment);
router.post('/event-booths/reject-slip', eventBoothCtrl.rejectSlip);

// --- 7. Approvals & Requests ---
router.get('/approvals', approvalCtrl.getApprovalsPage);
router.post('/approvals/confirm-payment', approvalCtrl.confirmPayment);
router.post('/approvals/reject-slip', approvalCtrl.rejectPaymentSlip);
router.post('/approvals/payment-deadline', approvalCtrl.updatePaymentDeadline);
router.post('/approvals/payment-settings', isAdminOnly, approvalCtrl.updatePaymentSettings);
router.get('/quotations/:requestId', async (req, res) => {
    try {
        const quotation = await buildQuotationData(req.params.requestId, req.user?.name);
        if (!quotation) {
            return res.status(404).render('admin/quotation', { error: 'ไม่พบใบเสนอราคา หรือคำขอนี้ยังไม่ได้ยืนยันการชำระเงิน', quotation: null });
        }
        return res.render('admin/quotation', { quotation, error: null });
    } catch (err) {
        return res.status(500).render('admin/quotation', { error: 'เกิดข้อผิดพลาดในการโหลดใบเสนอราคา', quotation: null });
    }
});
router.get('/requests', requestCtrl.getRequestsPage);
router.post('/requests/update-status', requestCtrl.updateStatus);

// --- 7a. รายงานการชำระค่าเช่า (อ่านอย่างเดียว) — เฉพาะ Admin เพราะมีเลขบัตร/ที่อยู่ผู้เช่าและยอดเงินทั้งตลาด ---
router.get('/rental-statements', isAdminOnly, rentalStatementCtrl.getOverviewPage);
router.get('/rental-statements/user/:id', isAdminOnly, rentalStatementCtrl.getSellerPage);
router.get('/rental-statements/stall/:code', isAdminOnly, rentalStatementCtrl.getStallPage);

// คำขอเอกสารจากร้านค้า: หน้าเลือก (ใบกำกับภาษี / สัญญาเช่า) แต่ละอย่างอยู่หน้าของตัวเอง
router.get('/documents', isAdminOnly, async (req, res) => {
    try {
        const [taxGroups, leaseGroups] = await Promise.all([
            prisma.taxInvoiceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.leaseContractRequest.groupBy({ by: ['status'], _count: { _all: true } })
        ]);
        const pick = (groups, status) => groups.find((g) => g.status === status)?._count._all || 0;
        res.render('admin/documents', {
            user: req.user,
            counts: {
                taxPending: pick(taxGroups, 'PENDING'),
                taxIssued: pick(taxGroups, 'ISSUED'),
                leasePending: pick(leaseGroups, 'PENDING'),
                leaseIssued: pick(leaseGroups, 'ISSUED')
            }
        });
    } catch (err) {
        res.redirect('/admin/dashboard');
    }
});

// คำขอสัญญาเช่า — ระบบสร้างร่างจากประวัติการจอง แอดมินตรวจแล้วอนุมัติ/ไม่อนุมัติ (controllers/leaseContractController.js)
router.get('/lease-contracts', isAdminOnly, leaseContractCtrl.getAdminListPage);
router.get('/lease-contracts/:id', isAdminOnly, leaseContractCtrl.getAdminDetailPage);
router.post('/lease-contracts/:id/issue', isAdminOnly, leaseContractCtrl.issue);
router.post('/lease-contracts/:id/cancel', isAdminOnly, leaseContractCtrl.cancel);

// --- 7b. คำขอใบกำกับภาษี ---
router.get('/tax-invoice-requests', async (req, res) => {
    try {
        const requests = await taxInvoiceCtrl.buildTaxInvoiceListRows({});
        res.render('admin/taxInvoiceRequests', {
            user: req.user,
            requests,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.render('admin/taxInvoiceRequests', { user: req.user, requests: [], error: 'load_failed', success: null });
    }
});
router.get('/tax-invoice-requests/:id/fulfill', async (req, res) => {
    try {
        const taxRequest = await taxInvoiceCtrl.getTaxInvoiceRequestForFulfill(req.params.id);
        if (!taxRequest) {
            return res.redirect('/admin/tax-invoice-requests?error=request_not_found');
        }
        res.render('admin/taxInvoiceFulfill', { user: req.user, taxRequest, error: req.query.error || null });
    } catch (err) {
        res.redirect('/admin/tax-invoice-requests?error=load_fulfill_failed');
    }
});
router.post('/tax-invoice-requests/:id/issue', async (req, res) => {
    const result = await taxInvoiceCtrl.issueTaxInvoiceRequest({
        taxInvoiceRequestId: req.params.id,
        issuedByName: req.user?.name,
        profileEdits: req.body
    });
    if (result.error) return res.redirect(`/admin/tax-invoice-requests/${req.params.id}/fulfill?error=${result.error}`);
    res.redirect('/admin/tax-invoice-requests?success=issued');
});
router.post('/tax-invoice-requests/:id/cancel', async (req, res) => {
    const result = await taxInvoiceCtrl.cancelTaxInvoiceRequest({ taxInvoiceRequestId: req.params.id, reason: req.body.reason });
    if (result.error) return res.redirect(`/admin/tax-invoice-requests?error=${result.error}`);
    res.redirect('/admin/tax-invoice-requests?success=cancelled');
});
router.post('/tax-invoice-requests/:id/reissue', async (req, res) => {
    const result = await taxInvoiceCtrl.reissueTaxInvoiceRequest({
        taxInvoiceRequestId: req.params.id,
        issuedByName: req.user?.name,
        profileEdits: req.body
    });
    if (result.error) return res.redirect(`/admin/tax-invoice-requests/${req.params.id}/fulfill?error=${result.error}`);
    res.redirect(`/admin/tax-invoices/${result.taxInvoiceRequestId}?success=reissued`);
});
router.get('/tax-invoices/:id', async (req, res) => {
    try {
        const taxInvoice = await taxInvoiceCtrl.buildTaxInvoiceData(req.params.id);
        if (!taxInvoice) {
            return res.status(404).render('admin/taxInvoice', { error: 'ไม่พบใบกำกับภาษี หรือคำขอนี้ยังไม่ได้ออกจริง', taxInvoice: null });
        }
        return res.render('admin/taxInvoice', { taxInvoice, error: null });
    } catch (err) {
        return res.status(500).render('admin/taxInvoice', { error: 'เกิดข้อผิดพลาดในการโหลดใบกำกับภาษี', taxInvoice: null });
    }
});

// --- 8. Booking Management (แก้ไข Path ไฟล์ EJS) ---

// หน้าสำหรับแอดมินดูรายการจองรวม (ใช้ไฟล์ booking.ejs)
router.get("/admin-booking", async (req, res) => {
    if (!req.user) return res.redirect("/login");
    
    if (req.user.role !== "ADMIN") {
        return res.status(403).send("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้");
    }

    // ชี้ไปที่ views/admin/booking.ejs
    res.render("admin/booking", {
        user: req.user
    });
});

// หน้าสำหรับดูรายละเอียด/โปรเกรสการจอง (ใช้ไฟล์ booking_stall.ejs)
router.get('/booking-stall', approvalCtrl.getBookingStallPage);
router.post('/booking-stall/confirm', approvalCtrl.confirmBookingStall);
router.post('/booking-stall/reject', approvalCtrl.rejectBookingStall);
router.post('/approvals/reject-stale-round', approvalCtrl.rejectStaleRound);
router.post('/approvals/confirm-verified-slips', approvalCtrl.confirmVerifiedSlips);
router.get('/approvals/poll', approvalCtrl.pollNewRequests);
router.get('/approvals/:id/history', approvalCtrl.getRequestHistory);

module.exports = router;