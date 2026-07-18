---
"@real-router/navigation-plugin": patch
---

Bundle the browser-env state guard directly (dissolved `type-guards`)

The symlinked `shared/browser-env` now carries `isStateStrict` as a local `state-guard.ts` twin, so navigation-plugin no longer force-bundles the dissolved `type-guards` package. Internal refactor — no public API or runtime-behaviour change.
