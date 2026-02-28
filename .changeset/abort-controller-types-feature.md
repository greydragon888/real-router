---
"@real-router/types": minor
---

Add `signal` field to `NavigationOptions` and `GuardFn` (#188)

New optional `signal?: AbortSignal` field on `NavigationOptions` allows cancelling in-flight navigations via the standard `AbortController` API. Guards receive the signal as an optional third parameter.

```typescript
const controller = new AbortController();
router.navigate('users', {}, { signal: controller.signal });

// Cancel the navigation
controller.abort();
```
