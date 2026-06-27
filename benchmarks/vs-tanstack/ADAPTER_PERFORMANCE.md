# Adapter Performance — cross-framework analysis (vs-tanstack)

Why the `vs-tanstack` speed numbers are shaped the way they are, how the cost was
attributed (CPU profiling + router-free control apps), and what is — and isn't —
addressable in each adapter.

Measured on Apple M3 Pro / jsdom, 2026-06-27. Speed via `vitest bench` (warmup
100, 10 s) and a wall-clock flame loop; both agree. Absolute numbers are
machine- and jsdom-dependent; the **decomposition** is the durable result.

## TL;DR

- **Read the columns, not just the ratio.** TanStack is ~flat across frameworks
  (router-bound); Real-Router varies a lot (adapter-bound). The headline ratio is
  governed by Real-Router's own per-framework number.
- **Bare Vue is not slow.** A router-free Vue app matches the React one. The Vue
  gap was a specific `<Link>` inefficiency, not "Vue runtime is the floor."
- **One Vue lever shipped: +19 %** (formal bench, RME ±0.9 %) — content-stabilize
  `routeParams` so inline literals stop re-running `canonicalJson` + `buildHref`.
- **Solid has no equivalent headroom** — its adapter is ~2 µs/nav (~2 %); the rest
  is Solid runtime + jsdom + GC.

## Per-navigation latency (ms/nav, lower = better)

`1 bench op = 10 navigations`, so `ms/nav = 1000 / (hz × 10)`.

| Framework                | Real-Router | TanStack | notes                 |
| ------------------------ | ----------- | -------- | --------------------- |
| react                    | **0.108**   | 1.522    |                       |
| solid                    | **0.102**   | 1.185    |                       |
| vue (before)             | 0.596       | 1.346    | 167.9 hz              |
| vue (after `<Link>` fix) | **0.497**   | 1.346    | **201.5 hz, +19.3 %** |

**TanStack is router-bound:** 1.19–1.52 ms/nav regardless of framework — its core
runs the same loader-lifecycle + structural-sharing every transition, so the UI
adapter barely moves the number. **Real-Router is adapter-bound:** its core is
~5 µs/nav and framework-flat, so the adapter's per-navigation reactivity
dominates. That is why the headline ratio (rr/ts) tracks Real-Router's own
per-framework number, and why Vue's modest 2.3× is _not_ a TanStack win
(TanStack-Vue is mid-pack) — it was Real-Router's Vue path being the outlier.

## Method: router-free control apps

Profiling alone (`node --cpu-prof`) shows _where_ time goes but not _whether the
router causes it_. The decisive control is a **router-free app of the same
shape** — strip the router entirely, drive the same number of reactive
component updates, and measure the framework's floor.

| Vue experiment (ms/nav)                                            | result    |
| ------------------------------------------------------------------ | --------- |
| bare framework — 47 components reading one `shallowRef`, no router | **0.034** |
| same shape on React (`useSyncExternalStore`)                       | 0.032     |
| real adapter — 20 `useRoute` subscribers only (no Links)           | **0.006** |
| real adapter — 20 `useRoute` + 20 real `<Link>` (fresh literals)   | **0.152** |
| …with **stable** `routeParams` references                          | 0.107     |
| …after the shipped `shallowEqual` fix                              | **0.108** |

The ladder localizes the cost precisely: **bare Vue ≈ bare React** (no intrinsic
gap), subscribers are nearly free, and **96 % of the minimal app's cost is the 20
`<Link>`s** — specifically the ~0.045 ms/nav burned re-running
`canonicalJson(routeParams)` + `buildHref` because the parent panel hands each
Link a fresh `{ id }` object literal every render.

## Vue: the `<Link>` fix

React's `<Link>` is wrapped in `memo()` with a content comparator
(`shallowEqual` on `routeParams`), so an inline `routeParams={{ id }}` literal
**bails the component out** — it does not re-render unless active state changes.
Vue diffs props by **reference**, so the same literal re-renders every navigation.

The fix ports React's contract to Vue: stabilize `routeParams` to a content-equal
reference via `shallowEqual`, so the `href` computed and the active-source watch
recompute only when params content actually changes. Cheaper than the previous
per-navigation `canonicalJson` (JSON.stringify + key sort), and same-shape
navigations skip `buildHref` entirely.

**Result (formal `vitest bench`, same-session A/B): 168.95 → 201.49 hz, +19.3 %,
RME ±0.9 %.** All 379 functional tests pass at 100 % line coverage; property and
stress suites green.

> This **corrects** the earlier "Vue Runtime Floor" conclusion
> (`packages/vue/ARCHITECTURE.md`). Three 2026-04-18 rewrites (computed→shallowRef
> in `useRouteNode`, watch→watchEffect, attrs rest-spread) genuinely measured as
> noise, but the conclusion drawn — "the adapter can't help" — over-generalized.
> Those three targeted the subscriber/scheduler path or the wrong `Link`
> mechanism; none tried param stabilization, the lever that actually mattered.

### What remains Vue-bound after the fix — profiled, not guessed

Even optimized, Vue is ~5× slower than React/Solid in absolute terms
(~0.50 vs ~0.10 ms/nav). Two experiments localize the residual precisely.

**The "no `React.memo` bail-out" is _not_ it.** With the optimized adapter,
fresh-literal `routeParams` (Vue runs each `<Link>`'s `componentUpdateFn` on
every nav) vs hoisted-stable params (Vue's `shouldUpdateComponent` bails the
Links out, the way `React.memo` does) measure **0.110 vs 0.103 ms/nav — a 6 %
gap.** Once the derivations are cheap, skipping the Link's update barely matters.

