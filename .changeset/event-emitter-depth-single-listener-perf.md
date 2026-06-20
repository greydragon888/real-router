---
"@real-router/core": patch
---

Speed up single-listener event dispatch on the depth-tracking emit path (#751)

The internal event emitter (bundled into core) special-cased a single listener — skipping the `[...set]` snapshot allocation for a direct call — only on its fast path (`maxEventDepth = 0`). The router runs exclusively on the depth-tracking path (`maxEventDepth = 5`), so single-subscriber events never got the shortcut and allocated a one-element array on every emit. Mirroring the `set.size === 1` shortcut into `#emitWithDepthTracking` makes single-listener emits ~10% faster (measured via mitata A/B, bracketed against run-to-run drift) — every navigation event with a single subscriber benefits. Behavior is unchanged (snapshot-of-one semantics preserved).
