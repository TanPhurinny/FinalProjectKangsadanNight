// ตรวจสอบว่าเป็น Staff หรือ Admin หรือไม่
exports.isStaffOrAdmin = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'ADMIN' || req.session.user.role === 'STAFF')) {
        return next();
    }
    res.redirect('/login?error=unauthorized');
};

// ตรวจสอบว่าเป็น Admin เท่านั้น (สำหรับหน้าจัดการ User)
exports.isAdminOnly = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'ADMIN') {
        return next();
    }
    res.status(403).send("สิทธิ์การเข้าถึงเฉพาะผู้ดูแลระบบสูงสุดเท่านั้น");
};