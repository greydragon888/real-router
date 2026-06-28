---
"@real-router/angular": patch
---

fix(angular): RouterErrorBoundary instantiated after an error shows the error (#778)

`provideRealRouter` now eagerly creates the per-router error source at bootstrap (via a `provideEnvironmentInitializer`), so a navigation error that fires BEFORE a `RouterErrorBoundary` is instantiated (a lazily-rendered error region, a failed boot navigation — the ordinary load order) is captured and surfaced once the boundary is created. Previously the boundary created the error source lazily on init — after the error had already fired with no subscriber — so it never rendered. Pairs with the #765 reconnect-reconcile fix: the boundary's `createDismissableError` catches up to the already-captured error on first subscribe.
