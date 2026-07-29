---
"@real-router/core": minor
---

Refuse a mis-channelled params bag instead of repairing it (#1548)

The `forwardState` seam used to run `separateChannels` (stage ②) over whatever
came out of the interceptor chain: a key the resolved route declares with `?`,
sitting in the params bag, was silently moved into the query channel. That
repair is gone. The seam now applies the same centralized check the facade
already used and throws.

Three things were wrong with moving it:

- **The producer kept believing its own bag shipped.** A decoder that returned
  `{ params: { ...params, tag } }` published a state it never wrote.
- **It laundered values past validation.** `search-schema-plugin` documented the
  leak with a test literally named `LEAKS`: an interceptor registered after the
  schema injected into `params`, the seam moved it into `search`, and an
  unvalidated value landed in the very channel the schema owns. That test now
  pins the refusal; the composition hazard is structurally gone.
- **It inverted caller precedence.** A caller's mis-channelled key and a chain
  default's query half ended up in different bags, where no merge ranks them,
  and the repair (spreading `search` last) handed the win to the DEFAULT —
  the #1570 defect, which needed a withholding rule to work around.

**Migration.** Pass a query value in `search`, which is knowable without reading
the target's config. The error names the key, the route, and — when a
`forwardTo` chain resolved elsewhere — the route you actually called, because a
caller who wrote `navigate("src", { lang })` looked at `src`, where `lang` is
undeclared and legitimate.

What did NOT change: a route's own defaults are still routed by the DECLARING
route (#1549 / #1570), in `canonicalize`, `makeState` and the chain fold. That
is core producing two channels out of a config slot whose owner may be resolved
dynamically — not a repair of somebody else's bag, and the one case where the
author genuinely cannot know the channel.

Measured radius before and after: 7 tests across 13 packages, all in core and
`search-schema-plugin`; every other package (browser, hash, navigation,
persistent-params, sources, memory, preload, ssr-utils, ssr-data, rsc-server)
was already channel-correct and needed no change.
