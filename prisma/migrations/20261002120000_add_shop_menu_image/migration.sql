-- ShopMenuImage: รูปเมนูร้าน (ป้ายเมนู/ใบราคา) แยกจากรูปสินค้า ให้ลูกค้ากด "ดูเมนูร้าน" ในผังตลาด
-- CreateTable
CREATE TABLE `ShopMenuImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopDetailId` INTEGER NOT NULL,
    `imageUrl` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShopMenuImage_shopDetailId_fkey`(`shopDetailId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopMenuImage` ADD CONSTRAINT `ShopMenuImage_shopDetailId_fkey` FOREIGN KEY (`shopDetailId`) REFERENCES `ShopDetail`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

