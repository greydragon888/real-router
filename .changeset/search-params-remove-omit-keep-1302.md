---
"@real-router/core": patch
---

Remove `omit()` / `keep()` (+ private helpers and `OmitResponse` / `KeepResponse` types) — API unreachable from `@real-router/core` (#1302). Deliberate surface reduction of this private package; the functions were tested but had no core consumer.
