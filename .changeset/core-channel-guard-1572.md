---
"@real-router/core": minor
---

Add the always-on channel guard — reject a mis-channelled State, warn on a mis-channelled argument (#1572)

Core gains a fifth always-on invariant guard. The predicate is one line —
`params ∩ queryNames(name) ≠ ∅` — and it is a **detector, never a normaliser**:
the key is not moved. Moving it is what channel separation does, and the
nav-pipeline design removes that stage precisely so channel-correctness becomes
the producer's contract instead of a repair performed behind everyone's back.

The two positions cover different populations, and — measured — they are not the
same kind of problem, so they ship with different reactions.

**P3 — `navigateToState` REJECTS.** It is the one producer that takes a
ready-made `State`, so the predicate reads `state.params ∩ queryNames(state.name)`.
There is no working form behind it: a hand-made State in the pre-M2 layout
commits silently corrupt — the key sits in `state.params` and never reaches
`state.path`, so `getState()` disagrees with the URL. The rejection mirrors the
`ROUTE_NOT_FOUND` guard beside it (rejected promise + `TRANSITION_ERROR`) rather
than throwing synchronously, because URL plugins call this from popstate
handlers and a new sync throw would change an existing method's failure shape.
`start()` commits through the same primitive, so the guard covers every start
including SSR hydration — at zero cost, since a state produced by core is
channel-correct by construction.

**P1 — `navigate` / `makeState` / `buildNavigationState` WARN**, on the caller's
raw argument, before interceptors. Behaviour is unchanged: the legacy single-bag
form still works on `navigate` and `buildNavigationState` (channel separation
moves the key one line downstream), and it is pinned today by a benchmark, a
stress test, a property and an INVARIANTS row. Announcing the contract first
lets every call site identify itself in the logs; promoting it to a throw is a
deliberate break with its own test migration and ships separately.

One position is not merely an announcement: a **direct `makeState`** has no
channel separation upstream of it, so the key stays in `params`, never reaches
the URL, and the warning reports a state that is already inconsistent with its
own path.

The guard is `undefined`-blind (the documented persistent-key removal marker is
not a mis-channel), inherits the `/items/:id?id` carve-out from the same
declaration registry the URL build prints from (#1556) rather than re-deriving
it, short-circuits on a route with no query declarations, and **never becomes
the thing that throws**: a bag backed by an accessor that throws is left to the
consumer that actually needed the value, so a diagnostic cannot move the origin
of an existing failure.

New error code: `WRONG_CHANNEL`.
