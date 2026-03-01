---
"@real-router/logger-plugin": patch
---

Eliminate redundant computations in logger-plugin (#199)

Pre-compute immutable flags and prefix at initialization, cache transition label and perf mark name across handlers, extract shared `resetTransitionState()` cleanup, inline `getTiming()`, and replace `Object.entries()` with `Object.keys()` for emptiness checks in params-diff.