---
"@real-router/lifecycle-plugin": minor
---

Add `onNavigate` lifecycle hook — orthogonal to `onEnter` / `onStay` (#463)

New route-level hook that fires on every successful navigation to the route,
regardless of whether the route was entered or params changed. Replaces the
common pattern of duplicating the same function in both `onEnter` and `onStay`.

```typescript
// Before — duplication:
{
  name: "services.catalog",
  path: "/catalog?q&sort&dir",
  onEnter: loadServices,
  onStay: loadServices,
}

// After — one declaration:
{
  name: "services.catalog",
  path: "/catalog?q&sort&dir",
  onNavigate: loadServices,
}
```

**Orthogonal dispatch:** `onEnter` / `onStay` / `onNavigate` fire
independently — if both `onEnter` and `onNavigate` are defined, both fire on
entry. Each hook reacts to its own condition, so you can compose shared logic
(`onNavigate`) with case-specific setup (`onEnter` / `onStay`) without either
silencing the other.
