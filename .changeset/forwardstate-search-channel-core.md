---
"@real-router/core": minor
---

RFC-4 M2: forwardState carries the query channel (#1548)

`forwardState(name, params, search?)` gains a third `search` argument and now
returns `{ name, params, search }`. `matchPath` threads `matchResult.search`
through it (marking the URL→State path), so a `forwardState` interceptor can
observe and validate the query on route matching, not only on navigate. Both
interceptable methods (`buildPath`, `forwardState`) are now three-argument via
`createTernaryInterceptable`; the unused two-argument `createBinaryInterceptable`
helper is removed. All first-party interceptors (persistent-params, search-schema)
register the full three-argument form; a shorter-arity third-party interceptor
stays type-valid (TS allows fewer params, and `next(a, b)` leaves the search slot
`undefined`).
