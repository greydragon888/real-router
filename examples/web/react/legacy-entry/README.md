# React Legacy Entry Example

Demonstrates `@real-router/react/legacy` — the React 18+ compatible entry point with no `RouteView`. Routing is handled manually via `useRouteNode("")` + switch/case.

## What it covers

- `import { ... } from '@real-router/react/legacy'` — React 18+ compatible entry
- Manual routing via `useRouteNode("")` + switch/case (no `<RouteView>`)
- `RouterProvider`, `Link`, `useRoute`, `useRouteNode` — same API as modern entry

## Migration path to modern entry

When you upgrade to React 19.2+, swap the import and replace the switch/case with `<RouteView>`:

**Before (legacy):**

```tsx
import { useRouteNode, Link, RouterProvider } from "@real-router/react/legacy";

function RouteContent() {
  const { route } = useRouteNode("");
  switch (route?.name) {
    case "home":
      return <Home />;
    case "about":
      return <About />;
    default:
      return <NotFound />;
  }
}
```

**After (modern):**

```tsx
import { RouteView, Link, RouterProvider } from "@real-router/react";

function RouteContent() {
  return (
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <Home />
      </RouteView.Match>
      <RouteView.Match segment="about">
        <About />
      </RouteView.Match>
      <RouteView.NotFound>
        <NotFound />
      </RouteView.NotFound>
    </RouteView>
  );
}
```

## Structure

```
src/
  main.tsx          ← creates router, mounts app (imports from /legacy)
  App.tsx           ← RouterProvider + sidebar + RouteContent (switch/case)
  routes.ts         ← route definitions
  pages/
    Home.tsx        ← home page
    About.tsx       ← about page
    Contacts.tsx    ← contacts page
../../shared/
  styles.css        ← shared CSS
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
