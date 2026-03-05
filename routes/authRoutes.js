const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');

// ตั้งค่า multer เบื้องต้น
const upload = multer();

// ... (ส่วน Login และ Logout คงเดิม) ...

// ระบบ Register (แก้ไขเพื่อให้ phoneNumber และ birthDate เข้า Database)
router.post('/register', upload.single('productImage'), async (req, res) => {
    try {
        // 1. ดึงค่าออกมาจาก req.body ให้ครบตามที่ส่งมาจาก Form
        const { 
            username, 
            password, 
            name, 
            role, 
            phoneNumber, 
            birthDate,
            shopName,
            productType,
            productDetail 
        } = req.body;

        // 2. ตรวจสอบข้อมูลสำคัญ
        if (!username || !password) {
            return res.render('login', { error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
        }

        // 3. บันทึกลงฐานข้อมูล (เพิ่มฟิลด์ phoneNumber และ birthDate)
        await prisma.user.create({
            data: { 
                username, 
                password, 
                name, 
                role: role || 'CUSTOMER',
                phoneNumber: phoneNumber || null, // ส่งค่า phoneNumber เข้าไป
                // แปลง birthDate จาก String (เช่น 2026-03-05) เป็น Date Object เพื่อให้ Prisma ยอมรับ
                birthDate: birthDate ? new Date(birthDate) : null 
            }
        });

        res.render('login', { error: "สมัครสำเร็จ! กรุณาเข้าสู่ระบบ" });
    } catch (err) {
        console.error(err);
        res.render('login', { error: "ไม่สามารถสมัครสมาชิกได้: " + err.message });
    }
});

module.exports = router;