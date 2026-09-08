---
"@real-router/core": patch
---

A validator-only door says where an adopted defaults bag came from, weakly (#2148)

`RouterInternals.getAdoptedOrigins()` carries a `WeakRef` to each caller bag that
`defaultParams` / `defaultSearch` were adopted from, so the validation layer can
tell an application that mutating one after `createRouter()` no longer reaches
the router. Since #2171 core copies those bags at construction, and the
application's later write is silent — no throw, no warning, no type error.

⚠ Weak, and that word is the design rather than a detail. Core does not hold the
application's container — #2171 is what stopped it — and a strong field would put
it back. A `WeakRef` is not holding: it knows where the bag was, if the bag is
still alive, and the application can free it at any time. Nothing routes through
it; adoption already took the copy the router runs on.

⚠ Only an UNFROZEN caller bag is recorded, and only in the two slots whose late
mutation changes behaviour. `queryParams` is not adopted at all and core stops
reading `limits` once `createLimits` has its numbers, so a late mutation of
either breaks nothing and has nothing to record. A clone records nothing:
`cloneRouter` constructs from the base's frozen copies, so an SSR application
cloning per request mints no references at all.

Nothing changes for an application that never mutates its config, and nothing at
all for bare core — the door exists to be asked, and core never asks it.
