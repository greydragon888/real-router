# clone-router probes — 2026-07-03

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx core/audit-probes/clone-router-2026-07-03/<probe>.ts` (src); same command without `--conditions` runs against dist. probe-07 additionally needs `--expose-gc`.

All 7 probes ran against BOTH src and freshly-bundled dist — identical verdicts. Full report: `packages/core/.claude/audit/clone-router-deep-2026-07-03.md`.

| Probe | Question | Verdict |
|---|---|---|
| 01 | same-slot definition+external guard: does the clone reproduce the base's effective ("last add wins") guard? | **DIVERGENCE — Bug (HIGH).** base: def wins (navigate resolves); clone: ext wins (navigate rejects CANNOT_ACTIVATE). Order def→ext in cloneRouter.ts:130-146 inverts base's ext→def history |
| 02 | is `rootPath` carried over? | **DIVERGENCE — Bug (HIGH).** clone rootPath="" → base URL `/app/users/1` resolves to UNKNOWN_ROUTE on the clone |
| 03 | what does a plugin factory see when re-run on the clone? | **DIVERGENCE — Bug (MEDIUM).** factory-time: buildPath without defaultParams, get() without config fields, forwardState doesn't forward; config lands only after usePlugin (cloneRouter.ts:149-159 order) |
| 04 | `cloneRouter(base, {key: undefined})` | key deleted on the clone; consistent with `createRouter(..., {key: undefined})` — by-design, undocumented (Test-gap LOW) |
| 05 | plugin factory throws on re-instantiation | fail-fast: throw propagates, batch rollback runs good plugins' teardown, base intact (correct behaviour; vitest Test-gap) |
| 06 | cloneRouter inside subscribe-listener / subscribeChanges-handler | works (not covered by reentrancy bans #1030/#1032); clone mid-TREE_CHANGED sees post-commit tree |
| 07 | per-clone heap vs fresh createRouter (#966 regression) | OK: 139.3 KB vs 138.5 KB (50 routes, N=1000), ratio 1.01 |
