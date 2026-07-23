const nodemailer = require('nodemailer');
const { isProduction } = require('./authSecrets');

let cachedTransporter = null;

function getTransporter() {
    if (cachedTransporter) {
        return cachedTransporter;
    }

    const gmailUser = String(process.env.GMAIL_USER || '').trim();
    const gmailAppPassword = String(process.env.GMAIL_APP_PASSWORD || '').trim();

    if (!gmailUser || !gmailAppPassword) {
        if (isProduction) {
            throw new Error('Missing required environment variables: GMAIL_USER / GMAIL_APP_PASSWORD');
        }

        console.warn('Warning: GMAIL_USER / GMAIL_APP_PASSWORD not set. Password reset emails will not be sent.');
        return null;
    }

    cachedTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailUser,
            pass: gmailAppPassword
        }
    });

    return cachedTransporter;
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
    const transporter = getTransporter();

    if (!transporter) {
        console.warn(`Password reset email not sent (mailer not configured). Link for ${toEmail}: ${resetUrl}`);
        return;
    }

    await transporter.sendMail({
        from: `"Kangsadan Night Market" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'รีเซ็ตรหัสผ่านบัญชีของคุณ',
        html: `
            <p>คุณได้ขอรีเซ็ตรหัสผ่านสำหรับบัญชี Kangsadan Night Market</p>
            <p>กดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์นี้จะหมดอายุใน 30 นาที):</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>
        `
    });
}

async function sendStallAssignedEmail(toEmail, stallCode, zoneLabel) {
    const transporter = getTransporter();

    if (!transporter) {
        console.warn(`Stall assigned email not sent (mailer not configured). ${toEmail}: ล็อก ${stallCode}`);
        return;
    }

    await transporter.sendMail({
        from: `"Kangsadan Night Market" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `แจ้งจัดล็อก ${stallCode} ให้ร้านค้าของคุณ`,
        html: `
            <p>แอดมินได้จัดล็อก <strong>${stallCode}</strong>${zoneLabel ? ` (${zoneLabel})` : ''} ให้ร้านค้าของคุณเรียบร้อยแล้ว</p>
            <p>กรุณาเข้าสู่ระบบและอัปโหลดสลิปโอนเงินที่หน้าสถานะการจอง เพื่อยืนยันล็อกดังกล่าว</p>
        `
    });
}

async function sendPaymentConfirmedEmail(toEmail, stallCode) {
    const transporter = getTransporter();

    if (!transporter) {
        console.warn(`Payment confirmed email not sent (mailer not configured). ${toEmail}: ล็อก ${stallCode}`);
        return;
    }

    await transporter.sendMail({
        from: `"Kangsadan Night Market" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `ยืนยันการชำระเงินสำหรับล็อก ${stallCode}`,
        html: `
            <p>แอดมินได้ตรวจสอบและยืนยันสลิปโอนเงินของคุณเรียบร้อยแล้ว</p>
            <p>ล็อก <strong>${stallCode}</strong> เป็นของร้านค้าของคุณอย่างเป็นทางการ</p>
        `
    });
}

module.exports = {
    sendPasswordResetEmail,
    sendStallAssignedEmail,
    sendPaymentConfirmedEmail
};
