---
"@real-router/core": minor
---

Add configurable `warnListeners` limit (#123)

New `limits.warnListeners` option (default: 1000, 0 to disable) warns about potential memory leaks when event listener count exceeds the threshold. Previously the warning threshold was hardcoded.
