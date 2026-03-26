---
"@real-router/core": minor
---

`usePlugin()` silently skips `false`, `null`, and `undefined` values (#341)

Enables inline conditional plugin registration:

```typescript
router.usePlugin(
  browserPlugin(),
  __DEV__ && loggerPlugin(),
  hasConsent && analyticsPlugin(),
);
```

Falsy values are filtered before validation. If all values are falsy, returns a noop unsubscribe function.
