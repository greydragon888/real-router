---
"@real-router/core": patch
---

Two named doors for the not-found commit instead of one door and a flag (#1981)

`navigateToNotFound` took an internal `skipDeactivation` option that decided
whether the departing route's `canDeactivate` is consulted. Measured, the two
polarities never mixed: three producers, all passing a literal `true`, all inside
`replace()`'s revalidation; every other caller omitted it. The flag was not
selecting behaviour at runtime — it was marking which of two callers had called.

It is now two functions over one private body:

- `navigateToNotFound(path)` — a user-initiated departure. Consults
  `canDeactivate` and may be refused (#1643).
- `revalidateToNotFound(path)` — `replace()`'s revalidation. Does not consult,
  because a tree swap is not a departure the user chose and there is no "stay"
  branch to offer (#1652).

What the split removes beyond the flag: the `NotFoundOptions` interface (its only
field was this flag), the `opts?` parameter on all THREE layers that threaded it
(`RouterInternals`, `NavigationNamespace`, the primitive), and three `import
type` lines — one deleted outright, two narrowed. Nothing published changes — `NotFoundOptions` was on no public subpath and
had no consumer outside core, and the public facade `router.navigateToNotFound(path)`
never had the option in the first place.

⚠ This does NOT make a later caller of `commitRevalidated` safe: that function IS
a revalidation door and anything it calls inherits its lane. What goes away is the
shared door where an ARGUMENT chose the lane — there is no longer a call that
looks right and yields the other behaviour.

Behaviour is unchanged in both lanes; `not-found-deactivation-1643.test.ts`
(13 tests, both lanes) is the safety net and stays green.
