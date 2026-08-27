---
"@real-router/core": minor
---

The pipeline terminal reads a route name once (#1883, closing #1889's residues)

`canonicalize` is the sole producer of `Canonical`, and it passed the caller's
`name` through untouched — so every consumer of `canonical.name` coerced it
again. A route name is used as a PROPERTY KEY, so each of those is a `toString`
call into application code, and the answers could disagree.

Measured on bare core, before and after:

| call with a non-string name | before | after |
| --- | --- | --- |
| `makeState(bag, {}, {}, "/x")` | 2 reads; `name` **is the caller's object** beside `home`'s `defaultParams` | 1 read; `name: "home"`, params agree |
| `makeState(bag, {}, {})` | 4 reads; throws `'home' is not defined` — about a route that EXISTS | 1 read; a coherent state at `/home` |
| `buildPath(bag, { id })` | 4 reads (5 with an encoder, **which ran**); throws about a route that exists | 1 read; returns `/a/1` |
| `buildPath` under a drift | ran one route's encoder and built for another | builds what the FIRST read named |

**Behaviour change:** `buildPath` and `makeState` now ANSWER where they used to
throw about a route they could resolve. That is the degrade behaviour the
project's own rule prescribes — a door answers what the value's `toString`
named — and the throw it replaces named an existing route, so it was misleading
rather than protective.

This also closes the two residues #1889 declared open: a caller's `encodeParams`
no longer runs on the way to a guaranteed refusal (there is no refusal), and a
drift can no longer split the encoder read from the matcher read (there is one
read).

⚠ A COERCION, not a type gate. `ARCHITECTURE.md` "Route-Name Type Gates" admits a
gate only where a stably-coercing non-string already does damage — and coercing
removes the damage, because the State's fields then agree. A gate at this shared
terminal would have turned `isActiveRoute`'s `true` into `false`, re-introducing
one of the three predicates #1897 reverted. Measured: `isActiveRoute` is
unchanged on both of its arms, and `navigate` / `canNavigateTo` never reach the
terminal at all.

Nothing changes for a string caller, anywhere — verified row by row across nine
shapes, including the root `""`, a `?`-declaring route, an `encodeParams` route,
a missing route and the LITERAL `forwardTo` form.

What a non-string caller sees, besides the counts: the published `state.name` is
now always a **string**. It used to be whatever was passed — `undefined`, `null`,
`42`, the object itself — beside `params` belonging to the coerced route. The
resolved name is unchanged in every case; only the field's type is, which is the
whole of "the fields agree". A `Symbol` argument now throws
`'Symbol(x)' is not defined` instead of a raw
`TypeError: Cannot convert a Symbol value to a string`, for the same reason.
