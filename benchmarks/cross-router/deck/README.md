# Cross-router infographic deck

Rendered performance infographic comparing `@real-router/*` against the per-framework
competitor routers, built from the benchmark `results/`. Published as a claude.ai
artifact; this directory tracks only the **source** — the rendered `deck.html` and its
`deck-data.json` are gitignored, generated on demand (locally an untracked report; CI
uploads them to the Pages/artifact snapshot, never committing anything).

## Files

| File | Role |
| --- | --- |
| `deck-config.js` | **Tracked source you edit** — `GROUPS` / `SCEN` / `WHY` / `CO` / `FIELD` + `__DATA__` / `__GRID__` / `__SWEEP__` / `__META__` placeholders: chart layout, scenario descriptions, per-cohort WHY blurbs. |
| `deck-shell.html` | **Tracked source** — HTML shell + render JS that `build-deck` splices the config block into (its config span is a `const GROUPS=[]; const DATA=[];` stub the splice overwrites). Read-only template; `build-deck` never mutates it. |
| `deck-extract.mjs` | Reads `../results/` (browser bench) + `../matcher-bench/results.json` (isolated matcher) → writes `deck-data.json`. |
| `build-deck.mjs` | Splices `deck-config.js` + `deck-data.json` into `deck-shell.html` → writes `deck.html` (fills the placeholders and replaces the `const GROUPS … const DATA` block). |
| `deck-data.json` | **Gitignored, generated** — extracted numbers (`META` / `DATA` / `GRID` / `SWEEP`). `results/` is gitignored too, so there is no committed snapshot; regenerate from a run. |
| `deck.html` | **Gitignored, generated** — rendered infographic (self-contained, ~58 KB). Don't hand-edit; edit `deck-config.js` / `deck-shell.html` and rebuild. |

## Rebuild

```bash
node --expose-gc ../matcher-bench/run.mjs   # FIRST if packages/ changed since its last run —
                                            # the wide/deep cards read it, and deck-extract
                                            # warns on an epoch mismatch (audit 07-18 K12/G1o;
                                            # bench-cross-router.sh runs it automatically)
node deck-extract.mjs   # after a fresh bench run: ../results + ../matcher-bench → deck-data.json
node build-deck.mjs     # deck-config.js + deck-data.json → deck.html
```

Copy (blurbs, layout) lives in `deck-config.js` + `deck-shell.html`; numbers come from
`deck-data.json`. `deck-extract.mjs` re-derives the numbers from the current (gitignored)
`results/`, so a rebuild after a new run regenerates the (gitignored) `deck-data.json` +
`deck.html` — there is no committed snapshot to keep in sync.

The `WHY` blurbs read the winner/loser mechanism per scenario × cohort; each ratio in them
is anchored to `deck-data.json` (or `../matcher-bench/results.json` for the wide/deep
matcher cards). When re-running the bench, re-verify the cited ratios against the fresh data.
