# React HMR Example

Demonstrates Hot Module Replacement for route config changes via `getRoutesApi(router).replace(routes)` and `import.meta.hot.accept`.

**Dev-only feature** — the HMR block is tree-shaken out of production builds by Vite.

## How to test

1. `pnpm install && pnpm dev`
2. Open the app in the browser
3. Navigate to any page
4. Open `src/routes.ts` in your editor
5. Add a new route, rename an existing one, or remove one
6. Save — the router updates without a page reload and the current URL is preserved

## What it covers

- `getRoutesApi(router).replace(routes)` — atomic route tree replacement (state revalidation included)
- `import.meta.hot.accept("./routes", callback)` — Vite HMR module hot swap
- HMR block is dev-only: Vite tree-shakes `import.meta.hot` code in production

## Structure

```
src/
  vite-env.d.ts     ← Vite client types (import.meta.hot)
  main.tsx          ← creates router + HMR block
  App.tsx           ← RouteView with three pages
  routes.ts         ← route definitions (edit this to trigger HMR)
  pages/
    Home.tsx
    About.tsx
    Settings.tsx
../shared/
  Layout.tsx        ← shared shell
../../shared/
  styles.css        ← shared CSS
```

## HMR block (in main.tsx)

```ts
if (import.meta.hot) {
  import.meta.hot.accept("./routes", (mod) => {
    if (mod) {
      getRoutesApi(router).replace(mod["routes"] as Route[]);
    }
  });
}
```

## Build

```bash
pnpm build
```
