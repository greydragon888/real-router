---
"@real-router/lifecycle-plugin": minor
---

Add `onNavigate` lifecycle hook — combined `onEnter` + `onStay` fallback (#463)

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

**Priority:** `onEnter` / `onStay` take precedence over `onNavigate` for their
respective case. `onNavigate` acts as a fallback for whichever specific hook is
not defined. This enables hybrid declarations — shared data loading in
`onNavigate`, entry-specific initialization in `onEnter`.
