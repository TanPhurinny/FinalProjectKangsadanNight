const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { getCookieOptions, getJwtSecret } = require('../config/authSecrets');

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = '1d';
const BCRYPT_SALT_ROUNDS = 10;

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidDate(dateValue) {
    if (!dateValue) return true;

    const parsedDate = new Date(dateValue);
    return !Number.isNaN(parsedDate.getTime());
}

function wantsJson(req) {
    const acceptHeader = req.headers.accept || '';
    return req.originalUrl.startsWith('/api/') || acceptHeader.includes('application/json');
}

function sendError(res, statusCode, message, extra = {}) {
    return res.status(statusCode).json({
        success: false,
        message,
        ...extra
    });
}

function sendHybridError(req, res, statusCode, message, redirectPath = '/profile') {
    if (wantsJson(req)) {
        return sendError(res, statusCode, message);
    }

    return res.redirect(`${redirectPath}?error=${encodeURIComponent(message)}`);
}

function respondAuthFailure(req, res, statusCode, message, redirectPath = '/login') {
    if (wantsJson(req)) {
        return sendError(res, statusCode, message);
    }

    return res.redirect(`${redirectPath}?error=${encodeURIComponent(message)}`);
}

function respondAuthSuccess(req, res, message, data = {}, redirectPath = '/') {
    if (wantsJson(req)) {
        return res.status(200).json({
            success: true,
            message,
            redirectPath,
            ...data
        });
    }

    return res.redirect(redirectPath);
}

function buildLoginRedirectTarget(user) {
    if (user.role === 'ADMIN' || user.role === 'STAFF') {
        return '/admin/dashboard';
    }

    return '/profile';
}

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            name: user.name
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function setAuthCookieWithDuration(res, token, rememberMe) {
    res.cookie('token', token, getCookieOptions(rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24));
}

function getCurrentUserId(req) {
    return req.authUser?.id || req.user?.id || null;
}

async function getProfileData(userId) {
    return userModel.findById(userId);
}

exports.renderLoginPage = (req, res) => {
    if (req.user) {
        return res.redirect('/');
    }

    res.render('login', {
        error: req.query.error === 'unauthorized' ? 'กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้' : null,
        success: req.query.success || (req.query.error === 'session_expired' ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : null),
        registerError: null,
        registerSuccess: null,
        forgotError: null,
        forgotSuccess: null,
        activeTab: 'login'
    });
};

