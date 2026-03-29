const express = require('express');
<<<<<<< HEAD
const multer = require('multer'); 
=======
>>>>>>> test
const session = require('express-session');
const path = require('path');
const methodOverride = require('method-override');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
<<<<<<< HEAD
const upload = multer(); 
=======
>>>>>>> test

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware สำคัญ ---
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// --- 3. การจัดการ Session ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'kangsadan_night_market_key',
    resave: false,
    saveUninitialized: false, 
    cookie: { 
        maxAge: 3600000,
        httpOnly: true 
    } 
}));

// ส่ง Path ปัจจุบันไปให้ทุก View ก่อนเข้า routes
app.use((req, res, next) => {
    res.locals.path = req.path;
    next();
});

// --- 4. นำเข้า Route แยกไฟล์ ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const marketRoutes = require('./routes/marketRoutes');
<<<<<<< HEAD
const sellerRoute = require('./routes/sellerRoute');
=======
const announceCtrl = require('./controllers/announcementController');
>>>>>>> test

// --- 5. การกำหนดเส้นทาง (Routing) ---

// Middleware สำหรับส่ง Path ไปยังทุก View (ต้องอยู่ก่อน Routes)
app.use((req, res, next) => {
    res.locals.path = req.path; 
    next();
});

// หน้าแรก (Index)
app.get('/', async (req, res) => {
    try {
        const user = req.session.user || null;
<<<<<<< HEAD
        const targetRole = user ? user.role : 'CUSTOMER';
        const roleToFetch = (targetRole === 'SELLER') ? 'SELLER' : 'CUSTOMER';
=======
        let announcements = [];

        // ผู้ใช้ที่ยังไม่เป็นสมาชิก ให้มองเป็น GUEST
        // ผู้ใช้ที่เป็นระบบหลังบ้าน (ADMIN/STAFF) ให้เห็นประกาศกลุ่มลูกค้าเป็นค่าเริ่มต้น
        let roleToFetch = 'GUEST';
        if (user?.role === 'SELLER') roleToFetch = 'SELLER';
        else if (user?.role === 'CUSTOMER') roleToFetch = 'CUSTOMER';
        else if (user?.role === 'ADMIN' || user?.role === 'STAFF') roleToFetch = 'CUSTOMER';
>>>>>>> test

        const announcements = await announceCtrl.getAnnouncementsForUser(roleToFetch);

        res.render('index', { 
            user, 
            announcements,
            error: null 
        });
    } catch (err) {
        console.error("Index Error:", err);
        res.render('index', { 
            user: req.session.user || null, 
            announcements: [], 
            error: "เกิดข้อผิดพลาดในการโหลดข้อมูลประกาศ" 
        });
    }
});

// ใช้งาน Route (ลบส่วนที่ซ้ำออกแล้ว)
app.use('/', authRoutes);        // Login, Register, Logout
app.use('/admin', adminRoutes);  // Dashboard, Users, Requests
app.use('/market', marketRoutes); // Slots, Products
app.use('/', sellerRoute);       // เลือกโซน, แจ้งซ่อม, จองแผง

// --- 6. Error Handling 404 (ต้องอยู่ท้ายสุดเสมอ) ---
app.use((req, res) => {
    res.status(404).render('index', { 
        user: req.session.user || null, 
        announcements: [],
        error: 'ขออภัย ไม่พบหน้าที่คุณต้องการ' 
    });
});
<<<<<<< HEAD

=======
>>>>>>> test
// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);
});