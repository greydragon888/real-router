---
"@real-router/core": minor
---

**An own `__proto__` key is answered by the SOURCE of the data (#1792).**

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members,
so `bag[key] = value` for it reaches the inherited setter, creates no own key,
and the value disappears with no error and no log. Every layer that met that
fact answered it separately, and the repository accumulated four policies for
one key. There is one rule now, and it keys on where the data came from:

| source                                                               | answer                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| the caller's per-navigation `params` / `search` bag                  | **refused** — a synchronous `TypeError`                                         |
| a URL's QUERY                                                        | **dropped** at the wire entry, and reported by `@real-router/validation-plugin` |
| an interceptor / `decodeParams` / dynamic `forwardTo` return         | **refused** at the `forwardState` seam                                          |
| a URL's PATH segment                                                 | **normalised silently** — the key cannot survive either way                     |
| a route's own `defaultSearch` / `defaultParams`                      | **refused at REGISTRATION**                                                     |
| a route's custom field (#1788), a plugin's context namespace (#1191) | **untouched**                                                                   |

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

**Where each half sits follows the SOURCE of the data, not its cost.** The drop
lives at `RoutesNamespace.matchPath`, the one producer that can be handed a bag
parsed out of a URL. The refusal lives at each caller-facing producer's entry and
at the `forwardState` seam, which covers in one place anything an interceptor, a
`decodeParams` or a dynamic `forwardTo` hands back. `canonicalize` checks
nothing: it is shared by all seven producers, and a drop there would silently
swallow a key that six of them were handed by a caller who should be told.

**Cost, measured and roughly even.** 40 paired rounds against `origin/master` on
an idle machine, arms alternating in one loop with the delta computed WITHIN each
round: `navigate` +2.98 % and `matchPath` +4.78 %, against +6.05 % / +1.86 % for
the same rule hosted in `canonicalize` — 2.4 pp cheaper on one path, 2.7 pp
dearer on the other. Quoted because it was measured, not because it decided
anything.

An earlier revision skipped the seam check when the chain had handed back the
references it was given. It is gone: the first form had a hole (an interceptor
can create this key on the bag it was handed, in place, via `defineProperty`,
keeping every reference), and the form that closed the hole bought a few percent
for a condition whose correctness took a paragraph. The seam either checks what
leaves it or it does not.

Two earlier figures in this changeset were wrong, and both were estimator bugs
rather than sampling bugs. The first, +2.4 % "as an upper bound", compared medians
ACROSS batches — on this harness the same arm on the same build moves 2 pp between
batches. The second came from too few rounds: at n = 4–6 the round-to-round spread
swamped every per-piece attribution. Pair inside the round, and take enough rounds
that the SIGN is unanimous before quoting a median.

⚑ **Doing this inside the query PARSER was built and rejected.** The parser
already tests `name === "__proto__"` on every key, so dropping there would have
been free — but it drops the key before `strictQueryParams` can see it, and a URL
carrying an undeclared `__proto__` stopped being unmatchable under `strict`.
Measured, not reasoned: the mode sweep went from `<no match>` to a silent match.
The parser is also injected as a one-argument `parseQueryString(queryString)` with
no route name in scope, so the diagnostic could not have survived there either.

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
