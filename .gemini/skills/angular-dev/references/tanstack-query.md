# TanStack Query (Angular)

The project uses `@tanstack/angular-query-experimental` for managing server state.

## Core Patterns

### Query Services
Queries should be encapsulated in a query service. Use `injectQuery` and wrap params in signals to enable automatic re-fetching when signals change.

```typescript
@Injectable({ providedIn: 'root' })
export class FeatureQueryService {
  private api = inject(FeatureApiService);

  getItemsQuery(params: Signal<Params>) {
    return injectQuery(() => ({
      queryKey: ['items', params()],
      queryFn: () => lastValueFrom(this.api.getItems(params())),
      staleTime: 5 * 60 * 1000,
    }));
  }
}
```

### In Components
Inject the query service and use the returned query object. Access data via the `data` signal.

```typescript
export class FeatureComponent {
  private queryService = inject(FeatureQueryService);
  params = signal({ page: 1 });

  query = this.queryService.getItemsQuery(this.params);
  
  // Access data: query.data()
  // Access status: query.isLoading(), query.isError()
}
```

### Mutations
Use `injectMutation` for create/update/delete operations.

```typescript
updateMutation = injectMutation((client) => ({
  mutationFn: (data: UpdateData) => lastValueFrom(this.api.update(data)),
  onSuccess: () => {
    client.invalidateQueries({ queryKey: ['items'] });
  },
}));
```

## Best Practices
- **Query Keys**: Use consistent array-based keys.
- **Async/Await**: Convert `HttpClient` Observables to Promises using `lastValueFrom` inside `queryFn`.
- **Signals**: Always pass parameters as Signals to `injectQuery` so TanStack Query can react to changes.
