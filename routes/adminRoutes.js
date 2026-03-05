const express = require('express');
const router = express.Router();
const { isStaffOrAdmin, isAdminOnly } = require('../middlewares/auth');

// Import Controllers ทั้งหมด
const userCtrl = require('../controllers/userController');
const approvalCtrl = require('../controllers/approvalController');
const requestCtrl = require('../controllers/requestController');
const marketCtrl = require('../controllers/marketController');

// Middleware ตรวจสอบสิทธิ์สำหรับทุก Route ในไฟล์นี้ (Staff และ Admin เท่านั้นที่เข้าได้)
router.use(isStaffOrAdmin);

// --- Market & Dashboard ---
// แก้ไข: ลบบรรทัดที่ซ้ำและใช้ marketCtrl ให้ถูกต้อง
router.get('/dashboard', marketCtrl.getDashboardPage);
router.get('/slots', marketCtrl.getSlotsPage);

// --- User Management (Admin Only) ---
router.get('/users', isAdminOnly, userCtrl.getUsersPage);
router.post('/users/update-role', isAdminOnly, userCtrl.updateRole);
router.get('/users/delete/:id', isAdminOnly, userCtrl.deleteUser);

// --- Approvals (คำขอจองแผง) ---
router.get('/approvals', approvalCtrl.getApprovalsPage);
router.post('/approvals/confirm', approvalCtrl.confirmApproval);

// --- Maintenance Requests (แจ้งซ่อม) ---
router.get('/requests', requestCtrl.getRequestsPage);
router.post('/requests/update-status', requestCtrl.updateStatus);

module.exports = router;