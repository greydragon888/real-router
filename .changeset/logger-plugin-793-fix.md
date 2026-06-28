---
"@real-router/logger-plugin": patch
---

Skip the Performance API branch of `onTransitionError`/`onTransitionCancel` when the transition slot was already cleared (#793)

With `usePerformanceMarks: true`, an out-of-band terminal — a guard-redirect (core emits a `cancel` + `error` pair, the `error` landing after the redirect target's `success` already reset the slot) or a `ROUTE_NOT_FOUND` with no preceding start — used to `mark`/`measure` against an empty `#startMarkName`, producing a garbage empty-label `router:transition-error:` mark and a `console.warn("Failed to create performance measure")` on every such redirect / not-found. The perf branch is now gated on a non-empty start mark, so an unpaired terminal leaves no mark and emits no warning. The `console.error` log for the error itself is unchanged.
