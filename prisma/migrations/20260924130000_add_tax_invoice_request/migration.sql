-- CreateTable
CREATE TABLE `TaxInvoiceProfile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `taxpayerType` ENUM('INDIVIDUAL', 'COMPANY') NOT NULL DEFAULT 'COMPANY',
    `taxpayerName` VARCHAR(191) NOT NULL,
    `taxId` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NULL,
    `address` TEXT NOT NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaxInvoiceProfile_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxInvoiceRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taxInvoiceProfileId` INTEGER NOT NULL,
    `requestedByUserId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'ISSUED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `documentNumber` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `issuedAt` DATETIME(3) NULL,
    `issuedByName` VARCHAR(191) NULL,
    `rejectReason` TEXT NULL,
    `replacesRequestId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TaxInvoiceRequest_documentNumber_key`(`documentNumber`),
    UNIQUE INDEX `TaxInvoiceRequest_replacesRequestId_key`(`replacesRequestId`),
    INDEX `TaxInvoiceRequest_taxInvoiceProfileId_fkey`(`taxInvoiceProfileId`),
    INDEX `TaxInvoiceRequest_requestedByUserId_fkey`(`requestedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxInvoiceRequestItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taxInvoiceRequestId` INTEGER NOT NULL,
    `bookingRequestId` INTEGER NOT NULL,

    INDEX `TaxInvoiceRequestItem_bookingRequestId_fkey`(`bookingRequestId`),
    UNIQUE INDEX `TaxInvoiceRequestItem_taxInvoiceRequestId_bookingRequestId_key`(`taxInvoiceRequestId`, `bookingRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaxInvoiceProfile` ADD CONSTRAINT `TaxInvoiceProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxInvoiceRequest` ADD CONSTRAINT `TaxInvoiceRequest_taxInvoiceProfileId_fkey` FOREIGN KEY (`taxInvoiceProfileId`) REFERENCES `TaxInvoiceProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxInvoiceRequest` ADD CONSTRAINT `TaxInvoiceRequest_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxInvoiceRequest` ADD CONSTRAINT `TaxInvoiceRequest_replacesRequestId_fkey` FOREIGN KEY (`replacesRequestId`) REFERENCES `TaxInvoiceRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxInvoiceRequestItem` ADD CONSTRAINT `TaxInvoiceRequestItem_taxInvoiceRequestId_fkey` FOREIGN KEY (`taxInvoiceRequestId`) REFERENCES `TaxInvoiceRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxInvoiceRequestItem` ADD CONSTRAINT `TaxInvoiceRequestItem_bookingRequestId_fkey` FOREIGN KEY (`bookingRequestId`) REFERENCES `BookingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
