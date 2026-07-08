---
"@real-router/core": patch
---

`navigateToState()` preserves route-meta so popstate does not re-run ancestor guards (#1170)

Route-meta lives in a `WeakMap` keyed by state-object reference. `navigateToState()` — which backs `start()` and **every popstate under a URL plugin** — built a fresh writable shell of the `matchPath` state without carrying the binding over. So once two consecutive `navigateToState` commits happened, both `toState` and `fromState` were meta-less and `getTransitionPath` fell into its full-reload fallback: shared ancestor guards **re-ran** and browser-back could **reject** a transition that `navigate()` resolves (e.g. an ancestor guard that flips to `false` while inside its subtree). The meta binding is now carried across the writable-shell copy, restoring `navigate()` parity — ancestor guards stay mounted and popstate `transition.segments` become deltas again.
