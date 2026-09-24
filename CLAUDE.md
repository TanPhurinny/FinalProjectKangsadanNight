# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

`npm start`/`npm run dev`/`npm install` all regenerate the Prisma client automatically (`postinstall`/`prestart`/`predev` scripts in `package.json`), so the client never drifts out of sync with `prisma/schema.prisma` after a `git pull` picks up a schema change. Only run `node app.js` directly (bypassing npm) if you've already generated the client yourself.

There is no test suite, lint config, or build step in this project. To verify a change boots correctly:

```bash
OPEN_BROWSER=false node -e "require('./app'); setTimeout(() => process.exit(0), 1500)"
```

Required env vars (see `.env`): `DATABASE_URL` (MySQL), `JWT_SECRET`. Optional: `PORT`, `NODE_ENV`, `OPEN_BROWSER`, `CLOUDINARY_URL` (required in production so uploads survive redeploys; `CLOUDINARY_FOLDER` overrides the root folder, default `kangsadan`), `GMAIL_USER`/`GMAIL_APP_PASSWORD` (Gmail App Password used to send password-reset emails via `config/mailer.js`; if unset, the reset link is logged to the console instead — fine for dev, must be set in production).

## Architecture

Server-rendered Express + EJS app ("Kangsadan Night Market" management system) backed by MySQL via Prisma. No frontend framework/bundler — views are `.ejs` templates in `views/`, static assets served from `public/`.

**Request flow (`app.js`):** two global middlewares run before routing: one sets `res.locals.path` (current URL, used by nav partials to highlight active links), one resolves `req.user`/`res.locals.user` via `getCurrentUser` (from `middlewares/jwtAuth.js`), so **every view has access to `user` even on public pages** — auth is not required to know who's logged in. Routers are mounted in this order:

- `/` → `routes/authRoutes.js` (login, register, logout, profile)
- `/admin` → `routes/adminRoutes.js` (dashboard, announcements, users, approvals, requests, bookings) — gated by `isStaffOrAdmin` (and `isAdminOnly` for user management specifically)
- `/market` → `routes/marketRoutes.js` (slot map, booking)
- `/` → `routes/sellerRoute.js` (zone selection, repair reports, stall booking)

A catch-all 404 handler re-renders `index` with an error message rather than a dedicated error page.

**Auth model — two parallel middleware layers, both reading the same JWT:**
- `middlewares/jwtAuth.js`: `requireAuth` is the hard gate (401 JSON if the URL/`Accept` header implies an API call, otherwise redirect to `/login`). It also exports `getCurrentUser`, which reads the JWT from the `Authorization: Bearer` header or the `token` cookie and is soft (returns `null` instead of failing) — used for the global `res.locals.user` middleware in `app.js`.
- `middlewares/auth.js`: role gates (`isStaffOrAdmin`, `isAdminOnly`) built on top of `getCurrentUser`, used to protect `/admin/*` routes.
- `config/authSecrets.js` centralizes the JWT secret and cookie options (httpOnly, sameSite=lax, secure only in production) and throws if `JWT_SECRET` is missing in production (falls back to a dev-only secret otherwise).
- `middlewares/authRateLimit.js` defines per-endpoint rate limiters (`authLimiter`, `registerLimiter`, `forgotPasswordLimiter`) applied in `authRoutes.js`.

Routes that need JSON vs. HTML behavior (login/register/forgot-password) branch on whether `req.originalUrl` starts with `/api/` or `Accept: application/json` is set — the same controller handles both a form POST (`/login`) and its API twin (`/api/auth/login`).

**Data layer:** `prisma/schema.prisma` defines the models: `User` (role enum: ADMIN/STAFF/SELLER/CUSTOMER), `ShopDetail` (1:1 with User), `Slot`/`Booking` (market stall booking), `BookingRequest`, `MaintenanceReport` (repair requests, status enum: PENDING/APPROVED/REJECTED/IN_PROGRESS/SUCCESS), `Announcement` (targeted by `targetRole`/`targetRoles`). Only `User` has a hand-written data-access module (`models/userModel.js`, which also strips `password` via `sanitizeUser` before returning users to callers) — other models are queried directly from controllers/routes via `new PrismaClient()`.

