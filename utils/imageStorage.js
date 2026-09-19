const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

// ที่เก็บรูปอัปโหลดทั้งระบบ:
//  - ตั้ง CLOUDINARY_URL (หรือ CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) -> อัปโหลดขึ้น Cloudinary, DB เก็บ https URL เต็ม
//  - ไม่ตั้ง -> fallback เก็บลง public/uploads/ ในเครื่อง (สำหรับ dev เท่านั้น ไฟล์จะหายเมื่อ redeploy บน host ที่ไม่มี disk ถาวร)
// ทุกจุดที่อัปโหลดต้องอ่านค่า `file.url` (ไม่ใช่ file.filename) เพื่อให้ใช้ได้ทั้งสองโหมด

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CLOUD_FOLDER_ROOT = process.env.CLOUDINARY_FOLDER || 'kangsadan';

function isCloudinaryEnabled() {
    return Boolean(
        process.env.CLOUDINARY_URL
        || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    );
}

if (isCloudinaryEnabled()) {
    // CLOUDINARY_URL ถูกอ่านอัตโนมัติโดย SDK; ตัวแปรแยกต้องส่งเอง
    if (!process.env.CLOUDINARY_URL) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
    }
    cloudinary.config({ secure: true });
} else if (process.env.NODE_ENV === 'production') {
    console.warn('[imageStorage] ยังไม่ได้ตั้งค่า CLOUDINARY_URL ใน production — รูปจะถูกเก็บลงดิสก์ในเครื่องและอาจหายเมื่อ redeploy');
}

function isCloudinaryUrl(value) {
    return /^https?:\/\/res\.cloudinary\.com\//i.test(String(value || ''));
}

// ดึง public_id จาก URL ของ Cloudinary: .../upload/[transformations/][v123/]folder/name.ext
function extractPublicId(url) {
    const match = String(url || '').match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:\?.*)?$/i);
    return match ? decodeURIComponent(match[1]) : null;
}

// Multer storage engine: รับ stream จาก multer แล้วส่งต่อไป Cloudinary หรือดิสก์ตาม config
class ImageStorage {
    constructor({ folder, prefix }) {
        this.folder = folder;
        this.prefix = prefix;
        this.localDir = path.join(PUBLIC_DIR, 'uploads', folder);
    }

    _buildName(req, file) {
        const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const prefix = typeof this.prefix === 'function' ? this.prefix(req, file) : (this.prefix || file.fieldname);
        return `${prefix}-${suffix}`;
    }

    _handleFile(req, file, cb) {
        const baseName = this._buildName(req, file);

        if (isCloudinaryEnabled()) {
            const upload = cloudinary.uploader.upload_stream(
                {
                    folder: `${CLOUD_FOLDER_ROOT}/${this.folder}`,
                    public_id: baseName,
                    resource_type: 'image'
                },
                (error, result) => {
                    if (error) return cb(error);
                    cb(null, {
                        filename: result.public_id,
                        url: result.secure_url,
                        size: result.bytes
                    });
                }
            );
            file.stream.on('error', cb);
            file.stream.pipe(upload);
            return;
        }

        fs.mkdirSync(this.localDir, { recursive: true });
        const filename = baseName + path.extname(file.originalname);
        const out = fs.createWriteStream(path.join(this.localDir, filename));
        file.stream.on('error', cb);
        out.on('error', cb);
        out.on('finish', () => cb(null, {
            filename,
            path: out.path,
            url: `/uploads/${this.folder}/${filename}`,
            size: out.bytesWritten
        }));
        file.stream.pipe(out);
    }

    _removeFile(req, file, cb) {
        deleteImage(file.url).then(() => cb(null), cb);
    }
}

function createImageStorage(options) {
    return new ImageStorage(options);
}

// ลบรูปเดิม (ไม่ throw — ลบไม่สำเร็จไม่ควรทำให้ request หลักล้ม)
async function deleteImage(url) {
    const value = String(url || '');
    if (!value) return;

    try {
        if (isCloudinaryUrl(value)) {
            if (!isCloudinaryEnabled()) return;
            const publicId = extractPublicId(value);
            if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
            return;
        }

        if (value.startsWith('/uploads/')) {
            // ใช้ path.join แล้วตรวจว่ายังอยู่ใต้ public/uploads กัน path traversal
            const absolutePath = path.join(PUBLIC_DIR, value);
            if (absolutePath.startsWith(path.join(PUBLIC_DIR, 'uploads') + path.sep)) {
                await fs.promises.unlink(absolutePath).catch(() => {});
            }
        }
    } catch (error) {
        console.error('[imageStorage] ลบรูปไม่สำเร็จ:', value, error.message);
    }
}

// อ่านรูปเป็น Buffer จาก URL ที่เก็บใน DB (ไว้ส่งให้ SlipOK) — คืน null ถ้าไม่พบ
async function readImageBuffer(url) {
    const value = String(url || '');
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) {
        const response = await fetch(value);
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
    }

    const absolutePath = path.join(PUBLIC_DIR, value.replace(/^\/+/, ''));
    if (!absolutePath.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(absolutePath)) return null;
    return fs.promises.readFile(absolutePath);
}

// ค่าเก่าของรูปประกาศเก็บแค่ชื่อไฟล์ (ann-xxx.jpg) ส่วนค่าใหม่เป็น URL เต็ม — แปลงให้ view ใช้ได้ทั้งคู่
function resolveImageUrl(value, legacyFolder) {
    const text = String(value || '');
    if (!text) return '';
    if (/^https?:\/\//i.test(text) || text.startsWith('/')) return text;
    return `/uploads/${legacyFolder}/${encodeURIComponent(text)}`;
}

module.exports = {
    isCloudinaryEnabled,
    isCloudinaryUrl,
    extractPublicId,
    createImageStorage,
    deleteImage,
    readImageBuffer,
    resolveImageUrl
};
