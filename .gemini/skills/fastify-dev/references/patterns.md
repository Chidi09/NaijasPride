# Fastify Development Patterns

## Route Definition
- **Type Provider**: Use `fastify-type-provider-zod` for type-safe validation and serialization.
- **Zod Schemas**: Define schemas for `params`, `query`, `body`, and `response`.
- **Async/Await**: Always use `async` route handlers.

```typescript
app.get('/path/:id', {
  schema: {
    params: z.object({ id: z.string().uuid() }),
    response: {
      200: z.object({ success: z.boolean(), data: SomeSchema }),
    },
  },
}, async (req, reply) => {
  const data = await service.getData(req.params.id);
  return { success: true, data };
});
```

## Plugin Structure
- **Modular Routes**: Group routes into plugins inside `src/modules/<feature>/`.
- **Fastify Plugin**: Use `fastify-plugin` (fp) for plugins that decorate the instance or need to persist state.

## Dependency Injection
- **Prisma**: Accessed via `fastify.prisma`.
- **Services**: Instantiate services inside the plugin and pass the prisma client.

```typescript
export const featureRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new FeatureService(fastify.prisma);
  // ... define routes using service
}
```

## Authentication
- **Decorator**: Use `fastify.authenticate(req, reply)` for protected routes.
- **User Object**: Decoded user is available at `req.user`.

```typescript
app.get('/protected', {
  preHandler: [fastify.authenticate]
}, async (req) => {
  return { user: req.user };
});
```

## Error Handling
- **Global Handler**: Handled by `globalErrorHandler` in `src/shared/errors/`.
- **Custom Errors**: Use appropriate HTTP status codes (400 for bad request, 401 for unauthorized, 404 for not found, etc.).
