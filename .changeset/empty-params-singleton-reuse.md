---
"@real-router/core": patch
---

Reuse the `EMPTY_PARAMS` singleton for empty-params navigations (#1027)

`normalizeParams` now returns the shared frozen `EMPTY_PARAMS` singleton when the result is empty (empty input, or every value `undefined`) instead of always allocating a fresh `{}`. This lets `makeState`'s `params === EMPTY_PARAMS` reuse branch fire, so a navigation to a route with no params (and no `defaultParams`) allocates zero transient objects instead of two.

Behavior-preserving: `state.params` is still an empty frozen object and the `undefined`-strip contract is unchanged.