**Controllers** (`controllers/`) hold the actual route logic; routers mostly just wire path + middleware + controller method. `controllers/auth.js` is an empty leftover file — `controllers/authController.js` is the real auth controller.

**File uploads** use `multer` with the custom storage engine in `utils/imageStorage.js` (`createImageStorage({ folder, prefix })`). If `CLOUDINARY_URL` is set, files go to Cloudinary and the DB stores the full `https://res.cloudinary.com/...` URL; if unset (dev), it falls back to `public/uploads/<folder>/` and stores `/uploads/...`. Always read `file.url` (never build the path from `file.filename`), delete old images via `deleteImage(url)`, and read images back via `readImageBuffer(url)` (used by slip verification). Legacy announcement rows store only a filename — views use the global `imageUrl(value, 'announcements')` helper. `node scripts/migrate-uploads-to-cloudinary.js [--apply]` moves existing local files and DB values to Cloudinary. Registration's `productImage` field still uses in-memory `multer()`.

**Localization:** UI copy, error messages, and code comments are primarily in Thai.

## สถานะงานที่ทำวันนี้ (2026-09-24)

- เพิ่มระบบ **ขอใบกำกับภาษี** แยกจากใบเสนอราคาเดิม (`controllers/taxInvoiceController.js`) — ต่างจากใบเสนอราคาที่ gen อัตโนมัติทันทีที่ยืนยันสลิป ใบกำกับภาษีต้องให้ผู้ขาย/ลูกค้า **ขอเข้ามาก่อน** แล้วแอดมินเป็นคนกรอก/ยืนยันข้อมูลผู้เสียภาษี (นามบริษัทมักคนละอันกับคนจอง) แล้วถึงออกเอกสารจริง
  - Schema ใหม่: `TaxInvoiceProfile` (โปรไฟล์ผู้เสียภาษี reuse ได้ ผูกกับ `User`), `TaxInvoiceRequest` (สถานะ PENDING/ISSUED/CANCELLED, มี `replacesRequestId` เก็บสายประวัติตอน "ยกเลิก & ออกใหม่"), `TaxInvoiceRequestItem` (many-to-many ผูกกับ `BookingRequest` — 1 คำขอรวมได้หลายใบเสนอราคา) — ไม่ persist ยอดเงินซ้ำ คำนวณสดผ่าน `buildQuotationData` เสมอ
  - Migration `prisma/migrations/20260924130000_add_tax_invoice_request/` — ใช้ `prisma db push` แทน `migrate dev` เพราะ DB กลาง (TiDB Cloud) มี schema drift ที่ไม่เกี่ยวกับงานนี้อยู่ก่อนแล้ว (`migrate dev` จะขึ้นเตือนให้ `migrate reset` ซึ่ง**ลบข้อมูลทั้งหมด** — ห้ามทำเด็ดขาดกับ DB ทีมที่ใช้งานจริง) แล้วเขียน migration SQL มือ + `prisma migrate resolve --applied` เพื่อให้ migration history ตรงกับ DB จริงโดยไม่รีเซ็ตข้อมูล
  - ฝั่งผู้ขาย: UI ขอใบกำกับภาษี (เลือกใบเสนอราคาได้หลายใบ + เลือกโปรไฟล์เดิม/กรอกนามใหม่) **รวมอยู่ในหน้า "ร้านค้าของฉัน" (`/shop-profile`)** ไม่ใช่หน้าแยก (ย้ายจากเมนู navbar ออกมาเพราะดูไม่สวย) — โปรไฟล์คู่มือ reuse ได้จาก dropdown ถ้าเคยขอมาก่อน
  - ฝั่งแอดมิน: หน้า `/admin/tax-invoice-requests` (list + filter สถานะ) และ `/admin/tax-invoice-requests/:id/fulfill` (กรอก/แก้ข้อมูลผู้เสียภาษีแล้วออกเอกสาร หรือ "ยกเลิก & ออกใหม่" ถ้าออกไปแล้วพบข้อมูลผิด — เก็บฉบับเดิมไว้เป็นประวัติเสมอ ไม่ลบทิ้ง) อยู่ใน dropdown "เพิ่มเติม" ของ navbar แอดมิน
  - แจ้งเตือนผู้ขาย: เพิ่มการ์ด "ใบกำกับภาษีได้รับการอนุมัติแล้ว" / "คำขอถูกปฏิเสธ" ในหน้า `/notifications` (`buildTaxInvoiceNotifications` ใน `routes/sellerRoute.js`) ตาม pattern เดียวกับการ์ดใบเสนอราคาเดิม
