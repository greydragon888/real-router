# navigate deep-audit probes — 2026-07-03

Прогон: macOS, Apple M3 Pro, **Battery Power** → latency-пробы `[SKIPPED: battery]`
(Probe-протокол rule 3); structural/liveness пробы выполнены (детерминированы).
Резолюция: src (`NODE_OPTIONS='--conditions=@real-router/internal-source'`) **и**
плавный dist-прогон — вывод побайтно идентичен ⇒ dist в синхроне с src, находки
валидны независимо от резолва.

## probe-01-never-settle-liveness-recheck.ts

Re-check Bug N-1 (#1018) + N-C. HEAD 69c87e38.

```
Q1 SUPERSEDE  → rejected:CANCELLED  OK (no hang)
Q2 STOP       → rejected:CANCELLED  OK (no hang)
Q3 DISPOSE    → rejected:CANCELLED  OK (no hang)
Q4 EXTERNAL   → rejected:CANCELLED error.reason=undefined signal.reason=external-reason fsmRecovered=true  OK
```

Вердикты: **Bug N-1 закрыт** (#1018 работает по всем 4 источникам отмены, без
зависания); prompt-строка «На HEAD c00035e9 зависает» — стейл. **N-C актуален**
(`error.reason === undefined` на mid-flight external abort; reason живёт на
captured `signal.reason`) — открытое наблюдение 2026-06-29 не изменилось.

## probe-02-stop-dispose-from-sync-leave.ts

Дыра пост-листенерной ревалидации на **no-guards** пути (окна: TRANSITION_START
emit и LEAVE_APPROVE emit/sync-leave батч). HEAD 69c87e38.

```
QA stop/no-guards   → RESOLVED(about) | isActive=true | state=about | events=START,LEAVE_APPROVE,CANCEL,ROUTER_STOP,SUCCESS
   verdict: VIOLATION (stop() undone / navigation committed)
QB dispose/no-guards → rejected:ROUTE_NOT_FOUND | isActive=false | next navigate=rejected:DISPOSED | events=START,LEAVE_APPROVE,CANCEL,ROUTER_STOP
   verdict: MISLEADING CODE (expected CANCELLED)
QC stop/with-guard  → rejected:CANCELLED | isActive=false | events=START,LEAVE_APPROVE,CANCEL,ROUTER_STOP
   verdict: OK (guard-путь защищён — асимметрия с QA подтверждена)
QD external-abort/sync-path → RESOLVED(about) | signal.aborted=true
   observation: abort IGNORED on fully-sync path
QE stop/onStart/no-guards → RESOLVED(about) | isActive=true | events=START,CANCEL,ROUTER_STOP,LEAVE_APPROVE,SUCCESS
   verdict: VIOLATION (stop() undone via TRANSITION_START window)
QF dispose/onStart/no-guards → rejected:ROUTE_NOT_FOUND | isActive=true | next navigate=rejected:DISPOSED
   verdict: VIOLATION (FSM resurrected out of DISPOSED — isActive true on disposed router)
```

Вердикт: **Bug подтверждён** (см. `navigate-deep-2026-07-03.md`, строка V-1).
`stop()`/`dispose()` из синхронного transition-листенера (subscribeLeave или
onTransitionStart) на пути **без guards** не ревалидируются: `sendComplete`/
`sendLeaveApprove` делают `forceState()` из IDLE/DISPOSED (нелегальные рёбра),
навигация коммитится после CANCEL (QA/QE), dispose даёт `isActive()===true` на
disposed-роутере (QF). Давний (pre-#1035): старые проверки были только по
`#navigationId`, который stop/dispose не бампают; #1035 удалил их как «мёртвые».
Контракты: wiki `navigation-lifecycle.md:189` («returns to a stopped state»),
core CLAUDE.md:346 (signal «never on successful completion»), CLAUDE.md:780
(stop/dispose «cancel the in-flight navigation»), `routerFSM.ts:66-71,112`
(нет ребра IDLE→READY; DISPOSED терминален), ARCHITECTURE.ru.md:310-327.
