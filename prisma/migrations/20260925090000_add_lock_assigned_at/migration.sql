-- เพิ่มคอลัมน์ lockAssignedAt ใน BookingRequest เก็บเวลาที่แอดมินจัดล็อกให้ (สถานะ IN_PROGRESS)
-- ใช้คำนวณกำหนดชำระเงินภายใน 6 ชั่วโมง
ALTER TABLE `BookingRequest` ADD COLUMN `lockAssignedAt` DATETIME(3) NULL;
