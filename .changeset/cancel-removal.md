---
"@real-router/core": minor
---

**Breaking:** Remove `router.cancel()` method

The `cancel()` method has been removed. Its functionality is now handled internally:

- `stop()` and `dispose()` automatically cancel in-flight transitions
- Concurrent `navigate()` calls cancel the previous navigation

**Migration:**
```diff
- router.cancel();
+ router.stop(); // or just call router.navigate() which cancels previous
```
