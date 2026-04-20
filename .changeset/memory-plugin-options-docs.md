---
"@real-router/memory-plugin": patch
---

Document `MemoryPluginOptions.maxHistoryLength` (#490)

Added inline JSDoc for `maxHistoryLength` covering the `0 = unlimited`
sentinel, the rejected values (negatives, `NaN`, `±Infinity`, fractions),
and the default (`1000`). The behavior was previously documented only
in the package's CLAUDE.md.
