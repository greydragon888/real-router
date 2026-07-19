# react-router-bug — isolated repro for react-router #15249

A self-contained reproduction of the deep-route **match blowup** in `react-router@8`:
`matchRoutes()`'s cost for a URL scales with the **route subtree BELOW the matched
route** — routes that are deeper than the URL and therefore *cannot possibly match*,
but are re-checked anyway.

> **Status:** starting point — surfaced by the [cross-router benchmark](../cross-router/),
> isolated here to a pure-Node matcher repro. To be developed further (see TODO).

## The finding

**The same URL costs more purely because the route tree is deeper.** No React, no
rendering, no browser. Both matrices below are one same-session run (2026-07-19):

**A · public `matchRoutes()` per call** (re-runs flatten+rank every call):

| URL matched | 90-deep tree | 150-deep tree | 210-deep tree |
| --- | ---: | ---: | ---: |
| `/sec/l2/…/l30` | 3.7 ms | 8.8 ms | 16.1 ms |
| `/sec/l2/…/l60` | 4.2 ms | 10.7 ms | 20.2 ms |
| `/sec/l2/…/l90` | **2.4 ms** | 11.3 ms | **24.5 ms** |

**B · Data-mode amortized** (branches prebuilt once, as `createBrowserRouter` does —
the honest steady-state per-navigation cost):

| URL matched | 90-deep tree | 150-deep tree | 210-deep tree |
| --- | ---: | ---: | ---: |
| `/sec/l2/…/l30` | 1.20 ms | 2.40 ms | 3.61 ms |
| `/sec/l2/…/l60` | 1.46 ms | 4.39 ms | 7.25 ms |
| `/sec/l2/…/l90` | **0.09 ms** | 5.18 ms | **9.95 ms** |

Two things stand out:

1. **On the honest amortized axis the phenomenon is STRONGER, not weaker:** the
   identical `/sec/l2/…/l90` match is **~10× slower per-call** in a 210-deep tree than
   a 90-deep one — but **~107× slower amortized** (0.09 → 9.95 ms), because the
   90-in-90 baseline collapses to scan-only µs-class once the per-call flatten+rank
   (59 % of the per-call @l90-in-210 figure) is amortized away.
2. **The URL, the matched route, and everything on the path are identical** — the only
   difference is the `l91…l210` routes hanging *below* the match, which are re-scanned
   even though no URL that ends at `l90` could ever reach them.

Swept across depth **within one tree**, the cost is a **parabola** on BOTH axes: it
climbs to a peak at ~⅔ of the tree depth (amortized: 11.6 ms @135 in a 210-tree) and
then *drops* toward the deepest leaf (which has no deeper routes left to re-check).
That is why depth 90 is cheap when it is the tree's bottom (amortized 0.09 ms), but
expensive (amortized 9.95 ms) when 120 more levels sit beneath it.

> **Per-call vs amortized (audit 2026-07-18; both measured above since 2026-07-19):**
> matrix A times the *public* `matchRoutes(routes, url)`, which re-runs the
> flatten+rank construct on **every call**; matrix B prebuilds branches the way a
> Data-mode router (`createBrowserRouter`) does and times only the per-nav scan. The
> finding survives — and sharpens — under B: what remains is the per-nav **rescan of
> branches below the match**. Frame any upstream report in the amortized terms — the
> per-call ms-figures overstate the steady-state cost while UNDERstating the ratio.

## Run

```sh
node run.mjs      # from the monorepo — uses the workspace react-router@8
# standalone:   npm i react-router@8 && node run.mjs
```

Prints both smoking-gun matrices (per-call + Data-mode amortized), both parabolas,
and writes `results.json`.

- `scenario.mjs` — the isolated repro: `buildRoutes(treeDepth)`, `deepPath(D)`,
  `matchCostMs(routes, url)` (public per-call) and `matchCostAmortizedMs(routes, url)`
  (Data-mode: branches prebuilt, scan-only). No app, no harness — only `react-router`.
- `run.mjs` — drives the sweeps on both variants and prints the tables.

## Related

- Upstream issue: <https://github.com/remix-run/react-router/issues/15249>
- **Browser-measured chart** (match **+** render, swept to depth 210, n=100):
  <https://claude.ai/code/artifact/58736d29-e694-4c20-9f0c-3469bbcb6c44>

## TODO (develop later)

- Pin the regression range across `react-router` versions.
- ~~Localize *which* matcher pass re-scans the deeper subtree~~ — resolved (audit
  2026-07-18): the flatten step is depth-constant per call; the parabola comes from
  **scanning branches below the matched route**.
- ~~Add an amortized variant to `scenario.mjs` and publish both matrices~~ — done
  (2026-07-19): `matchCostAmortizedMs`, both matrices above are one session; the
  amortized framing is the one to upstream.
- Test branching trees (not just a single deep chain) and realistic route configs.
- Distill into an upstream-ready minimal repro / PR for #15249.
