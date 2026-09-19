// ย้ายรูปที่เคยเก็บใน public/uploads/ ขึ้น Cloudinary แล้วอัปเดตค่าใน DB ให้เป็น URL เต็ม
// วิธีใช้:  node scripts/migrate-uploads-to-cloudinary.js          (ทดลองรัน แค่แสดงผล ไม่เขียนอะไร)
//          node scripts/migrate-uploads-to-cloudinary.js --apply  (อัปโหลดจริง + อัปเดต DB)
// ต้องตั้ง CLOUDINARY_URL ใน .env ก่อน รันซ้ำได้ (ข้ามค่าที่เป็น URL อยู่แล้ว / ไฟล์ที่ไม่มีบนดิสก์)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const prisma = require('../config/prismaClient');
const { isCloudinaryEnabled } = require('../utils/imageStorage');

const APPLY = process.argv.includes('--apply');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ROOT = process.env.CLOUDINARY_FOLDER || 'kangsadan';

// [model, field, ค่าเก่าเป็นแค่ชื่อไฟล์ในโฟลเดอร์นี้ (ถ้ามี)]
const TARGETS = [
    ['user', 'avatarUrl'],
    ['communityPostImage', 'imageUrl'],
    ['sellerApplication', 'shopCoverImage'],
    ['shopDetail', 'productImage'],
    ['shopDetail', 'shopCoverImage'],
    ['shopProductImage', 'imageUrl'],
    ['bookingRequest', 'productImage'],
    ['bookingRequest', 'paymentSlipImage'],
    ['maintenanceReport', 'image'],
    ['maintenanceReportImage', 'imageUrl'],
    ['announcement', 'image', 'announcements'],
    ['seller', 'productImage'],
    ['communityBanner', 'imageUrl']
];

const uploaded = new Map(); // relativePath -> secure_url (รูปเดียวกันถูกอ้างหลายแถวอัปโหลดครั้งเดียว)

async function toCloudUrl(rawValue, legacyFolder) {
    let relative = String(rawValue || '');
    if (!relative || /^https?:\/\//i.test(relative)) return null;
    if (!relative.startsWith('/')) {
        if (!legacyFolder) return null;
        relative = `/uploads/${legacyFolder}/${relative}`;
    }
    if (!relative.startsWith('/uploads/')) return null;

    if (uploaded.has(relative)) return uploaded.get(relative);

    const absolute = path.join(PUBLIC_DIR, relative);
    if (!fs.existsSync(absolute)) {
        console.warn(`  ! ไม่พบไฟล์ ${relative} — ข้าม`);
        return null;
    }

    const parsed = path.parse(relative);
    const folder = `${ROOT}/${path.basename(parsed.dir)}`;
    if (!APPLY) {
        uploaded.set(relative, `(dry-run) ${folder}/${parsed.name}`);
        return uploaded.get(relative);
    }
    const result = await cloudinary.uploader.upload(absolute, {
        folder,
        public_id: parsed.name,
        overwrite: false,
        resource_type: 'image'
    });
    uploaded.set(relative, result.secure_url);
    return result.secure_url;
}

async function main() {
    if (!isCloudinaryEnabled()) {
        console.error('ยังไม่ได้ตั้งค่า CLOUDINARY_URL ใน .env');
        process.exit(1);
    }
    console.log(APPLY ? 'โหมดจริง: อัปโหลดและอัปเดต DB' : 'โหมดทดลอง: ไม่เขียนอะไร (ใส่ --apply เพื่อรันจริง)');

    let changed = 0;
    for (const [model, field, legacyFolder] of TARGETS) {
        const rows = await prisma[model].findMany({ select: { id: true, [field]: true } });
        for (const row of rows) {
            const newUrl = await toCloudUrl(row[field], legacyFolder);
            if (!newUrl) continue;
            console.log(`${model}#${row.id}.${field}: ${row[field]} -> ${newUrl}`);
            if (APPLY) await prisma[model].update({ where: { id: row.id }, data: { [field]: newUrl } });
            changed += 1;
        }
    }
    console.log(`เสร็จสิ้น: ${changed} ค่า, ไฟล์ที่อัปโหลด ${uploaded.size} ไฟล์`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
