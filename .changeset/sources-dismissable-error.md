---
"@real-router/sources": minor
---

feat: add `createDismissableError(router)` — per-router cached source wrapping `getErrorSource` with integrated dismissed-version state

Consolidates the `dismissedVersion`/`visibleError`/`resetError` pattern that was duplicated across all 6 `RouterErrorBoundary` adapters. Snapshot shape: `{ error, toRoute, fromRoute, version, resetError }`. `destroy()` is a no-op (cached wrapper). New `DismissableErrorSnapshot` type exported.
