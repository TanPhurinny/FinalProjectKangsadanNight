const prisma = require('../config/prismaClient');

const COMMUNITY_CATEGORIES = [
    'แนะนำร้าน-บริการ',
    'ของหายได้คืน',
    'เรื่องทั่วไป',
    'โปรโมทร้านค้าของคุณ'
];

const COMMUNITY_BANNERS = [
    { image: '/img/banner.png' },
    { image: '/img/kang.jpg' }
];

// ไอคอนประจำแต่ละหมวดหมู่ ใช้แสดงบนการ์ดเลือกประเภทโพสต์ (custom form UI)
// ใช้ bootstrap-icons ที่โหลดไว้อยู่แล้วในทุกหน้า ไม่ต้องเพิ่ม asset ใหม่
const COMMUNITY_CATEGORY_ICONS = {
    'แนะนำร้าน-บริการ': 'bi-shop',
    'ของหายได้คืน': 'bi-search-heart',
    'เรื่องทั่วไป': 'bi-chat-dots',
    'โปรโมทร้านค้าของคุณ': 'bi-megaphone'
};
const DEFAULT_CATEGORY_ICON = 'bi-grid';

function isSeller(user) {
    return String(user?.role || '').toUpperCase() === 'SELLER';
}

async function getUserAvatar(userId) {
    const shop = await prisma.shopDetail.findUnique({
        where: { userId },
        select: { productImage: true }
    });

    return shop?.productImage || '/img/favicon.png';
}

function parseDateTimeThai(dateValue) {
    if (!dateValue) {
        return { date: '-', time: '-' };
    }

    const date = new Date(dateValue);
    return {
        date: date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };
}

function normalizeCategory(rawCategory) {
    const category = String(rawCategory || '').trim();
    return COMMUNITY_CATEGORIES.includes(category) ? category : null;
}

function parseRemoveImageIds(rawRemoveImageIds) {
    if (!rawRemoveImageIds) return [];

    try {
        const parsed = JSON.parse(rawRemoveImageIds);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isInteger(value) && value > 0);
    } catch (error) {
        return [];
    }
}

// หาเลขแผงจริงที่ผู้ขายแต่ละคนกำลังเช่าอยู่ (มาจาก BookingRequest ที่แอดมินอนุมัติ
// และยืนยันชำระเงินแล้วเท่านั้น status SUCCESS) แทนการใช้ shop.shopZoneLabel
// ที่เป็นแค่ข้อความที่ผู้ขายพิมพ์เอง ไม่ผูกกับการจองจริง
// ผู้ขายหนึ่งคนอาจเช่าได้มากกว่า 1 แผง จึงคืนค่าเป็น array ของเลขแผง
async function getActiveStallCodesByUserId(userIds) {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    const stallCodesByUserId = new Map();
    if (!uniqueUserIds.length) return stallCodesByUserId;

    const users = await prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: {
            id: true,
            name: true,
            sellerProfile: { select: { id: true } }
        }
    });
    if (!users.length) return stallCodesByUserId;

    const sellerIds = users.map((user) => user.sellerProfile?.id).filter(Boolean);
    const sellerNames = users.map((user) => user.name).filter(Boolean);

    // BookingRequest.sellerId บางแถวเป็น null (สร้างมาก่อนที่ระบบจะผูก Seller profile)
    // จึงต้อง fallback จับคู่ด้วยชื่อผู้ขาย (sellerName) เหมือนกับที่ sellerRoute.js ใช้อยู่แล้ว
    const orConditions = [
        sellerIds.length ? { sellerId: { in: sellerIds } } : null,
        sellerNames.length ? { sellerName: { in: sellerNames } } : null
    ].filter(Boolean);
    if (!orConditions.length) return stallCodesByUserId;

    const activeRequests = await prisma.bookingRequest.findMany({
        where: {
            status: 'SUCCESS',
            assignedStallCode: { not: null },
            OR: orConditions
        },
        select: { sellerId: true, sellerName: true, assignedStallCode: true }
    });

    const sellerIdToUserId = new Map();
    const sellerNameToUserId = new Map();
    users.forEach((user) => {
        if (user.sellerProfile?.id) sellerIdToUserId.set(user.sellerProfile.id, user.id);
        if (user.name) sellerNameToUserId.set(user.name, user.id);
    });

    activeRequests.forEach((request) => {
        if (!request.assignedStallCode) return;

        const userId = sellerIdToUserId.get(request.sellerId) ?? sellerNameToUserId.get(request.sellerName);
        if (!userId) return;

        const list = stallCodesByUserId.get(userId) || [];
        list.push(request.assignedStallCode);
        stallCodesByUserId.set(userId, list);
    });

    return stallCodesByUserId;
}

