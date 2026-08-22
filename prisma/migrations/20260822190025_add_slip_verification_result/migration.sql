-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `slipVerified` BOOLEAN NULL,
    ADD COLUMN `slipVerifiedAmount` DOUBLE NULL,
    ADD COLUMN `slipVerifyReason` TEXT NULL;
