---
"@real-router/core": patch
---

Stop charging every producer for a merge that has nothing to merge (#1589)

The nav pipeline made every producer share one implementation. It also made every
producer run the whole pass whether or not the route has anything to merge, and
the core benchmark suite prices that at 10–78 % against master.

`canonicalize` now returns early when the route has no `defaultParams`, no
`defaultSearch` and no `?`-declaration and the caller named no query channel: the
whole tail is provably identity there — `withholdFilledSlots` short-circuits on an
undefined default, both merges collapse to their empty singletons, and the mode
gate cannot drop a key from a query channel that is empty in every mode. Channels
stay frozen, so the invariant is untouched.

`mergeWithDefault` gains an internal `valueIsOwned` flag, used only by
`canonicalize`'s path channel: with no default it used to freeze a defensive COPY
of the bag, which is right in general (the caller's bag must never be frozen) but
wasteful for the object `normalizeParams` minted one line earlier. The path bag
was being copied twice per producer call, on every entry point.

No behaviour change: the same channels, the same freezing, the same diagnostics.
