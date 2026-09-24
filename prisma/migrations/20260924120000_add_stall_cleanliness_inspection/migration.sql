-- CreateTable
CREATE TABLE `StallCleanlinessInspection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stallId` INTEGER NOT NULL,
    `stallCode` VARCHAR(191) NOT NULL,
    `itemResults` JSON NOT NULL,
    `overallPassed` BOOLEAN NOT NULL,
    `note` TEXT NULL,
    `recordedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StallCleanlinessInspection_stallId_fkey`(`stallId`),
    INDEX `StallCleanlinessInspection_recordedById_fkey`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StallCleanlinessInspection` ADD CONSTRAINT `StallCleanlinessInspection_stallId_fkey` FOREIGN KEY (`stallId`) REFERENCES `Stall`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StallCleanlinessInspection` ADD CONSTRAINT `StallCleanlinessInspection_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
