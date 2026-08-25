-- CreateTable
CREATE TABLE `MaintenanceReportImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `maintenanceReportId` INTEGER NOT NULL,
    `imageUrl` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MaintenanceReportImage_maintenanceReportId_fkey`(`maintenanceReportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyInspectionSubmission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `submissionDate` DATETIME(3) NOT NULL,
    `submittedById` INTEGER NOT NULL,
    `inspectedCount` INTEGER NOT NULL,
    `totalCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DailyInspectionSubmission_submittedById_fkey`(`submittedById`),
    UNIQUE INDEX `DailyInspectionSubmission_submissionDate_submittedById_key`(`submissionDate`, `submittedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MaintenanceReportImage` ADD CONSTRAINT `MaintenanceReportImage_maintenanceReportId_fkey` FOREIGN KEY (`maintenanceReportId`) REFERENCES `MaintenanceReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyInspectionSubmission` ADD CONSTRAINT `DailyInspectionSubmission_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