exports.login = async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const rememberMe = req.body.rememberMe === '1' || req.body.rememberMe === 'on' || req.body.rememberMe === true;

        if (!username || !password) {
            return respondAuthFailure(req, res, 400, 'กรุณากรอก username และ password ให้ครบ');
        }

        const user = username.includes('@')
            ? await userModel.findByEmail(username)
            : await userModel.findByUsername(username);

        if (!user) {
            return respondAuthFailure(req, res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return respondAuthFailure(req, res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

        const token = createToken(user);
        setAuthCookieWithDuration(res, token, rememberMe);

        const redirectPath = buildLoginRedirectTarget(user);

        return respondAuthSuccess(req, res, 'เข้าสู่ระบบสำเร็จ', {
            success: true,
            token,
            user: userModel.sanitizeUser(user)
        }, redirectPath);
    } catch (error) {
        console.error('Login Error:', error);
        return respondAuthFailure(req, res, 500, 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
};

exports.register = async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const name = String(req.body.name || '').trim();
        const email = userModel.normalizeEmail(req.body.email);
        const phoneNumber = String(req.body.phoneNumber || '').trim();
        const birthDate = req.body.birthDate ? new Date(req.body.birthDate) : null;
        const role = req.body.role === 'SELLER' ? 'SELLER' : 'CUSTOMER';
        const shopName = String(req.body.shopName || '').trim();
        const productType = String(req.body.productType || '').trim();
        const productDetail = String(req.body.productDetail || '').trim();

        if (!username || !password || !name || !email) {
            return respondAuthFailure(req, res, 400, 'กรุณากรอกข้อมูลให้ครบถ้วน');
        }

        if (!isValidEmail(email)) {
            return respondAuthFailure(req, res, 400, 'รูปแบบอีเมลไม่ถูกต้อง');
        }

        if (password.length < 6) {
            return respondAuthFailure(req, res, 400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
        }

        if (!isValidDate(req.body.birthDate)) {
            return respondAuthFailure(req, res, 400, 'วันเกิดไม่ถูกต้อง');
        }

        const existingUser = await userModel.findByUsernameOrEmail(username, email);

        if (existingUser) {
            const isSameUsername = existingUser.username === username;
            const isSameEmail = userModel.normalizeEmail(existingUser.email) === email;

            if (isSameUsername && isSameEmail) {
                return respondAuthFailure(req, res, 409, 'username และ email นี้ถูกใช้งานแล้ว');
            }

            if (isSameUsername) {
                return respondAuthFailure(req, res, 409, 'username นี้ถูกใช้งานแล้ว');
            }

            return respondAuthFailure(req, res, 409, 'email นี้ถูกใช้งานแล้ว');
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        const createdUser = await userModel.createUser({
            username,
            password: hashedPassword,
            name,
            email,
            phoneNumber: phoneNumber || null,
            birthDate,
            role,
            shop: role === 'SELLER'
                ? {
                    create: {
                        shopName: shopName || null,
                        productType: productType || null,
                        productDetail: productDetail || null
                    }
                }
                : undefined
        });

        if (wantsJson(req)) {
            return res.status(201).json({
                success: true,
                message: 'สมัครสมาชิกสำเร็จ',
                user: userModel.sanitizeUser(createdUser)
            });
        }

        return res.redirect('/login?success=' + encodeURIComponent('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ'));
    } catch (error) {
        console.error('Register Error:', error);

        if (error.code === 'P2002') {
            return respondAuthFailure(req, res, 409, 'username หรือ email นี้ถูกใช้งานแล้ว', '/login');
        }

        return respondAuthFailure(req, res, 500, 'เกิดข้อผิดพลาดในการสมัครสมาชิก', '/login');
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const email = userModel.normalizeEmail(req.body.email);
        const newPassword = String(req.body.newPassword || '');
        const confirmPassword = String(req.body.confirmPassword || '');

        if (!username || !email || !newPassword || !confirmPassword) {
            return respondAuthFailure(req, res, 400, 'กรุณากรอกข้อมูลให้ครบถ้วน', '/login');
        }

        if (!isValidEmail(email)) {
            return respondAuthFailure(req, res, 400, 'รูปแบบอีเมลไม่ถูกต้อง', '/login');
        }

        if (newPassword.length < 6) {
            return respondAuthFailure(req, res, 400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', '/login');
        }

        if (newPassword !== confirmPassword) {
            return respondAuthFailure(req, res, 400, 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน', '/login');
        }

        const user = await userModel.findByUsernameOrEmail(username, email);

        if (!user || user.username !== username || userModel.normalizeEmail(user.email) !== email) {
            return respondAuthFailure(req, res, 404, 'ไม่พบบัญชีผู้ใช้ที่ตรงกับข้อมูลนี้', '/login');
        }

        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

        await userModel.updateUser(user.id, {
            password: hashedPassword
        });

        return respondAuthSuccess(req, res, 'รีเซ็ตรหัสผ่านสำเร็จ', {}, '/login');
    } catch (error) {
        console.error('Forgot Password Error:', error);
        return respondAuthFailure(req, res, 500, 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน', '/login');
    }
};

exports.getProfile = async (req, res) => {
    try {
        const userId = getCurrentUserId(req);

        if (!userId) {
            if (wantsJson(req)) {
                return sendError(res, 401, 'กรุณาเข้าสู่ระบบก่อน');
            }

            return res.redirect('/login?error=unauthorized');
        }

        const profileUser = await getProfileData(userId);

        if (!profileUser) {
            if (wantsJson(req)) {
                return sendError(res, 404, 'ไม่พบข้อมูลผู้ใช้');
            }

            return res.redirect('/login?error=unauthorized');
        }

        if (wantsJson(req)) {
            return res.status(200).json({
                success: true,
                user: userModel.sanitizeUser(profileUser)
            });
        }

        return res.render('admin/profile', {
            user: req.user || userModel.sanitizeUser(profileUser),
            profileUser,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Get Profile Error:', error);

        if (wantsJson(req)) {
            return sendError(res, 500, 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้');
        }

        return res.redirect('/login?error=profile_error');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = getCurrentUserId(req);

        if (!userId) {
            return sendHybridError(req, res, 401, 'กรุณาเข้าสู่ระบบก่อน', '/login?error=unauthorized');
        }

        const currentUser = await userModel.findById(userId);

        if (!currentUser) {
            return sendHybridError(req, res, 404, 'ไม่พบข้อมูลผู้ใช้');
        }

        const name = String(req.body.name || '').trim();
        const email = req.body.email ? userModel.normalizeEmail(req.body.email) : currentUser.email;
        const phoneNumber = String(req.body.phoneNumber || '').trim();
        const birthDate = req.body.birthDate ? new Date(req.body.birthDate) : null;
        const password = String(req.body.password || '');
        const newPassword = String(req.body.newPassword || '');
        const confirmPassword = String(req.body.confirmPassword || '');

        if (req.body.email && !isValidEmail(email)) {
            return sendHybridError(req, res, 400, 'รูปแบบอีเมลไม่ถูกต้อง');
        }

        if (email && (await userModel.emailExistsForOtherUser(email, userId))) {
            return sendHybridError(req, res, 409, 'อีเมลนี้ถูกใช้งานแล้ว');
        }

        const updateData = {
            name: name || currentUser.name,
            email,
            phoneNumber: phoneNumber || null,
            birthDate: req.body.birthDate ? birthDate : currentUser.birthDate
        };

        if (newPassword || confirmPassword || password) {
            if (!password) {
                return sendHybridError(req, res, 400, 'กรุณากรอกรหัสผ่านปัจจุบัน');
            }

            const isCurrentPasswordValid = await bcrypt.compare(password, currentUser.password);

            if (!isCurrentPasswordValid) {
                return sendHybridError(req, res, 400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
            }

            if (newPassword !== confirmPassword) {
                return sendHybridError(req, res, 400, 'รหัสผ่านใหม่ไม่ตรงกัน');
            }

            if (newPassword.length < 6) {
                return sendHybridError(req, res, 400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
            }

            updateData.password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
        }

        const updatedUser = await userModel.updateUser(userId, updateData);

        syncSession(req, updatedUser);

        if (wantsJson(req)) {
            return res.status(200).json({
                success: true,
                message: 'อัปเดตโปรไฟล์สำเร็จ',
                user: userModel.sanitizeUser(updatedUser)
            });
        }

        return res.redirect('/profile?success=' + encodeURIComponent('อัปเดตโปรไฟล์สำเร็จ'));
    } catch (error) {
        console.error('Update Profile Error:', error);

        if (wantsJson(req)) {
            return sendError(res, 500, 'ไม่สามารถอัปเดตโปรไฟล์ได้');
        }

        return res.redirect('/profile?error=update_failed');
    }
};

exports.logout = async (req, res) => {
    try {
        res.clearCookie('token', getCookieOptions(0));

        if (wantsJson(req)) {
            return res.status(200).json({
                success: true,
                message: 'ออกจากระบบสำเร็จ'
            });
        }

        return res.redirect('/');
    } catch (error) {
        console.error('Logout Error:', error);

        if (wantsJson(req)) {
            return sendError(res, 500, 'ไม่สามารถออกจากระบบได้');
        }

        return res.redirect('/');
    }
};