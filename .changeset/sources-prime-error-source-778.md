---
"@real-router/sources": minor
---

feat(sources): add `primeErrorSource(router)` — tolerant eager error-source priming (#778)

`primeErrorSource(router)` eagerly creates (and subscribes) the per-router error source when the router supports the plugin API, and is a no-op otherwise. Framework adapters' `RouterProvider` call it at mount so a navigation error that fires before a `RouterErrorBoundary` mounts is still captured — without crashing on a router-like that has no internals-registry entry (a test stub, an `Object.create`-derived object). `getErrorSource` stays strict (throws for an invalid router); `primeErrorSource` is the don't-crash-the-Provider wrapper the boundary-pre-mount-error fix relies on.
