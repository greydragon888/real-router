---
"@real-router/types": minor
---

feat(types)!: remove callback types, simplify navigation signatures (#45)

**Breaking Change:**

- `DoneFn` type removed
- `CancelFn` type removed
- `ActivationFn` simplified — `done` callback parameter removed
- `Navigator.navigate()` returns `Promise<State>` (was `CancelFn`)

```typescript
// Before
type ActivationFn = (toState, fromState, done: DoneFn) => ...;

// After
type ActivationFn = (toState, fromState) => boolean | Promise<boolean | State | void> | State | void;
```
