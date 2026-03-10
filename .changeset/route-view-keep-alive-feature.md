---
"@real-router/react": minor
---

Add `keepAlive` prop to `<RouteView.Match>` (#261)

New `keepAlive` prop on `<RouteView.Match>` uses React 19.2 `<Activity>` API to hide deactivated matches instead of unmounting them, preserving DOM and React state:

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users" keepAlive>
    <UsersPage />
  </RouteView.Match>
</RouteView>
```
