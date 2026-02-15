---
"@real-router/core": minor
---

feat!: remove `clearMiddleware()` method (#91)

BREAKING CHANGE: `clearMiddleware()` has been removed. Use the `Unsubscribe` function returned by `useMiddleware()` instead.

Before:
```ts
router.useMiddleware(myMiddleware);
// later...
router.clearMiddleware();
```

After:
```ts
const unsub = router.useMiddleware(myMiddleware);
// later...
unsub();
```
