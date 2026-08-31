---
"@real-router/core": patch
---

`forwardState` no longer hands back a container that swaps a merge target (#1986)

On its no-default fast path the `forwardState` seam returned the caller's own
bags unchanged, so an own `"__proto__"` — the shape `JSON.parse` of a URL query
or an API payload mints — rode straight through. That is inert until someone
merges it, and merging the result is the documented idiom for this door: it is
an interception point, so a plugin doing
`Object.assign({}, result.params, extra)` had its own object's prototype
replaced.

Both channels are sanitised at the INNERMOST `next` now, and again on the way
out. The inner one is the fix for the reported shape — every interceptor runs
outside it, so it is the earliest point whose result reaches all of them; the
outer one keeps the door's own published contract when an interceptor injects a
poisoned bag of its own. The rule that closed the #1957
doors does not reach this one — core mints nothing here, the container is the
caller's — so the extension is deliberate and narrow: **a pass-through gets a
copy when the door is an extension seam**, because otherwise core hands a
prototype-swap primitive to a plugin author who followed the instructions.

**No cost on the common path.** `withoutUnsafeKey` is gated on `hasOwn`, so a
clean bag comes back by identity with no allocation — which matters because
`canNavigateTo` reaches this seam on every `<Link>` render. That
half is a test, not a claim.

**An absent channel slot still ANSWERS.** The copy adds a READ where the seam
used to pass a slot through untouched, so every shape that leaves one absent
would otherwise become a cryptic `TypeError` from a frame the caller never
named: `forwardState(name, undefined)`, a route `decodeParams` that fills only
the query channel (reachable through `matchPath`, a public door), and an
interceptor nulling a slot. All three are guarded and pinned.

⚠ **Do not rewrite the strip as a DESCRIPTOR copy.** It is the obvious way to
avoid reading the caller's values, it was tried here, and it is worse on the
axis this module exists for: `Object.defineProperties` runs
`ToPropertyDescriptor`, which asks `HasProperty` for `get` / `set` / `value` /
`writable`, so an ambient `Object.prototype.get` makes every copy throw —
measured, `navigate()` then fails silently and the state does not move. It also
propagates the source's `writable` / `configurable` into a copy whose object is
still extensible, and keeps the caller's getter alive inside a container the
router has published. A guard cell pins the outcome.

The sibling pass-through — the plain `NavigationOptions` arc — is deliberately
NOT sanitised: copying it reads `reload` and `replace` a second time, below the
read that already decided, and there is a pin whose whole subject is that count.

Also recorded, and unchanged in behaviour: the `getInternals` handle is out of
this rule's scope permanently. It hands out core's LIVE stores rather than a
copy made to be handed out, and withholding a key there would take it from the
router — `set("__proto__", v)` is a supported call, and `routeCustomFields` is
keyed by route name, where a route may legitimately be named `__proto__`.
