---
"@real-router/types": minor
---

Remove middleware types (#133)

**Breaking Change:** Middleware types removed following middleware layer removal in `@real-router/core`.

- Removed `MiddlewareFn`, `Middleware`, `MiddlewareFactory` types
- `TransitionPhase` narrowed from `"deactivating" | "activating" | "middleware"` to `"deactivating" | "activating"`
