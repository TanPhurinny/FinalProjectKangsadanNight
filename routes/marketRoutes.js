const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// หน้าผังตลาด (เข้าได้ทุกคนที่ Login)
router.get('/slots', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const slots = await prisma.slot.findMany();
    res.render('slots', { user: req.session.user, data: slots });
});

// ระบบจองแผง (เฉพาะ SELLER)
router.post('/booking/:id', async (req, res) => {
    if (req.session.user.role !== 'SELLER') return res.status(403).send('เฉพาะผู้ขายเท่านั้นที่จองได้');
    // โค้ดจัดการการจองที่นี่
});

module.exports = router;