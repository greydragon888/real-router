---
"@real-router/core": patch
---

Lock `undefined` params contract at core boundary (#465)

`router.navigate(name, { x: undefined })` and `router.buildPath(name, { x: undefined })` are now guaranteed to produce URLs without `x` **by core itself**, not transitively through the query-string engine. Plugin interceptors that introduce `undefined` values into `forwardState` output are also normalized away before they reach URL and `state.params`.

**Behavior change:** `state.params` no longer contains keys whose values are `undefined` after navigation — `"x" in state.params` is `false`, not `true` with `state.params.x === undefined`. The serialized URL is unchanged; only the in-memory `state.params` shape is tightened.

**Internal:** `defaultQueryString` fallback removed from `path-matcher` (dead code, internal package). `SegmentMatcher` now requires `parseQueryString`/`buildQueryString` as mandatory options; `search-params` remains the only engine used by the public API.

Groundwork for the query-param semantics contract defined in the RFC (`packages/core/.claude/rfc/rfc-query-param-semantics.md`).
