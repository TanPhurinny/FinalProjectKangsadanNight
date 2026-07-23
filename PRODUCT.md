# PRODUCT.md

ภาพรวมฟีเจอร์ของ **Kangsadan Night Market** ระบบจัดการตลาดนัด แบ่งตามบทบาทผู้ใช้งาน 4 กลุ่ม (`Role` enum ใน `prisma/schema.prisma`): `ADMIN`, `STAFF`, `SELLER`, `CUSTOMER`

ทุกคนเข้าหน้าแรก (`/`) ได้โดยไม่ต้อง login — ระบบรู้จัก user ที่ล็อกอินอยู่ทุกหน้า (ผ่าน JWT cookie/`Authorization` header) แม้ในหน้า public เพื่อปรับ nav และเนื้อหาให้เหมาะกับ role

---

## 1. ลูกค้าทั่วไป (CUSTOMER)

Role ตั้งต้นเมื่อสมัครสมาชิก ใช้เว็บเพื่อ "ดู" ตลาดและแจ้งปัญหา ไม่ได้จองแผงขายของ

- **หน้าแรก** (`views/index.ejs`): hero แนะนำตลาด, สถิติร้านค้า/โซน, ตารางเวลาเปิด-ปิด, ประกาศ (announcement) ที่ตรงกับ role ของตน, FAQ
- **ประกาศข่าวสาร**: กรอง/ค้นหาประกาศที่ admin/staff โพสต์ถึง role `CUSTOMER` (`targetRole`/`targetRoles` ใน model `Announcement`)
- **แจ้งซ่อม/แจ้งปัญหา** (`GET/POST /repair`): แจ้งปัญหาสิ่งอำนวยความสะดวกในตลาด (ไฟดับ, พื้นชำรุด ฯลฯ) แนบรูปได้ — เก็บเป็น `MaintenanceReport` (status: PENDING → APPROVED/REJECTED/IN_PROGRESS/SUCCESS)
- **โปรไฟล์ส่วนตัว** (`/profile`): ดู/แก้ไขข้อมูลบัญชี
- **สมัครเป็นผู้ขาย**: จากหน้า register เลือกอัปโหลด `productImage` เพื่อสมัครเป็น seller (รออนุมัติ role เปลี่ยนโดย admin)

## 2. พ่อค้าแม่ค้า (SELLER)

ผู้เช่าแผงขายของในตลาด มีทั้งฟีเจอร์ของ CUSTOMER บวกระบบจองแผงเต็มรูปแบบ

- **เลือกโซน** (`GET /select-zone`): ดูโซนขายของ (FASHION/FOOD/EVENT_BOOTH) พร้อมราคาตามแถว/ผัง
- **จองแผง** (`GET/POST /booking-stall`): เลือกแผง (`Stall`) ในผังของแต่ละโซน, กำหนดช่วงวันเช่า, จำนวนแผง, ตัวเลือกไฟ (`lightEnabled`) และเครื่องใช้ไฟฟ้า (เล็ก/ใหญ่ — `BookingElectricDevice`) ระบบคำนวณราคารวมอัตโนมัติ (`rentTotal`, `lightTotal`, `applianceTotal`, `grandTotal`)
- **หน้าโปรไฟล์ร้าน** (`/seller`, model `ShopDetail`/`Seller`): ชื่อร้าน, ประเภทสินค้า, รายละเอียด, รูปสินค้า/ปกร้าน, tier, tag — ใช้แสดงในหน้าประกาศ/สาธารณะ
- **ยืนยันการชำระเงิน** (`POST /booking-payment/confirm`): อัปโหลดสลิปโอนเงิน (`paymentSlipImage`) หลังจองแผง เพื่อรอ staff/admin ตรวจสอบ
- **ติดตามสถานะการจอง** (`GET /booking-status`): ดูสถานะคำขอจอง (PENDING รอตรวจสลิป → รอชำระเงิน → APPROVED) และแจ้งเตือน (`/notifications`)
- **แจ้งซ่อม**: ใช้ฟีเจอร์เดียวกับ CUSTOMER (แจ้งปัญหาจุดขายของตัวเอง)

