const express = require('express');
const session = require('express-session');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

// --- 1. การตั้งค่าพื้นฐาน (Configuration) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware สำคัญ (วาง Static ไว้บนสุดเพื่อแก้ปัญหา CSS) ---
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 3. การจัดการ Session ---
app.use(session({
    secret: 'kangsadan_night_market_key',
    resave: false,
    saveUninitialized: false, // ปรับเป็น false เพื่อความปลอดภัย
    cookie: { maxAge: 3600000 } // เซสชันอยู่ได้ 1 ชั่วโมง
}));

// --- 4. นำเข้า Route แยกไฟล์ตามขอบเขตงาน ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const marketRoutes = require('./routes/marketRoutes');

// --- 5. การกำหนดเส้นทาง (Routing) ---

// หน้าแรกสำหรับคนทั่วไป (Index)
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// ใช้งาน Route ที่แยกไฟล์ไว้
app.use('/', authRoutes);        // จัดการ Login, Register, Logout
app.use('/admin', adminRoutes);  // จัดการ Dashboard, Users, Requests (เฉพาะ Admin/Staff)
app.use('/market', marketRoutes); // จัดการ Slots, Products (สำหรับ Seller/Customer)

//สำหรับผู้ขาย
const sellerRoute = require('./routes/sellerRoute');
app.use('/', sellerRoute);//เลือกแผง

// --- 6. การจัดการ Error 404 (หน้าไม่พบ) ---
app.use((req, res) => {
    res.status(404).render('index', { 
        user: req.session.user || null, 
        error: 'ไม่พบหน้าที่คุณต้องการ' 
    });
});

// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);
});


