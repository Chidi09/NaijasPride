---
name: angular-dev
description: Development guidance for the NaijasPride Angular 17 frontend. Use when adding or modifying components, services, or pages in apps/web.
---

# Angular Development Skill (NaijasPride)

This skill provides procedural knowledge and patterns for developing the Angular frontend of NaijasPride.

## Workflows

### Creating a New Feature
1. **Define Types**: Add relevant types to `packages/shared-types/src/api/` or `models/`.
2. **Data Service**: Create a service in `apps/web/src/app/features/<feature>/services/<feature>-api.service.ts` using `HttpClient`.
3. **Query Service**: Create a query service in `apps/web/src/app/features/<feature>/services/<feature>-query.service.ts` using `injectQuery`.
4. **Components**: Create standalone components in `apps/web/src/app/features/<feature>/components/` or `pages/`.
5. **Routing**: Add the feature routes to `apps/web/src/app/app.routes.ts` or a feature-specific routes file.

### UI/UX Standards
- Use **Tailwind CSS** for layout and spacing.
- Use **Angular Material** for basic UI components (buttons, icons, dialogs).
- Follow the **Domain Theme**: Use CSS variables for domain-specific colors (e.g., `--music-*`, `--manga-*`).

## Reference Material

- **[patterns.md](references/patterns.md)**: Core Angular 17 conventions (Signals, Control Flow, Standalone).
- **[tanstack-query.md](references/tanstack-query.md)**: Detailed guidance on server state management.

## Tooling
- **Shell**: Use **PowerShell** for all commands (Windows environment).
- **Generate**: Use `ng generate component path/to/comp --standalone` to ensure standalone components.
- **Build**: Use `npm run build` from the repo root or `ng build` inside `apps/web`.
- **PowerShell Tip**: For sequential commands, use `;` instead of `&&`. Example: `npm run build; if ($?) { npm run start }`.