---
"@real-router/angular": patch
---

fix: memory leak in `injectRouterTransition` / `RouterErrorBoundary` via shared cached source

Migrated `injectRouterTransition` and `RouterErrorBoundary` to `getTransitionSource` / `getErrorSource` from `@real-router/sources`. The cached shared wrapper ignores external `destroy()` — safe alongside `sourceToSignal.destroy()` that runs in `DestroyRef.onDestroy`.
