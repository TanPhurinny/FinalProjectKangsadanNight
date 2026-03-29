const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const userController = require('../controllers/userController');

// ตั้งค่า multer รับข้อมูลฟอร์มที่มีรูปภาพ
const upload = multer();

function renderLogin(res, payload = {}) {
    return res.render('login', {
        error: null,
        success: null,
        registerError: null,
        registerSuccess: null,
        forgotError: null,
        forgotSuccess: null,
        activeTab: 'login',
        ...payload
    });
}

function isGmail(email) {
    return /^[^\s@]+@gmail\.com$/i.test(String(email || '').trim());
}

// หน้า Login & Register UI
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');

    if (req.query.error === 'unauthorized') {
        return renderLogin(res, { error: 'กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้' });
    }

    renderLogin(res);
});

// ระบบ Login
router.post('/login', async (req, res) => {
    const { username, password, rememberMe } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { username } });

        if (user && user.password === password) {
            req.session.user = { id: user.id, name: user.name, role: user.role };

            // เลือกอายุ session ตาม remember me
            req.session.cookie.maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60;

            if (user.role === 'ADMIN' || user.role === 'STAFF') {
                return res.redirect('/admin/dashboard');
            } else {
                return res.redirect('/');
            }
        } else {
            return renderLogin(res, { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
        }
    } catch (err) {
        return renderLogin(res, { error: "เกิดข้อผิดพลาด: " + err.message });
    }
});

// ระบบ Register
router.post('/register', upload.single('productImage'), async (req, res) => {
    try {
        const { 
            username, password, name, email, role,
            phoneNumber, birthDate, shopName, 
            productType, productDetail 
        } = req.body;

        if (!username || !password || !name || !email) {
            return renderLogin(res, {
                registerError: "กรุณากรอกข้อมูลพื้นฐานให้ครบถ้วน",
                activeTab: 'register'
            });
        }

        if (!isGmail(email)) {
            return renderLogin(res, {
                registerError: "กรุณาใช้อีเมล Gmail เท่านั้น (ตัวอย่าง: yourname@gmail.com)",
                activeTab: 'register'
            });
        }

        const exists = await prisma.user.findFirst({
            where: {
                OR: [{ username }, { email: String(email).trim().toLowerCase() }]
            }
        });

        if (exists) {
            return renderLogin(res, {
                registerError: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว",
                activeTab: 'register'
            });
        }

        await prisma.user.create({
            data: {
                username,
                password,
                name,
                email: String(email).trim().toLowerCase(),
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

        return renderLogin(res, { success: "สมัครสำเร็จ! กรุณาเข้าสู่ระบบ" });

    } catch (err) {
        console.error(err);
        return renderLogin(res, {
            registerError: "สมัครไม่สำเร็จ: " + err.message,
            activeTab: 'register'
        });
    }
});

// ระบบลืมรหัสผ่าน
router.post('/forgot-password', async (req, res) => {
    try {
        const { username, email, newPassword, confirmPassword } = req.body;

        if (!username || !email || !newPassword || !confirmPassword) {
            return renderLogin(res, {
                forgotError: 'กรุณากรอกข้อมูลรีเซ็ตรหัสผ่านให้ครบถ้วน',
                activeTab: 'forgot'
            });
        }

        if (!isGmail(email)) {
            return renderLogin(res, {
                forgotError: 'กรุณาใช้อีเมล Gmail ให้ถูกต้อง',
                activeTab: 'forgot'
            });
        }

        if (newPassword.length < 6) {
            return renderLogin(res, {
                forgotError: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร',
                activeTab: 'forgot'
            });
        }

        if (newPassword !== confirmPassword) {
            return renderLogin(res, {
                forgotError: 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน',
                activeTab: 'forgot'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const user = await prisma.user.findFirst({
            where: {
                username,
                email: normalizedEmail
            }
        });

        if (!user) {
            return renderLogin(res, {
                forgotError: 'ไม่พบบัญชีผู้ใช้ที่ตรงกับ Username และ Gmail นี้',
                activeTab: 'forgot'
            });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { password: newPassword }
        });

        return renderLogin(res, {
            forgotSuccess: 'รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสใหม่',
            activeTab: 'forgot'
        });
    } catch (err) {
        return renderLogin(res, {
            forgotError: 'เกิดข้อผิดพลาด: ' + err.message,
            activeTab: 'forgot'
        });
    }
});

// ระบบ Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ดูโปรไฟล์ของตัวเอง
router.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?error=unauthorized');
    }
    userController.getProfile(req, res);
});

// อัปเดตโปรไฟล์ของตัวเอง
router.post('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?error=unauthorized');
    }
    userController.updateProfile(req, res);
});

module.exports = router;