const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const communityController = require('../controllers/communityController');
const { requireAuth } = require('../middlewares/jwtAuth');

const router = express.Router();

const communityUploadDir = path.join(__dirname, '../public/uploads/community');
if (!fs.existsSync(communityUploadDir)) {
    fs.mkdirSync(communityUploadDir, { recursive: true });
}

const communityStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, communityUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `community-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const uploadCommunityImages = multer({
    storage: communityStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
            return;
        }

        cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 10
    }
});

function handleUploadError(uploadFn) {
    return (req, res, next) => {
        uploadFn(req, res, (error) => {
            if (!error) {
                next();
                return;
            }

            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_COUNT') {
                    return res.status(400).json({ success: false, message: 'อัปโหลดรูปได้สูงสุด 10 รูป' });
                }
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, message: 'ขนาดไฟล์ต้องไม่เกิน 5MB ต่อรูป' });
                }
            }

            return res.status(400).json({ success: false, message: error.message || 'อัปโหลดรูปไม่สำเร็จ' });
        });
    };
}

const uploadMultiple = handleUploadError(uploadCommunityImages.array('images', 10));

router.get('/community', requireAuth, communityController.renderFeedPage);
router.get(['/comunity', '/seller/community', '/seller/comunity', '/seller/comunity.ejs', '/views/seller/comunity.ejs'], requireAuth, (req, res) => {
    return res.redirect('/community');
});

router.get('/community/feed', requireAuth, communityController.getFeedPosts);
router.post('/community/posts', requireAuth, uploadMultiple, communityController.createPost);
router.put('/community/posts/:id', requireAuth, uploadMultiple, communityController.updatePost);
router.delete('/community/posts/:id', requireAuth, communityController.deletePost);

router.post('/community/posts/:id/like', requireAuth, communityController.toggleLike);
router.get('/community/posts/:id/comments', requireAuth, communityController.getComments);
router.post('/community/posts/:id/comments', requireAuth, communityController.createComment);

router.get('/community/my-posts', requireAuth, communityController.renderMyPostsPage);
router.get('/community/my-posts/data', requireAuth, communityController.getMyPosts);

module.exports = router;