- แก้ navbar ล้นทั้งฝั่งแอดมิน/ผู้ขาย ด้วย component dropdown "เพิ่มเติม" (`<details>/<summary>`, ไม่ใช้ JS หนัก) ที่มี CSS เตรียมไว้ในโปรเจกต์อยู่แล้วแต่ไม่เคยถูกใช้จริง — ระหว่างทางเจอบั๊ก dropdown panel โดน `.nav-links { overflow-x: auto }` ตัดจนกลายเป็นกล่องเลื่อนเล็กๆ (CSS overflow บังคับให้ทั้งสองแกนตัดพร้อมกันเสมอ แยกไม่ได้) แก้ด้วย JS สลับพาเนลเป็น `position: fixed` คำนวณตำแหน่งจริงตอนเปิด (`public/js/partials/navbar.js`)
- ปรับ UX งานตรวจความสะอาดร้านอาหาร (`/staff/marketinspection` โหมดความสะอาด) ให้ตรวจ+บันทึกเสร็จแล้ว **เด้งไปร้านถัดไปในลิสต์อัตโนมัติ** ไม่ต้องปิด-เปิดฟอร์มเอง พร้อมโชว์ข้อมูลร้าน/ผู้ขาย/สินค้าหลักที่หัว modal ให้เห็นชัดว่ากำลังตรวจร้านไหน (`public/js/staff/marketinspection-cleanliness.js`) — ระหว่างทางเจอบั๊ก modal ชนกับ navbar (z-index ของ `.excess-panel` ต่ำกว่า navbar ที่ sticky ไว้ สีเดียวกันเลยดูเหมือนหัว modal หายไป) แก้แล้วใน `public/stylesheets/staff/marketinspection.css`

## Team conventions

This project is worked on by multiple people in parallel (branches per person: `tan`, `bow`, `tannav`, ...). To keep everyone's work compatible:

- **Branches:** work on your own branch (named after you), merge into `main` via PR — don't commit directly to `main`.
- **Commits:** one commit per logical change, message in Thai, written as a full sentence describing what changed (e.g. `เพิ่มระบบแอดมินตรวจสอบสลิปโอนเงินก่อนยืนยันล็อก`) — not `feat:`/`fix:` prefixes, not English.
- **Before starting work:** `git pull` on `main` and rebase/merge it into your branch first — several people touch `views/`, `controllers/`, and `routes/` at once, so stale branches conflict often.
- **UI/design:** follow the existing "gridgeist" visual style already applied across `index`, `admin`, and `seller` pages (see git history for `รีดีไซน์...เป็นสไตล์ gridgeist`) — sharp grid layout, visible borders, no `rounded-pill`/`rounded-4`. Use the `gridgeist` skill when redesigning or adding pages so new screens match.
- **After schema changes:** run `npx prisma generate` and commit the migration under `prisma/migrations/` — don't hand-edit the generated client.
- **Before opening a PR:** boot-check the app (see verify command above) and click through the flow you changed in a browser; there's no automated test suite to catch regressions.
- **Language:** keep new UI copy, flash/error messages, and comments in Thai to match the rest of the codebase; code identifiers (variables, functions, routes) stay in English.
