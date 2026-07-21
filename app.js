const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const methodOverride = require('method-override');
const { exec } = require('child_process');
const prisma = require('./config/prismaClient');
const session = require('express-session');
const { getCurrentUser } = require('./middlewares/jwtAuth');
const { isProduction } = require('./config/authSecrets');

const app = express();

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 2. Middleware สำคัญ ---
// CSP ปิดไว้ก่อน เพราะ views ยังพึ่ง inline script/onclick และ CDN ภายนอก (bootstrap, fontawesome, sweetalert2)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));

// --- 3. การจัดการ Session ---
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'kangsadan_night_market_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 3600000,
    httpOnly: true,
  },
}));

// ส่ง Path ปัจจุบันและ user ไปให้ทุก View ก่อนเข้า routes
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.user = req.session?.user || null;
  next();
});

app.use(async (req, res, next) => {
  req.user = await getCurrentUser(req);
  res.locals.user = req.user || null;
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

    let roleToFetch = 'GUEST';
    if (user?.role === 'SELLER') roleToFetch = 'SELLER';
    else if (user?.role === 'CUSTOMER') roleToFetch = 'CUSTOMER';
    else if (user?.role === 'ADMIN' || user?.role === 'STAFF') roleToFetch = 'CUSTOMER';

    const announcements = await announceCtrl.getAnnouncementsForUser(roleToFetch);

    res.render('index', {
      announcements,
      error: null,
    });
  } catch (err) {
    console.error('Index Error:', err);
    res.render('index', {
      user: req.user || null,
      announcements: [],
      error: 'เกิดข้อผิดพลาดในการโหลดข้อมูลประกาศ',
    });
  }
});

// ใช้งาน Route
app.use('/', authRoutes); // Login, Register, Logout
app.use('/admin', adminRoutes); // Dashboard, Users, Requests
app.use('/market', marketRoutes); // Slots, Products
app.use('/', sellerRoute); // เลือกโซน, แจ้งซ่อม, จองแผง

// --- 6. Error Handling 404 (ต้องอยู่ท้ายสุดเสมอ) ---
app.use((req, res) => {
  res.status(404).render('index', {
    user: req.user || null,
    announcements: [],
    error: 'ขออภัย ไม่พบหน้าที่คุณต้องการ',
  });
});

// --- 7. เริ่มต้นเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;

function startServer() {
  app.listen(PORT, () => {
    console.log(`🚀 Kangsadan Night Market System running at http://localhost:${PORT}`);

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
}

// เชื่อมต่อฐานข้อมูลให้พร้อมก่อนเปิดรับ request จริง กัน request แรกของผู้ใช้
// (เช่นตอน login) ต้องรอ TLS/connection handshake ไปกับฐานข้อมูล remote เอง
prisma.$connect()
  .then(startServer)
  .catch((error) => {
    console.error('Prisma connection failed, starting server anyway:', error.message);
    startServer();
  });