## 3. พนักงานตลาด (STAFF)

เข้าถึง `/admin/*` ได้เหมือน ADMIN ยกเว้นส่วนจัดการผู้ใช้และหน้าจองรวมระดับแอดมิน (gate ด้วย `isStaffOrAdmin` vs `isAdminOnly` ใน `middlewares/auth.js`) — เน้นงานปฏิบัติการหน้างานประจำวัน

- **แดชบอร์ด** (`/admin/dashboard`): ภาพรวมสถานะตลาด (ผัง slot ที่ใช้งาน/ว่าง)
- **จัดการประกาศ** (`/admin/announcements`): สร้าง/แก้ไข/ลบประกาศ พร้อมแนบรูป กำหนด role ปลายทาง (ประกาศเฉพาะ seller, เฉพาะลูกค้า, หรือทุกคน)
- **ตรวจสอบคำขอจอง** (`/admin/approvals`): อนุมัติ/ปฏิเสธคำขอจองแผง, ตรวจสลิปโอนเงินและยืนยันการชำระเงิน (`confirm-payment`)
- **จัดการรายการจองแผง** (`/admin/booking-stall`): ดูรายละเอียด/ความคืบหน้าการจองแต่ละแผง อนุมัติหรือปฏิเสธ
- **จัดการคำร้องแจ้งซ่อม** (`/admin/requests`): ดูรายการ `MaintenanceReport` ทั้งหมด อัปเดตสถานะ (รับเรื่อง/กำลังซ่อม/เสร็จสิ้น/ปฏิเสธ)
- **จัดการผังแผง/สล็อต** (`/admin/slots`): ดูผังแผงทั้งตลาด

## 4. ผู้ดูแลระบบ (ADMIN)

สิทธิ์เต็มทุกอย่างที่ STAFF ทำได้ บวกงานบริหารระบบและสิทธิ์ผู้ใช้

- **ทุกฟีเจอร์ของ STAFF** ด้านบน
- **จัดการผู้ใช้** (`/admin/users`, `isAdminOnly`): ดูรายชื่อผู้ใช้ทั้งหมด, เปลี่ยน role (เช่น อนุมัติ CUSTOMER → SELLER, ตั้ง STAFF), ลบผู้ใช้
- **หน้าจองรวมระดับแอดมิน** (`/admin/admin-booking`, ตรวจ `role === 'ADMIN'` ตรง ๆ ในโค้ด ไม่ผ่าน middleware กลาง): ภาพรวมการจองทั้งระบบข้ามโซน

---

## สรุปการไหลของข้อมูลหลัก (booking lifecycle)

1. **SELLER** เลือกโซน → เลือกแผง → กรอกช่วงเช่า/ไฟ/เครื่องใช้ไฟฟ้า → ระบบสร้าง `BookingRequest`/`Booking` สถานะ `PENDING`
2. **SELLER** อัปโหลดสลิปโอนเงิน → สถานะเปลี่ยนเป็น "รอตรวจสอบสลิป"
3. **STAFF/ADMIN** ตรวจสลิปที่หน้า `/admin/approvals` หรือ `/admin/booking-stall` → กด confirm-payment/approve → สถานะ `APPROVED`
4. หากถูกปฏิเสธ → `REJECTED` พร้อมแจ้งเตือนกลับไปยัง seller (`/notifications`)

## Reference

- Role/permission gates: `middlewares/auth.js` (`isStaffOrAdmin`, `isAdminOnly`), `middlewares/jwtAuth.js` (`requireAuth`, `getCurrentUser`)
- Route entrypoints ต่อ role: `routes/authRoutes.js` (ทุก role), `routes/sellerRoute.js` (seller + customer แจ้งซ่อม), `routes/marketRoutes.js` (booking action), `routes/adminRoutes.js` (staff/admin)
- Data model เต็ม: `prisma/schema.prisma`
