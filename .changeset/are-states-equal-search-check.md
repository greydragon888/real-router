---
"@real-router/validation-plugin": patch
---

Refuse a malformed `state.search` in `areStatesEqual(…, false)` (#2897)

With `ignoreQueryParams: false`, `router.areStatesEqual` compares the `search` of both states, and the plugin checked neither. A state whose `search` was missing or `null` reached core and threw a bare `TypeError: Cannot convert undefined or null to object`. A string or array `search` answered `false`.

- The plugin now throws `[router.areStatesEqual] Invalid state1.search: {type}. Expected a plain object.` for a `search` that is not an object, is `null` or is an array. The second state reports `state2.search`.
- The default call (`ignoreQueryParams` omitted or `true`) reads no `search` and is unchanged.
