---
"@real-router/core": minor
---

fix(core): the query-option errors name the option, not an internal layer (#1819, #1796)

⚠ **Consumers who match on these message strings must update.** Split out of the
refusal changeset because a message rename is a different KIND of change from the
fix that surfaced it — `.changeset/README.md`, "separate by type".

⚠ **Three further changes this text did not announce, all measured.**

- **The message changed, prefix and shape.** It read `[search-params] Unknown
arrayFormat "x" — expected …`; it now reads `[router.constructor] Invalid
"queryParams.arrayFormat": "x" — expected …`. The old prefix named a layer that
  has not been a package since #1510 and that no caller ever wrote, and the text
  named a bare field rather than the option path — so it pointed at neither
  something you typed nor something you could look up. Core's other message
  prefixes are `[router.<call>]` — ten of them, each naming a call — beside a
  comparable number that name a class or layer instead (`[SegmentMatcher.*]`,
  `[FSM.*]`, `[Logger]`, …). ⚠ Two revisions of this line quoted exact counts and
  neither survived re-measurement, because the count depends on whether you
  include the bare `[router]`, the `[router.${methodName}]` template families,
  and prefixes like `[dynamic]` that are not message prefixes at all. The
  argument is about the `[router.*]` family, not a census. And
  `@real-router/validation-plugin` prints `[router.constructor] Invalid
"queryParams.<key>"` for this exact option — which matters, because the
  construction-time refusal makes the plugin's message unreachable for these four
  fields, so core has to carry the sentence it now shadows. Both raising doors
  (`createRouter`, and `cloneRouter` through `new RouterClass(...)`) ARE the
  constructor, so the prefix is honest. A value whose string conversion FAILS gets the same shape
  (`Invalid "queryParams.arrayFormat": its value cannot be converted to a
string.`, with the original error as `cause`) — deliberately without naming
  `toString`, since a `toString` that RETURNS a symbol makes the conversion
  throw rather than the callback. A slot whose READ throws — an accessor-backed
  config, which is the ordinary lazy spelling — is named the same way
  (`Invalid "queryParams.<field>": reading it threw.`) instead of escaping the
  constructor raw. The remedy tail is also DERIVED from the strategy table rather than
  hand-written, which reorders one of the four: `numberFormat` lists `"auto" |
"none"` where it listed `"none" | "auto"`. Consumers grep messages — if you
  match on this one, match on the option path.
- **A second message loses the same prefix.** Building a query whose array holds a
  non-primitive raised `[search-params] Array element must be …`; it now raises
  `[router] Invalid query value: an array element must be …` — bare, because the
  URL build it sits in is reached from `navigate`, `navigateToDefault` and
  `makeState` as well as `buildPath` (instrumented at the throw site: four core
  doors; `navigateToState` never reaches it, and `getStaticPaths` lives in
  `@real-router/ssr-utils`, not core), so naming any one of them would be false
  at the other three. Left
  behind by the rename above and called "a different concern" at the time — but
  the stated reason (a layer that has not been a package since #1510) applies to
  it word for word, and shipping half a rename means the family argument was
  false of the family.
- `getInternals(router).routeGetStore().matcherOptions.queryParams` — the
  plugin-facing `@real-router/core/validation` subpath — is no longer the
  caller's own object. It is a frozen, coerced, unknown-key-dropped copy, fresh
  per router where two default routers used to share one singleton.
  `getOptions().queryParams` is unchanged and still `=== ` the caller's bag.
- `cloneRouter` re-runs the snapshot, so a bag that DRIFTS now fails the clone
  itself rather than the clone's first navigation, and in exchange the drift no
  longer poisons the long-lived base router — measured on both. ⚠ An earlier
  draft added "reads an accessor-backed bag once more than before"; measured, the
  count is the SAME. What changed is which code reads it, and that the clone's
  later builds and parses read it zero times instead of two to five.
