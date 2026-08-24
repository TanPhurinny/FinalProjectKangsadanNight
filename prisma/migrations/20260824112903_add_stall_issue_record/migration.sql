-- CreateTable
CREATE TABLE `StallIssueRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stallId` INTEGER NOT NULL,
    `stallCode` VARCHAR(191) NOT NULL,
    `noShow` BOOLEAN NOT NULL DEFAULT false,
    `sublease` BOOLEAN NOT NULL DEFAULT false,
    `otherMarket` BOOLEAN NOT NULL DEFAULT false,
    `wrongSeller` BOOLEAN NOT NULL DEFAULT false,
    `otherIssueNote` TEXT NULL,
    `recordedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StallIssueRecord_stallId_fkey`(`stallId`),
    INDEX `StallIssueRecord_recordedById_fkey`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StallIssueRecord` ADD CONSTRAINT `StallIssueRecord_stallId_fkey` FOREIGN KEY (`stallId`) REFERENCES `Stall`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StallIssueRecord` ADD CONSTRAINT `StallIssueRecord_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
