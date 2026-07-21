const isProduction = process.env.NODE_ENV === 'production';
let cachedJwtSecret = null;
let cachedJwtSecretKey = null;

function getSecret(name, fallback) {
    const value = String(process.env[name] || '').trim();

    if (value) {
        return value;
    }

    if (isProduction) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    console.warn(`Warning: using fallback for ${name}. Set ${name} in your environment before production.`);
    return fallback;
}

function getJwtSecret() {
    if (!cachedJwtSecret) {
        cachedJwtSecret = getSecret('JWT_SECRET', 'dev-only-jwt-secret');
    }

    return cachedJwtSecret;
}

// jose ต้องการ secret เป็น Uint8Array (ไม่ใช่ string ตรงๆ แบบ jsonwebtoken)
function getJwtSecretKey() {
    if (!cachedJwtSecretKey) {
        cachedJwtSecretKey = new TextEncoder().encode(getJwtSecret());
    }

    return cachedJwtSecretKey;
}

function getCookieOptions(maxAge) {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge
    };
}

module.exports = {
    getCookieOptions,
    getJwtSecret,
    getJwtSecretKey,
    isProduction
};