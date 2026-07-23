const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { SignJWT } = require('jose');
const { z } = require('zod');
const userModel = require('../models/userModel');
const prisma = require('../config/prismaClient');
const { getCookieOptions, getJwtSecretKey } = require('../config/authSecrets');
const { sendPasswordResetEmail } = require('../config/mailer');
const logger = require('../config/logger');

const JWT_SECRET_KEY = getJwtSecretKey();
const JWT_EXPIRES_IN = '1d';
const BCRYPT_SALT_ROUNDS = 10;

const loginSchema = z.object({
    username: z.string().trim().min(1, 'กรุณากรอก username และ password ให้ครบ'),
    password: z.string().min(1, 'กรุณากรอก username และ password ให้ครบ')
});

const emailSchema = z.string().trim().email();

function isValidEmail(email) {
    return emailSchema.safeParse(email).success;
}

const registerSchema = z.object({
    username: z.string().trim().min(1, 'กรุณากรอกข้อมูลให้ครบถ้วน'),
    password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
    name: z.string().trim().min(1, 'กรุณากรอกข้อมูลให้ครบถ้วน'),
    email: z.string().trim().min(1, 'กรุณากรอกข้อมูลให้ครบถ้วน').email('รูปแบบอีเมลไม่ถูกต้อง'),
    phoneNumber: z.string().trim().optional(),
    birthDate: z.union([z.string(), z.date()]).optional().nullable()
        .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'วันเกิดไม่ถูกต้อง')
});

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

function withTabToken(redirectPath, token) {
    if (!token) return redirectPath;

    const separator = redirectPath.includes('?') ? '&' : '?';
    return `${redirectPath}${separator}tabToken=${encodeURIComponent(token)}`;
}

function buildLoginRedirectTarget(user) {
    if (user.role === 'ADMIN' || user.role === 'STAFF') {
        return '/admin/dashboard';
    }

    if (user.role === 'SELLER') {
        return '/seller';
    }

    return '/profile';
}

