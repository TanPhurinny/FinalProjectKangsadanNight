const prisma = require('../config/prismaClient');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function sanitizeUser(user) {
    if (!user) return null;

    const { password, ...safeUser } = user;
    return safeUser;
}

async function findByUsername(username) {
    return prisma.user.findUnique({
        where: { username: String(username || '').trim() }
    });
}

async function findByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) return null;

    return prisma.user.findUnique({
        where: { email: normalizedEmail }
    });
}

async function findByUsernameOrEmail(username, email) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = String(username || '').trim();

    return prisma.user.findFirst({
        where: {
            OR: [
                { username: normalizedUsername },
                { email: normalizedEmail }
            ]
        }
    });
}

async function findById(userId) {
    return prisma.user.findUnique({
        where: { id: Number(userId) },
        include: { shop: true }
    });
}

async function createUser(data) {
    return prisma.user.create({ data });
}

async function updateUser(userId, data) {
    return prisma.user.update({
        where: { id: Number(userId) },
        data,
        include: { shop: true }
    });
}

async function emailExistsForOtherUser(email, userId) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) return false;

    const foundUser = await prisma.user.findFirst({
        where: {
            email: normalizedEmail,
            NOT: { id: Number(userId) }
        }
    });

    return Boolean(foundUser);
}

module.exports = {
    createUser,
    emailExistsForOtherUser,
    findByEmail,
    findById,
    findByUsername,
    findByUsernameOrEmail,
    normalizeEmail,
    sanitizeUser,
    updateUser
};