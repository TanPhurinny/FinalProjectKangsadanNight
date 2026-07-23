# DESIGN.md

คู่มือระบบดีไซน์ของ Kangsadan Night Market — สไตล์ **gridgeist**: ตารางเส้นชัด, เส้นขอบบาง, ไทโปกราฟีมีลำดับชั้น, ไม่มี rounded-pill/rounded-4

## Thesis

> ระบบจัดการตลาดนัดที่สื่อสารด้วยตารางบรรณาธิการ (editorial grid), เส้นกรอบบางที่จัดระเบียบเนื้อหา, สีเดียว (teal) เป็นจุดเน้น, และ mono font สำหรับ metadata/ตัวเลข — ไม่มีมุมโค้งเกินจำเป็น ไม่มีเงา ไม่มีการ์ดลอย

ใช้ทั่วทั้งหน้า `index`, `admin/*`, `seller/*`, `login` เพื่อให้ผู้ใช้ทุก role (ADMIN/STAFF/SELLER/CUSTOMER) เห็นภาษาการออกแบบเดียวกัน

## Design tokens

โทเค็นหลักประกาศเป็น CSS custom properties ซ้ำกันใน `public/stylesheets/index/style.css` และ `public/stylesheets/admin/theme.css` (ทั้งสองไฟล์ต้องซิงก์กันเมื่อแก้สี):

```css
--primary: #2C93A8;       /* teal — ปุ่มหลัก, ลิงก์, สถานะ active */
--primary-dark: #1f6f80;  /* hover state ของ primary */
--navy: #12303a;          /* หัวข้อ, navbar, footer, พื้นเข้ม */
--ink: #16333c;           /* สีตัวอักษรหลัก */
--ink-soft: #5b7a84;      /* ตัวอักษรรอง/คำอธิบาย */
--line: #d7e3e6;          /* เส้นขอบมาตรฐาน */
--line-soft: #e7eeef;     /* เส้นขอบจาง */
--soft-bg: #f6f8f8;       /* พื้นหลังโซนรอง (สลับกับพื้นขาว) */
--accent: #c98a2e;        /* warning/accent สีทอง ใช้เท่าที่จำเป็น */
--mono: 'IBM Plex Mono', 'Courier New', monospace;
```

สถานะเสริม (จาก `admin/theme.css`): `--success-color #27AE60`, `--warning-color #c98a2e`, `--info-color #3498DB`, `--danger-color #c0392b` — ใช้กับ badge/alert/card-header เท่านั้น ไม่ใช่กับปุ่มหลักทั่วไป

**Radius:** `--border-radius: 4px`, `--border-radius-sm: 3px` — ไม่มี pill, ไม่มี rounded-4 ที่ใดในระบบ
**Shadow:** `--card-shadow: none` เสมอ — ลำดับชั้นมาจากเส้นขอบและสี ไม่ใช่เงา
**Font:** body = `'Kanit', sans-serif` (ไทย/UI ทั่วไป), `--mono` สำหรับตัวเลข/metadata/label แบบ uppercase เท่านั้น (เช่น badge, timestamp, ตัวเลขสถิติ)

## Grid & layout

- Container กว้างสุด `1200px`
- ส่วนที่มีข้อมูลหลายชิ้นเรียงเป็นกริดแล้ว "แชร์เส้นขอบ" แทนที่จะให้แต่ละการ์ดมีขอบรอบตัวเอง — ทำโดยให้ container มี `border-top + border-left` แล้วแต่ละ cell มี `border-right + border-bottom` (ดู `.about-section .row.g-4`, `.zones-section .row.g-4`, `.hero-stats`, `.facts-grid`, `.visit-grid`)
- Hero เป็น 2 คอลัมน์ `1.5fr / 1fr` แบ่งด้วยเส้น ไม่ใช่ card สองใบแยกกัน (`.hero-layout`)
- Section header ใช้ `border-bottom` บาง ๆ แทนเส้นประดับ (`.section-head`, `.section-title`)

## Components

| Component | กฎ |
|---|---|
| **ปุ่มหลัก** (`.btn-kangsadan`, `.btn-primary`) | พื้น `--primary`, ขอบสีเดียวกับพื้น, radius 3px, hover → `--primary-dark` |
| **ปุ่มโครงร่าง** (`.btn-hero-ghost`, `.btn-outline-primary`) | พื้นโปร่งใส, ขอบขาว/primary 1px, hover เติมพื้นจาง |
| **Badge/pill สถานะ** | สี่เหลี่ยมมุมตัด (3px), ไม่ใช่ pill กลม, ตัวอักษร mono ตัวพิมพ์ใหญ่ (`.role-badge-pill`, `.cat-pill`, `.announcement-category`) |
| **การ์ดประกาศ** (`.announcement-card`) | ขอบ 1px `--line`, radius 4px, ไม่มีเงา, hover เปลี่ยนเฉพาะสีขอบเป็น `--primary` |
| **ตาราง** (`.table`) | หัวตารางพื้น navy ตัวอักษรขาว mono uppercase, แถวคั่นด้วยเส้นบาง ไม่ใช่ zebra shadow |
| **Alert** | ขอบซ้ายหนา 3px สีตามสถานะ, พื้นโปร่งจาง (rgba ของสีสถานะ) |
| **site-header** (แถบหัวข้อ + ปุ่มย้อนกลับ) | ปุ่มกลับสี่เหลี่ยม 40×40 มุม 3px, หัวข้อกึ่งกลาง, ใช้ในหน้า seller/admin ย่อย |

## Responsive rules

Breakpoints หลัก: `991.98px` (tablet) และ `575.98px` (mobile) — ดู `public/stylesheets/index/style.css:853-983`

หลักการ: **จัดเรียงใหม่ ไม่ใช่ย่อ** — กริด/เลย์เอาต์ 2 คอลัมน์พับเป็น 1 คอลัมน์ และเส้นขอบที่เคย "แบ่งข้าง" (`border-right`) จะเปลี่ยนเป็น "แบ่งบน-ล่าง" (`border-bottom`) เพื่อรักษาโครงสร้างกริดไว้แม้จะเรียงแนวตั้ง เช่น `.hero-layout`, `.facts-grid`, `.hero-stats`, `.visit-card`

## กติกาเมื่อแก้ไข/เพิ่มหน้าใหม่

1. ห้ามใช้ `rounded-pill`, `rounded-4`, หรือ box-shadow ใหม่ — ยึด `--border-radius-sm` (3px) เป็นค่าเริ่มต้น
2. เพิ่มโทเค็นสีใหม่ต้องประกาศใน **ทั้งสองไฟล์** `index/style.css` และ `admin/theme.css` เพื่อไม่ให้ palette เพี้ยนระหว่างหน้า public กับ admin
3. Metadata/ตัวเลข/label สถานะ → ใช้ `--mono`; เนื้อหาอ่านทั่วไป → `'Kanit'`
4. กริดหลายชิ้น (การ์ด, สถิติ, ขั้นตอน) ให้แชร์เส้นขอบร่วมกันตามรูปแบบใน `.facts-grid`/`.about-section .row.g-4` แทนการใส่ `border` ให้การ์ดแต่ละใบแยกกัน
5. โค้ปใหม่ ข้อความ error, comment ในไฟล์ที่แก้ ต้องเป็นภาษาไทย ตาม `CLAUDE.md`
6. ทดสอบ responsive ที่ 991px และ 575px ก่อนส่ง PR — ดูว่าเส้นขอบสลับด้านถูกต้องหรือไม่
