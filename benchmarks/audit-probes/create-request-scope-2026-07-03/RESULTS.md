# create-request-scope probes — 2026-07-03

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx audit-probes/create-request-scope-2026-07-03/<probe>.ts` (src); without `--conditions` — dist (identical verdicts).

Baseline set `create-request-scope-2026-06-25/` re-run the same day — fully healthy, NOT stale (probe-01 Q5 was refreshed together with the #969 fix; prints `listeners=0`): Q1-Q7 all CONFIRMED; probe-02-memory: per-scope 137.96 KB (was 157.20 — lightened together with the clone, consistent with clone-router probe-07's 139.3 KB), leak after dispose 249 B (<1024 → CLEAN), retained control discriminating.

Full report: `packages/core/.claude/audit/create-request-scope-deep-2026-07-03.md`.

| Probe | Question | Verdict |
|---|---|---|
| 01 | do the three cloneRouter bugs filed 2026-07-03 surface through `scope.router`? | **all three INHERITED** (as expected — the wrapper adds only request-lifecycle binding): #1175 rootPath loss (`/app/users/1` vs `/users/1`), #1174 guard-order inversion (base allows / scope blocks), #1176 factory under-initialized window (`?page=1` missing on the clone-run snapshot). Filed — NOT re-opened; this probe pins the inheritance so the cloneRouter fixes can be re-verified at scope level |
