# matcher-bench — isolated matcher scaling (wide table + deep tree match)

Pure-Node microbench that measures each router's **matcher** in isolation — no browser,
no framework render — across two sweeps: a **width** sweep of `4 … 1024` flat sibling routes
(`wide-config`) and a **depth** sweep of a `3 … 90`-level nested chain (`deep-config`). It is
the honest instrument for the **"how does match cost scale?"** questions that the Playwright
`wide-config` / `deep-config` scenarios cannot answer at sub-millisecond magnitudes.

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
| @angular/router | parse + `defaultUrlMatcher` walk | load `@angular/compiler` (JIT) first, then `@angular/router` |

`@solidjs/router` and `sv-router` are client-only at their package **index** but expose a
pure matcher in an internal file, imported directly from the pnpm store (hash-free glob).
`@angular/router`'s index needs the JIT compiler for its decorators, so `@angular/compiler`
is imported first (what `platform-browser-dynamic` does); `recognize()` isn't public, so its
core is replicated with the public `defaultUrlMatcher` (walk the config until a route
consumes all segments) — a faithful `O(N)`, absolute is a lower bound on the full recognizer.

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
| @angular/router | O(N) recognizer walk | ~92 | ~219× |

(Absolutes are Node V8 and vary with the machine; the **O-class and shape** are what the
card reports. react-router's absolute includes re-flattening branches every call — its
public `matchRoutes` does this; `createBrowserRouter` may amortize it across navigations.)

## Deep tree match — depth sweep

The same isolation applied to `deep-config` ("how does match cost scale with nesting
**depth**?"). Every engine builds the identical 90-level nested chain `/deep/l1/…/l90`
(`deep-spec`) and matches the URL at each target depth `[3, 30, 60, 90]`. Isolated µs per
match at depth 90 (representative run):

| router | class | µs @90 | note |
| --- | --- | ---: | --- |
| real-router | **O(depth)** trie walk | ~2.8 | **the lightest — wins the deep matcher in every cohort** |
| vue-router | O(depth) | ~4.8 | µs-competitive (rr wins ~1.7×) |
| tanstack | O(depth) | ~70 | walks the parent chain per level too; rr wins **~25×** |
| sv-router | O(depth) | ~202 | heavy constant (rr wins ~72×) |
| solid-router | O(depth) | ~273 | heavy constant (rr wins ~99×) |
| react-router | **catastrophic** (#15249) | **~5900** | parabola peaking @60 (**9.6 ms**); re-flatten + re-rank every call |

> ⚠️ **Fixed 2026-07-16 (independent audit, C9):** an earlier version reported TanStack deep as **O(1) ~1 µs** ("champion") — a matcher-bench bug: `tanstack buildDeep` closed over a mutated `let parent` (late-binding), so the 90-level tree never built and `matchRoutes` fuzzy-matched to `/deep` (2 matches) at any depth; the `length > 0` gate passed it. Fixed with per-iteration `const` capture + a depth-assert gate (the match must reach depth d). TanStack deep is **O(depth)**; **real-router wins the deep matcher in every cohort.**

**react-router #15249 is confirmed a MATCHER cost, not render:** the isolated matcher
reproduces the browser card's exact **parabola (peak @60)** — a matcher-algorithm signature,
not the monotonic curve render would produce. The browser "react-router wins deep @90" was
render (its matcher @90 is ~5953 µs, ~2000× real-router's). Deep matches are µs–ms (not
sub-µs like wide), so the deep sweep uses a low per-loop iteration floor.

## Holdouts

Competitors that cannot be isolated headless are **O(N)/O(depth)** by other evidence and keep
that verdict from the browser card:

- **@mateothegreat/svelte5-router** (wide + deep) — its matcher is a method on a Svelte-runes
  `RouterInstance` class (needs the runes runtime). `O(N)` by source: the router iterates
  its routes and calls `route.test(path)` on each.
- **@angular/router** (deep only) — the flat wide scan isolates via `defaultUrlMatcher`, but
  the *nested* recognizer needs a recursive descent (per-level segment consumption +
  snapshot/guard work) that can't be faithfully replicated headless. Its deep card keeps the
  browser full-nav (O(depth), ~5.5 ms @90 vs real-router ~1.6).
