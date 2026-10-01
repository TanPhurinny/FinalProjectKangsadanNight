-- ShopViewEvent: สถิติการเปิดดูร้านจากผังตลาด (การ์ดร้าน/ดูเมนู/แชร์) ไม่เก็บข้อมูลผู้ดู
-- CreateTable
CREATE TABLE `ShopViewEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopUserId` INTEGER NOT NULL,
    `stallCode` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShopViewEvent_shopUserId_createdAt_idx`(`shopUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

