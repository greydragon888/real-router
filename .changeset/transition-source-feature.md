---
"@real-router/sources": minor
---

Add `createTransitionSource` for transition lifecycle subscriptions (#XX)

New source that tracks router transition state (start/success/error/cancel)
via `getPluginApi().addEventListener()`. Provides `RouterTransitionSnapshot`
with `isTransitioning`, `toRoute`, and `fromRoute`.

Dependency change: `@real-router/core` replaces `@real-router/types`.
