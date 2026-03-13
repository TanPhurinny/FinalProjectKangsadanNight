const express = require('express');
const router = express.Router();
const { isStaffOrAdmin, isAdminOnly } = require('../middlewares/auth');

// Import Controllers ทั้งหมด
const userCtrl = require('../controllers/userController');
const approvalCtrl = require('../controllers/approvalController');
const requestCtrl = require('../controllers/requestController');
const marketCtrl = require('../controllers/marketController');

// Middleware ตรวจสอบสิทธิ์สำหรับทุก Route ในไฟล์นี้
router.use(isStaffOrAdmin);

// --- Market & Dashboard ---
router.get('/dashboard', marketCtrl.getDashboardPage);
router.get('/slots', marketCtrl.getSlotsPage);

// --- User Management ---
router.get('/users', isAdminOnly, userCtrl.getUsersPage);
router.post('/users/update-role', isAdminOnly, userCtrl.updateRole);
router.get('/users/delete/:id', isAdminOnly, userCtrl.deleteUser);

// --- Approvals ---
router.get('/approvals', approvalCtrl.getApprovalsPage);
router.post('/approvals/confirm', approvalCtrl.confirmApproval);

// --- Maintenance Requests ---
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