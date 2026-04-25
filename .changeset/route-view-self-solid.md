---
"@real-router/solid": minor
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

Implemented as a Symbol-based marker object (`SELF_MARKER`), symmetric to the
existing `Match`/`NotFound` markers. Priority: `Match` → `Self` → `NotFound`.
Multiple `Self` follow first-wins. Optional `fallback` prop wraps children in
Solid's `<Suspense>`.
