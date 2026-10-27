-- "ปิดร้านวันนี้" แยกต่อร้าน: เพิ่ม shopId แล้วเปลี่ยน unique จาก (userId, businessDate) เป็น (shopId, businessDate)
ALTER TABLE `ShopOpenStatus` ADD COLUMN `shopId` INTEGER NULL;

-- แถวเดิมเป็นของร้านหลัก (ร้านที่ id น้อยสุดของผู้ใช้)
UPDATE `ShopOpenStatus` s
SET s.`shopId` = (SELECT MIN(d.`id`) FROM `ShopDetail` d WHERE d.`userId` = s.`userId`)
WHERE s.`shopId` IS NULL;

DROP INDEX `ShopOpenStatus_userId_businessDate_key` ON `ShopOpenStatus`;

CREATE INDEX `ShopOpenStatus_userId_businessDate_idx` ON `ShopOpenStatus`(`userId`, `businessDate`);

CREATE UNIQUE INDEX `ShopOpenStatus_shopId_businessDate_key` ON `ShopOpenStatus`(`shopId`, `businessDate`);
