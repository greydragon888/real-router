---
"@real-router/cache-manager": patch
---

Replace LRU with FIFO eviction in KeyIndexCache (#165)

FIFO eliminates `Map.delete()` + `Map.set()` on every cache hit (LRU refresh).
Hit path is now a single `Map.get()` — 2–3.4× faster than LRU in benchmarks.

Other optimizations:
- Inline `#store()` into `get()` (one fewer function call on miss)
- Replace `#stats` object with separate `#hits`/`#misses` counters (no object allocation on `clear()`)
- Handle `undefined` as a valid cached value (disambiguate from cache miss)