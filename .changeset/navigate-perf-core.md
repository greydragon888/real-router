---
"@real-router/core": patch
---

Optimize navigate() — 6x speedup, 5x fewer allocations (#307)

Optimistic sync execution eliminates async overhead when no guards are registered.
Systematic allocation reduction across the navigate pipeline: merged state construction,
single-pass freeze chain, cached error paths, segment array reuse, FSM dispatch bypass.
Guard pipeline refactored from three-function coroutine to flat loop with zero sync-path regression.
