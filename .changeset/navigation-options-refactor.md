---
"@real-router/types": minor
---

Remove index signature from `NavigationOptions`, enforce strict fields only (#188)

**BREAKING CHANGE:** `NavigationOptions` no longer accepts arbitrary keys. Only known fields (`replace`, `reload`, `force`, `forceDeactivate`, `redirected`, `signal`) are allowed.

**Migration:**
```diff
- router.navigate('route', {}, { replace: true, customKey: 'value' });
+ router.navigate('route', {}, { replace: true });
```
