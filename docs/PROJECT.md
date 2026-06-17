# Project: NaijasPride Type Refactoring

## Architecture

- Monorepo using Turborepo.
- `apps/api`: Fastify backend using Prisma and shared packages.
- `apps/web`: Angular 17 frontend using shared packages.
- `packages/shared-types`, `packages/shared-utils`, `packages/shared-validators`, `packages/shared-config`: Shared packages used by both api and web.

## Code Layout

- `apps/api/src/` - Backend source code
- `apps/web/src/` - Frontend source code

## Milestones

| #   | Name                    | Scope                                                                                  | Dependencies | Status      |
| --- | ----------------------- | -------------------------------------------------------------------------------------- | ------------ | ----------- |
| 1   | apps/api Refactoring    | Refactor all explicit `any` types in `apps/api` to precise types and pass local checks | none         | IN_PROGRESS |
| 2   | apps/web Refactoring    | Refactor all explicit `any` types in `apps/web` to precise types and pass local checks | none         | IN_PROGRESS |
| 3   | Final Integration Check | Run repository-wide typecheck and linting to ensure no regressions                     | 1, 2         | PLANNED     |

## Interface Contracts

- No changes to runtime interfaces or network APIs are planned. All type signatures are purely internal typescript enhancements.
