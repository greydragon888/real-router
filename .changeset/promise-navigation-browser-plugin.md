---
"@real-router/browser-plugin": minor
---

feat(browser-plugin)!: adapt to Promise-based navigation API (#45)

**Breaking Change:** `router.start()` with browser plugin now returns `Promise<State>`.

```typescript
// Before
router.start("/users", (err, state) => {
  if (err) console.error(err);
});

// After
const state = await router.start("/users");
```
