---
"@real-router/core": patch
---

Unify circular `forwardTo` error message (#916)

The dynamic forward resolver (`#resolveDynamicForward`) threw `Circular forwardTo detected: …` while the static resolver (`resolveForwardChain`) threw `Circular forwardTo: …`. Both paths now use the same `Circular forwardTo: …` wording. Cosmetic only — no API change; both already threw an `Error` matching `/Circular forwardTo/`.
