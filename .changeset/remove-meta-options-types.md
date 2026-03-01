---
"@real-router/types": minor
---

Remove `options` field from `StateMeta` type (#202)

**Breaking Change:** `StateMeta` no longer includes `options: NavigationOptions` field.

`TransitionMeta` extended with optional `reload` and `redirected` fields.

**Migration:**
```diff
- if (state.meta?.options?.redirected) { ... }
+ if (state.transition?.redirected) { ... }

- if (state.meta?.options?.reload) { ... }
+ if (state.transition?.reload) { ... }
```
