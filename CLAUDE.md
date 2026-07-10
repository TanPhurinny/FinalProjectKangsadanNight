# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # install dependencies
npx prisma generate       # regenerate Prisma client after schema changes
npx prisma migrate dev    # create/apply a migration during development
node prisma/seed.js       # seed the database (also runs via `npx prisma db seed`)
npm start                 # run the app (node app.js)
npm run dev               # run with nodemon (auto-restart)
```

There is no test suite, lint config, or build step in this project. To verify a change boots correctly:

```bash
OPEN_BROWSER=false node -e "require('./app'); setTimeout(() => process.exit(0), 1500)"
```

Required env vars (see `.env`): `DATABASE_URL` (MySQL), `JWT_SECRET`. Optional: `PORT`, `NODE_ENV`, `OPEN_BROWSER`.

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

**File uploads** use `multer`: disk storage for admin announcement images (`public/uploads/announcements`, 5MB limit, image-type filter) and in-memory storage (`multer()`) for registration's `productImage` field.

**Localization:** UI copy, error messages, and code comments are primarily in Thai.
