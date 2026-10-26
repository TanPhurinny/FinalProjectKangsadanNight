-- CreateTable
CREATE TABLE `LeaseContractRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('PENDING', 'ISSUED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `contractFileUrl` VARCHAR(191) NULL,
    `adminNote` TEXT NULL,
    `issuedAt` DATETIME(3) NULL,
    `issuedByName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeaseContractRequest_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeaseContractRequest` ADD CONSTRAINT `LeaseContractRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

