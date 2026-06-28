---
"@real-router/sources": patch
---

fix(sources): freeze INITIAL_SNAPSHOT + docs cleanup (#768)

`createErrorSource`'s shared `INITIAL_SNAPSHOT` singleton (returned by every error source until the first error) is now `Object.freeze`d — mirroring `createTransitionSource`'s frozen `IDLE_SNAPSHOT` — so a consumer can no longer mutate it and corrupt the shared singleton for every error source of every router. Plus documentation fixes: INVARIANTS "Cache Identity 3" now states the hash-aware contract precisely (non-empty hash → `false`; `hash: ""` → `true` under no URL plugin), the ARCHITECTURE filtering-pipeline diagram shows the `hashFlip` pre-filter branch (#532), the `canonicalJson` JSDoc notes the `Date` ↔ ISO-string cache-key collision, and a stale `createRouteSource` test comment is corrected.
