-- AlterTable
ALTER TABLE `Seller` ADD COLUMN `blacklistReason` TEXT NULL,
    ADD COLUMN `blacklistedAt` DATETIME(3) NULL,
    ADD COLUMN `blacklistedById` INTEGER NULL,
    ADD COLUMN `isBlacklisted` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `Seller_blacklistedById_fkey` ON `Seller`(`blacklistedById`);

-- AddForeignKey
ALTER TABLE `Seller` ADD CONSTRAINT `Seller_blacklistedById_fkey` FOREIGN KEY (`blacklistedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
