---
"@real-router/core": minor
"@real-router/validation-plugin": minor
---

**An own `__proto__` key is answered by the SOURCE of the data (#1792).**

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members,
so `bag[key] = value` for it reaches the inherited setter, creates no own key,
and the value disappears with no error and no log. Every layer that met that
fact answered it separately, and the repository accumulated four policies for
one key. There is one rule now, and it keys on where the data came from:

| source                                                               | answer                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| the caller's per-navigation `params` / `search` bag                  | **refused** — a synchronous `TypeError`                       |
| a URL's QUERY                                                        | **dropped**, and reported by `@real-router/validation-plugin` |
| a URL's PATH segment                                                 | **normalised silently** — the key cannot survive either way   |
| a route's own `defaultSearch` / `defaultParams`                      | **refused at REGISTRATION**                                   |
| a route's custom field (#1788), a plugin's context namespace (#1191) | **untouched**                                                 |

**The refusal** is core's sixth always-on invariant guard, at the same three
producers the channel guard (#1572) uses — `navigate`, `makeState`,
`buildNavigationState` — and synchronous for the same reason: an argument-shape
defect at the API boundary, caught before any transition exists. The caller
wrote the name; telling them beats any silent handling.

**A route's own defaults are the third category, and the one an earlier draft
missed.** A default is typed by the developer, so it looks like the static-config
case — but unlike a custom field it does not stay in the config: it flows into
the very channel a caller's bag is refused from, so admitting it would publish
the key by the back door. Measured before this existed: the default was silently
lost in the merge, even with nothing filled, so the developer got neither the key
nor a word about it. Refused at `createRouter` / `add` / `replace` / `update` /
`setRootPath`, beside `assertRouteDefaultChannels` and for its stated reason —
both sides are known at config time, so the error names the route and the slot.

**The drop** is in `pipeline/canonicalize`, beside the mode gate. A URL is not
the caller's code and `match()` must never throw on input (#737) — a link from
anywhere would otherwise crash a popstate handler. Bare core is silent; the
validation plugin says it once per route+key, per router (#1583).

⚠ **Only the QUERY channel is checked, and the asymmetry is the point.** The
query bag can carry the key into `state.search` — the no-gate fast path hands it
straight through — so dropping it is a correctness fix. The path bag cannot:
`normalizeParams` copies by plain assignment, which for this one name reaches the
inherited setter and creates no own key, so a path `__proto__` is already gone
whether or not anyone looks. `state.params` is identical either way; the only
thing a path-side check buys is TELLING somebody about a loss that has already
happened.

An earlier draft did buy it, and the price is why this one does not. Reporting a
path drop needs the matcher to stop losing the key first — six decode and
junction-merge writes converted to defines, none of which an AST scan for
`x[k] = v` can find — and then a second membership test on every navigation. See
the cost section below. The correctness half ships; the diagnostic half does not.
`tests/functional/state/proto-key-by-source.test.ts` pins the resulting silence
against a query route in the same router, so the pin cannot pass vacuously, and
records which mutation each half catches.

⚠ **The obvious alternative — carry the key as data everywhere — was built
first, measured, and rejected.** It does not keep the hazard in core, it
EXPORTS it: once the key survives into `state.params` / `state.search`, every
consumer meets it, and `Object.assign` (how application code merges bags) drops
it exactly as core did. Measured downstream on that build: `logger-plugin`'s
diff accumulator had its PROTOTYPE replaced by caller data and logged a blank
line; `persistent-params-plugin` lost the key on every navigation;
`search-schema-plugin` corrupted the prototype of the bag it returns AS the
state, which the state guards then reject as "not a plain object". Nine sites in
core and three plugins is the cost of carrying it. One refusal is the cost of
not.

**Cost: `navigate` +5.7 %, `matchPath` +1.9 %** — one membership test per
`canonicalize`, on a path where a navigation is a couple of microseconds, so a
single builtin call is a real fraction of it. Measured against `origin/master`
over 40 paired rounds on an idle machine, arms alternating in one loop with the
delta computed WITHIN each round: `navigate` median +5.67 %, quartiles
[+3.39, +7.44], positive in 40 of 40 rounds; `matchPath` median +1.89 %, positive
in 35 of 40.

Two earlier figures in this changeset were wrong and are worth recording, because
both were estimator bugs rather than sampling bugs. The first, +2.4 % "as an upper
bound", came from comparing medians ACROSS batches — on this harness the same arm
on the same build moves 2 pp between batches, so that comparison has no power at
all. The second came from too few rounds: at n = 4–6 the round-to-round spread
swamped every per-piece attribution, and three arms isolating parts of the change
contradicted each other. Pair inside the round, and take enough rounds that the
SIGN is unanimous before quoting a median.

The path-side diagnostic that this changeset dropped is priced by the same run:
carrying it cost `navigate` +8.55 % (positive 40 of 40) against master, so
removing it bought 2.28 pp (`matchPath` 0.91 pp) — and it bought that back
without changing a single observable result, because `state.params` is identical
with or without it. CI's instruction-count gate will read its own number,
plausibly larger; that is the figure to hold this against.

⚠ **Breaking, narrowly.** `navigate` / `makeState` / `buildNavigationState`
throw where they previously accepted the bag and silently mishandled the key. A
caller reaching this has a field literally named `__proto__` in a params or
search bag; the error names the channel and the remedy.

**Found by an eight-lens adversarial pass**, which also recorded a
pre-existing defect this change does not fix: `navigate(name, null)` throws a
raw `TypeError: Cannot convert undefined or null to object` from
`findMisChanneledKey` — but only when the route declares query params, since
that guard's `queryNames.length === 0` early return shields every other route by
accident. Same "survival depends on an unrelated fact" shape, different owner.
