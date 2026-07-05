# update-route audit probes — 2026-07-04

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx audit-probes/update-route-2026-07-04/probe-0N-*.ts`
(probe-01: dist ≡ src, diff пуст). AC power → latency probe executed.

## probe-01-update-contract-matrix.ts

| Q | Verdict |
|---|---|
| Q1 phantom `update("ghost")` bare core | **NEW → #1205**: TREE_CHANGED лжёт (`update:ghost`), guard-фабрика скомпилирована; **последующий `add("ghost")` наследует** phantom defaults + blocking guard (`navigate` → `CANNOT_ACTIVATE`). Тест :1506 смотрит не в то хранилище («orphan write is unreachable» — ложь) |
| Q2 (filed **#1171**) definition canDeactivate via update | **re-verified**: runs=1 после двух leave (второй не гардится), `get().canDeactivate=LOST` после первого |
| Q3 update mid-STARTING | проходит бесшумно (даже logger.error молчит — isTransitioning не покрывает STARTING); defaults применяются к стартовому матчу → комментарий в **#1204** |
| Q4 flat dotted name (#1194 neighborhood) | **негатив**: update пишет по имени, walk не нужен — #1194 на update не распространяется |
| Q5 update mid-navigation | warning-not-block контракт работает: logger.error с документированным текстом + правка применена (v8-ignore на ветке ссылается на фантомный `Router.updateRoute` → комментарий в **#1173**) |

## probe-02-update-o1-latency.ts (AC)

| Tree size | avg | p50 | RME |
|---|---|---|---|
| 10 routes | 111.5 ns | 109.3 ns | 0.00% |
| 1000 routes | 126.9 ns | 125.8 ns | 0.00% |

×100 маршрутов → +14% (не ×100): **NO_TREE_REBUILD / O(1) confirmed**.
