---
"@real-router/core": minor
---

fix(core): resolve the query strategies once, at matcher construction (#1796)

`resolveStrategies` ran per parse and per build, so an invalid `queryParams`
format surfaced from inside `matchPath` — and its call sites are the ones with
nobody to catch for them: `navigation-plugin`'s `navigate`-event handler (an
un-intercepted event makes Chromium fall back to a full-document navigation) and
`preload-plugin`'s hover path, where the listener is registered directly on
`document`. `createMatcher` now resolves once, so `createRouter` refuses an
invalid format and `match()` cannot raise a config error at all.

That also makes the refusal unconditional. Both directions short-circuit on an
empty query before resolving, so a router with a bogus format used to run
cleanly until the first URL that happened to carry a query key.

⚠ **Behaviour change, stated against the version you are upgrading FROM.** A
router configured with an invalid `queryParams` format constructed fine and then
threw the named `TypeError` out of the first query-bearing `matchPath` /
`buildPath` / `start()`; `createRouter` now throws it instead. Only a
misconfigured router is affected — a valid format is untouched, and a malformed
percent sequence still unmatches instead of throwing.

⚠ The move is not only earlier, it is to a call site nobody wraps. `matchPath`
is already inside a `try` in most integrations; `createRouter` runs at module
scope, so a bad config now takes the whole module graph down rather than the
query-bearing routes. That is arguably the right trade for a misconfiguration,
and it is the trade — not a free improvement.

⚠ An earlier revision of this paragraph described the before-state as "resolved
MOST query URLs to `UNKNOWN_ROUTE` with no diagnostic". That is the **pre-#1796**
world, and #1796's first half is already released — measured on the release
commit, the named throw is what a consumer gets today. The silent-`UNKNOWN_ROUTE`
description survived from the first half's own write-up into the second half's,
where it was no longer true of anybody.

⚠ Most, not every, and the exception is why this matters. Measured on the
pre-#1796 base, four formats × two values: with an ordinary typo (`"bogusTypo"`)
all four unmatch, but with a PROTOTYPE name (`"toString"`) `arrayFormat` and
`nullFormat` **parsed correctly** — `{"a":[1,2]}` and `{"a":null}`,
byte-identical to a valid config, because the native method the lookup resolved
to happened to satisfy the call. So the prior behaviour was not "everything
404s": two of the four formats worked, silently, on a configuration the router
should have refused.

**The three shared defaults are frozen.** `makeOptions` hands back a
module-level cached singleton BY REFERENCE — a pinned perf invariant — so an
unfrozen one is a process-global, the #897 class (`LEVEL_CONFIGS` exported
unfrozen corrupted the global log threshold); measured before the fix, a single
write to it changed what every later `makeOptions()` returned.

⚠ The reach is narrower than "every default-configured router", which an earlier
draft claimed: `OptionsNamespace` fills `queryParams` with
`DEFAULT_QUERY_PARAMS`, whose four fields are all DEFINED, so the all-undefined
fast path does not fire and such a router gets a FRESH object.
`DEFAULT_QUERY_PARAMS` itself is shared by every one of them by reference
(measured), and the resolved singleton is reached by a caller passing nothing or
an empty bag. Nothing in the engine mutates any of the three, so the freeze costs
nothing and makes read-only structural rather than conventional.

It also removes an ORDER DEPENDENCE that predates this change: `OptionsNamespace`
deep-freezes the router's options and its defaults reference
`DEFAULT_QUERY_PARAMS`, so the FIRST `createRouter` froze the module singleton as
a side effect — `Object.isFrozen` answered `false` in a process that had not
built a router and `true` in one that had.

⚠ **Three input classes stay outside the guard**, because they never reach
`resolveStrategies`: a nullish format value (`asKey` reports it as absence and
`makeOptions`' `??` then supplies the default — ⚠ `null` reached that `??` as the
STRING `"null"` for four commits of this branch and was refused by name, which is
the shape a JSON or YAML config actually carries; it is pinned now, in both
halves of nullish), a
format on a route rather than the router, and a `queryParams` CONTAINER that is
not an object at all, accepted in silence — a truthy non-object (a string, a
number) reads `undefined` through the same four field probes, while `null` / `0`
/ `""` do not reach them at all (`makeOptions` opens with `!opts`). All three are
silent in bare core and are `@real-router/validation-plugin`'s to report.

⚠ **The rethrow predicate cannot itself throw, and the first version of it
could.** The narrowing rethrows an error carrying a marker, and asking
`SYMBOL in error` runs the `has` trap of a Proxy — so the ASK escaped
`matchPath` when an application threw `new Proxy(err, { has() { throw … } })`
from an `Object.prototype` setter. Measured, and it is the exact contract the
narrowing exists to protect: one fail-open default had been replaced by another
wearing a different hat. The ask is wrapped now — if asking whether the error is
ours throws, it is not ours.

