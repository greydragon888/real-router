# Cross-router infographic deck

Rendered performance infographic comparing `@real-router/*` against the per-framework
competitor routers, built from the benchmark `results/`. Published as a claude.ai
artifact; this directory holds the committed **source + rendered output**.

## Files

| File | Role |
| --- | --- |
| `deck-config.js` | Template — `GROUPS` / `SCEN` / `WHY` / `CO` / `FIELD` + `__DATA__` / `__GRID__` / `__SWEEP__` placeholders. **The source you edit**: chart layout, scenario descriptions, per-cohort WHY blurbs. |
| `deck-extract.mjs` | Reads `../results/` (browser bench) + `../matcher-bench/results.json` (isolated matcher) → writes `deck-data.json`. |
| `deck-data.json` | Extracted numbers (`DATA` / `GRID` / `SWEEP`). Committed **snapshot** — `results/` is gitignored, so this is the only record of the figures the rendered deck was built from. |
| `build-deck.mjs` | Splices `deck-config.js` + `deck-data.json` into `deck.html` (fills the placeholders and replaces the `const GROUPS … const DATA` block). |
| `deck.html` | Rendered infographic (self-contained, ~54 KB). **Generated** — don't hand-edit the data block; edit `deck-config.js` and rebuild. |

## Rebuild

```bash
node deck-extract.mjs   # after a fresh bench run: ../results + ../matcher-bench → deck-data.json
node build-deck.mjs     # deck-config.js + deck-data.json → deck.html
```

Copy (blurbs, layout) lives in `deck-config.js`; numbers come from `deck-data.json`.
`deck-extract.mjs` re-derives the numbers from the current (gitignored) `results/`, so a
rebuild after a new run shifts the committed snapshot — expected, `results/` isn't tracked.

The `WHY` blurbs read the winner/loser mechanism per scenario × cohort; each ratio in them
is anchored to `deck-data.json` (or `../matcher-bench/results.json` for the wide/deep
matcher cards). When re-running the bench, re-verify the cited ratios against the fresh data.
