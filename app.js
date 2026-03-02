const express = require('express');
const session = require('express-session');
const app = express();

// ตั้งค่าพื้นฐาน
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ตั้งค่า Session
app.use(session({
    secret: 'kangsadan_night_market_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 }
}));

// นำเข้า Route
const authRoutes = require('./routes/authRoutes');

// หน้าแรกสำหรับคนทั่วไป
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// ใช้งาน Route
app.use('/', authRoutes);

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));