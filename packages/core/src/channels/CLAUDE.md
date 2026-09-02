# channels (`core/src/channels`)

The **channel-correctness subsystem** of `@real-router/core` — one rule, three mechanisms, one directory. Not a package (no `package.json`, bundled into core at build time) and not a public import path; the only consumers are core's own facade, namespaces, wiring and pipeline.

Core's fifth always-on invariant guard lives here (`guard`), together with the two mechanisms that apply the same rule at other moments: `defaults` at registration, `modeGate` at the pipeline's terminal. **Only the first is a guard** — "guard" names one of the three, not the directory.

## The rule

`params` is the **path** channel, `search` the **query** channel, and the router moves nothing between them: the two meet in exactly one place, the printed URL.

**The slot IS the channel.** `defaultParams` is the path channel and `defaultSearch` the query channel, whatever the route declares — there is no routing by declaration, in any position. Stage ② (channel separation) is deleted; channel-correctness is the **producer's contract**, not a repair the pipeline performs behind everyone's back.

## Exports

| Export                       | Module        | Kind              | Description                                                                                                                                                                         |
| ---------------------------- | ------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findMisChanneledKey`        | `guard.ts`    | predicate         | The first key the caller put in the PATH bag while the route declares it with `?`, or `undefined`. Scans `queryNames`, not the bag — no `Object.keys` allocation                    |
| `assertChannelCorrect`       | `guard.ts`    | throwing guard    | The single place a mis-channelled bag is refused, wherever it came from. Throws `TypeError`. `source` names WHOSE bag is wrong (thunk-friendly for the hot path)                    |
| `misChanneledKeyMessage`     | `guard.ts`    | message builder   | One wording for every door — including `navigateToState`'s `RouterError(WRONG_CHANNEL)`, which needs the wording WITHOUT the throw (why it is separate from `assertChannelCorrect`) |
| `assertRouteDefaultChannels` | `defaults.ts` | config-time guard | A route's own `defaultParams` naming a key it declares with `?`, refused at registration. Runs over the WHOLE config after every rebuild                                            |
| `withholdFilledSlots`        | `defaults.ts` | precedence rule   | Declines a query default whose key the caller already filled with the retired single-bag spelling. Nothing is moved — only the default is declined                                  |
| `admittedSearch`             | `modeGate.ts` | normaliser        | The query channel restricted to what the active `queryParamsMode` will actually PRINT. A DROP, not a move                                                                           |

## Three mechanisms, deliberately different

| Mechanism  | Does                        | On the render path?                            | Reference     |
| ---------- | --------------------------- | ---------------------------------------------- | ------------- |
| `guard`    | **DETECTS** and refuses     | Throwing form: **no**. Bare predicate: **yes** | #1572         |
| `defaults` | Refuses at **config time**  | n/a (registration, not navigation)             | #1549 / #1570 |
| `modeGate` | **FIXES** and never reports | **Yes** — every producer, predicates included  | #1575         |

The distinction inside `guard` is load-bearing (#1581): `assertChannelCorrect` never runs on the predicates — there it would scan the caller's bag on every `<Link>` render for a condition that is almost always absent, and its reaction is a throw, into a render, across six adapters. But `canNavigateTo` calls `findMisChanneledKey` **directly** and ANSWERS `false` for the shape P1 throws on, so it never promises a navigation that would throw on the click (#1576). **Detecting on the render path is fine; throwing there is not.**

`modeGate` makes the opposite call on purpose, and it is not a leak from the guard's rule: it speaks only when a key was actually DROPPED — i.e. only when the answer the predicate just returned is missing what the caller asked for. See the full render-path table in [../../CLAUDE.md](../../CLAUDE.md).

## Why a subsystem and not a namespace method

The other four always-on guards each have an owning module — `subscribe` belongs to `EventBusNamespace`, `start(path)` to `RouterLifecycleNamespace`, `navigateToNotFound` to the facade, `claimContextNamespace` to `getPluginApi`. This one has no owner, and its callers are more numerous than they look — **sixteen sites in ten modules**, counted rather than recalled:

| Site                                                          | Module                                                                                                                                                     | Mechanism                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| P1 raw-argument guard                                         | `internals.ts`                                                                                                                                             | `assertChannelCorrect`                           |
| the `forwardState` seam                                       | `Router.ts`                                                                                                                                                | `assertChannelCorrect`                           |
| `canNavigateTo`                                               | `Router.ts`                                                                                                                                                | `findMisChanneledKey`                            |
| P3 `navigateToState` — predicate **and** message              | `NavigationNamespace.ts` (×2)                                                                                                                              | `findMisChanneledKey` / `misChanneledKeyMessage` |
| the `decodeParams` boundary                                   | `RoutesNamespace.ts`                                                                                                                                       | `assertChannelCorrect`                           |
| `updateRoute`'s incoming `defaultParams`                      | `routesStore.ts`                                                                                                                                           | `assertChannelCorrect`                           |
| four registration entry points                                | `routesStore.ts` ×2 (`setRootPath`, `addRoute`), `getRoutesApi.ts` ×2                                                                                      | `assertRouteDefaultChannelsFor`                  |
| the four State-PUBLISHING doors, on the bag they ship (#1927) | `wiring/wireNamespaces.ts` (`navigate`), `StateNamespace.ts` (`makeState`), `getPluginApi.ts` (`buildNavigationState`), `RoutesNamespace.ts` (`matchPath`) | `assertShippedChannelCorrect`                    |
| the store-layer adapter those four reach it through           | `RoutesNamespace/helpers.ts`                                                                                                                               | `assertRouteDefaultChannels`                     |

(The two applying mechanisms add two more sites, in `pipeline/canonicalize.ts` — `withholdFilledSlots` and `admittedSearch` — which is the pipeline consuming the rule rather than a further position that checks it.)

A cross-cutting invariant with that spread is a subsystem. The rule used to live in **two files both called `helpers.ts`** (the bag check in `src/helpers.ts`, the config check in `namespaces/RoutesNamespace/helpers.ts`) — one edit away from becoming two rules that disagree.

That is not a hypothetical fear; the same shape one layer up is what Phase 4 closed. Stage ③ and the mode gate had TWO terminals — `pipeline/canonicalize` and `StateNamespace.makeState` — and #1584's existence precondition landed on the first and not the second, because it was found by sweeping the PORT's consumers while the other terminal read its own dependency bag. One implementation is what makes the next such fix reach every position by construction rather than by whoever remembers the second copy.

## The import boundary

**This directory imports nothing from the namespaces, the engine or the pipeline** — the same inversion `src/pipeline` makes with its `RouteResolver` port. Declared query names arrive as **DATA** (`readonly string[]`, or a `queryNamesOf` accessor), never as a matcher or a store, so there is exactly one registry (#1556) and this code cannot grow a second derivation of it.

**This is machine-enforced, not a convention:** a `no-restricted-imports` block scoped to `src/channels/**/*.ts` in `packages/core/eslint.config.mjs`. Its message names the remedy (pass `readonly string[]` or a `queryNamesOf` accessor from the caller, as `RoutesNamespace/helpers.assertRouteDefaultChannelsFor` does).

The caller owning the derivation also owns its **caches**, which matters at registration: every `assertRouteDefaultChannels` call site runs on PREPARED artifacts before any swap, with caches local to the attempt — checking against the live store would validate a tree the rejected batch has not installed.

## Gotchas

- **`undefined` is absence on both sides (#1550 / #1551)** — an `undefined`-valued key is NOT a mis-channel (it is the documented removal marker `persistent-params` relies on), and a caller's removal marker does not count as "already filled", so a withheld default survives it.
- **An absent BAG is a different fact, and it has two spellings (#1822).** `findMisChanneledKey` short-circuits on `undefined` **and** `null`, because `navigate(name, null)` is supported runtime input — pinned as "treats null params as empty params and resolves" — while the signature admits only `Params | undefined`. Testing `=== undefined` alone lets `Object.hasOwn` perform `ToObject`, which makes the DIAGNOSTIC the thing that throws — the one thing this predicate must never do. The term is spelled `== null`, the intent `Router` already states in those words. ⚠ The term belongs in the predicate rather than in `assertChannelCorrect`: `canNavigateTo` and `navigateToState` reach it directly, and neither may throw — the first answers on the render path, the second rejects because URL plugins call it from popstate handlers.
- **The `/items/:id?id` carve-out (#843 / #1549)** — a name that also occupies a path slot is absent from `queryNames` by construction, so the collision form is legitimately path-owned and passes the guard. `withholdFilledSlots` is scoped to DECLARED query names for the same reason: withholding for a key declared nowhere, or for the path-slot half of a collision, printed an href the route's own `matchPath` immediately rewrote (the #1552 / #1578 class — href ≠ destination, with `buildPath` the only producer out of agreement).
- **A diagnostic must never become the thing that throws** — the bag may be accessor-backed (a Proxy, a getter, a framework's reactive object), and `findMisChanneledKey` reads it EARLIER than any consumer would. A throwing accessor is caught and treated as "nothing to report", so the failure keeps its original origin.
- **`Object.hasOwn` before every read** — a bare `params[key]` walks the PROTOTYPE, so a route declaring `?toString` / `?constructor` / `?valueOf` read as "the caller already filled this slot" on an EMPTY bag. Both `findMisChanneledKey` and `withholdFilledSlots` guard the read. ⚑ The rule is no longer scoped to this subsystem: the URL PRINTER obeys it too since #1798 (`SegmentMatcher`'s declared-query loop and its path-slot read), which is what closed the two ways the same blind spot escaped here — an href carrying a serialized native method while `state.search` stayed empty, and a `:toString` slot bypassing the required-param guard. Measured radius there: 11 of `Object.prototype`'s 12 own members on the query direction, all 12 on the path slot.
- **The READ rule has a WRITE twin, and this subsystem carries one of each (#1852).** `Object.hasOwn` guards what is read OFF a caller's bag; `putField` guards what is written INTO a record of core's own under a key the caller chose. `withholdFilledSlots` is the site here — its `kept` bag is keyed by whatever a route's `defaultSearch` spells, and registration accepts any name. Measured before the fix: an ambient accessor under a route's own default key made `buildPath` **throw** (`Cannot set property theme of #<Object> which has only a getter`) instead of printing a URL. ⚠ Its former justification — "the merge below walks own keys, so nothing this loop produces reaches a committed channel" — was a REACHABILITY argument, and it was named in the code rather than defended precisely so it could be retired; `__proto__` was never the whole hazard.
- **Dropping `"__proto__"` is a SEPARATE decision from that primitive, and it lives elsewhere.** `putField` keeps every name; the five channel copy sites in `src/helpers.ts` skip that one on purpose, because `state.params` / `state.search` are the most-merged containers the router publishes and a bag handed back carrying an own `"__proto__"` is a prototype-swap primitive for any consumer that merges it. A plugin's context namespace (#1191) and a route's custom fields (#1788) keep it, for the mirror reason. See `UNSAFE_KEY` in `src/constants.ts`.
- **`admittedSearch`'s drop branch is the only unfrozen hand-back in the subsystem, so it freezes** — `search` arrives frozen from `mergeQueryChannel` and the no-drop branch returns it untouched. ⚠ That is a description, NOT the reason the query channel keeps its merge-time freeze while the path channel lost one (#1928): measured, moving the query freeze to `materialize` leaves the suite green, so the split is PERF-gated — and re-measured on this shape it costs +6.3 % on `isActiveRoute-parent`, not the 9.8 % on `isActiveRoute-exact` #1598 recorded (that arm is noise now). Before nav-pipeline Phase 2 the gap was invisible (every consumer re-merged and re-froze downstream); `materialize` deliberately does not, and Phase 4 removed the last re-merge, so this freeze is the only one on the drop path.
- **Every mechanism returns its input untouched when nothing changes** — no allocation on the common path, which is the only path the zero-default hot path ever takes.

## File map

```
guard.ts     — findMisChanneledKey · assertChannelCorrect · misChanneledKeyMessage
defaults.ts  — assertRouteDefaultChannels (config-time half) · withholdFilledSlots (precedence)
modeGate.ts  — admittedSearch
index.ts     — the barrel core imports
```

## The mode gate — always-on, but a NORMALISER (#1575)

The channel guard **detects and never moves**; the mode gate **fixes and never
reports**.

One rule, all three `queryParamsMode` values, both directions: _a key the active
mode does not PRINT does not enter the canonical query channel._ That buys
`keys(state.search) ⊆ keys(matchPath(state.path).search)` in every mode.

- A **DROP, not a move** — the key does not fall back into `state.params`.
- Applied **after** the default merge, so a `defaultSearch` for a key the route
  does not declare with `?name` is dead config under `default` / `strict`.
- Wired at ONE terminal, `pipeline/canonicalize`, which every producer reaches.
  `loose` short-circuits, so the repo default pays nothing.
- **The diagnostic fires from every producer, predicates included, and that
  uniformity IS the design.** It speaks only when a key was actually DROPPED —
  i.e. only when the answer just returned is missing what the caller asked for.
  De-duplicated per route+key. ⚠ Pinned by "feeds the gate from EVERY producer" in
  `undeclared-query-mode-gate.test.ts`, the only test that fails on a mutant that
  silences one producer.
- **The message names the route and the key, deliberately not the PRODUCER** —
  under the de-dup that ships with it the name would be whichever producer ran
  first, asserting a locality the de-dup has already destroyed.
- The pipeline reads the decision through one boolean port accessor,
  `admitsUndeclaredQuery()`.
- **The REPORT presupposes the route exists.** The drop does not, but announcing
  "key `q` is not declared on route `nope`" about a route that is not a route
  blames the query for a typo in the ROUTE name. Both diagnostics gate on
  `pathNames(name) !== undefined`.
- Silent in bare core; the plugin's `reportDroppedQueryKey` makes it visible,
  de-duplicated per route+key **per router**, so an SSR clone is not silenced.

**A key declared NOWHERE keeps its params-bag home**, with an opt-in diagnostic.
It stays in `state.params` as app-level data — the state does not round-trip
through its own `state.path`, and that consequence is real. Core does NOT drop it:
dropping retires a shipped capability, and the "declared nowhere" predicate cannot
separate a typo from `navigate("users", { id })` on a parent route whose CHILD
declares `:id`. The diagnostic is opted into by the COMMITTING producers rather
than inferred from the compositional form, so no predicate pays it on the render
path.

**What each mechanism does on the RENDER path.** Read this before writing
"predicates are not …" anywhere:

| Mechanism                       | On predicates?                     | Why                                                                                                                                           |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Channel guard**               | **No** — never runs there          | A SCAN for a condition almost always absent, on every render, whose reaction is a throw into a render. `canNavigateTo` still answers `false`. |
| **Mode gate**                   | **Yes** — every producer           | Speaks only when a key was DROPPED, so the cost lands on the broken call. De-duplicated per route+key.                                        |
| **Undeclared-param diagnostic** | **No** — committing producers only | Nothing is lost; the advice is about round-tripping a state you are about to commit, and a predicate commits nothing.                         |

The discriminator is **loss**: report where information was destroyed, advise only
where something will be committed, and never scan the render path for an absence.

## See Also

- [README.md](README.md) — what this subsystem is, in short
- [../../CLAUDE.md](../../CLAUDE.md) — the `@real-router/core` package architecture, incl. the render-path table for all three mechanisms
- [../../INVARIANTS.md](../../INVARIANTS.md) — property-based invariants (state immutability across every producer, mode-gate containment)
- [../pipeline/CLAUDE.md](../pipeline/CLAUDE.md) — the navigation delivery pipeline, this subsystem's main consumer
