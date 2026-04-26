# React Nested Routes Example

Demonstrates nested `<RouteView>` with `useRouteNode`, breadcrumbs via `useRouteUtils().getChain()`, and ancestor matching in a multi-level navigation layout.

## What it covers

- Nested `<RouteView nodeName="users">` inside a layout component
- `useRouteNode("users")` — re-renders only when `users.*` subtree changes
- `useRouteUtils().getChain(routeName)` — builds breadcrumb trail from ancestor chain
- `<Link activeStrict={false}>` ancestor matching — outer sidebar highlights "Users" for all `users.*` routes
- **`<RouteView.Self>` for parent-as-page** — `users` IS the list, `users.profile` IS the profile (no synthetic `list` child / `forwardTo`); `Self` renders when the active route equals `nodeName`, `Match segment="profile"` wins for `/users/:id` and below

## Structure

```
src/
  main.tsx           ← creates router, mounts app
  App.tsx            ← outer RouteView (home | users subtree)
  routes.ts          ← route definitions with nested children
  pages/
    Home.tsx         ← home page
    UsersLayout.tsx  ← breadcrumbs + inner RouteView (Self=UsersList, Match=UserProfile)
    UsersList.tsx    ← lists users with profile links
    UserProfile.tsx  ← per-user sub-nav + nested RouteView (Self=details, Match=Settings)
    UserSettings.tsx ← per-user settings form
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
