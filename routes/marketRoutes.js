const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const zoneAccess = require('../utils/zoneAccess');

// หน้าผังตลาด (เข้าได้ทุกคนที่ Login)
router.get('/slots', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const slots = await prisma.slot.findMany();
    res.render('slots', { user: req.session.user, data: slots });
});

// ระบบจองแผง (เฉพาะ SELLER)
router.post('/booking/:id', async (req, res) => {
    if (req.session.user.role !== 'SELLER') return res.status(403).send('เฉพาะผู้ขายเท่านั้นที่จองได้');
    try {
        const slotId = parseInt(req.params.id);
        if (Number.isNaN(slotId)) return res.status(400).send('invalid_slot_id');

        const slot = await prisma.slot.findUnique({ where: { id: slotId } });
        if (!slot) return res.status(404).send('ไม่พบแผงที่ต้องการจอง');

        // ดึงข้อมูลผู้ขายเพื่อคำนวณโซนที่อนุญาต
        const userRecord = await prisma.user.findUnique({ where: { id: req.session.user.id }, include: { shop: true } });
        const productType = userRecord?.shop?.productType || null;
        const allowed = zoneAccess.allowedZonesFor(productType).map(z => String(z).toLowerCase());
        const slotZone = String(slot.zone || '').toLowerCase();

        if (allowed.length && !allowed.includes(slotZone)) {
            return res.status(403).send('คุณไม่มีสิทธิ์จองโซนนี้ตามประเภทสินค้าของคุณ');
        }

        // สร้าง Booking (สถานะเริ่มต้นเป็น PENDING)
        await prisma.booking.create({ data: { slotId: slotId, userId: req.session.user.id } });
        // ทำให้แผงไม่ว่างชั่วคราว
        await prisma.slot.update({ where: { id: slotId }, data: { isAvailable: false } });

        return res.redirect('/booking-status');
    } catch (err) {
        console.error('booking route error', err);
        return res.status(500).send('เกิดข้อผิดพลาดในการจอง');
    }
});

module.exports = router;