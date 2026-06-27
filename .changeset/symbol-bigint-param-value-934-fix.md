---
"@real-router/validation-plugin": patch
---

Reject Symbol / BigInt param values with an actionable error (#934)

A `Symbol` (or `BigInt`) used as a navigation param value cannot round-trip through a URL path — a Symbol path-param keeps its raw identity in `state.params` (the path stringifies to `/items/Symbol(x)` and never matches back), and bare core accepts it silently. `validateParams` now inspects each param value and rejects a `symbol` / `bigint` with a precise, key-named message (`param "id" cannot be a symbol …`) instead of the generic "params must be a plain object" shape error. Value inspection is own-property only, mirroring `isParams`.
