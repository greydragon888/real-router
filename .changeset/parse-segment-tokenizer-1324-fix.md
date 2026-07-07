---
"@real-router/core": minor
---

Reject a trailing parameter marker (`/:y*`, `/:y:`, `/*y:`) at route registration (#1324)

A param or splat name ending in a bare `:`/`*` marker was silently registered as a dead route by bare core — `buildPath` then threw `Missing required param 'y*'` — while the validation plugin's gate rejected it: a gate↔backstop grammar divergence. The route-path grammar is now single-sourced through one `parseSegment` tokenizer, so the trie backstop and the gate agree — such a path is rejected at registration with a clear `Trailing parameter marker …` error instead of compiling an unmatchable route. A mid-name marker (`/:a:b` → param `a:b`) is unaffected.
