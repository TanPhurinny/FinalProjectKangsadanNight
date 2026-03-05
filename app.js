const express = require('express');
const session = require('express-session');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer'); // เพิ่ม multer สำหรับจัดการรูปภาพ
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const upload = multer(); // ตั้งค่า multer พื้นฐาน

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware (สำคัญมาก: ต้องวางก่อนเรียกใช้ Routes) ---
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. การจัดการ Session ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'kangsadan_night_market_key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 3600000, 
        httpOnly: true,
        secure: false // เปลี่ยนเป็น true ถ้าใช้ https
    }
}));

// --- 4. นำเข้า Route (ต้องแน่ใจว่าไฟล์เหล่านี้มี module.exports = router) ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const marketRoutes = require('./routes/marketRoutes');

// --- 5. การกำหนดเส้นทาง (Routing) ---

// หน้าแรก
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null, error: null });
});

// ใช้งาน Route ที่แยกไฟล์ไว้
app.use('/', authRoutes);        // จัดการ Login, Register, Logout
app.use('/admin', adminRoutes);  // จัดการ Dashboard, Users, Requests (เฉพาะ Admin/Staff)
app.use('/market', marketRoutes); // จัดการ Slots, Products (สำหรับ Seller/Customer)

// --- 6. Error Handling 404 ---
app.use((req, res) => {
    res.status(404).render('index', { 
        user: req.session.user || null, 
        error: 'ไม่พบหน้าที่คุณต้องการ (404 Not Found)' 
    });
});

// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);
});