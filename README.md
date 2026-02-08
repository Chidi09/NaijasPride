# NaijasPride

A full-stack monorepo for a Nigerian/African content streaming platform.

## Tech Stack

- **Frontend**: Angular 18 + Tailwind CSS + TanStack Query
- **Backend**: Fastify + Prisma + PostgreSQL (Supabase)
- **Monorepo**: Turborepo
- **Database**: Supabase (PostgreSQL)

## Features

- Movie listing with advanced filtering (Genre, Year, Quality, Sort)
- Movie detail pages with download options
- Admin dashboard for content management
- Bollywood support (new!)
- Responsive design

## Project Structure

```
├── apps/
│   ├── web/           # Angular frontend
│   └── api/           # Fastify backend
├── packages/
│   ├── shared-types/  # Shared TypeScript types
│   └── shared-validators/ # Shared Zod schemas
```

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `apps/api/.env`
4. Run database migrations: `npm run db:push`
5. Start development: `npm run dev`

## Development

```bash
# Start all services
npm run dev

# Start only API
npm run dev --filter=api

# Start only Web
npm run start

# Database operations
npm run db:push
```

## Security Env Vars

Set these in `apps/api/.env` before running auth in non-test environments:

- `JWT_SECRET` (required): access-token signing secret
- `JWT_REFRESH_SECRET` (required): refresh-token signing secret
- `JWT_ACCESS_TOKEN_TTL` (optional, default `20m`)
- `JWT_REFRESH_TOKEN_TTL` (optional, default `30d`)
- `CORS_ORIGINS` (optional, comma-separated allowlist, e.g. `http://localhost:4200`)
- `BODY_LIMIT_BYTES` (optional, default `1048576`)
- `SENTRY_DSN` (optional): backend Sentry DSN
- `SENTRY_ENVIRONMENT` (optional): e.g. `development`, `staging`, `production`
- `SENTRY_RELEASE` (optional): app version/commit

### CSRF Notes

- CSRF validation is enforced only for unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) when authentication cookies (`accessToken`/`refreshToken`) are present.
- Bearer-token (`Authorization`) requests are not CSRF-checked.
- Cookie-auth clients should first call `GET /api/v1/auth/csrf-token`, then send the returned token in `x-csrf-token`.

### Web Sentry + SW Notes

- Web Sentry reads config from `apps/web/src/index.html` meta tags:
  - `sentry-dsn`
  - `sentry-environment`
  - `app-release`
- A service worker is registered from `apps/web/src/sw.js` in secure contexts (`https` or `localhost`).

## License

MIT
