# React Data Loading Example

Demonstrates route-driven data loading via `loadData` in route config and a data-loader plugin that triggers fetches on navigation transitions.

## What it covers

- `loadData` custom field in route config — `(params) => Promise<T>`
- `getPluginApi(router).getRouteConfig(routeName)` — reads per-route config in plugin
- Custom data-loader plugin using `onTransitionSuccess` lifecycle hook
- Shared store (`useSyncExternalStore`) for loading/error/data states
- Spinner while loading, error display on failure, data on success

## Structure

```
src/
  main.tsx        ← router with dataLoaderPluginFactory()
  App.tsx         ← RouteView with exact match for products vs products.detail
  routes.ts       ← routes with loadData on products and products.detail
  dataLoader.ts   ← data-loader plugin using getPluginApi().getRouteConfig()
  pages/
    Home.tsx         ← landing page
    ProductList.tsx  ← reads from store via useSyncExternalStore
    ProductDetail.tsx ← reads product detail from store
../../shared/
  store.ts  ← microstore (loading/error/data keys per route)
  api.ts    ← mock API with 300ms delay
  styles.css
```

## Run

```bash
pnpm install
pnpm dev
```
