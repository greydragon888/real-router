---
"@real-router/core": patch
---

The channel verdict now covers the bag that ships (#1927)

A caller's `params` bag was read twice: once by a channel guard to decide, once by
the normaliser that builds `state.params`. Between the two reads the object still
belongs to the application — a Proxy, a framework's reactive object, a plain
getter — so a bag answering `undefined` while the guard looked (the documented
removal marker, correctly waved through) and a value afterwards committed a
**declared query name into the path channel**:

```
makeState("x", driftingBag)   state.path   /x
                              state.params {"page":"9"}   ← declared `?page`
                              state.search {}
CONTROL, the honest bag { page: "9" }: refused, as it always was
```

Measured read counts of the caller's bag before the fix: `makeState` 2,
`navigate` 3, `buildNavigationState` 3, the decoder bag on `matchPath` 3.

The fix is the SAME predicate, one position later — on the canonical bag, which
core owns and which has no accessors, so the verdict cannot be overtaken. It runs
at the four doors that PUBLISH a State: `navigate`, `makeState`,
`buildNavigationState`, `matchPath`.

⚑ `buildPath` and `isActiveRoute` are deliberately untouched. They return a string
and a boolean — nothing ships for a verdict to vouch for — and #1572 / #1581
record that the render-path predicates are not instrumented: detecting there is
fine, throwing is not. They express that the way they always have, by not calling.

⚑ `canNavigateTo` is out too, and that was measured rather than assumed: adding
the call changed no answer for any bag blindness from 0 to 3 reads, because the
seam already sees the same key one read earlier — while costing a predicate call
per `<Link>` per render.

Behaviour change, bounded: an input that previously produced a corrupt committed
state is now refused. A stable bag is unaffected, and `undefined` remains the
removal marker.

Four written claims this fix refutes are corrected in the same change — two code
comments and two `CLAUDE.md` passages that each said the shape was already
unreachable "on the same predicate". That phrase was the defect.
