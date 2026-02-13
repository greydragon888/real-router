---
"@real-router/core": minor
---

feat(core)!: Promise-based navigation API (#45)

**Breaking Change:** `navigate()`, `navigateToDefault()`, `start()` now return `Promise<State>` instead of `CancelFn`/`this`.

```typescript
// Before (callback-based)
router.navigate("users", { id: "123" }, {}, (err, state) => {
  if (err) console.error(err);
  else console.log(state);
});

// After (Promise-based)
const state = await router.navigate("users", { id: "123" });
```

- `start()` no longer accepts `State` parameter (only `string` path)
- `parseNavigateArgs()`, `safeCallback()` removed
- Guards no longer receive `done` callback — return values directly
