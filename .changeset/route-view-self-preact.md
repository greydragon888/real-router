---
"@real-router/preact": minor
---

Add `<RouteView.Self>` slot for the parent-as-list pattern (#538)

`RouteView.Self` renders its children when the active route name equals the
parent `RouteView`'s `nodeName` and no descendant `Match` is active.

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersList />
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile />
  </RouteView.Match>
</RouteView>
```

Priority: `Match` → `Self` → `NotFound`. Multiple `Self` follow first-wins
(mirrors `NotFound`). Optional `fallback` prop wraps children in `<Suspense>`
from `preact/compat`.
