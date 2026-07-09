const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { requireAuth } = require('../middlewares/jwtAuth');

// หน้าผังตลาด (เข้าได้ทุกคนที่ Login)
router.get('/slots', requireAuth, async (req, res) => {
    const slots = await prisma.slot.findMany();
    res.render('slots', { user: req.user, data: slots });
});

// ระบบจองแผง (เฉพาะ SELLER)
router.post('/booking/:id', requireAuth, async (req, res) => {
    if (req.user.role !== 'SELLER') return res.status(403).send('เฉพาะผู้ขายเท่านั้นที่จองได้');
    // โค้ดจัดการการจองที่นี่
});

module.exports = router;