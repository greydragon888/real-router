---
"@real-router/sources": patch
---

fix: a non-string route name no longer shares a cache slot with a well-typed one (#1881)

`createActiveRouteSource` builds its cache key with a template literal, which
COERCES the route name. A bag whose `toString` returns `"users"` and the string
`"users"` therefore produce the identical key and share one cached source —
and whichever call is made FIRST decides the answer for both.

Measured on the previous release, with the router on `/users`:

| first call             | `createActiveRouteSource(router, "users", …)` |
| ---------------------- | --------------------------------------------- |
| none                   | `true`                                        |
| a bag naming `"users"` | **`false`**                                   |

So a well-typed `<Link>` on the slow path could already report itself inactive
on the route it names, whenever a non-string-named sibling was built first.
That half is a pre-existing defect, not a new one.

What is new is the reach. Until `@real-router/core@0.97.4` the router coerced a
non-string name too, so for a name resolving through `forwardTo` both calls
computed the same boolean and the collision stayed invisible. Core now refuses
such a name, so the two answers diverge for every shape rather than only for
plain ones.

A non-string name now bypasses the cache entirely — the same shape the existing
BigInt/circular-params fallback already uses. Nothing changes for a string
name: identical answers, and two identical string calls still share one cached
source.

**Who is affected:** consumers reaching the SLOW path — a `<Link>` with
`routeParams` / `routeSearch` / `activeStrict` / `ignoreQueryParams={false}` /
`hash`, `useIsActiveRoute`, `injectIsActiveRoute`, `RealLinkActive`, Solid's
`link` directive, scroll-spy. The default name-only `<Link>` never reaches this
factory.

⚠ Two things this does NOT close. A bypassed source subscribes per call rather
than sharing one, so a non-string-named link now holds its own router
subscription — bounded by the caller's own render count, and the same is true
of the pre-existing BigInt bypass. And the FAST path is untouched:
`createActiveNameSelector` still coerces, so a non-string name can still report
a descendant route active there while the slow path says otherwise.
