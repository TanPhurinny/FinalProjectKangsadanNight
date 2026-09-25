-- StallRenewalNotice: แจ้งเตือนในระบบที่แอดมินกดส่งให้ผู้เช่าล็อกที่ใกล้หมดสัญญา (ปุ่ม "แจ้งเตือนร้านค้า")
-- ผูกกับวันหมดสัญญา ณ ตอนแจ้ง (bookingEndDate) การ์ดฝั่งผู้ขายจะหายเองเมื่อต่อสัญญาแล้ววันหมดสัญญาเปลี่ยน
CREATE TABLE `StallRenewalNotice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stallCode` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `bookingEndDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StallRenewalNotice_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