function buildPostView(post, currentUserId, activeStallCodes = []) {
    const { date, time } = parseDateTimeThai(post.createdAt);
    const isOwner = Number(currentUserId) === Number(post.userId);
    const shop = post.author?.shop || {};

    return {
        id: post.id,
        category: post.category,
        content: post.content,
        createdAt: `${date} ${time}`,
        createdDate: date,
        createdTime: time,
        updatedAt: post.updatedAt,
        storeName: shop.shopName || post.author?.name || 'ผู้ใช้งาน',
        profileImage: shop.productImage || '/img/favicon.png',
        stallNo: activeStallCodes.length ? activeStallCodes.join(', ') : 'ยังไม่มีแผง',
        authorName: post.author?.name || '-',
        images: post.images.map((image) => ({
            id: image.id,
            imageUrl: image.imageUrl
        })),
        likes: post.likes.length,
        comments: post.comments.length,
        isLiked: post.likes.some((like) => Number(like.userId) === Number(currentUserId)),
        isOwner
    };
}

async function fetchFeedPosts(currentUserId, where = {}) {
    const posts = await prisma.communityPost.findMany({
        where,
        include: {
            author: {
                include: { shop: true }
            },
            images: true,
            likes: {
                select: {
                    userId: true
                }
            },
            comments: {
                select: {
                    id: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    const stallCodesByUserId = await getActiveStallCodesByUserId(posts.map((post) => post.userId));

    return posts.map((post) => buildPostView(post, currentUserId, stallCodesByUserId.get(post.userId) || []));
}

async function fetchPostOrThrow(postId) {
    const post = await prisma.communityPost.findUnique({
        where: { id: postId },
        include: {
            author: {
                include: { shop: true }
            },
            images: true,
            likes: {
                select: { userId: true }
            },
            comments: {
                select: { id: true }
            }
        }
    });

    return post;
}

exports.renderFeedPage = async (req, res) => {
    try {
        const [posts, currentUserAvatar] = await Promise.all([
            fetchFeedPosts(req.user.id),
            getUserAvatar(req.user.id)
        ]);

        return res.render('seller/comunity', {
            user: req.user,
            banners: COMMUNITY_BANNERS,
            categories: COMMUNITY_CATEGORIES,
            categoryIcons: COMMUNITY_CATEGORY_ICONS,
            defaultCategoryIcon: DEFAULT_CATEGORY_ICON,
            posts,
            currentUserAvatar,
            canCreatePost: isSeller(req.user) && !req.session?.viewAsCustomer
        });
    } catch (error) {
        console.error('renderFeedPage error:', error);
        return res.status(500).render('index', {
            user: req.user,
            announcements: [],
            error: 'ไม่สามารถโหลดฟีดคอมมูนิตี้ได้'
        });
    }
};

exports.getFeedPosts = async (req, res) => {
    try {
        const category = normalizeCategory(req.query.category);
        const where = category ? { category } : {};
        const posts = await fetchFeedPosts(req.user.id, where);

        return res.json({ success: true, posts });
    } catch (error) {
        console.error('getFeedPosts error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถโหลดโพสต์ได้' });
    }
};

exports.createPost = async (req, res) => {
    try {
        if (!isSeller(req.user)) {
            return res.status(403).json({ success: false, message: 'เฉพาะผู้ขายเท่านั้นที่สร้างโพสต์ได้' });
        }

        const category = normalizeCategory(req.body.category);
        const content = String(req.body.content || '').trim();

        if (!category) {
            return res.status(400).json({ success: false, message: 'ประเภทโพสต์ไม่ถูกต้อง' });
        }

        if (!content) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกเนื้อหาโพสต์' });
        }

        if (content.length > 5000) {
            return res.status(400).json({ success: false, message: 'เนื้อหาโพสต์ยาวเกินกำหนด' });
        }

        const uploadedImages = Array.isArray(req.files) ? req.files : [];
        if (uploadedImages.length > 10) {
            return res.status(400).json({ success: false, message: 'อัปโหลดรูปได้สูงสุด 10 รูป' });
        }

        const createdPost = await prisma.communityPost.create({
            data: {
                userId: req.user.id,
                category,
                content,
                images: {
                    create: uploadedImages.map((file) => ({
                        imageUrl: `/uploads/community/${file.filename}`
                    }))
                }
            },
            include: {
                author: {
                    include: { shop: true }
                },
                images: true,
                likes: {
                    select: { userId: true }
                },
                comments: {
                    select: { id: true }
                }
            }
        });

        const stallCodesByUserId = await getActiveStallCodesByUserId([req.user.id]);

        return res.status(201).json({
            success: true,
            message: 'โพสต์สำเร็จ',
            post: buildPostView(createdPost, req.user.id, stallCodesByUserId.get(req.user.id) || [])
        });
    } catch (error) {
        console.error('createPost error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถสร้างโพสต์ได้' });
    }
};

exports.updatePost = async (req, res) => {
    try {
        const postId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
        }

        const post = await prisma.communityPost.findUnique({
            where: { id: postId },
            include: { images: true }
        });

        if (!post) {
            return res.status(404).json({ success: false, message: 'ไม่พบโพสต์ที่ต้องการแก้ไข' });
        }

        if (Number(post.userId) !== Number(req.user.id)) {
            return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขโพสต์นี้' });
        }

        const category = normalizeCategory(req.body.category);
        const content = String(req.body.content || '').trim();

        if (!category) {
            return res.status(400).json({ success: false, message: 'ประเภทโพสต์ไม่ถูกต้อง' });
        }

        if (!content) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกเนื้อหาโพสต์' });
        }

        const removeImageIds = parseRemoveImageIds(req.body.removeImageIds);
        const uploadedImages = Array.isArray(req.files) ? req.files : [];

        const remainedImageCount = post.images.filter((image) => !removeImageIds.includes(image.id)).length;
        const nextImageCount = remainedImageCount + uploadedImages.length;

        if (nextImageCount > 10) {
            return res.status(400).json({ success: false, message: 'อัปโหลดรูปได้สูงสุด 10 รูป' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.communityPost.update({
                where: { id: postId },
                data: {
                    category,
                    content
                }
            });

            if (removeImageIds.length > 0) {
                await tx.communityPostImage.deleteMany({
                    where: {
                        id: { in: removeImageIds },
                        postId
                    }
                });
            }

            if (uploadedImages.length > 0) {
                await tx.communityPostImage.createMany({
                    data: uploadedImages.map((file) => ({
                        postId,
                        imageUrl: `/uploads/community/${file.filename}`
                    }))
                });
            }
        });

        const updatedPost = await fetchPostOrThrow(postId);
        const stallCodesByUserId = await getActiveStallCodesByUserId([req.user.id]);

        return res.json({
            success: true,
            message: 'อัปเดตโพสต์สำเร็จ',
            post: buildPostView(updatedPost, req.user.id, stallCodesByUserId.get(req.user.id) || [])
        });
    } catch (error) {
        console.error('updatePost error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตโพสต์ได้' });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const postId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
        }

        const post = await prisma.communityPost.findUnique({ where: { id: postId } });
        if (!post) {
            return res.status(404).json({ success: false, message: 'ไม่พบโพสต์ที่ต้องการลบ' });
        }

        if (Number(post.userId) !== Number(req.user.id)) {
            return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ลบโพสต์นี้' });
        }

        await prisma.communityPost.delete({ where: { id: postId } });
        return res.json({ success: true, message: 'ลบโพสต์สำเร็จ' });
    } catch (error) {
        console.error('deletePost error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถลบโพสต์ได้' });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        const postId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
        }

        const existingLike = await prisma.communityLike.findUnique({
            where: {
                postId_userId: {
                    postId,
                    userId: req.user.id
                }
            }
        });

        if (existingLike) {
            await prisma.communityLike.delete({ where: { id: existingLike.id } });
        } else {
            await prisma.communityLike.create({
                data: {
                    postId,
                    userId: req.user.id
                }
            });
        }

        const likeCount = await prisma.communityLike.count({ where: { postId } });
        return res.json({ success: true, isLiked: !existingLike, likes: likeCount });
    } catch (error) {
        console.error('toggleLike error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกการกดถูกใจได้' });
    }
};

