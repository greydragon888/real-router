---
"@real-router/react": minor
---

Add `<RouteView>` declarative routing component (#260)

Declarative compound component for view-level routing. Replaces imperative if/switch patterns with JSX:

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage />
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage />
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```
