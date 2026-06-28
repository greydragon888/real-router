---
"@real-router/preload-plugin": patch
---

Invalidate the pre-resolved State cache on structural `routes.update`/`add` (#805)

A structural tree mutation — `forwardTo`/`defaultParams`/`encodeParams`/`decodeParams` via `routes.update`, or an `add` that intercepts an already-cached href — previously left `getPreloadedState(href)` returning a stale snapshot built with the old resolution. A `<FastLink>` consumer would then commit the pre-mutation `State`, bypassing the fresh config. `#onTreeChanged` now clears the href-keyed snapshot cache on **any** structural op, matching the existing `remove`/`replace`/`clear` behavior. `#compiledPreloads` is untouched — its lazy factory-reference revalidation already covers `add`/`update`.
