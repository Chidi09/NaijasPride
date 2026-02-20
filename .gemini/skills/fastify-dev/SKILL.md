---
name: fastify-dev
description: Development guidance for the NaijasPride Fastify API. Use when adding routes, services, or modules in apps/api.
---

# Fastify Development Skill (NaijasPride)

This skill provides procedural knowledge and patterns for developing the backend Fastify API of NaijasPride.

## Workflows

### Adding a New API Module
1. **Prisma Schema**: Update `apps/api/prisma/schema.prisma` and run `npx prisma migrate dev`.
2. **Service Class**: Create `apps/api/src/modules/<module>/<name>.service.ts` for business and DB logic.
3. **Routes Plugin**: Create `apps/api/src/modules/<module>/<name>.routes.ts`.
4. **Register**: Add the routes to `apps/api/src/app.ts`.

### Security & Validation
- Always use **Zod** for request validation (`schema` property in routes).
- Use `fastify.authenticate` for protected routes.
- Sanitize user input (Fastify `preValidation` hook is already configured globally).

## Reference Material

- **[patterns.md](references/patterns.md)**: Route definitions, Type safety, Plugins, and Authentication.
- **[database.md](references/database.md)**: Prisma usage, Selection objects, and Service patterns.

## Tooling
- **Shell**: Use **PowerShell** for all commands (Windows environment).
- **Test**: `npm run test` (if configured).
- **Build**: `npm run build` from the repo root or inside `apps/api`.
- **Database**: `npx prisma studio` to view data locally.
- **PowerShell Tip**: For sequential commands, use `;` instead of `&&`. Example: `npx prisma generate; if ($?) { npm run build }`.