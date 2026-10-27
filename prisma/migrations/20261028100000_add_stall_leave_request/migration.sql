-- คำขอลาหยุด / ปล่อยเช่าช่วงแผง (utils/stallLeave.js)

-- CreateTable
CREATE TABLE `StallLeaveRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` ENUM('LEAVE', 'SUBLET_MEMBER', 'SUBLET_GUEST') NOT NULL DEFAULT 'LEAVE',
    `status` ENUM('WAITING_SUBTENANT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `userId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `bookingRequestId` INTEGER NULL,
    `stallCode` VARCHAR(20) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `subShopId` INTEGER NULL,
    `subtenantAcceptedAt` DATETIME(3) NULL,
    `guestToken` VARCHAR(64) NULL,
    `guestTokenExpiresAt` DATETIME(3) NULL,
    `guestName` VARCHAR(191) NULL,
    `guestPhone` VARCHAR(20) NULL,
    `guestIdCard` VARCHAR(20) NULL,
    `guestProductType` VARCHAR(191) NULL,
    `guestProductSubtype` VARCHAR(191) NULL,
    `guestProductDetail` TEXT NULL,
    `guestImages` TEXT NULL,
    `guestTermsAcceptedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `reviewedById` INTEGER NULL,
    `reviewedByName` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StallLeaveRequest_guestToken_key`(`guestToken`),
    INDEX `StallLeaveRequest_stallCode_startDate_idx`(`stallCode`, `startDate`),
    INDEX `StallLeaveRequest_userId_idx`(`userId`),
    INDEX `StallLeaveRequest_subShopId_idx`(`subShopId`),
    INDEX `StallLeaveRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

