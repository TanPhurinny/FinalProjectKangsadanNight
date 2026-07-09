const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const methodOverride = require('method-override');
const { exec } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { getCurrentUser } = require('./middlewares/jwtAuth');
const { isProduction } = require('./config/authSecrets');

const app = express();
const prisma = new PrismaClient();

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware สำคัญ ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));

<<<<<<< HEAD
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
=======
if (isProduction) {
    app.set('trust proxy', 1);
}
>>>>>>> 7b6e17c6f22e9cb2048a899c48bde4740bc5b99c

// ส่ง Path ปัจจุบันไปให้ทุก View ก่อนเข้า routes
app.use((req, res, next) => {
    res.locals.path = req.path;
    res.locals.user = req.session.user; // ส่งข้อมูล user ไปกับทุก request
    next();
});

app.use((req, res, next) => {
    req.user = getCurrentUser(req);
    res.locals.user = req.user;
    next();
});

// --- 4. นำเข้า Route แยกไฟล์ ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const marketRoutes = require('./routes/marketRoutes');
const sellerRoute = require('./routes/sellerRoute');
const announceCtrl = require('./controllers/announcementController');

// --- 5. การกำหนดเส้นทาง (Routing) ---

// หน้าแรก (Index)
app.get('/', async (req, res) => {
    try {
        const user = req.user || null;

        // ผู้ใช้ที่ยังไม่เป็นสมาชิก ให้มองเป็น GUEST
        // ผู้ใช้ที่เป็นระบบหลังบ้าน (ADMIN/STAFF) ให้เห็นประกาศกลุ่มลูกค้าเป็นค่าเริ่มต้น
        let roleToFetch = 'GUEST';
        if (user?.role === 'SELLER') roleToFetch = 'SELLER';
        else if (user?.role === 'CUSTOMER') roleToFetch = 'CUSTOMER';
        else if (user?.role === 'ADMIN' || user?.role === 'STAFF') roleToFetch = 'CUSTOMER';

        announcements = await announceCtrl.getAnnouncementsForUser(roleToFetch);

        res.render('index', {
            // user ถูกส่งไปแล้วจาก middleware ด้านบน
            announcements,
            error: null
        });
    } catch (err) {
        console.error("Index Error:", err);
<<<<<<< HEAD
        res.render('index', {
            announcements: [],
            error: "เกิดข้อผิดพลาดในการโหลดข้อมูลประกาศ"
=======
        res.render('index', { 
            user: req.user || null, 
            announcements: [], 
            error: "เกิดข้อผิดพลาดในการโหลดข้อมูลประกาศ" 
>>>>>>> 7b6e17c6f22e9cb2048a899c48bde4740bc5b99c
        });
    }
});

// ใช้งาน Route
app.use('/', authRoutes);        // Login, Register, Logout
app.use('/admin', adminRoutes);  // Dashboard, Users, Requests
app.use('/market', marketRoutes); // Slots, Products
app.use('/', sellerRoute);       // เลือกโซน, แจ้งซ่อม, จองแผง

// --- 6. Error Handling 404 (ต้องอยู่ท้ายสุดเสมอ) ---
app.use((req, res) => {
<<<<<<< HEAD
    res.status(404).render('index', {
=======
    res.status(404).render('index', { 
        user: req.user || null, 
>>>>>>> 7b6e17c6f22e9cb2048a899c48bde4740bc5b99c
        announcements: [],
        error: 'ขออภัย ไม่พบหน้าที่คุณต้องการ'
    });
});
// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);
<<<<<<< HEAD
});
=======

    if (process.env.OPEN_BROWSER !== 'false') {
        const url = `http://localhost:${PORT}`;
        const command = process.platform === 'darwin'
            ? `open "${url}"`
            : process.platform === 'win32'
                ? `start "" "${url}"`
                : `xdg-open "${url}"`;

        exec(command, (error) => {
            if (error) {
                console.error('Could not open browser automatically:', error.message);
            }
        });
    }
});
>>>>>>> 7b6e17c6f22e9cb2048a899c48bde4740bc5b99c
