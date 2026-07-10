ALTER TABLE `ShopDetail`
    ADD COLUMN `shopSummary` TEXT NULL,
    ADD COLUMN `shopCoverImage` VARCHAR(191) NULL,
    ADD COLUMN `sellerTier` VARCHAR(191) NULL,
    ADD COLUMN `shopZoneLabel` VARCHAR(191) NULL,
    ADD COLUMN `shopTags` TEXT NULL,
    ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false;

UPDATE `ShopDetail`
SET
    `shopSummary` = CASE
        WHEN `productType` IN ('อาหาร', 'FOOD') THEN CONCAT('ร้าน', COALESCE(`shopName`, 'อาหาร'), ' พร้อมเสิร์ฟเมนูสดใหม่ทุกวัน เหมาะสำหรับลูกค้าที่มองหาร้านอาหารคุณภาพในตลาดกลางคืน')
        WHEN `productType` IN ('แฟชั่น', 'FASHION') THEN CONCAT('ร้าน', COALESCE(`shopName`, 'แฟชั่น'), ' คัดสรรสินค้าแฟชั่นและแอคเซสซอรีที่โดดเด่น เหมาะสำหรับลูกค้าที่ต้องการสินค้ามีสไตล์')
        ELSE CONCAT('ร้าน', COALESCE(`shopName`, 'ค้าทั่วไป'), ' ให้บริการสินค้าคุณภาพ พร้อมต้อนรับลูกค้าทุกวัน')
    END,
    `shopCoverImage` = CASE
        WHEN `productType` IN ('อาหาร', 'FOOD') THEN 'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1400&auto=format&fit=crop'
        WHEN `productType` IN ('แฟชั่น', 'FASHION') THEN 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=1400&auto=format&fit=crop'
        ELSE 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?q=80&w=1400&auto=format&fit=crop'
    END,
    `sellerTier` = CASE
        WHEN `productType` IN ('อาหาร', 'FOOD') THEN 'Preferred Seller'
        WHEN `productType` IN ('แฟชั่น', 'FASHION') THEN 'Trend Seller'
        ELSE 'General Seller'
    END,
    `shopZoneLabel` = CASE
        WHEN `productType` IN ('อาหาร', 'FOOD') THEN 'โซนอาหาร'
        WHEN `productType` IN ('แฟชั่น', 'FASHION') THEN 'โซนแฟชั่น'
        ELSE 'โซนทั่วไป'
    END,
    `shopTags` = CASE
        WHEN `productType` IN ('อาหาร', 'FOOD') THEN 'อาหารสด,พร้อมเสิร์ฟ,ขายดี'
        WHEN `productType` IN ('แฟชั่น', 'FASHION') THEN 'แฟชั่น,สไตล์เด่น,สินค้าขายดี'
        ELSE 'ร้านค้า,คุณภาพ,พร้อมให้บริการ'
    END,
    `isVerified` = TRUE
WHERE `shopSummary` IS NULL
   OR `shopCoverImage` IS NULL
   OR `sellerTier` IS NULL
   OR `shopZoneLabel` IS NULL
   OR `shopTags` IS NULL;