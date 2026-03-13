const express = require('express');
const multer = require('multer'); // <--- เพิ่มบรรทัดนี้เข้าไปครับ
const session = require('express-session');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const announceCtrl = require('./controllers/announcementController');

const app = express();
const prisma = new PrismaClient();
const upload = multer(); // ตอนนี้บรรทัดนี้จะใช้งานได้แล้ว

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware สำคัญ ---
// ให้มั่นใจว่าโฟลเดอร์ public มีโครงสร้าง /uploads/announcements
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
        httpOnly: true // เพิ่มความปลอดภัยป้องกัน XSS
    } 
}));

// --- 4. นำเข้า Route แยกไฟล์ ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const marketRoutes = require('./routes/marketRoutes');

// --- 5. การกำหนดเส้นทาง (Routing) ---

// หน้าแรก (Index) - ดึงประกาศตาม Role ของผู้ใช้งาน
app.get('/', async (req, res) => {
    try {
        const user = req.session.user || null;
        let announcements = [];

        // เลือก Role ที่ต้องการดึงประกาศ (ถ้าไม่ Login ให้เป็น CUSTOMER)
        const targetRole = user ? user.role : 'CUSTOMER';
        
        // สำหรับแอดมินหรือเจ้าหน้าที่ อาจจะอยากให้เห็นประกาศของทุกคน หรือเห็นของ CUSTOMER เป็นหลัก
        // ในที่นี้กำหนดให้ถ้าไม่ใช่ SELLER ให้เห็นของ CUSTOMER ทั้งหมด
        const roleToFetch = (targetRole === 'SELLER') ? 'SELLER' : 'CUSTOMER';

        announcements = await announceCtrl.getAnnouncementsForUser(roleToFetch);

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

// ใช้งาน Route ที่แยกไฟล์ไว้
app.use('/', authRoutes);        
app.use('/admin', adminRoutes);  
app.use('/market', marketRoutes);
app.use('/', authRoutes);        // จัดการ Login, Register, Logout,รายการจองใช้โปรเกรส
app.use('/admin', adminRoutes);  // จัดการ Dashboard, Users, Requests (เฉพาะ Admin/Staff)
app.use('/market', marketRoutes); // จัดการ Slots, Products (สำหรับ Seller/Customer)
const sellerRoute = require('./routes/sellerRoute');


app.use('/', sellerRoute); // เลือกแผง,แจ้งซ่อม,จองแผง



// --- 6. Error Handling 404 ---
app.use((req, res) => {
    res.status(404).render('index', { 
        user: req.session.user || null, 
        announcements: [],
        error: 'ขออภัย ไม่พบหน้าที่คุณต้องการ' 
    });
});

app.use((req, res, next) => {
    res.locals.path = req.path; // ส่ง Path ปัจจุบันไปให้ทุก View อัตโนมัติ
    next();
});
// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);
});
