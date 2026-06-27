---
"@real-router/core": patch
---

Fix `canNavigateTo` over-checking shared-ancestor guards that `navigate` skips (#970)

`canNavigateTo` built its `toState` without route-meta, so `getTransitionPath` took its meta-less fast path and (de)activated the entire route chain — including ancestor segments shared with the current route, which `navigate` leaves mounted and never re-guards. A guard on a shared parent (e.g. a `canDeactivate` "block on unsaved changes" on a section route) therefore made `canNavigateTo` return `false` for an intra-section navigation that `navigate` would resolve — a false-negative ("Link disabled though the click would succeed"). `canNavigateTo` now builds `toState` the same way `navigate` does (with route-meta and normalized params), restoring strict parity with `navigate`'s guard set. This also fixes the documented innermost-first deactivation guard order and the `normalizeParams` drift that exposed an `{ x: undefined }` key to guards.
