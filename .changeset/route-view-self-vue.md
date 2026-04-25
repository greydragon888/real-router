---
"@real-router/vue": minor
---

Add `<RouteView.Self>` slot for the parent-as-list pattern (#538)

`RouteView.Self` is a marker `defineComponent` (mirrors `Match`/`NotFound`)
that renders its slot content when the active route name equals the parent
`RouteView`'s `nodeName` and no descendant `Match` is active.

```vue
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersList />
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile />
  </RouteView.Match>
</RouteView>
```

Priority: `Match` → `Self` → `NotFound`. Multiple `Self` follow first-wins.
Optional `fallback` prop (`VNode | () => VNode`) wraps children in
`<Suspense>`. Compatible with the existing `keepAlive` modes on the
parent `RouteView`.
