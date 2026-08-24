const express = require('express');
const router = express.Router();
const { isStaffOnly } = require('../middlewares/auth');
const staffInspectionCtrl = require('../controllers/staffInspectionController');

router.use(isStaffOnly);

router.get('/marketinspection', staffInspectionCtrl.getMarketInspectionPage);
router.post('/marketinspection/electric-excess', staffInspectionCtrl.saveElectricExcess);
router.post('/marketinspection/inspection-check', staffInspectionCtrl.saveInspectionCheck);
router.post('/marketinspection/issue', staffInspectionCtrl.saveStallIssue);

module.exports = router;
