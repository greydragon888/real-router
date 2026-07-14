# react-router-bug — isolated repro for react-router #15249

A self-contained reproduction of the deep-route **match blowup** in `react-router@8`:
`matchRoutes()`'s cost for a URL scales with the **route subtree BELOW the matched
route** — routes that are deeper than the URL and therefore *cannot possibly match*,
but are re-checked anyway.

> **Status:** starting point — surfaced by the [cross-router benchmark](../cross-router/),
> isolated here to a pure-Node matcher repro. To be developed further (see TODO).

## The finding

**The same URL costs ~10× more purely because the route tree is deeper.** No React, no
rendering, no browser — just `matchRoutes()`:

| URL matched | 90-deep tree | 150-deep tree | 210-deep tree |
| --- | ---: | ---: | ---: |
| `/sec/l2/…/l30` | 3.5 ms | 8.6 ms | 16.1 ms |
| `/sec/l2/…/l60` | 3.7 ms | 10.5 ms | 19.4 ms |
| `/sec/l2/…/l90` | **2.3 ms** | 11.2 ms | **22.4 ms** |

Two things stand out:

1. **A single `matchRoutes()` call takes 2–22 ms** — for a pure matching function that
   should cost microseconds.
2. **The identical `/sec/l2/…/l90` match is ~10× slower in a 210-deep tree** than in a
   90-deep one. The URL, the matched route, and everything on the path are identical —
   the only difference is the `l91…l210` routes hanging *below* the match, which are
   re-scanned even though no URL that ends at `l90` could ever reach them.

Swept across depth **within one tree**, the cost is a **parabola**: it climbs to a peak at
~⅔ of the tree depth and then *drops* toward the deepest leaf (which has no deeper routes
left to re-check). That is why depth 90 is cheap (2.3 ms) when it is the tree's bottom, but
expensive (22.4 ms) when 120 more levels sit beneath it.

## Run

```sh
node run.mjs      # from the monorepo — uses the workspace react-router@8
# standalone:   npm i react-router@8 && node run.mjs
```

Prints the smoking-gun matrix and the parabola, and writes `results.json`.

- `scenario.mjs` — the isolated repro: `buildRoutes(treeDepth)`, `deepPath(D)`,
  `matchCostMs(routes, url)`. No app, no harness — only `react-router`.
- `run.mjs` — drives the two sweeps and prints the tables.

## Related

- Upstream issue: <https://github.com/remix-run/react-router/issues/15249>
- **Browser-measured chart** (match **+** render, swept to depth 210, n=100):
  <https://claude.ai/code/artifact/58736d29-e694-4c20-9f0c-3469bbcb6c44>

## TODO (develop later)

- Pin the regression range across `react-router` versions.
- Localize *which* matcher pass re-scans the deeper subtree (`matchRouteBranch` /
  `rankRouteBranches` / the flatten step) with a flamegraph.
- Test branching trees (not just a single deep chain) and realistic route configs.
- Distill into an upstream-ready minimal repro / PR for #15249.
