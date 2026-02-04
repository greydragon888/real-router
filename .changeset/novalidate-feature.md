---
"@real-router/core": minor
"@real-router/types": minor
---

Add `noValidate` option to disable validation in production

New configuration option for performance-critical environments:

```typescript
const router = createRouter(routes, {
  noValidate: process.env.NODE_ENV === 'production'
});
```

When enabled, skips argument validation in ~40 public methods.
Constructor always validates options object itself.
