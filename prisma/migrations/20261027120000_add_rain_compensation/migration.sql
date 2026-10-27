-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `rainDiscount` INTEGER NULL,
    ADD COLUMN `rainDiscountForfeit` INTEGER NULL;

-- CreateTable
CREATE TABLE `RainCompensationDay` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `percent` INTEGER NOT NULL,
    `note` TEXT NULL,
    `announceAt` DATETIME(3) NOT NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RainCompensationDay_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RainCredit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dayId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `sourceRequestId` INTEGER NULL,
    `stallCodes` VARCHAR(191) NOT NULL,
    `baseRent` DOUBLE NOT NULL,
    `percent` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'USED', 'REVOKED', 'SKIPPED_CAP') NOT NULL DEFAULT 'ACTIVE',
    `expiresAt` DATETIME(3) NOT NULL,
    `usedOnRequestId` INTEGER NULL,
    `usedAt` DATETIME(3) NULL,
    `revokeReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RainCredit_userId_status_idx`(`userId`, `status`),
    INDEX `RainCredit_usedOnRequestId_idx`(`usedOnRequestId`),
    UNIQUE INDEX `RainCredit_dayId_userId_key`(`dayId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RainCredit` ADD CONSTRAINT `RainCredit_dayId_fkey` FOREIGN KEY (`dayId`) REFERENCES `RainCompensationDay`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
