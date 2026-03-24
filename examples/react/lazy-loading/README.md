# React Lazy Loading Example

Demonstrates code splitting with `React.lazy()` and `RouteView.Match fallback` for Suspense-based loading states.

## What it covers

- `React.lazy(() => import('./Page'))` — dynamic import per route
- `RouteView.Match fallback={<Spinner />}` — wraps children in `<Suspense>` automatically
- Three separate lazy chunks: Dashboard, Analytics, Settings
- Home page in the main bundle (no lazy loading overhead)
- Cached chunks — spinner only on first visit, instant on return

## Structure

```
src/
  main.tsx        ← standard router setup
  App.tsx         ← lazy imports + RouteView.Match with fallback
  routes.ts       ← flat route definitions
  Spinner.tsx     ← fallback component shown during chunk load
  pages/
    Home.tsx        ← in main bundle (no lazy)
    Dashboard.tsx   ← separate chunk (default export for React.lazy)
    Analytics.tsx   ← separate chunk
    Settings.tsx    ← separate chunk
../shared/
  Layout.tsx      ← shared shell
../../shared/
  styles.css
```

## Run

```bash
pnpm install
pnpm dev
```
