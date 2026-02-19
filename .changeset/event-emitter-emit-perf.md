---
"@real-router/core": patch
---

Optimize EventEmitter emit() hot path

Three optimizations to the internal event-emitter `emit()`:
1. Replace `Function.prototype.apply.call` with switch by args.length (direct calls for 0-3 args)
2. Separate fast path when `maxEventDepth === 0` — skips depth tracking, try/finally, and depthMap operations
3. Inline `#checkRecursionDepth` + `#getDepthMap` into depth-tracking path, eliminating 2 method calls

Benchmark results vs baseline: emit() 3 args 1 listener **-36%** (30→19 ns), full navigation cycle **-8%** (175→161 ns), 1000 emits **-38%** (30.5→19.1 μs).
