---
"@real-router/core": patch
---

Totalize URL encoding on lone surrogates + fix quadratic key-only query parse (#1314 #1315 #1316).

`build` / `buildPath` no longer throw `URIError` on a lone (unpaired) UTF-16 surrogate — a value `parse` / `match` accept but `encodeURIComponent` rejects (e.g. user text sliced on an emoji surrogate-pair boundary, or a programmatically built URL). Both `search-params` (`safeEncode`, single-sourced across the scalar and array-element encode sites) and `path-matcher` (all three encoding modes: `default` / `uri` / `uriComponent`) now sanitize it to U+FFFD via `toWellFormed`, keeping `range(parse) ⊆ dom(build)` total. Consequently `start()` no longer stores a state whose later `buildPath` throws (the poisoned-state path), and `navigate()` with such user text resolves instead of rejecting. The sanitize is lossy on that already non-round-trippable input — the surrogate becomes `�` on the first round-trip, then stable — documented like the `-0` loss.

Also: `parse` is now O(n) on key-only query chunks (`?a&a&…`) — the per-chunk `indexOf("=")` no longer rescans to the end of the string (was O(n²) on a forgeable URL, #1316). The over-encoded number/boolean coercion asymmetry (`?a=4%32` → number `42`, `?a=%74rue` → string `"true"`) is now locked and documented as an intentional raw-vs-decoded contract (#1317), not changed.
