const express = require('express');
const multer = require('multer'); 
const session = require('express-session');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const announceCtrl = require('./controllers/announcementController');

const app = express();
const prisma = new PrismaClient();
const upload = multer(); 

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware สำคัญ ---
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
        httpOnly: true 
    } 
}));

// --- 4. นำเข้า Route แยกไฟล์ ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const marketRoutes = require('./routes/marketRoutes');
const sellerRoute = require('./routes/sellerRoute');

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
        const targetRole = user ? user.role : 'CUSTOMER';
        const roleToFetch = (targetRole === 'SELLER') ? 'SELLER' : 'CUSTOMER';

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

// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);
});