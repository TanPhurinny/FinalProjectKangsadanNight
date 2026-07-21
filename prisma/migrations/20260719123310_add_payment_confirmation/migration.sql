-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `paymentConfirmedAt` DATETIME(3) NULL,
    ADD COLUMN `paymentSlipImage` VARCHAR(191) NULL;
