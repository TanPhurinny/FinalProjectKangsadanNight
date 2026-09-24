-- ประเภทสินค้าเฉพาะ (subtype) ให้ผู้ขายเลือกตอนสมัครร้าน ใช้เทียบระยะห่างล็อกตอนแอดมินจัดล็อก
-- (ดู utils/productSubtypes.js)
ALTER TABLE `SellerApplication` ADD COLUMN `productSubtype` VARCHAR(191) NULL, ADD COLUMN `productSubtypeOther` VARCHAR(191) NULL;
ALTER TABLE `ShopDetail` ADD COLUMN `productSubtype` VARCHAR(191) NULL, ADD COLUMN `productSubtypeOther` VARCHAR(191) NULL;
