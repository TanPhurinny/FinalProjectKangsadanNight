-- ShopPromo: โปรวันนี้ของร้าน (ข้อความสั้น) ต่อวันขาย
-- หมายเหตุ: ตอนสร้าง migration นี้ diff ของ DB กลางมีคำสั่งลบ Booking.billableDays / ตาราง BookingHoliday ติดมาด้วย
-- (ของเพื่อนในทีมที่ยังไม่อยู่ใน schema ของ branch นี้) — ตั้งใจใส่เฉพาะการสร้างตาราง ShopPromo เท่านั้น
CREATE TABLE `ShopPromo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `businessDate` DATETIME(3) NOT NULL,
    `text` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopPromo_businessDate_idx`(`businessDate`),
    UNIQUE INDEX `ShopPromo_userId_businessDate_key`(`userId`, `businessDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
