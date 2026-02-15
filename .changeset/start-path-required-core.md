---
"@real-router/core": minor
---

Make `path` a required argument in `router.start()` (#90)

**Breaking Change:** `router.start()` now requires a path string argument.

**Migration:**
```diff
- await router.start();
+ await router.start("/home");
```

Browser-plugin users are unaffected — the plugin injects browser location automatically.
