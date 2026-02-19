---
"@real-router/core": patch
---

Optimize hot paths: cached error callback, Set replaced with includes

Cache `.catch()` callback as `static #onSuppressedError` (one allocation per class, not per `navigate()` call). Replace `new Set(activeSegments)` with `Array.includes()` for segment cleanup (1-5 elements — linear search is faster than Set construction).
