---
"@real-router/react": minor
---

feat(react)!: remove callback props from BaseLink (#45)

**Breaking Change:** `successCallback` and `errorCallback` props removed from `BaseLink`/`Link`/`ConnectedLink`.

```typescript
// Before
<Link routeName="users" successCallback={(state) => ...} errorCallback={(err) => ...} />

// After
<Link routeName="users" />
```

Use `router.addEventListener(events.TRANSITION_SUCCESS, ...)` for navigation tracking.
