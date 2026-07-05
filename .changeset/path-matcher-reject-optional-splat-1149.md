---
"@real-router/core": patch
---

Reject optional splat `*name?` at registration instead of silently building unmatchable URLs (#1149)

`*path?` (optional splat) desynced three ways: `buildParamMeta`/`compileBuildParts` classified it as a splat (multi-segment, `/`-preserving encoder) while the trie's optional fork compiled a plain single-segment param. `buildPath({ path: "a/b" })` emitted `/files/a/b`, which `match()` rejected — a deep-link to a router-built URL was dead (`UNKNOWN_ROUTE`), and navigate-then-reload diverged. The exact class of #858 (name-less marker) / #1050 (fused marker).

Fix (product decision — reject, not support): the shape only ever "worked" for 0–1 segments, so it is rejected at registration like its #858/#1050 siblings. `path-matcher`'s `registerTree` throws `Optional splat … is not supported` (the bare-core backstop, covering `createRouter`), and `route-tree`'s validation gate throws a route-contextual `optional splat ('*name?') is not supported …` first on the plugin `add`/`replace` paths. A required splat `*name` (incl. `*path?query`, where `?` is the query separator) is unaffected.
