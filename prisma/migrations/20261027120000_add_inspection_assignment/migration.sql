-- CreateTable
CREATE TABLE `InspectionAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `businessDate` DATETIME(3) NOT NULL,
    `stallId` INTEGER NOT NULL,
    `stallCode` VARCHAR(191) NOT NULL,
    `assignedToId` INTEGER NOT NULL,
    `batchNo` INTEGER NOT NULL DEFAULT 1,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `heartbeatAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `InspectionAssignment_businessDate_assignedToId_idx`(`businessDate`, `assignedToId`),
    UNIQUE INDEX `InspectionAssignment_businessDate_stallId_key`(`businessDate`, `stallId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

