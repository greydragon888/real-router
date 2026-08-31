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

Both channels are sanitised on the way out now. The rule that closed the #1957
doors does not reach this one — core mints nothing here, the container is the
caller's — so the extension is deliberate and narrow: **a pass-through gets a
copy when the door is an extension seam**, because otherwise core hands a
prototype-swap primitive to a plugin author who followed the instructions.

**No cost on the common path.** `withoutUnsafeKey` is gated on `hasOwn`, so a
clean bag comes back by identity with no allocation — which matters because
`isActiveRoute` and `buildPath` reach this seam on every `<Link>` render. That
half is a test, not a claim.

**And it copies DESCRIPTORS, so it never invokes an accessor on the caller's
bag.** A value copy reads every remaining key to rewrite it, which made core the
origin of a throw for a value nobody asked for: measured, a bag carrying both the
key and a throwing getter turned a `forwardState` that RETURNED into one that
throws. Copying descriptors keeps a getter lazy — the consumer that actually
wants the value is still the one that triggers it. This applies to
`withoutUnsafeKey` as a whole, so the URL-direction sites it already served get
the same property.

The sibling pass-through — the plain `NavigationOptions` arc — is deliberately
NOT sanitised: copying it reads `reload` and `replace` a second time, below the
read that already decided, and there is a pin whose whole subject is that count.

Also recorded, and unchanged in behaviour: the `getInternals` handle is out of
this rule's scope permanently. It hands out core's LIVE stores rather than a
copy made to be handed out, and withholding a key there would take it from the
router — `set("__proto__", v)` is a supported call, and `routeCustomFields` is
keyed by route name, where a route may legitimately be named `__proto__`.
