---
"@real-router/core": patch
---

Keep a "__proto__" query key as an own param (#1293)

search-params materializes a literal "__proto__" query key as a real own property (#855), but `SegmentMatcher.#mergeQueryParams` folded the parsed query into the params accumulator with a plain `params[key] = …` assign — which for the literal key "__proto__" invokes the inherited setter and silently drops the param one layer up (a string value vanishes; an array value swaps the local prototype). The merge now writes each key with `Object.defineProperty`, so a legal (if exotic) "__proto__" query param survives. No prototype pollution either way.
