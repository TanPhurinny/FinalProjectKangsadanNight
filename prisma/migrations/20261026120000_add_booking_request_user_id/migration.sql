-- ผูกคำขอจองกับผู้ใช้โดยตรง (แทน sellerId ที่ชี้ตาราง Seller ซึ่งว่างเสมอ)
-- เติมค่าให้คำขอเก่าด้วย: node scripts/backfill-booking-request-user.js --apply

-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `userId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `BookingRequest_userId_fkey` ON `BookingRequest`(`userId`);

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
