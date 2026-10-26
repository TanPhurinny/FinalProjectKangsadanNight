-- CreateTable
CREATE TABLE `EventBoothRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trackingToken` VARCHAR(64) NOT NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `eventTitle` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `days` INTEGER NOT NULL DEFAULT 1,
    `preferredStallCode` VARCHAR(191) NULL,
    `assignedStallCode` VARCHAR(191) NULL,
    `pricePerDay` DOUBLE NOT NULL DEFAULT 0,
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'SUCCESS') NOT NULL DEFAULT 'PENDING',
    `rejectReason` TEXT NULL,
    `paymentDueAt` DATETIME(3) NULL,
    `paymentSlipImage` VARCHAR(191) NULL,
    `slipVerified` BOOLEAN NULL,
    `slipVerifyReason` TEXT NULL,
    `slipVerifiedAmount` DOUBLE NULL,
    `paymentConfirmedAt` DATETIME(3) NULL,
    `decidedByName` VARCHAR(191) NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventBoothRequest_trackingToken_key`(`trackingToken`),
    INDEX `EventBoothRequest_userId_fkey`(`userId`),
    INDEX `EventBoothRequest_status_idx`(`status`),
    INDEX `EventBoothRequest_assignedStallCode_idx`(`assignedStallCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventBoothRequest` ADD CONSTRAINT `EventBoothRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

