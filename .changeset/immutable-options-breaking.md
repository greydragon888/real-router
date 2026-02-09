---
"@real-router/core": minor
---

Remove `setOption()`, make options immutable (#63)

**Breaking Change:** Router options are now immutable after construction. The `setOption()` method has been removed along with the `lock()`/`unlock()` lifecycle.

Options that were previously changeable after `start()` (`defaultRoute`, `defaultParams`) must now be set in the constructor:

```diff
- const router = createRouter(routes);
- router.setOption('defaultRoute', 'home');
- router.start();
+ const router = createRouter(routes, { defaultRoute: 'home' });
+ router.start();
```
