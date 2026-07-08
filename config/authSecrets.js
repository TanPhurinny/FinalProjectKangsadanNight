const isProduction = process.env.NODE_ENV === 'production';
let cachedJwtSecret = null;

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
    isProduction
};