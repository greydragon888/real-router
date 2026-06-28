---
"@real-router/vue": patch
---

fix(vue): RouterErrorBoundary mounted after an error shows the fallback (#778)

`RouterProvider` now eagerly creates the per-router error source at mount, so a navigation error that fires BEFORE a `RouterErrorBoundary` mounts (a lazily-loaded app shell, a failed boot navigation — the ordinary load order) is captured and surfaced once the boundary mounts. Previously the boundary created the error source lazily on mount — after the error had already fired with no subscriber — so the fallback never appeared. Pairs with the #765 reconnect-reconcile fix: the boundary's `createDismissableError` catches up to the already-captured error on first subscribe.
