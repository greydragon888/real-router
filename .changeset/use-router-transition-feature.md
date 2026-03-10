---
"@real-router/react": minor
---

Add `useRouterTransition` hook (#259)

New hook for tracking router transition state. Returns `RouterTransitionSnapshot`
with `isTransitioning`, `toRoute`, and `fromRoute`. Useful for progress bars,
loading overlays, and disabling navigation during async guards.

Available in both entry points (`@real-router/react` and `@real-router/react/legacy`).
