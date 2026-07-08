# FinalProjectKangsadanNight

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your database and secret values
3. Install dependencies
4. Run Prisma generate if needed
5. Start the app

## Environment Variables

Required:

- `DATABASE_URL`
- `JWT_SECRET`

Optional:

- `PORT`
- `NODE_ENV`
- `OPEN_BROWSER`

Example:

```env
DATABASE_URL="mysql://user:password@localhost:3306/kangsadan_night"
JWT_SECRET="change-this-jwt-secret"
PORT=3000
NODE_ENV=development
OPEN_BROWSER=false
```

## Run

```bash
npm install
npx prisma generate
npm start
```

For development:

```bash
npm run dev
```

## Authentication Notes

- Passwords are hashed with `bcrypt`
- Login returns a JWT
- Protected routes use JWT-based auth middleware
- Login, register, and forgot-password endpoints return JSON for API requests

## Verify

Use these commands after changes:

```bash
npm start
```

Or run a quick boot check:

```bash
OPEN_BROWSER=false node -e "require('./app'); setTimeout(() => process.exit(0), 1500)"
```
