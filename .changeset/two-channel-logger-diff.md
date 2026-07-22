---
"@real-router/logger-plugin": minor
---

Diff both params and search channels on same-route navigation (#1548)

Under the RFC-4 M2 params/search split a query-only change (e.g. pagination)
lives in `state.search`, not `state.params`. The same-route param diff now runs
on both channels and prints them under labelled lines (`params …` / `search …`),
so a `?page=2 → ?page=3` navigation shows a `search` diff instead of nothing.
