---
"@real-router/core": minor
---

Internalize `State.meta`, remove `forceId` pipeline, optimize `areStatesEqual` (#202)

**Breaking Change:** `State.meta` is no longer part of the public API. `forceId` parameter removed from `makeState`.

- `reload` and `redirected` flags moved to `state.transition`
- `transitionPath` accepts optional `opts` parameter for reload detection
- `shouldUpdateNode` reads `reload` from `state.transition` instead of `state.meta.options`
- Removed `EMPTY_OPTIONS` constant, `cleanOpts` helper, `getUrlParamsFromMeta` helper
- Removed `meta.id`, `#stateId` counter, `forceId` parameter (dead code — nobody read `meta.id`)
- Route param type mapping stored in `WeakMap<State, Params>` (no wrapper object)
- `areStatesEqual` uses cached `#urlParamsCache` instead of WeakMap lookup
- `freezeStateInPlace` no longer freezes internal meta
- `areStatesEqual` and `areParamValuesEqual` use `for` loops instead of `.every()`
