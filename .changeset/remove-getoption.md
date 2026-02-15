---
"@real-router/core": minor
---

Remove `getOption()` method (#92)

**Breaking Change:** `getOption()` has been removed. Use `getOptions()` instead — options are immutable after `createRouter()`, so property access is equivalent.

**Migration:**
```diff
- router.getOption("defaultRoute")
+ router.getOptions().defaultRoute
```
