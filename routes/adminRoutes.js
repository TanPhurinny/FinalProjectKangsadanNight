const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { isStaffOrAdmin, isAdminOnly } = require('../middlewares/auth');

// --- 1. Import Controllers ทั้งหมด ---
const userCtrl = require('../controllers/userController');
const approvalCtrl = require('../controllers/approvalController');
const requestCtrl = require('../controllers/requestController');
const marketCtrl = require('../controllers/marketController');
const announceCtrl = require('../controllers/announcementController'); 

// --- 2. การตั้งค่า Multer สำหรับอัปโหลดรูปประกาศ ---
const storage = multer.diskStorage({
    destination: './public/uploads/announcements/',
    filename: (req, file, cb) => {
        // ตั้งชื่อไฟล์ใหม่: ann-เวลปัจจุบัน.นามสกุลไฟล์เดิม
        cb(null, 'ann-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 3. Middleware ตรวจสอบสิทธิ์ ---
// ทุก Route ด้านล่างนี้ เฉพาะ Staff และ Admin เท่านั้นที่เข้าถึงได้
router.use(isStaffOrAdmin);

// --- 4. Market & Dashboard ---
router.get('/dashboard', marketCtrl.getDashboardPage);
router.get('/slots', marketCtrl.getSlotsPage);

// --- 5. Announcements (จัดการประกาศ) ---
router.get('/announcements', announceCtrl.getAdminAnnouncements);
// รองรับการอัปโหลดรูปภาพผ่านฟิลด์ชื่อ 'announcementImage'
router.post('/announcements/create', upload.single('announcementImage'), announceCtrl.createAnnouncement);
router.get('/announcements/delete/:id', announceCtrl.deleteAnnouncement);

// --- 6. User Management (เฉพาะ Admin เท่านั้น) ---
router.get('/users', isAdminOnly, userCtrl.getUsersPage);
router.post('/users/update-role', isAdminOnly, userCtrl.updateRole);
router.get('/users/delete/:id', isAdminOnly, userCtrl.deleteUser);

// --- 7. Approvals (รายการอนุมัติจองแผง) ---
router.get('/approvals', approvalCtrl.getApprovalsPage);
router.post('/approvals/confirm', approvalCtrl.confirmApproval);

// --- 8. Maintenance Requests (การแจ้งซ่อม/คำร้อง) ---
router.get('/requests', requestCtrl.getRequestsPage);
router.post('/requests/update-status', requestCtrl.updateStatus);
// หน้า admin ดูรายการจอง ทำโปรเกรส
router.get("/admin-booking", async (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  // ถ้าต้องการให้เฉพาะ admin เข้า
  if (req.session.user.role !== "ADMIN") {
    return res.status(403).send("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้");
  }

  res.render("seller/admin_booking", {
    user: req.session.user
  });

});
//โปรเกรส
router.get("/booking-stall", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.render("seller/admin_booking_stall", {
    user: req.session.user
  });

});

module.exports = router;