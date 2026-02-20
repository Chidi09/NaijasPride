# Database Patterns (Prisma)

The project uses Prisma ORM for database access.

## Service Pattern
Encapsulate all database logic inside service classes. Services should receive the `PrismaClient` (or a transaction client) in their constructor.

```typescript
export class FeatureService {
  constructor(private prisma: PrismaClient) {}

  async findActive(id: string) {
    return this.prisma.feature.findUnique({
      where: { id, status: 'active' }
    });
  }
}
```

## Common Practices
- **Selection Objects**: Use `const SOME_SELECT = { ... } as const` to define reusable selection shapes and ensure type safety.
- **Active Filter**: Always filter by `status: ContentStatus.active` for public-facing queries unless otherwise specified.
- **Transactions**: Pass the `prisma` client from the transaction to the service if needed.
- **Kebab/Camel Case**: Database tables use `PascalCase` or `snake_case` in schema, but Prisma generates `camelCase` for fields.

## Schema Locations
- Schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
