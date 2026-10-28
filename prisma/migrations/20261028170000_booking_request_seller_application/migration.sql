-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `sellerApplicationId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `BookingRequest_sellerApplicationId_fkey` ON `BookingRequest`(`sellerApplicationId`);

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_sellerApplicationId_fkey` FOREIGN KEY (`sellerApplicationId`) REFERENCES `SellerApplication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