function createToken(user) {
    return new SignJWT({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRES_IN)
        .sign(JWT_SECRET_KEY);
}

function setAuthCookieWithDuration(res, token, rememberMe) {
    res.cookie('token', token, getCookieOptions(rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24));
}

async function verifyPassword(user, password) {
    const storedPassword = String(user?.password || '');

    if (!storedPassword) {
        return false;
    }

    if (storedPassword.startsWith('$2')) {
        return bcrypt.compare(password, storedPassword);
    }

    if (storedPassword !== password) {
        return false;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await userModel.updateUser(user.id, { password: hashedPassword });
    user.password = hashedPassword;
    return true;
}

function getCurrentUserId(req) {
    return req.authUser?.id || req.user?.id || null;
}

async function getProfileData(userId) {
    return userModel.findById(userId);
}

exports.renderLoginPage = (req, res) => {
    // ไม่ redirect ออกจากหน้า login แม้ cookie ที่แชร์กันทุกแท็บจะมี user อยู่แล้ว
    // เพราะแท็บนี้อาจต้องการ login เป็นอีก role หนึ่งแยกต่างหาก (ดู public/js/common/tabSession.js)
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
        const parsedInput = loginSchema.safeParse({
            username: req.body.username,
            password: req.body.password
        });

        if (!parsedInput.success) {
            return respondAuthFailure(req, res, 400, parsedInput.error.issues[0].message);
        }

        const { username, password } = parsedInput.data;
        const rememberMe = req.body.rememberMe === '1' || req.body.rememberMe === 'on' || req.body.rememberMe === true;

        const user = username.includes('@')
            ? await userModel.findByEmail(username)
            : await userModel.findByUsername(username);

        if (!user) {
            return respondAuthFailure(req, res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

        const isPasswordValid = await verifyPassword(user, password);

        if (!isPasswordValid) {
            return respondAuthFailure(req, res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

        const token = await createToken(user);
        setAuthCookieWithDuration(res, token, rememberMe);
        if (req.session) {
            req.session.user = userModel.sanitizeUser(user);
        }

        const redirectPath = buildLoginRedirectTarget(user);

        // สำหรับ seller ที่ submit ฟอร์มแบบ HTML (ไม่ผ่าน fetch JSON)
        // แนบ tabToken ไปกับ URL เพื่อให้ auth ต่อแท็บทำงานได้สม่ำเสมอ
        if (!wantsJson(req) && user.role === 'SELLER') {
            return res.redirect(withTabToken(redirectPath, token));
        }

        return respondAuthSuccess(req, res, 'เข้าสู่ระบบสำเร็จ', {
            success: true,
            token,
            user: userModel.sanitizeUser(user)
        }, redirectPath);
    } catch (error) {
        logger.error({ err: error }, 'Login Error');
        return respondAuthFailure(req, res, 500, 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
};

exports.register = async (req, res) => {
    try {
        const parsedInput = registerSchema.safeParse({
            username: req.body.username,
            password: req.body.password,
            name: req.body.name,
            email: userModel.normalizeEmail(req.body.email),
            phoneNumber: req.body.phoneNumber,
            birthDate: req.body.birthDate || null
        });

        if (!parsedInput.success) {
            return respondAuthFailure(req, res, 400, parsedInput.error.issues[0].message);
        }

        const { username, password, name, email, birthDate } = parsedInput.data;
        const phoneNumber = String(parsedInput.data.phoneNumber || '').trim();

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
            birthDate: birthDate ? new Date(birthDate) : null,
            role: 'CUSTOMER'
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
        logger.error({ err: error }, 'Register Error');

        if (error.code === 'P2002') {
            return respondAuthFailure(req, res, 409, 'username หรือ email นี้ถูกใช้งานแล้ว', '/login');
        }

        return respondAuthFailure(req, res, 500, 'เกิดข้อผิดพลาดในการสมัครสมาชิก', '/login');
    }
};

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 นาที

function hashResetToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function buildResetUrl(req, rawToken) {
    return `${req.protocol}://${req.get('host')}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

// ขอลิงก์รีเซ็ตรหัสผ่าน: ยืนยันตัวตนด้วย username+email แล้วส่งลิงก์ไปที่อีเมลที่ผูกกับบัญชีจริงเท่านั้น
// (ไม่เปิดเผยว่าพบบัญชีหรือไม่ เพื่อป้องกันการเดา username/email)
exports.forgotPassword = async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const email = userModel.normalizeEmail(req.body.email);

        if (!username || !email) {
            return respondAuthFailure(req, res, 400, 'กรุณากรอกข้อมูลให้ครบถ้วน', '/login');
        }

        if (!isValidEmail(email)) {
            return respondAuthFailure(req, res, 400, 'รูปแบบอีเมลไม่ถูกต้อง', '/login');
        }

        const genericMessage = 'หากข้อมูลถูกต้อง เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลที่ผูกกับบัญชีนี้แล้ว';
        const user = await userModel.findByUsernameOrEmail(username, email);

        if (user && user.username === username && userModel.normalizeEmail(user.email) === email && user.email) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = hashResetToken(rawToken);

            await userModel.createPasswordResetToken(user.id, tokenHash, new Date(Date.now() + RESET_TOKEN_TTL_MS));
            await sendPasswordResetEmail(user.email, buildResetUrl(req, rawToken));
        }

        if (wantsJson(req)) {
            return respondAuthSuccess(req, res, genericMessage, {}, '/login');
        }

        return res.redirect('/login?success=' + encodeURIComponent(genericMessage));
    } catch (error) {
        logger.error({ err: error }, 'Forgot Password Error');
        return respondAuthFailure(req, res, 500, 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน', '/login');
    }
};

exports.renderResetPasswordPage = (req, res) => {
    const token = String(req.query.token || '').trim();

    if (!token) {
        return res.redirect('/login?error=' + encodeURIComponent('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง'));
    }

    res.render('resetPassword', {
        token,
        error: req.query.error || null
    });
};

// ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล: token ต้องยังไม่หมดอายุและยังไม่เคยถูกใช้
exports.resetPassword = async (req, res) => {
    try {
        const rawToken = String(req.body.token || req.query.token || '').trim();
        const newPassword = String(req.body.newPassword || '');
        const confirmPassword = String(req.body.confirmPassword || '');
        const retryPath = rawToken ? `/reset-password?token=${encodeURIComponent(rawToken)}` : '/login';

        if (!rawToken || !newPassword || !confirmPassword) {
            return respondAuthFailure(req, res, 400, 'กรุณากรอกข้อมูลให้ครบถ้วน', retryPath);
        }

        if (newPassword.length < 6) {
            return respondAuthFailure(req, res, 400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', retryPath);
        }

        if (newPassword !== confirmPassword) {
            return respondAuthFailure(req, res, 400, 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน', retryPath);
        }

        const tokenHash = hashResetToken(rawToken);
        const resetToken = await userModel.findValidPasswordResetToken(tokenHash);

        if (!resetToken) {
            return respondAuthFailure(req, res, 400, 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว', '/login');
        }

        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

        await userModel.updateUser(resetToken.userId, { password: hashedPassword });
        await userModel.markPasswordResetTokenUsed(resetToken.id);

        const successMessage = 'รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่';

        if (wantsJson(req)) {
            return respondAuthSuccess(req, res, successMessage, {}, '/login');
        }

        return res.redirect('/login?success=' + encodeURIComponent(successMessage));
    } catch (error) {
        logger.error({ err: error }, 'Reset Password Error');
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

            return res.redirect('/');
        }

        const profileUser = await getProfileData(userId);

        if (!profileUser) {
            if (wantsJson(req)) {
                return sendError(res, 404, 'ไม่พบข้อมูลผู้ใช้');
            }

            return res.redirect('/');
        }

        if (wantsJson(req)) {
            return res.status(200).json({
                success: true,
                user: userModel.sanitizeUser(profileUser)
            });
        }

        const latestSellerApplication = profileUser.role === 'CUSTOMER'
            ? await prisma.sellerApplication.findFirst({
                where: { userId: profileUser.id },
                orderBy: { createdAt: 'desc' }
            })
            : null;

        return res.render('admin/profile', {
            user: req.user || userModel.sanitizeUser(profileUser),
            profileUser,
            latestSellerApplication,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        logger.error({ err: error }, 'Get Profile Error');

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
        logger.error({ err: error }, 'Update Profile Error');

        if (wantsJson(req)) {
            return sendError(res, 500, 'ไม่สามารถอัปเดตโปรไฟล์ได้');
        }

        return res.redirect('/profile?error=update_failed');
    }
};

exports.logout = async (req, res) => {
    try {
        res.clearCookie('token', getCookieOptions(0));

        if (req.session) {
            await new Promise((resolve) => {
                req.session.destroy(() => resolve());
            });
        }

        if (wantsJson(req)) {
            return res.status(200).json({
                success: true,
                message: 'ออกจากระบบสำเร็จ'
            });
        }

        return res.redirect('/?success=' + encodeURIComponent('ออกจากระบบสำเร็จ'));
    } catch (error) {
        logger.error({ err: error }, 'Logout Error');

        if (wantsJson(req)) {
            return sendError(res, 500, 'ไม่สามารถออกจากระบบได้');
        }

        return res.redirect('/login?error=' + encodeURIComponent('ไม่สามารถออกจากระบบได้'));
    }
};

exports.loginSchema = loginSchema;
exports.registerSchema = registerSchema;