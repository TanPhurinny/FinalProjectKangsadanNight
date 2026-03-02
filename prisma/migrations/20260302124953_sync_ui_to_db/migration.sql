-- DropForeignKey
ALTER TABLE `Booking` DROP FOREIGN KEY `Booking_slotId_fkey`;

-- DropForeignKey
ALTER TABLE `Booking` DROP FOREIGN KEY `Booking_userId_fkey`;

-- DropForeignKey
ALTER TABLE `MaintenanceReport` DROP FOREIGN KEY `MaintenanceReport_userId_fkey`;

-- DropForeignKey
ALTER TABLE `ShopDetail` DROP FOREIGN KEY `ShopDetail_userId_fkey`;

-- DropIndex
DROP INDEX `Booking_slotId_fkey` ON `Booking`;

-- DropIndex
DROP INDEX `Booking_userId_fkey` ON `Booking`;

-- DropIndex
DROP INDEX `MaintenanceReport_userId_fkey` ON `MaintenanceReport`;

-- AddForeignKey
ALTER TABLE `ShopDetail` ADD CONSTRAINT `ShopDetail_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_slotId_fkey` FOREIGN KEY (`slotId`) REFERENCES `Slot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceReport` ADD CONSTRAINT `MaintenanceReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
