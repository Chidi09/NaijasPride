# Angular Development Patterns

## Component Structure
- **Standalone Components**: Always use standalone components (`standalone: true`).
- **Control Flow**: Use Angular 17+ `@if`, `@for`, `@switch` syntax.
- **Signals**: Prefer `signal()`, `computed()`, and `effect()` for local component state.
- **Styling**: Use Tailwind CSS utility classes. Prefer inline `styles: [` ... `]` for component-specific CSS if it's small.
- **Templates**: Use inline `template: ` ... `` for small to medium components, separate files for large ones.

## Data Fetching & State Management
- **TanStack Query**: Use `@tanstack/angular-query-experimental` for server state.
- **Query Services**: Pattern: `injectQuery` inside specialized query services.
- **HttpClient**: Use `HttpClient` inside data services for raw API calls.
- **Observables**: Use RxJS for event-based logic, but convert to Signals or use TanStack Query for UI state.

## Naming Conventions
- **Files**: `kebab-case.component.ts`, `kebab-case.service.ts`.
- **Selectors**: `app-kebab-case`.
- **Classes**: `PascalCaseComponent`.

## Material Design
- Use Angular Material components (`MatButtonModule`, `MatIconModule`, etc.) for UI elements.
- Custom theme variables: Use `--music-*` or `--manga-*` variables for domain-specific themes.
