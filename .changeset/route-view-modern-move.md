---
"@real-router/react": minor
---

Move `<RouteView>` to React 19.2+ only entry point (#261)

**BREAKING CHANGE:** `<RouteView>` is no longer available via `@real-router/react/legacy`.

**Migration:** Use `useRouteNode` + conditional rendering in React 18:

```tsx
const { route } = useRouteNode("");
if (startsWithSegment(route.name, "users")) return <UsersPage />;
```

Or upgrade to React 19.2+ and import from `@real-router/react`.
