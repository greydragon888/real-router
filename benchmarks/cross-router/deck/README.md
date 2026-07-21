# Cross-router infographic deck

Rendered performance infographic comparing `@real-router/*` against the per-framework
competitor routers, built from the benchmark `results/`. Two editions from ONE source: the
interactive web deck (`deck.html`) and a paginated print/PDF edition (`print.html` →
`cross-router-report.pdf`). This directory tracks only the **source**; every generated output
lands in the gitignored **`out/`** subfolder (locally an untracked report; CI uploads it to
the Pages/artifact snapshot, never committing anything).

## Files

| File | Role |
| --- | --- |
| `deck-config.js` | **Tracked source you edit** — `GROUPS` / `SCEN` / `WHY` / `CO` / `FIELD` / `COHORTS` + `__DATA__` / `__GRID__` / `__SWEEP__` / `__META__` / `__VERSIONS__` placeholders: chart layout, scenario descriptions, per-cohort WHY blurbs, router version seeds. |
| `deck-render.js` | **Tracked source** — the shared render (chart / board / cards / stamp) + the ratio resolver (`resolveR` / `ratioMag` / `heroMaxX` — turn `⟨…⟩` blurb tokens into live multipliers from `DATA`), inlined at each shell's `//__RENDER__` marker. **Edit render logic here**, not per-shell. |
| `deck-shell.html` | **Tracked source** — interactive web deck shell (hero + PDF button, board, cohorts, isolate/tooltip wiring). |
| `print-shell.html` | **Tracked source** — print/PDF edition shell (A4-landscape, paginated cover → summary → cohort-per-page, static). |
| `deck-extract.mjs` | Reads `../results/` (browser bench) + `../matcher-bench/results.json` (isolated matcher) → writes `out/deck-data.json`. |
| `build-deck.mjs` | Splices the config block + inlines `deck-render.js` into BOTH shells → writes `out/deck.html` + `out/print.html`. |
| `render-pdf.mjs` | Playwright renders `out/print.html` → `out/cross-router-report.pdf` (vector). |
| `sync-run-data.mjs` | Pull a published CI run's `bench-results` artifact (via `gh`) into the local pipeline — refreshes `out/deck-data.json` + `../matcher-bench/results.json` + `results/`, then rebuilds. No local bench needed. |
| `out/` | **Gitignored, generated** — `deck-data.json` (numbers) + `deck.html` (interactive) + `print.html` (print edition) + `cross-router-report.pdf`. Don't hand-edit; edit the source and rebuild. `results/` is gitignored too, so there's no committed snapshot — regenerate from a run. |

## Rebuild

```bash
node --expose-gc ../matcher-bench/run.mjs   # FIRST if packages/ changed since its last run —
                                            # the wide/deep cards read it, and deck-extract
                                            # warns on an epoch mismatch (audit 07-18 K12/G1o;
                                            # bench-cross-router.sh runs it automatically)
node deck-extract.mjs   # after a fresh bench run: ../results + ../matcher-bench → out/deck-data.json
node build-deck.mjs     # config + deck-render.js → out/deck.html + out/print.html
node render-pdf.mjs     # out/print.html → out/cross-router-report.pdf  (needs Playwright)
```

### From a CI run — no local bench (recommended)

`results/` and `matcher-bench/results.json` are gitignored, so a fresh checkout has no data to
build a deck from — and the local matrix is a ~6 h job. Instead, pull a published CI snapshot
straight into the pipeline (needs `gh auth login`):

```bash
node sync-run-data.mjs <run-id-or-url> [--pdf]
# e.g. node sync-run-data.mjs https://github.com/greydragon888/real-router/actions/runs/29695303795
```

It downloads that run's `bench-results` artifact, refreshes the three data inputs
(`out/deck-data.json`, `../matcher-bench/results.json`, `results/` — the current
`deck-data.json` is first backed up to `out/deck-data.prev.json`), and rebuilds `deck.html` +
`print.html` from the **tracked source**. So the local deck gets the run's fresh numbers **plus**
whatever template/blurb edits are on disk — the artifact's own `deck.html` is discarded (it was
built from the run's source, not yours). Blurb multipliers re-derive from the data; only re-check
qualitative shape claims if a `SWEEP`/`GRID` verdict flipped. Find run ids on the
[Actions tab](https://github.com/greydragon888/real-router/actions/workflows/cross-router-bench.yml)
(`gh run list -R greydragon888/real-router -w "Cross Routers Benchmarks"`).

Copy (blurbs, layout) lives in `deck-config.js` + the shells + `deck-render.js`; numbers come
from `out/deck-data.json`. `deck-extract.mjs` re-derives them from the current (gitignored)
`results/`, so a rebuild after a new run regenerates everything in `out/` — there is no
committed snapshot to keep in sync.

The `WHY` blurbs read the winner/loser mechanism per scenario × cohort. Their ×N multipliers
are **not hardcoded** — each is a `⟨[sc:]rival[@N|@max|@min]⟩` token that `resolveR`
(in `deck-render.js`) computes at render time as the on-chart magnitude (`max(rr,rival) /
min(…)`) straight from `DATA`, so the number can never drift from the picture the reader
sees. Write only the direction word ("heavier" / "leaner" / "lighter") in prose; the number
re-pins itself on every rebuild. The hero "up to N× faster" stat is derived the same way
(`heroMaxX`, the biggest active-links lead vs the fastest rival). When re-running the bench,
only re-check the **qualitative shape** claims ("flat" / "climbs" / "leads" / "draws level")
against the fresh `SWEEP`/`GRID` verdicts — the magnitudes take care of themselves.
