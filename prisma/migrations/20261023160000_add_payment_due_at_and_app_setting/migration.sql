-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `paymentDueAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `AppSetting` (
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedByName` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
