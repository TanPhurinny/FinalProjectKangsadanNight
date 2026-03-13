const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');

// ตั้งค่า multer รับข้อมูลฟอร์มที่มีรูปภาพ
const upload = multer();

// หน้า Login & Register UI
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { error: null, success: null });
});

// ระบบ Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { username } });

        if (user && user.password === password) {
            req.session.user = { id: user.id, name: user.name, role: user.role };

            if (user.role === 'ADMIN' || user.role === 'STAFF') {
                return res.redirect('/admin/dashboard');
            } else {
                return res.redirect('/');
            }
        } else {
            // กรณีล็อกอินผิดพลาด แสดงสีแดง (error)
            res.render('login', { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", success: null });
        }
    } catch (err) {
        res.render('login', { error: "เกิดข้อผิดพลาด: " + err.message, success: null });
    }
});


// ระบบ Register
router.post('/register', upload.single('productImage'), async (req, res) => {
    try {
        const { 
            username, password, name, role, 
            phoneNumber, birthDate, shopName, 
            productType, productDetail 
        } = req.body;

        if (!username || !password || !name) {
            return res.render('login', { error: "กรุณากรอกข้อมูลพื้นฐานให้ครบถ้วน", success: null });
        }

        await prisma.user.create({
            data: {
                username,
                password,
                name,
                phoneNumber: phoneNumber || null,
                birthDate: birthDate ? new Date(birthDate) : null,
                role: role, 
                shop: role === 'SELLER' ? {
                    create: {
                        shopName: shopName || null,
                        productType: productType || null,
                        productDetail: productDetail || null
                    }
                } : undefined
            }
        });

        // สมัครสำเร็จ: ส่งค่าไปที่ตัวแปร success เพื่อให้แสดงสีเขียว
        res.render('login', { success: "สมัครสำเร็จ! กรุณาเข้าสู่ระบบ", error: null });

    } catch (err) {
        console.error(err);
        res.render('login', { error: "สมัครไม่สำเร็จ: " + err.message, success: null });
    }
});

// ระบบ Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;