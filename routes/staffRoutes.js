const express = require('express');
const router = express.Router();
const { isStaffOnly } = require('../middlewares/auth');
const staffInspectionCtrl = require('../controllers/staffInspectionController');

router.use(isStaffOnly);

router.get('/marketinspection', staffInspectionCtrl.getMarketInspectionPage);

module.exports = router;
