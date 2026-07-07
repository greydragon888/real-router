---
"@real-router/core": minor
---

search-params: fail fast on an unknown query-params format (#1318).

A JS consumer passing a typo'd `queryParams` format (`arrayFormat: "bracket"` instead of `"brackets"`, `booleanFormat: "empty_true"` instead of `"empty-true"`, …) previously indexed the strategy map to `undefined`, deferring a cryptic `TypeError` to first encode/decode — which the router's `SegmentMatcher.#mergeQueryParams` catch-all then masked as `UNKNOWN_ROUTE` for **every** query URL, with zero diagnostics. `resolveStrategies` now throws a named `TypeError` at options-resolution time, naming the bad field, its value, and the allowed set. TS consumers are unaffected (the union types already forbid the typo).
