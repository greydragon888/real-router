# React Basic Example

Demonstrates core routing with `@real-router/react`: navigation, active links, and a 404 page.

## What it covers

- `createRouter(routes)` + `browserPluginFactory()` + `router.start()`
- `RouterProvider`, `<Link activeClassName>`, `<RouteView>` + `Match` segments + `NotFound`
- `useRoute()` — reading current route state
- `defaultRoute` + `allowNotFound: true`
- Browser back/forward navigation

## Structure

```
src/
  main.tsx        ← creates router, mounts app
  App.tsx         ← RouterProvider + Layout + RouteView
  routes.ts       ← route definitions
  pages/
    Home.tsx      ← home page with useRoute()
    About.tsx     ← about page
    Contacts.tsx  ← contacts page
../shared/
  Layout.tsx      ← shared shell (header + sidebar + content + footer)
../../shared/
  styles.css      ← shared CSS
```

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```
