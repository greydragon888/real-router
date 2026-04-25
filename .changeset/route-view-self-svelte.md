---
"@real-router/svelte": minor
---

Add `self` reserved snippet on `<RouteView>` for the parent-as-list pattern (#538)

`RouteView` now recognises a `self` named snippet, alongside the existing
`notFound`. The `self` snippet renders when the active route name equals the
parent `RouteView`'s `nodeName` and no segment snippet matches.

```svelte
<RouteView nodeName="users">
  {#snippet self()}
    <UsersList />
  {/snippet}
  {#snippet profile()}
    <UserProfile />
  {/snippet}
  {#snippet notFound()}
    <NotFoundPage />
  {/snippet}
</RouteView>
```

Priority: segment snippet match → `self` (active equals `nodeName`) →
`notFound` (`UNKNOWN_ROUTE`). Like `notFound`, `self` is reserved — a route
literally named `self` is **never** picked as a regular segment match (use a
different snippet name if you need to render a route called `self`).
