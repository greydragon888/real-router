# React Nested Routes Example

Demonstrates nested `<RouteView>` with `useRouteNode`, breadcrumbs via `useRouteUtils().getChain()`, and ancestor matching in a multi-level navigation layout.

## What it covers

- Nested `<RouteView nodeName="users">` inside a layout component
- `useRouteNode("users")` — re-renders only when `users.*` subtree changes
- `useRouteUtils().getChain(routeName)` — builds breadcrumb trail from ancestor chain
- `<Link activeStrict={false}>` ancestor matching — outer sidebar highlights "Users" for all `users.*` routes
- `forwardTo: "users.list"` — alias redirect on the parent route

## Structure

```
src/
  main.tsx           ← creates router, mounts app
  App.tsx            ← outer RouteView (home | users subtree)
  routes.ts          ← route definitions with nested children
  pages/
    Home.tsx         ← home page
    UsersLayout.tsx  ← breadcrumbs + inner sidebar + inner RouteView
    UsersList.tsx    ← lists users with profile links
    UserProfile.tsx  ← profile page using useRouteNode("users.profile")
    UserSettings.tsx ← settings form
../shared/
  Layout.tsx         ← shared shell
../../shared/
  styles.css         ← shared CSS
```

## Run

```bash
pnpm install
pnpm dev
```
