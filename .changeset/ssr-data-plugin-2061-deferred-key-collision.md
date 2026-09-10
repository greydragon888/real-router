---
"@real-router/ssr-data-plugin": patch
---

a deferred key claimed by two routers on one page now says so (#2061)

The client registry lives on `globalThis` under one key and is indexed by the
BARE deferred-key name, and the settle transport the server streams —
`__rrDefer__("<key>", json)` — carries that bare name too. Two routers on one
page declaring the same key did not merely see equal values: they held the SAME
promise object, and whichever payload landed first resolved it for both, silently.

⚠ **The key namespace is the application's, not the plugin's.**
`defer({ deferred: { reviews } })` claims `"reviews"` for the whole document, and
generic names are what applications pick — two independently authored mounts
colliding is the ordinary case, not an exotic one.

`ensureRegistryPromise` now takes an optional claimant, and the loader plugin
passes its per-instance identity. One router asking again is the documented
idempotent case and stays silent; a second claimant is reported once per key.

⚠ **A diagnostic, not isolation, and that is the decision.** The promise stays
shared, because splitting it would be worse than the collision: the settle script
carries the bare key and resolves exactly one entry, so the second promise would
never settle at all. Real isolation needs a per-router prefix in the wire format,
which needs an identity surviving SSR → client that `SerializedRouterState` does
not carry. The constraint is documented in the package's CLAUDE.md instead.

⚠ The de-dup flag lives on the registry ENTRY, not in module state — a
module-level `Set` is the shape #1583 was filed for, where process-global de-dup
went silent after the first router under SSR/SSG.
