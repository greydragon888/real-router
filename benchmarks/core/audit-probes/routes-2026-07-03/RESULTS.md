# routes deep-audit probes — 2026-07-03

Прогон: macOS, Apple M3 Pro, **Battery Power** → latency `[SKIPPED: battery]`
(structural выполнены). src (`--conditions=@real-router/internal-source`) ↔ dist
— вывод идентичен. HEAD afe49684.

## probe-01-known-risks-sweep.ts

```
Q1 dangling forward → matchPath("/a")=State(name=a) has(matched.name)=true navigate("a")=RESOLVED(a)
   observation: forward map self-healed
Q2 non-string dynamic → direct(first fn)=rejected: forwardTo callback must return a string, got number
                        chained(second fn)=rejected: Route "42" does not exist
   observation: ASYMMETRY confirmed — first callback type-checked, chained one surfaces a misleading error
Q3 preserve edges → "/"→/  ""→/  "/about"→/about  "/about/"→/about/   OK
Q4 payload aliasing → payload===input:true buildPath before=/list?page=1 afterPayloadMutation=/list?page=999
   observation: CONFIRMED — payload nested config aliases the live store
```

Вердикты: риск №2 промпта (dangling forward после remove цели) — **закрыт
поведением** (`getRoutesApi.ts:80-82` чистит static-entries на удалённый таргет);
Q2 — DX-асимметрия тип-чека `#resolveDynamicForward` (:560 vs :584) — RT-5;
Q3 — preserve-края корректны; Q4 — документированный aliasing-контракт
TREE_CHANGED-payload эмпирически истинен (тесту нужен identity-pin — RT-4).
NB: `matchPath` — НЕ фасадный метод Router; публичный путь —
`getPluginApi(router).matchPath` (первый прогон пробы упал на этом).

## probe-02-replace-guard-compile-atomicity.ts

```
QA failed replace   → before=rejected:CANNOT_ACTIVATE replace=threw: factory exploded on compile treeIntact=true after=RESOLVED
   verdict: VIOLATION (failed replace silently ERASED the old definition guards — clearDefinitionGuards ran before the compile abort)
QB failed add       → add=threw ... adminGuard=rejected:CANNOT_ACTIVATE  OK (contrast: add path atomic)
QC external guard   → after failed replace: rejected:CANNOT_ACTIVATE  OK (external survives)
```

Вердикт: **Bug R-1 подтверждён** (см. `routes-deep-2026-07-03.md`):
`replaceRoutes` выполняет `clearDefinitionGuards()` (getRoutesApi.ts:464) ДО
`adoptRouteArtifacts`, а #956-компиляция guard-факторий бросает внутри adopt —
упавший replace оставляет дерево целым, но старые definition-guards стёрты.
Нарушает jsdoc `routesStore.ts:659-668` («atomic for malformed guards too»).
Фикс — хойст компиляции до clear (зеркало #1046); после фикса ожидание QA
перевернётся (after=rejected:CANNOT_ACTIVATE) — обнови этот файл.
