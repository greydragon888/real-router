---
"@real-router/types": minor
---

Remove redundant `StateMeta.redirected` and `StateMeta.source` fields (#121)

**Breaking change:** `StateMeta` no longer includes `redirected` or `source` fields.

**Migration:**

```diff
- if (state.meta.redirected) { ... }
+ if (state.meta.options.redirected) { ... }
```

The `source` field was dead code — no consumer ever read it, so no migration is needed.
