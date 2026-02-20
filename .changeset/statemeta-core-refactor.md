---
"@real-router/core": minor
---

Remove `source` parameter from `matchPath()` (#121)

**Breaking change:** `matchPath()` no longer accepts a second `source` argument.

**Migration:**

```diff
- router.matchPath('/users/123', 'popstate')
+ router.matchPath('/users/123')
```
