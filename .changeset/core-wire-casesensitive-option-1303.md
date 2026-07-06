---
"@real-router/core": minor
---

Wire opt-in case-insensitive routing via `caseSensitive` (#1303)

The engine already implemented `caseSensitive` end-to-end, but the option was severed at the core seam — `Options` had no field and `deriveMatcherOptions` never mapped it, so `createRouter({ caseSensitive: false })` was silently ignored. `caseSensitive` is now a public router option, mapped through to the matcher. **Default stays `true` (case-sensitive, spec-correct per RFC 3986 §6.2.2.1)** — case-insensitive is an explicit opt-in (`caseSensitive: false`) for server-less / hash / static-hosted / legacy routing. Only static literal segments are compared case-insensitively; dynamic param values keep their case. Note the divergence from React Router v7 / TanStack / vue-router, which default to case-insensitive.
