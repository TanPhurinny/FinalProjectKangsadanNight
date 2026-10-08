# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

`npm start`/`npm run dev`/`npm install` all regenerate the Prisma client automatically (`postinstall`/`prestart`/`predev` scripts in `package.json`), so the client never drifts out of sync with `prisma/schema.prisma` after a `git pull` picks up a schema change. Only run `node app.js` directly (bypassing npm) if you've already generated the client yourself.

There is no test suite, lint config, or build step in this project. To verify a change boots correctly:

```bash
OPEN_BROWSER=false node -e "require('./app'); setTimeout(() => process.exit(0), 1500)"
```

Required env vars (see `.env`): `DATABASE_URL` (MySQL), `JWT_SECRET`. Optional: `PORT`, `NODE_ENV`, `OPEN_BROWSER`, `CLOUDINARY_URL` (required in production so uploads survive redeploys; `CLOUDINARY_FOLDER` overrides the root folder, default `kangsadan`), `GMAIL_USER`/`GMAIL_APP_PASSWORD` (Gmail App Password used to send password-reset emails via `config/mailer.js`; if unset, the reset link is logged to the console instead — fine for dev, must be set in production), `PUBLIC_BASE_URL` (base URL baked into stall QR codes/printed signs from `controllers/marketMapController.js`; defaults to the request's protocol+host — set it if production sits behind a proxy or a different domain).

## Architecture

Server-rendered Express + EJS app ("Kangsadan Night Market" management system) backed by MySQL via Prisma. No frontend framework/bundler — views are `.ejs` templates in `views/`, static assets served from `public/`.

**Request flow (`app.js`):** two global middlewares run before routing: one sets `res.locals.path` (current URL, used by nav partials to highlight active links), one resolves `req.user`/`res.locals.user` via `getCurrentUser` (from `middlewares/jwtAuth.js`), so **every view has access to `user` even on public pages** — auth is not required to know who's logged in. Routers are mounted in this order:

- `/` → `routes/authRoutes.js` (login, register, logout, profile)
- `/admin` → `routes/adminRoutes.js` (dashboard, announcements, users, approvals, requests, bookings) — gated by `isStaffOrAdmin` (and `isAdminOnly` for user management specifically)
- `/market` → `routes/marketRoutes.js` (slot map, booking)
- `/` → `routes/sellerRoute.js` (zone selection, repair reports, stall booking, and the market map `/market-map` + its extras `/market-map/{qr,sign,print,track}` handled by `controllers/marketMapController.js`)

**`/market-map` is public (no login)** so customers can scan a stall's QR sign. Internal data (vacancy, contract end dates, inspection results, lot prices, open repairs) is stripped server-side by role in `getMarketMapPage` — never just hidden with CSS. Its client is split into `public/js/marketMap.js` (map, layers, cards) and `public/js/marketNav.js` (step-by-step navigation, loaded after and reusing marketMap.js globals).

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

## สถานะงานที่ทำวันนี้ (2026-10-02)

งานทั้งหมดอยู่บน branch `tanmac` (push แล้ว ยังไม่ได้เปิด PR เข้า `main`) — เน้นผังตลาด `/market-map` ให้ใช้บนมือถือเป็นหลัก

- **ระบบชั้นข้อมูลบนผัง (layer)** สำหรับแอดมิน/staff: แท็บสลับว่าสีบนล็อกบอกเรื่องอะไร — หมวดสินค้า / ผลตรวจวันนี้ (`utils/inspectionToday.js`) / หมดสัญญา (มีแถบเลื่อน "ดูล่วงหน้า 0–30 วัน" + เลือกหลายล็อกแล้วแจ้งเตือน/ปล่อยล็อกพร้อมกัน) / งานซ่อม (ปักหมุดคำร้องที่ยังไม่ปิดจากรหัสล็อกในช่อง `location`) — เพิ่มชั้นใหม่ได้ที่ `LAYERS` ใน `marketMap.js`
- **staff:** บันทึกผลตรวจด่วนจากการ์ดล็อก (ใช้ API เดิม `/staff/marketinspection/*`) + โหมดเดินตรวจ เรียงร้านที่ยังไม่ตรวจตามเส้นทางจริง (`utils/inspectionWalkOrder.js` ใช้ร่วมกับหน้าตรวจตลาด) บันทึกแล้วเด้งไปร้านถัดไป — **ยังไม่ได้ลองบันทึกจริงกับ DB**
- **ผู้ขาย:** อัปโหลดรูปเมนูได้ 4 รูป (ตาราง `ShopMenuImage`), แถบความครบของร้าน + สถิติคนเปิดดูร้าน 7 วัน (ตาราง `ShopViewEvent` เก็บแค่ร้าน/ประเภท/เวลา ไม่เก็บผู้ดู) ในหน้าร้านค้าของฉัน, การ์ดสุขภาพล็อก (สัญญา/ความสะอาด/ไฟเกิน/แจ้งซ่อมค้าง) + ปุ่มแจ้งซ่อมล็อกนี้ (`/repair?stall=`), QR ร้าน + ป้ายหน้าร้าน A5 (`/market-map/sign/:code`), แถบรอบจองถัดไปที่หัวหน้าเลือกโซน (`getRoundTimeline` ใน `utils/bookingRound.js` คำนวณจากกติกาเดียวกับฟอร์มจอง)
- **ลูกค้า:** ป้ายเมนูเด่น + ปุ่มดูเมนูร้าน, ร้านโปรด/ดูล่าสุด (localStorage), แชร์ร้าน, ป้ายร้านใหม่, ร้านข้างๆ, โพสต์ล่าสุดของร้าน, ซูมผัง (ปุ่ม + สองนิ้ว), การ์ดร้านเป็น bottom sheet บนมือถือ, **นำทาง "ฉันอยู่ตรงนี้"** (แตะโซนบนผังย่อ → เส้นทาง + ขั้นตอนเลี้ยวซ้าย/ขวา นับแถว นับล็อก — พิกัดอยู่ใน `ZONE_GEO` ของ `marketNav.js` ต้องตรงกับ `#zone-*` ใน `marketMap.css`; **ยังไม่ได้ลองเดินตามที่หน้างานจริง**)
- **ปิดร้านวันนี้:** ทุกร้านถือว่าเปิดอยู่เป็นค่าเริ่มต้น ผู้ขายกดแค่ "ปิดร้านวันนี้" (ปุ่มแดง, กดยกเลิกได้) ที่หน้าแรกผู้ขาย `/seller` หรือการ์ดล็อกตัวเองบนผัง → `POST /shop-status` — ตาราง `ShopOpenStatus` มีแถวเฉพาะร้านที่กดปิด ต่อ 1 "วันขาย" ที่ตัดวันตอนตี 5 (ตลาดกลางคืนขายเลยเที่ยงคืน, ดู `utils/shopOpenStatus.js`) ร้านกลับมาเปิดเองวันขายถัดไป / ลูกค้าเห็นร้านที่ปิดจางลงพร้อมป้าย "ปิด" + ตัวกรอง "เปิดอยู่ตอนนี้" / staff กรอง "แจ้งปิดร้าน" ในชั้นผลตรวจได้ (คอลัมน์ `openedAt` เหลือจากเวอร์ชันแรกที่ให้เช็คอินเปิดร้าน ไม่ได้ใช้แสดงผลแล้ว)
- **แก้บั๊กระหว่างทาง:** "ล็อกของฉัน" บนผังไม่เคยขึ้นเพราะ `BookingRequest.sellerId` เป็น null ทุกแถว — ตอนนี้จับคู่จากชื่อผู้ขายด้วย (ชื่อซ้ำจะปนกัน ควรผูก `sellerId` จริงในอนาคต); หน้าตรวจตลาดนับล็อกที่ถูกปล่อยแล้วเป็นงานตรวจ (คำขอ SUCCESS ค้างไว้โดยตั้งใจตาม `utils/stallRenewal.js`) — ตอนนี้นับเฉพาะล็อกที่ `Stall.status` ยัง `BOOKED`
- **ค้างตัดสิน:** 4 ล็อก (B304, B100, B601, B106) มีคำขอ SUCCESS แต่ล็อกถูกปล่อยเป็นว่าง — จะกู้คืนด้วย `scripts/restore-released-stalls.js` หรือปล่อยไว้

## Team conventions

This project is worked on by multiple people in parallel (branches per person: `tan`, `bow`, `tannav`, ...). To keep everyone's work compatible:

- **Branches:** work on your own branch (named after you), merge into `main` via PR — don't commit directly to `main`.
- **Commits:** one commit per logical change, message in Thai, written as a full sentence describing what changed (e.g. `เพิ่มระบบแอดมินตรวจสอบสลิปโอนเงินก่อนยืนยันล็อก`) — not `feat:`/`fix:` prefixes, not English.
- **Before starting work:** `git pull` on `main` and rebase/merge it into your branch first — several people touch `views/`, `controllers/`, and `routes/` at once, so stale branches conflict often.
- **UI/design:** follow the existing "gridgeist" visual style already applied across `index`, `admin`, and `seller` pages (see git history for `รีดีไซน์...เป็นสไตล์ gridgeist`) — sharp grid layout, visible borders, no `rounded-pill`/`rounded-4`. Use the `gridgeist` skill when redesigning or adding pages so new screens match — it's committed at `.claude/skills/gridgeist/` (MIT, from github.com/ohmiler/gridgeist), so Claude Code loads it for everyone automatically; update it there rather than installing a personal copy. **Fonts:** `IBM Plex Sans Thai` for all UI text and `IBM Plex Mono` only for numbers/codes/dates (stall codes, counters) — load both with the same Google Fonts link every page uses (`family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700`), and always put `'IBM Plex Sans Thai'` right after `'IBM Plex Mono'` in mono stacks because Plex Mono has no Thai glyphs (Thai text would otherwise fall back to a mismatched system font).
- **After schema changes:** run `npx prisma generate` and commit the migration under `prisma/migrations/` — don't hand-edit the generated client.
- **Applying schema changes to the shared DB (TiDB Cloud):** never use `prisma migrate dev` — the shared DB has drift unrelated to your change, so it prompts for `migrate reset`, which **wipes all team data**. Instead: check the diff first with `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` (must contain only your change), save it as `prisma/migrations/<timestamp>_<name>/migration.sql`, apply with `npx prisma db execute --file <that file> --schema prisma/schema.prisma`, then `npx prisma migrate resolve --applied <name>` so migration history matches the DB.
- **Before opening a PR:** boot-check the app (see verify command above) and click through the flow you changed in a browser; there's no automated test suite to catch regressions.
- **Language:** keep new UI copy, flash/error messages, and comments in Thai to match the rest of the codebase; code identifiers (variables, functions, routes) stay in English.