**It is broad Vue runtime.** A CPU profile of the optimized full app buckets as:

| Layer                                      |                                     % of profile |
| ------------------------------------------ | -----------------------------------------------: |
| **Vue runtime**                            | **~73 %** (component update + reactivity + VDOM) |
| GC / native                                |                                             14 % |
| jsdom                                      |                                              9 % |
| app subscribers                            |                                              2 % |
| **real-router (adapter + core + sources)** |                                         **~1 %** |
| RouteView · nanostores                     |                                        ~0 % each |

Top frames are all Vue: `componentUpdateFn` 8.6 %, `set` 5.6 %,
`renderComponentRoot` 5.5 %, `track` 8.3 %, `setFullProps`+`updateProps` 5.8 %,
`_createVNode`+`createBaseVNode`+`isSameVNodeType` 8.5 %, `patch`+`patchElement`
3.2 %, `notify` 2.6 %. **The adapter, RouteView, and nanostores are each ~0 %** —
the earlier guess that RouteView / the nanostores cascade / a missing `memo`
bail-out drove the residual was wrong; the profile says it is the broad Vue
runtime across ~70 components.

**Why Vue specifically — it pays two taxes at once.** Per navigation it drives
~70 small reactive components, and Vue 3 is the only one of the three that pays
_both_ of these on each update:

|         | fine-grained reactivity (`track`/`set`/`notify` ≈ 21 %) | VDOM (vnode create + diff + patch + props ≈ 32 %)                                      |
| ------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Vue** | ✅ proxy tracks every reactive read                     | ✅ creates + diffs + patches a vnode (runtime `h()` → no patch flags → full prop diff) |
| React   | ❌ coarse re-render instead                             | ✅ — but `memo` bails unchanged components out                                         |
| Solid   | ✅ signals (leaner than proxies)                        | ❌ compiles to direct DOM, no vnode at all                                             |

React pays only the VDOM tax (and `memo` skips most of it); Solid pays only the
signal tax (no VDOM). **Vue pays both**, so the workload that runs at ~0.10 ms on
React/Solid costs ~0.50 ms on Vue. This is Vue 3 architecture, not adapter
overhead — the bare-Vue floor (≈ React) is cheap only because it is a
minimal-reactivity workload; the realistic router workload exposes the double
tax. `setFullProps` alone is ~4 % because runtime `h()` vnodes carry no compiler
patch-flags, so Vue re-resolves every prop on every update (the adapter uses
`h()` by design — no SFC-compiler dependency).

TanStack-Vue sits in the same Vue-render budget, which is why Real-Router's win
against it is compressed (~2.7×) versus React/Solid (~14×/11.5×).

## Solid: near-optimal, no adapter headroom

Solid is already the fastest adapter (~0.10 ms/nav, tied with React). A
minified-aware re-profile (the adapter ships as minified `dist`, so single-letter
names had to be mapped back to source lines in the bundle) gives:

| Bucket (Solid)                                                |   µs/nav |        % |
| ------------------------------------------------------------- | -------: | -------: |
| Solid runtime (`runTop`, `readSignal`, `mergeProps`, effects) |      ~35 |     33 % |
| jsdom (inflated by the test environment)                      |      ~27 |     24 % |
| GC / native / profiler                                        |      ~19 |     17 % |
| app workload (`useRoute`/`useRouteNode` + LCG in subscribers) |      ~14 |     13 % |
| **our stack (adapter + core + sources)**                      |   **~8** | **~7 %** |
| → of which **adapter**                                        | **~2.4** | **~2 %** |
| nanostores/solid loader store                                 |    ~1.3+ |          |

The Vue win does **not** transfer: Solid components run **once** (the parent panel
does not re-render on navigation, so Links are never re-created), `href` is
`createMemo`-ized for the component's lifetime, and the `createSelector` fast path
makes active-state O(1) (only ~2 Links update per navigation). The
param-recompute problem is structurally absent. The single biggest non-runtime
function in the profile — `unwrap` (~5 µs) — comes from `@nanostores/solid`'s
`useStore` (the bench's loader-data layer wraps the store in a Solid
`createStore`), **not** from the route hooks, which use plain signals.

**Verdict:** the Solid adapter is structurally optimal for this workload
(run-once + `createSelector` + plain signals + captured-once slow path). The ~2 %
adapter footprint is not worth chasing; the dominant cost (Solid runtime + jsdom +
GC) is not adapter-addressable.

## React: the baseline

React sits at ~0.108 ms/nav. Its `<Link>` `memo` + content comparator is the
pattern the Vue fix borrows. React re-renders subscribing components on store
change but returns `null` cheaply and reconciles efficiently; the router core is
~4 µs/nav, framework-flat.

## Reproduce

```bash
# Speed (hz) per framework
pnpm bench:vs-tanstack -- client-nav real-router vue speed
pnpm bench:vs-tanstack -- client-nav real-router solid speed

# CPU profile (analyze the emitted .cpuprofile)
NODE_ENV=production node --cpu-prof --import tsx \
  vs-tanstack/client-nav/real-router/vue/speed.flame.ts
```

Note: with the lib build's `minify: false`, **app + Vue runtime keep readable
names but the `@real-router/*` dist is still minified** — classify those hot
frames by bundle line number, not by name, or the adapter's cost hides under
single-letter functions (this is how `canonicalJson` first hid under `p`/`h`).
