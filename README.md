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

## License

MIT
