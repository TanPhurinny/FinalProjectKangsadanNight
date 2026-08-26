-- CreateTable
CREATE TABLE `ShopProductImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopDetailId` INTEGER NOT NULL,
    `imageUrl` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShopProductImage_shopDetailId_fkey`(`shopDetailId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopProductImage` ADD CONSTRAINT `ShopProductImage_shopDetailId_fkey` FOREIGN KEY (`shopDetailId`) REFERENCES `ShopDetail`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
