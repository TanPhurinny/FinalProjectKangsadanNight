/*
  Warnings:

  - You are about to drop the column `blacklistReason` on the `Seller` table. All the data in the column will be lost.
  - You are about to drop the column `blacklistedAt` on the `Seller` table. All the data in the column will be lost.
  - You are about to drop the column `blacklistedById` on the `Seller` table. All the data in the column will be lost.
  - You are about to drop the column `isBlacklisted` on the `Seller` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Seller` DROP FOREIGN KEY `Seller_blacklistedById_fkey`;

-- DropIndex
DROP INDEX `Seller_blacklistedById_fkey` ON `Seller`;

-- AlterTable
ALTER TABLE `Seller` DROP COLUMN `blacklistReason`,
    DROP COLUMN `blacklistedAt`,
    DROP COLUMN `blacklistedById`,
    DROP COLUMN `isBlacklisted`;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `blacklistReason` TEXT NULL,
    ADD COLUMN `blacklistedAt` DATETIME(3) NULL,
    ADD COLUMN `blacklistedById` INTEGER NULL,
    ADD COLUMN `isBlacklisted` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `User_blacklistedById_fkey` ON `User`(`blacklistedById`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_blacklistedById_fkey` FOREIGN KEY (`blacklistedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
