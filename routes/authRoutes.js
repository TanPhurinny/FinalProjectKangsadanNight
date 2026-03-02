const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// หน้า UI: Login & Register
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/'); // ถ้า Login แล้วให้กลับหน้าแรก
    res.render('login', { error: null });
});

// ระบบ Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (user && user.password === password) {
            req.session.user = { 
                id: user.id, 
                name: user.name, 
                role: user.role 
            };
            return res.redirect('/'); // Login สำเร็จกลับหน้าแรก
        }
        res.render('login', { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    } catch (err) {
        res.render('login', { error: "Database Error: " + err.message });
    }
});

// ระบบ Register
router.post('/register', async (req, res) => {
    const { username, password, name, role } = req.body;
    try {
        await prisma.user.create({
            data: { 
                username, 
                password, 
                name, 
                role: role || 'CUSTOMER' 
            }
        });
        res.render('login', { error: "สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ" });
    } catch (err) {
        res.render('login', { error: "ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว" });
    }
});

// ระบบ Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;