⚠ And the marker is a **label, not a capability**. `Symbol.for` is a global
registry, so an application can obtain the same symbol, attach it to an error of
its own, and have it rethrown (measured, and pinned). Accepted: forging it takes
a deliberate `Symbol.for` with this exact string, at which point the application
is asking for the rethrow. A private `Symbol()` would close it and cannot cross
the `path-matcher` layer boundary, which is why the registry is used at all.

**Measured**, alternating processes, min-of-N timing reps, medians over 12
rounds, A/A floor **0.3–2.4 %** on the hot path (stated inline, as this package's
other perf notes do — a single-digit delta without a floor is not a result).

Against the version you are upgrading FROM: a query-carrying `matchPath`
**−10.2 %** and a query-emitting `buildPath` **−6.8 %**, on a three-key query.

⚠ The win is **concentrated, not uniform**, because what is removed is a fixed
per-call cost (~120–145 ns per `matchPath`, ~50–60 ns per `buildPath`) rather
than a proportional one. So it is roughly **−15 % at one query key, −10 % at
three, −4.6 % at eight**, and **zero on a URL with no query** — both directions
short-circuit before resolving. ⚠ A middle revision claimed ≈ −2 % there;
re-measured against a tighter floor it is −0.03 % / −0.47 %, i.e. inside the
noise, and the original "exactly zero" was right. Quoting the three-key cell alone
would read as a property of the call; it is a property of the shape.

⚠ **Construction gets slower, and an earlier revision of this section did not say
so while being headed "Measured cost".** Resolving once per matcher costs
`createRouter` **≈ +420…700 ns** (+1.3…2.4 %), `cloneRouter` **≈ +220…690 ns**
and `dispose()` **≈ +250…310 ns** (+9…13 % of a teardown), since it runs a
resolution where it ran none. A route mutation is **≈ +220…300 ns**
(+2.6…3.6 %) — an earlier revision called that one unresolved, and an
independent re-measurement resolved it well outside its floor. Where two runs of
the same protocol disagree, both ends are given rather than the flattering one. An SSR
request that clones and disposes pays **≈ +930 ns** and earns it back on its
seventh query-carrying `matchPath`. Immaterial against a ~32 µs construction, but
it is a cost and it belongs in a section that names its gains.

⚠ A first revision of this paragraph quoted +148 ns / +84 ns / +232 ns — three to
five times low, from a harness whose A/A floor was wider than the effect. The
numbers above come from alternating whole processes, min-of-9 reps, 16 pooled
rounds, against a cross-checkout A/A floor of 0.4–1.3 %.

⚠ An earlier revision quoted **−3.3 % / −3.0 %** against the **pre-#1796** base.
Those numbers reproduce against that base, but that base is not this one:
#1796's first half is already released, so the figure nets this branch's win
against a regression consumers already have and prints the smaller number.

⚠ **Three further changes this text did not announce, all measured.**

- **The message changed, prefix and shape.** It read `[search-params] Unknown
arrayFormat "x" — expected …`; it now reads `[router.constructor] Invalid
"queryParams.arrayFormat": "x" — expected …`. The old prefix named a layer that
  has not been a package since #1510 and that no caller ever wrote, and the text
  named a bare field rather than the option path — so it pointed at neither
  something you typed nor something you could look up. Core has eleven
  `[router.*]` prefixes — ten besides this one, every one naming a call — and it
  also carries twelve that name a class or layer instead (`[SegmentMatcher.*]`,
  `[FSM.*]`, `[Logger]`, …), so this is an argument about the `[router.*]` family
  and not about core as a whole. And
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
  URL build it sits in is reached from `navigate`, `navigateToState`,
  `navigateToDefault`, `makeState` and `getStaticPaths` as well as `buildPath`,
  so naming any one call would be false at the other five. Left
  behind by the rename above and called "a different concern" at the time — but
  the stated reason (a layer that has not been a package since #1510) applies to
  it word for word, and shipping half a rename means the family argument was
  false of the family.
- `getInternals(router).routeGetStore().matcherOptions.queryParams` — the
  plugin-facing `@real-router/core/validation` subpath — is no longer the
  caller's own object. It is a frozen, coerced, unknown-key-dropped copy, fresh
  per router where two default routers used to share one singleton.
  `getOptions().queryParams` is unchanged and still `=== ` the caller's bag.
- `cloneRouter` re-runs the snapshot, so a clone reads an accessor-backed bag
  once more than before and a bag that DRIFTS now fails the clone itself rather
  than the clone's first navigation. In exchange the drift no longer poisons the
  long-lived base router, which it did before — measured on both.
