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
const { generalLimiter } = require('./middlewares/authRateLimit');
const logger = require('./config/logger');

const app = express();

// --- 1. การตั้งค่าพื้นฐาน ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// รันหลัง reverse proxy (Heroku/Railway/Nginx ฯลฯ) เสมอใน production เพื่อให้ req.secure/req.ip
// อ่านค่าจริงจาก X-Forwarded-* ได้ถูกต้อง (จำเป็นทั้งสำหรับ HTTPS redirect และ rate limiter ด้านล่าง)
if (isProduction) {
  app.set('trust proxy', 1);
}

// --- 2. Middleware สำคัญ ---
// CSP ปิดไว้ก่อน เพราะ views ยังพึ่ง inline script/onclick และ CDN ภายนอก (bootstrap, fontawesome, sweetalert2)
app.use(helmet({ contentSecurityPolicy: false }));

// บังคับ HTTPS ใน production (proxy ส่ง X-Forwarded-Proto มาบอกว่า request เดิมเป็น http หรือ https)
if (isProduction) {
  app.use((req, res, next) => {
    if (req.secure || req.get('x-forwarded-proto') === 'https') {
      return next();
    }
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// จำกัดจำนวน request ต่อ IP เป็นด่านแรกกัน DoS/brute-force แบบกว้างๆ ทั้งระบบ
// (endpoint auth ที่ละเอียดอ่อนกว่ามี limiter เข้มกว่านี้ซ้อนอยู่อีกชั้นใน authRoutes.js)
app.use(generalLimiter);

// log ทุก request (method, path, status, เวลาที่ใช้, ผู้ใช้ที่ยิง) ไว้ตรวจสอบย้อนหลัง/ตรวจจับความผิดปกติ
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id || null,
      ip: req.ip
    }, 'request');
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));

// --- 3. การจัดการ Session ---
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
  // ผู้ขายที่กดสลับไปดูมุมมองลูกค้าทั่วไปชั่วคราว (session flag เท่านั้น role จริงใน JWT ไม่เปลี่ยน)
  res.locals.viewAsCustomer = Boolean(req.user?.role === 'SELLER' && req.session?.viewAsCustomer);
  next();
});

// กัน browser cache หน้าที่ render แบบไดนามิก (bfcache) ไว้ ไม่งั้นกด "ย้อนกลับ" หลัง logout
// จะเห็น HTML เดิมที่เคย login ค้างอยู่ ทั้งที่ cookie/token ถูกล้างไปแล้วจริง
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// --- 4. นำเข้า Route แยกไฟล์ ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const staffRoutes = require('./routes/staffRoutes');
const marketRoutes = require('./routes/marketRoutes');
const communityRoutes = require('./routes/communityRoutes');
const sellerRoute = require('./routes/sellerRoute');
const announceCtrl = require('./controllers/announcementController');

// --- 5. การกำหนดเส้นทาง (Routing) ---
// หน้าแรก (Index)
app.get('/', async (req, res) => {
  try {
    const user = req.user || null;

    if (user?.role === 'SELLER' && !res.locals.viewAsCustomer) {
      const tabToken = req.query?.tabToken;
      const sellerPath = tabToken
        ? `/seller?tabToken=${encodeURIComponent(String(tabToken))}`
        : '/seller';
      return res.redirect(sellerPath);
    }

    let roleToFetch = 'GUEST';
    if (user?.role === 'CUSTOMER' || res.locals.viewAsCustomer) roleToFetch = 'CUSTOMER';
    else if (user?.role === 'ADMIN' || user?.role === 'STAFF') roleToFetch = 'CUSTOMER';

    const announcements = await announceCtrl.getAnnouncementsForUser(roleToFetch);

    res.render('index', {
      announcements,
      error: null,
      success: req.query.success || null,
    });
  } catch (err) {
    console.error('Index Error:', err);
    res.render('index', {
      user: req.user || null,
      announcements: [],
      error: 'เกิดข้อผิดพลาดในการโหลดข้อมูลประกาศ',
      success: null,
    });
  }
});

// ใช้งาน Route
app.use('/', authRoutes); // Login, Register, Logout
app.use('/admin', adminRoutes); // Dashboard, Users, Requests
app.use('/staff', staffRoutes); // Staff pages
app.use('/market', marketRoutes); // Slots, Products
app.use('/', communityRoutes); // Community Feed APIs + Pages
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
