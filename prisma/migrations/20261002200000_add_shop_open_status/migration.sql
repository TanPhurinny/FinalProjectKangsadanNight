-- ShopOpenStatus: เช็คอิน "ร้านเปิดแล้ว" ของผู้ขายต่อวันขาย
-- CreateTable
CREATE TABLE `ShopOpenStatus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `businessDate` DATETIME(3) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopOpenStatus_businessDate_idx`(`businessDate`),
    UNIQUE INDEX `ShopOpenStatus_userId_businessDate_key`(`userId`, `businessDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

