---
"@real-router/core": patch
---

Route configuration is adopted at registration, and the route record is frozen (#2172)

The other half of the decision #2145 took, after #2171 did the `Options` door.
Three doors handed back route configuration whose nested slots were the caller's
own literals, aliasing the live store: `getRoutesApi(r).get(name)`, the
`subscribeChanges` payload, and `getPluginApi(r).getRouteConfig(name)`. Measured,
a write through the first moved live routing from `/users/1` to `/users/HACKED`,
and the ordinary path that reaches it is read-modify-write —
`route.defaultParams.locale = …; routes.update(...)` — where the router is already
mutated before `update` has validated anything.

`defaultParams` and `defaultSearch` are now copied into core's own frozen objects
at registration AND on `update`. Both places, because they are two consumers of
one value: `commitRouteUpdate` writes it into the store and returns it as the
`patch` payload, so a copy at either alone leaves the other aliased — measured
mid-change, with registration adopted while `update` still handed back the
caller's bag on both sides. The `update` copy also lands ABOVE the channel
assertion, closing the read-before-copy window at that door.

`getRouteConfig` now hands out a FROZEN record rather than a copy. The record is
core's own — `fromEntries` mints it — so there is no caller object to avoid
freezing, and the door is hot: `preload-plugin` calls it per navigation and
`search-schema-plugin` per route resolution, where a copy would allocate on every
one of those to stop a write nobody legitimately makes. All three first-party
callers only read. Custom-field VALUES stay the caller's, because plugins key
caches on their identity.

⚠ **The copy preserves KIND, and that is a correctness requirement.** `{ ...[] }`
is `{}` and `{ ..."abc" }` is `{ 0: "a", 1: "b", 2: "c" }`, so a plain spread turns
an array or a string handed to `defaultParams` into a plausible-looking object —
and `@real-router/validation-plugin`, which refuses that field by asking what it
IS, then sees an object and says nothing. Measured on the spread-only form: four
cells of that plugin's own coverage table moved out of "plugin refuses" and into
"unreachable", i.e. core's copy laundered invalid config past the layer that
exists to name it. Non-objects now pass through untouched and arrays stay arrays;
the plugin's classification is back to its baseline exactly.

⚠ Breaking for read-modify-write on a handed-out config. `route.defaultParams.x =
…` now THROWS instead of silently mutating live routing — a copy left writable
would swallow the write instead, which is the class of defect this wave is about.
The fix is to build a new object: `routes.update(name, { defaultParams: {
...route.defaultParams, locale } })`.

⚠ Breaking for a plugin that memoises onto the record `getRouteConfig` returns
(`cfg.__compiled ??= compile(cfg.searchSchema)`). That write used to land in core's
route store and, under SSR, in every per-request clone; it now throws. A side
`Map` keyed by route name is the shape all three first-party plugins already use.

⚠ An accessor-backed route default is now evaluated ONCE, at registration, and no
navigation-time door reads it again — the read-count table for `#1847` went from
one read per door to zero, with a new control asserting the single registration
read. A config that expected to be re-read per navigation was relying on the
aliasing this retires.

`types/tree-changed.ts` described the payload's nested slots as "the very objects
the caller registered, all the way down" — accurate when #1963 wrote it, and false
in the other direction now. It records the adoption, keeps the retired behaviour
named so a reader meeting old code recognises it, and states what still passes
through: guard functions, because a function is called rather than enumerated, and
custom-field values, because plugins key caches on their identity.

Decision: #2145. First half: #2171. Parent: #1958. Umbrella: #1901.
