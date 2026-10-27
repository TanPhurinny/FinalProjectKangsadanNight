-- 1 ผู้ใช้มีได้หลายร้าน: เอา unique ออกจาก ShopDetail.userId (สร้าง index ธรรมดารองรับ FK ก่อน แล้วค่อยลบ unique index)
CREATE INDEX `ShopDetail_userId_idx` ON `ShopDetail`(`userId`);
DROP INDEX `ShopDetail_userId_key` ON `ShopDetail`;

-- ร้านที่คำขอจอง / ใบสมัคร / คำขอสัญญาเช่า เป็นของ (null = ข้อมูลเก่า ใช้ร้านหลักของผู้ใช้ เติมด้วย scripts/backfill-shop-id.js)
ALTER TABLE `BookingRequest` ADD COLUMN `shopId` INTEGER NULL;
ALTER TABLE `SellerApplication` ADD COLUMN `shopId` INTEGER NULL;
ALTER TABLE `LeaseContractRequest` ADD COLUMN `shopId` INTEGER NULL;

CREATE INDEX `BookingRequest_shopId_fkey` ON `BookingRequest`(`shopId`);
CREATE INDEX `SellerApplication_shopId_fkey` ON `SellerApplication`(`shopId`);
CREATE INDEX `LeaseContractRequest_shopId_fkey` ON `LeaseContractRequest`(`shopId`);

ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `ShopDetail`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SellerApplication` ADD CONSTRAINT `SellerApplication_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `ShopDetail`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LeaseContractRequest` ADD CONSTRAINT `LeaseContractRequest_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `ShopDetail`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