exports.getComments = async (req, res) => {
    try {
        const postId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
        }

        const comments = await prisma.communityComment.findMany({
            where: { postId },
            include: {
                user: {
                    include: {
                        shop: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return res.json({
            success: true,
            comments: comments.map((comment) => ({
                id: comment.id,
                content: comment.content,
                authorName: comment.user?.shop?.shopName || comment.user?.name || 'ผู้ใช้งาน',
                profileImage: comment.user?.shop?.productImage || '/img/favicon.png',
                createdAt: new Date(comment.createdAt).toLocaleString('th-TH')
            }))
        });
    } catch (error) {
        console.error('getComments error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถโหลดคอมเมนต์ได้' });
    }
};

exports.createComment = async (req, res) => {
    try {
        const postId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
        }

        const content = String(req.body.content || '').trim();
        if (!content) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อความคอมเมนต์' });
        }

        if (content.length > 1000) {
            return res.status(400).json({ success: false, message: 'ข้อความคอมเมนต์ยาวเกินกำหนด' });
        }

        const comment = await prisma.communityComment.create({
            data: {
                postId,
                userId: req.user.id,
                content
            },
            include: {
                user: {
                    include: {
                        shop: true
                    }
                }
            }
        });

        const commentCount = await prisma.communityComment.count({ where: { postId } });

        return res.status(201).json({
            success: true,
            message: 'เพิ่มคอมเมนต์สำเร็จ',
            commentCount,
            comment: {
                id: comment.id,
                content: comment.content,
                authorName: comment.user?.shop?.shopName || comment.user?.name || 'ผู้ใช้งาน',
                profileImage: comment.user?.shop?.productImage || '/img/favicon.png',
                createdAt: new Date(comment.createdAt).toLocaleString('th-TH')
            }
        });
    } catch (error) {
        console.error('createComment error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มคอมเมนต์ได้' });
    }
};

