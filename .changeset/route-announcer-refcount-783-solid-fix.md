---
"@real-router/solid": patch
---

Fix route announcer silencing other providers on teardown — ref-count the shared aria-live element (#783)

`createRouteAnnouncer` reuses a single shared `[data-real-router-announcer]` aria-live element across all instances, but `destroy()` removed it **unconditionally**. With more than one `RouterProvider` in the same document (micro-frontends — the same multi-provider scenario `scroll-restore`'s `storageKey` exists for), the first provider's `destroy()` detached the shared element while the remaining providers kept writing `textContent` to the now-orphaned node → screen-reader silence, with no signal.

A module-scoped instance counter now removes the shared element only when the last holder is destroyed. `destroy()` also gained an idempotency guard so repeated calls decrement the count exactly once.
