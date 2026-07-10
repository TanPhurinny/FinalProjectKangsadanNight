-- CreateTable
CREATE TABLE IF NOT EXISTS `Zone` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `productCategory` ENUM('FASHION', 'FOOD', 'EVENT_BOOTH') NOT NULL,
  `size` VARCHAR(191) NOT NULL,
  `bookingStartDate` DATETIME(3) NULL,
  `bookingEndDate` DATETIME(3) NULL,
  `electricityFee` DOUBLE NOT NULL DEFAULT 15,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Zone_code_key` (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ZoneRow` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `rowCode` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NULL,
  `price` DOUBLE NOT NULL,
  `size` VARCHAR(191) NOT NULL,
  `zoneId` INTEGER NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ZoneRow_zoneId_rowCode_key` (`zoneId`, `rowCode`),
  INDEX `ZoneRow_zoneId_fkey` (`zoneId`),
  CONSTRAINT `ZoneRow_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `Stall` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `stallCode` VARCHAR(191) NOT NULL,
  `rowId` INTEGER NOT NULL,
  `isAvailable` BOOLEAN NOT NULL DEFAULT true,
  `bookingStartDate` DATETIME(3) NULL,
  `bookingEndDate` DATETIME(3) NULL,
  `extraElectricityCost` DOUBLE NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Stall_stallCode_key` (`stallCode`),
  INDEX `Stall_rowId_fkey` (`rowId`),
  CONSTRAINT `Stall_rowId_fkey` FOREIGN KEY (`rowId`) REFERENCES `ZoneRow` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
