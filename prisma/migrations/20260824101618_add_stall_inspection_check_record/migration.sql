-- CreateTable
CREATE TABLE `StallInspectionCheckRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stallId` INTEGER NOT NULL,
    `stallCode` VARCHAR(191) NOT NULL,
    `isInspected` BOOLEAN NOT NULL DEFAULT false,
    `recordedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StallInspectionCheckRecord_stallId_fkey`(`stallId`),
    INDEX `StallInspectionCheckRecord_recordedById_fkey`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StallInspectionCheckRecord` ADD CONSTRAINT `StallInspectionCheckRecord_stallId_fkey` FOREIGN KEY (`stallId`) REFERENCES `Stall`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StallInspectionCheckRecord` ADD CONSTRAINT `StallInspectionCheckRecord_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
