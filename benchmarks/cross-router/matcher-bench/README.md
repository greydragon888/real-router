# matcher-bench — isolated matcher scaling (wide table match)

Pure-Node microbench that measures each router's **matcher** in isolation — no browser,
no framework render — across a width sweep of `4 … 1024` flat sibling routes. It is the
honest instrument for the **"wide table match"** question ("how does match cost scale with
table width?"), which the Playwright `wide-config` scenario cannot answer at
sub-millisecond magnitudes.

## Why it exists

The Playwright scenario measures `ΔTaskDuration` of one full navigation
(click → framework render → settle). The match itself is a thin rider on a ~1 ms
render/settle floor, and at sub-ms magnitudes that floor **wobbles with background load
by more than the match cost changes with N**. The result: the charted curve shows
load-noise "waves" instead of the matcher's true complexity — and it even **inverts the
story** (TanStack renders as the tall, wavy line, implying a slow/erratic matcher, when
its matcher is actually `O(1)` and among the fastest; the height was its render cost).

Isolating the matcher and looping it makes the measurement **100 % matching**: the curve
is flat for `O(1)` matchers and cleanly rising for `O(N)` scanners, with zero waves.
See the side-by-side: <https://claude.ai/code/artifact/c6a87424-213a-4e23-b194-7ac75971e644>.

## Run

```bash
node --expose-gc run.mjs         # all cohorts → results.json
node --expose-gc run.mjs vue     # one cohort
```

Writes `matcher-bench/results.json` (git-ignored, like `results/`).

## Method

- Under each `N` we build **exactly N** sibling routes (`/catalog/item-1 … item-N`) — true
  table **width**, unlike the app which builds a fixed 1024-route table and navigates to
  position `N`.
- Target = the **last** route (worst case for an order-preserving scan).
- Each engine's own pure match entry point (see contract below).
- Per timed loop: warm ~25 ms, then run `K` iterations with `K` adaptive so the total
  duration ≫ clock granularity; `global.gc()` forced before the timed loop. Median of 9
  reps. Engines are measured **interleaved in one process** for cross-engine ratio-fairness.

## Contract (apples-to-apples)

"URL pathname → matched route(s)", each router's natural pure-match call, minimal hoisted
input (the `O(1)` constant of input marshalling does not change a curve's slope):

| engine | pure match entry | resolution |
| --- | --- | --- |
| real-router | `getPluginApi(router).matchPath(url)` | `@real-router/core` + `/api` |
| react-router | `matchRoutes(routes, url)` | `react-router` |
| tanstack | `router.matchRoutes(loc)` | `@tanstack/react-router` (matcher = shared `@tanstack/router-core`) |
| vue-router | `router.resolve(url)` | `vue-router` |
| solid-router | `getRouteMatches(createBranches(routes), url)` | direct file `@solidjs/router/dist/routing.js` |
| sv-router | `matchRoute(url, routes)` | direct file `sv-router/src/helpers/match-route.js` |

`@solidjs/router` and `sv-router` are client-only at their package **index** but expose a
pure matcher in an internal file, imported directly from the pnpm store (hash-free glob).

## Result — the O-class map

**Only real-router and TanStack are `O(1)`. Every other measured router is `O(N)`.**
Isolated µs per match at N = 1024 (representative run):

| router | class | µs @1024 | scaling @1024/@4 |
| --- | --- | ---: | ---: |
| real-router | **O(1)** segment trie | ~0.5 | ~1× |
| tanstack | **O(1)** static-path index | ~0.8 | ~1× |
| vue-router | O(N) sorted scan | ~31 | ~50× |
| solid-router | O(N) branch scan | ~125 | ~238× |
| sv-router | O(N·log N) sort + scan | ~250 | ~337× |
| react-router | O(N) flatten + rank per call | ~2328 | ~185× |

(Absolutes are Node V8 and vary with the machine; the **O-class and shape** are what the
card reports. react-router's absolute includes re-flattening branches every call — its
public `matchRoutes` does this; `createBrowserRouter` may amortize it across navigations.)

## Holdouts

Two competitors cannot be isolated headless; both are **O(N)** by other evidence and keep
that verdict from the browser card:

- **@angular/router** — needs Angular's JIT/platform to run outside a browser. Its `O(N)`
  is already clean in the Playwright card (`0.56 → 2.96 ms`, rme ~1 %): angular is the one
  cohort whose matcher is expensive enough to clear the render-noise floor, so the browser
  card there is already honest and does not need this harness.
- **@mateothegreat/svelte5-router** — its matcher is a method on a Svelte-runes
  `RouterInstance` class (needs the runes runtime). `O(N)` by source: the router iterates
  its routes and calls `route.test(path)` on each.
