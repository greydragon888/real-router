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
| `deck-render.js` | **Tracked source** — the shared render (chart / board / cards / stamp), inlined at each shell's `//__RENDER__` marker. **Edit render logic here**, not per-shell. |
| `deck-shell.html` | **Tracked source** — interactive web deck shell (hero + PDF button, board, cohorts, isolate/tooltip wiring). |
| `print-shell.html` | **Tracked source** — print/PDF edition shell (A4-landscape, paginated cover → summary → cohort-per-page, static). |
| `deck-extract.mjs` | Reads `../results/` (browser bench) + `../matcher-bench/results.json` (isolated matcher) → writes `out/deck-data.json`. |
| `build-deck.mjs` | Splices the config block + inlines `deck-render.js` into BOTH shells → writes `out/deck.html` + `out/print.html`. |
| `render-pdf.mjs` | Playwright renders `out/print.html` → `out/cross-router-report.pdf` (vector). |
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

Copy (blurbs, layout) lives in `deck-config.js` + the shells + `deck-render.js`; numbers come
from `out/deck-data.json`. `deck-extract.mjs` re-derives them from the current (gitignored)
`results/`, so a rebuild after a new run regenerates everything in `out/` — there is no
committed snapshot to keep in sync.

The `WHY` blurbs read the winner/loser mechanism per scenario × cohort; each ratio in them
is anchored to `deck-data.json` (or `../matcher-bench/results.json` for the wide/deep
matcher cards). When re-running the bench, re-verify the cited ratios against the fresh data.
