-- ShopReview: รีวิวร้านค้าจากสมาชิก (ดู utils/shopReviews.js)
-- CreateTable
CREATE TABLE `ShopReview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopUserId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `stallCode` VARCHAR(32) NULL,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `sellerReply` TEXT NULL,
    `sellerRepliedAt` DATETIME(3) NULL,
    `reportCount` INTEGER NOT NULL DEFAULT 0,
    `reportReason` TEXT NULL,
    `reportedAt` DATETIME(3) NULL,
    `isHidden` BOOLEAN NOT NULL DEFAULT false,
    `hiddenReason` TEXT NULL,
    `hiddenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopReview_shopUserId_isHidden_createdAt_idx`(`shopUserId`, `isHidden`, `createdAt`),
    INDEX `ShopReview_userId_idx`(`userId`),
    UNIQUE INDEX `ShopReview_shopUserId_userId_key`(`shopUserId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopReview` ADD CONSTRAINT `ShopReview_shopUserId_fkey` FOREIGN KEY (`shopUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShopReview` ADD CONSTRAINT `ShopReview_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

