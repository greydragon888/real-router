---
"@real-router/core": minor
---

Integrate AbortController API into `router.navigate()` (#188)

Each navigation creates an internal `AbortController`. Pass an external `signal` via `NavigationOptions` to cancel navigations from userland:

```typescript
const controller = new AbortController();

const promise = router.navigate('users', {}, { signal: controller.signal });

controller.abort(); // rejects with TRANSITION_CANCELLED
```

Key behaviors:
- Pre-aborted signal rejects immediately without starting a transition
- Concurrent navigation aborts the previous navigation's signal
- `router.stop()` and `router.dispose()` abort in-flight navigations
- Guards receive `signal` as optional third parameter for cooperative cancellation
- `AbortError` thrown in guards is auto-converted to `TRANSITION_CANCELLED`
- Signal is stripped from `state.meta.options` (non-serializable)
