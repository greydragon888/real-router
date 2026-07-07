---
"@real-router/core": patch
---

Route build-path compilation now derives its param slots from the shared `parseSegment` tokenizer (#1324)

`compileBuildParts` (the L2 build layer) previously ran its own `paramRgx` to pull param names and optional markers out of a route path — the last layer still parsing the path grammar in parallel with the trie (L3), `buildParamMeta` (L1), and the validation gate (L4). It now walks the path through the same `parseSegment` tokenizer those layers use, so build's param name can no longer drift from the trie's: the `build ≠ match` class (#1050/#1150) is closed structurally, not merely caught after the fact by the inverse-pair round-trip property. Behavior-preserving — `buildPath` output is byte-identical for every accepted route (verified by an old-vs-new diff across the path grammar plus the `inverse-half` property); malformed paths remain rejected downstream at `registerTree` exactly as before.
