-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `sellerId` INTEGER NULL,
    ADD COLUMN `totalBasePrice` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `totalElectricPrice` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `totalExtraPrice` DOUBLE NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `sellerId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Stall` ADD COLUMN `basePrice` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `electricFeePerDay` DOUBLE NOT NULL DEFAULT 15,
    ADD COLUMN `extraPrice` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `height` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `status` ENUM('AVAILABLE', 'BOOKED', 'MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
    ADD COLUMN `width` INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE `Zone` ADD COLUMN `defaultStallHeight` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `defaultStallWidth` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ZoneRow` ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stallEndNumber` INTEGER NULL,
    ADD COLUMN `stallStartNumber` INTEGER NULL;

-- CreateTable
CREATE TABLE `ProductType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` ENUM('FASHION', 'FOOD', 'EVENT_BOOTH') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Seller` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `productTypeId` INTEGER NULL,
    `shopName` VARCHAR(191) NULL,
    `productDetail` TEXT NULL,
    `productImage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Seller_userId_key`(`userId`),
    INDEX `Seller_productTypeId_fkey`(`productTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZoneProductType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zoneId` INTEGER NOT NULL,
    `productTypeId` INTEGER NOT NULL,

    INDEX `ZoneProductType_zoneId_fkey`(`zoneId`),
    INDEX `ZoneProductType_productTypeId_fkey`(`productTypeId`),
    UNIQUE INDEX `ZoneProductType_zoneId_productTypeId_key`(`zoneId`, `productTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ElectricDevice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `deviceName` VARCHAR(191) NOT NULL,
    `defaultDailyFee` DOUBLE NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ElectricDevice_deviceName_key`(`deviceName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `stallId` INTEGER NOT NULL,
    `priceBasePerDay` DOUBLE NOT NULL DEFAULT 0,
    `priceExtraPerDay` DOUBLE NOT NULL DEFAULT 0,
    `days` INTEGER NOT NULL DEFAULT 1,
    `subtotal` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BookingItem_bookingId_fkey`(`bookingId`),
    INDEX `BookingItem_stallId_fkey`(`stallId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingElectricDevice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `deviceId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `dailyFee` DOUBLE NOT NULL DEFAULT 0,
    `days` INTEGER NOT NULL DEFAULT 1,
    `subtotal` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BookingElectricDevice_bookingId_fkey`(`bookingId`),
    INDEX `BookingElectricDevice_deviceId_fkey`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StallPriceRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stallId` INTEGER NOT NULL,
    `ruleType` ENUM('PINK', 'YELLOW', 'BLUE') NOT NULL,
    `extraAmount` DOUBLE NOT NULL DEFAULT 0,
    `note` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StallPriceRule_stallId_fkey`(`stallId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Booking_sellerId_fkey` ON `Booking`(`sellerId`);

-- CreateIndex
CREATE INDEX `BookingRequest_sellerId_fkey` ON `BookingRequest`(`sellerId`);

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `Seller`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `Seller`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Seller` ADD CONSTRAINT `Seller_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Seller` ADD CONSTRAINT `Seller_productTypeId_fkey` FOREIGN KEY (`productTypeId`) REFERENCES `ProductType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneProductType` ADD CONSTRAINT `ZoneProductType_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneProductType` ADD CONSTRAINT `ZoneProductType_productTypeId_fkey` FOREIGN KEY (`productTypeId`) REFERENCES `ProductType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingItem` ADD CONSTRAINT `BookingItem_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingItem` ADD CONSTRAINT `BookingItem_stallId_fkey` FOREIGN KEY (`stallId`) REFERENCES `Stall`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingElectricDevice` ADD CONSTRAINT `BookingElectricDevice_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingElectricDevice` ADD CONSTRAINT `BookingElectricDevice_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `ElectricDevice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StallPriceRule` ADD CONSTRAINT `StallPriceRule_stallId_fkey` FOREIGN KEY (`stallId`) REFERENCES `Stall`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
