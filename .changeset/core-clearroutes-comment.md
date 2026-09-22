---
"@real-router/core": patch
---

Correct the `v8 ignore` note on the `clearRoutes` no-op arm (#2487)

It named `Router.clearRoutes()`, which does not exist — the facade's only
`clearRoutes` call sits inside `dispose()` — and credited `validateClearRoutes`
unit tests, which do not exist either: every mention of that helper under
`tests/` is a comment, never a call. The note now names the arm it guards and
the pair of conditions that reaches it.
