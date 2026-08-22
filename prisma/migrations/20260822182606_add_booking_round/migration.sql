-- CreateTable
CREATE TABLE `BookingRound` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roundNumber` INTEGER NOT NULL,
    `cycleStartDate` DATETIME(3) NOT NULL,
    `cycleEndDate` DATETIME(3) NOT NULL,
    `reminderDate` DATETIME(3) NULL,
    `openAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BookingRound_roundNumber_key`(`roundNumber`),
    INDEX `BookingRound_cycleStartDate_idx`(`cycleStartDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
