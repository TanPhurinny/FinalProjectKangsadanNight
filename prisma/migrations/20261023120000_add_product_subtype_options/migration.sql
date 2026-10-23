-- CreateTable
CREATE TABLE `ProductSubtypeOption` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productType` VARCHAR(50) NOT NULL,
    `groupName` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `isHidden` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProductSubtypeOption_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

