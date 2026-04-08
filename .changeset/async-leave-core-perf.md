---
"@real-router/core": patch
---

Optimize navigate hot path for async leave overhead (#391)

Skip `AbortController.abort()` on sync leave path, defer `NavigationContext` to async branch, move `isCurrentNav` closure to guards block. Benchmarks vs master: 0 listeners −29%, 1 sync listener −7%, 3 sync listeners −11%.