exports.renderMyPostsPage = async (req, res) => {
    try {
        if (!isSeller(req.user)) {
            return res.status(403).render('index', {
                user: req.user,
                announcements: [],
                error: 'เฉพาะผู้ขายเท่านั้นที่เข้าถึงหน้านี้ได้'
            });
        }

        const posts = await fetchFeedPosts(req.user.id, { userId: req.user.id });

        return res.render('seller/community_my_posts', {
            user: req.user,
            categories: COMMUNITY_CATEGORIES,
            categoryIcons: COMMUNITY_CATEGORY_ICONS,
            defaultCategoryIcon: DEFAULT_CATEGORY_ICON,
            posts
        });
    } catch (error) {
        console.error('renderMyPostsPage error:', error);
        return res.status(500).render('index', {
            user: req.user,
            announcements: [],
            error: 'ไม่สามารถโหลดหน้าจัดการโพสต์ได้'
        });
    }
};

exports.getMyPosts = async (req, res) => {
    try {
        if (!isSeller(req.user)) {
            return res.status(403).json({ success: false, message: 'เฉพาะผู้ขายเท่านั้นที่เข้าถึงข้อมูลนี้ได้' });
        }

        const category = normalizeCategory(req.query.category);
        const keyword = String(req.query.q || '').trim();

        const where = {
            userId: req.user.id
        };

        if (category) {
            where.category = category;
        }

        if (keyword) {
            where.content = {
                contains: keyword
            };
        }

        const posts = await fetchFeedPosts(req.user.id, where);
        return res.json({ success: true, posts });
    } catch (error) {
        console.error('getMyPosts error:', error);
        return res.status(500).json({ success: false, message: 'ไม่สามารถโหลดโพสต์ของคุณได้' });
    }
};

exports.communityCategories = COMMUNITY_CATEGORIES;
exports.communityBanners = COMMUNITY_BANNERS;
exports.isSeller = isSeller;
