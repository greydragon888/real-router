---
"@real-router/react": minor
---

Add `<RouteView.Self>` slot for the parent-as-list pattern (#538)

`RouteView.Self` renders its children when the active route name equals the
parent `RouteView`'s `nodeName` and no descendant `Match` is active. This
closes the API gap that previously forced imperative
`route.name === ...` ternaries when a parent route IS the listing of its
children.

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersList />
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile />
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <UserSettings />
  </RouteView.Match>
</RouteView>
```

Priority order: `Match` (descendant of `nodeName`) → `Self` (active equals
`nodeName`) → `NotFound` (`UNKNOWN_ROUTE`). At most one slot renders. Multiple
`Self` instances follow the first-wins rule (mirrors `NotFound`). `Self`
accepts an optional `fallback` prop that wraps children in `<Suspense>`.
