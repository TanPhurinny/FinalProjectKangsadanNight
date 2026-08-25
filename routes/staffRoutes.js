const express = require('express');
const router = express.Router();
const { isStaffOnly } = require('../middlewares/auth');
const staffInspectionCtrl = require('../controllers/staffInspectionController');
const staffDashboardCtrl = require('../controllers/staffDashboardController');
const scoreReportCtrl = require('../controllers/scoreReportController');

router.use(isStaffOnly);

router.get('/dashboard', staffDashboardCtrl.getStaffDashboard);
router.get('/marketinspection', staffInspectionCtrl.getMarketInspectionPage);
router.post('/marketinspection/electric-excess', staffInspectionCtrl.saveElectricExcess);
router.post('/marketinspection/inspection-check', staffInspectionCtrl.saveInspectionCheck);
router.post('/marketinspection/issue', staffInspectionCtrl.saveStallIssue);
router.post('/marketinspection/submit-day', staffInspectionCtrl.submitDay);
router.get('/marketinspection/report', scoreReportCtrl.getStaffReportPage);
router.get('/marketinspection/report/export', scoreReportCtrl.exportStaffReportExcel);
router.get('/seller-scores', scoreReportCtrl.getSellerScoresPage);

module.exports = router;
