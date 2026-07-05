# replace audit probes — 2026-07-04

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx audit-probes/replace-2026-07-04/probe-0N-*.ts`
(plain run = dist; forced = src; probe-01 outputs **identical** — dist in sync). AC power → latency probe executed.

## probe-01-replace-contract-matrix.ts

| Q | Verdict |
|---|---|
| Q1 (filed **#1193**) failed replace with compile-throwing factory | **re-verified**: throw propagates, tree intact (`has('sec')`=true), but the OLD definition guard is erased (`canNavigateTo('sec')` flips false→true) — clearDefinitionGuards runs before the #956 compile |
| Q2 (filed **#1192**) both-slot (external-first, definition-second) | **re-verified**: after replace the compiled slot still runs the ERASED definition guard (`canNavigateTo('dual')`=false while only the allowing external factory remains) |
| Q8 order control (definition-first, external-second) | healthy (true/true) — existing test replaceRoutes.test.ts:459 covers only this order |
| Q3/Q3b (filed **#1170**, replace side) | **NOT reproduced**: ancestor guard runs 0× on sibling hops after replace, with and without `:id` param — evidence commented on the issue |
| Q4 revalidation guard-bypass | **NEW → #1201**: URL-ownership reshuffle commits a `canActivate:false` route (`state.name='locked'`) without running the guard |
| Q4b forwardTo teleport | **NEW → #1201**: revalidation applies the new set's forwardTo — state silently moves `cur@/c` → `tgt@/t` |
| Q4c normal navigate after bypass | guarded correctly (`CANNOT_ACTIVATE`) — hole is revalidation-only |
| Q5 replace mid-STARTING | proceeds (isTransitioning() excludes STARTING); start resolves into the lazily-swapped tree — benign, undocumented |
| Q6 О-5 ordering | confirmed: subscribeChanges handler sees new tree + still-old state |
| Q7 идемпотентный replace ×3 | by-design #950: 3× TRANSITION_SUCCESS + 3× TREE_CHANGED (adapters re-render each time) |

## probe-02-diff-cost-latency.ts (AC power)

| Variant | avg | p50 | RME |
|---|---|---|---|
| A replace(100) 0 listeners | 100 571 ns | 96 917 ns | 0.00% |
| B replace(100) 1 listener | 123 303 ns | 117 167 ns | 0.00% |

Δ = +22.7 µs (**+22.6%**) — the listener-gated diff («Решение 3.B»: before-snapshot + flat diff + freeze) is real money; the gate saves it for the no-listener path. Verdict: confirmed.
