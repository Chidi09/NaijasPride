<p align="center">
  <img src="apps/web/src/assets/images/logo-full.png" alt="NaijasPride" width="250" />
</p>

<h1 align="center">NaijasPride</h1>

<p align="center">
  A premier streaming and media platform tailored for Nollywood, Bollywood, Hollywood content, as well as anime and books.<br/>
  Built with scale, performance, and best engineering practices in mind.
</p>

---

## 🏗 Architecture & Engineering Patterns

This project leverages modern software engineering principles to ensure maintainability, security, and performance.

### 1. Monorepo Organization (Turborepo)

- **Separation of Concerns**: The codebase is logically divided into functional domains:
  - `apps/web`: Angular 18 frontend client.
  - `apps/api`: Fastify backend service.
  - `packages/shared-types`: Unified TypeScript definitions shared across the stack.
  - `packages/shared-validators`: Zod schemas for end-to-end type safety and runtime validation.
- **Optimized Builds**: Turborepo provides intelligent caching and parallel execution for CI/CD and local development.

### 2. Modern Frontend Stack

- **Framework**: Angular 18 utilizing signals for fine-grained reactivity and minimal change detection overhead.
- **Styling**: Tailwind CSS with custom thematic design systems (e.g., "Old Money" palette).
- **State Management**: TanStack Query (Angular integration) for declarative server-state management, caching, and deduplication of requests.
- **Progressive Web App (PWA)**: Implements service workers for caching, offline fallbacks, and a native-like installation experience.
- **SEO Optimization**: Server-side friendly meta tags, dynamic OpenGraph/Twitter card injection, and structural JSON-LD for rich search engine results.

### 3. High-Performance Backend

- **Framework**: Fastify is used for its exceptional speed and low overhead.
- **Database & ORM**: PostgreSQL hosted on Supabase, managed securely with Prisma ORM for type-safe database access and predictable schema migrations.
- **Resiliency & Circuit Breakers**: Built-in failure tolerance for external dependencies (e.g., third-party manga/anime APIs). Automatic circuit breaking and recovery windows (`MANGA_SOURCE_<SOURCE>_CB_FAILURES`) prevent cascading failures when external services experience downtime.
- **Security**:
  - Strict CSRF protection validating all mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Secure stateless JWT authentication: HTTP-only refresh tokens and short-lived access tokens.
  - Granular CORS policies and rate limiting.
- **Observability**: Fully integrated with Sentry (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`) for real-time error tracking and performance monitoring.

### 4. Advanced Networking & Proxying

- **Cloudflare Bypass Support**: Built-in integration with FlareSolverr to reliably access external content APIs protected by Cloudflare.
- **Docker Compose**: Seamless developer experience for spinning up the backend, database, and proxy services locally within a unified network.

---

## 🚀 Getting Started

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Environment Setup**: Copy `.env.example` to `apps/api/.env` and configure your credentials.
4. **Database Migration**: `npm run db:push`
5. **Start Development**: `npm run dev`

### Development Commands

```bash
# Start all services concurrently
npm run dev

# Start only API
npm run dev --filter=api

# Start only Web Client
npm run start

# Run database operations
npm run db:push
```

## 🔒 Security & Environment Variables

Ensure these are set in `apps/api/.env` for production environments:

- `JWT_SECRET` / `JWT_REFRESH_SECRET`: Cryptographic keys for token generation.
- `CORS_ORIGINS`: Strict allowlist for frontend clients.
- `SENTRY_DSN`: Endpoint for telemetry reporting.

### Manga Source Environment Configurations

- `MANGA_SOURCES_ENABLED`: Toggle specific providers (`mangadex`, `weebcentral`, `asura`).
- `FLARESOLVERR_URL`: Target URL for the FlareSolverr instance.
- `MANGA_SOURCE_<SOURCE>_CB_FAILURES`: Fault tolerance thresholds.

## 📄 License

MIT License.
