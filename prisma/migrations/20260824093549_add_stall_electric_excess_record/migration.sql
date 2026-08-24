-- CreateTable
CREATE TABLE `StallElectricExcessRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stallId` INTEGER NOT NULL,
    `stallCode` VARCHAR(191) NOT NULL,
    `smallCount` INTEGER NOT NULL DEFAULT 0,
    `largeCount` INTEGER NOT NULL DEFAULT 0,
    `smallUnitPrice` DOUBLE NOT NULL DEFAULT 20,
    `largeUnitPrice` DOUBLE NOT NULL DEFAULT 40,
    `subtotal` DOUBLE NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `recordedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StallElectricExcessRecord_stallId_fkey`(`stallId`),
    INDEX `StallElectricExcessRecord_recordedById_fkey`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StallElectricExcessRecord` ADD CONSTRAINT `StallElectricExcessRecord_stallId_fkey` FOREIGN KEY (`stallId`) REFERENCES `Stall`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StallElectricExcessRecord` ADD CONSTRAINT `StallElectricExcessRecord_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
