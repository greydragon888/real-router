# route-lifecycle deep-audit probes — 2026-07-03

Прогон: macOS, Apple M3 Pro, **Battery Power** → latency/alloc-пробы `[SKIPPED: battery]`
(getFunctions ×1M 0-alloc — и театр: `return this.#functionsTuple`, прямой возврат
readonly-поля, структурная гарантия). Structural пробы выполнены. Резолюция: src
(`--conditions=@real-router/internal-source`) и плавный dist — вывод идентичен ⇒
dist в синхроне, находки валидны для обоих. HEAD 42cd7647.

## probe-01-origin-matrix.ts

Cross-cutting матрица definition × external через публичный API.

```
Q1 def-config guard      → navigate=rejected:CANNOT_ACTIVATE canNavigateTo=false  OK
Q2 ext-last over def     → navigate=rejected:CANNOT_ACTIVATE  OK (last add wins)
Q3 def-last over ext     → navigate=RESOLVED(admin)  OK (last add wins)
Q4 update(null)+ext      → navigate=rejected:CANNOT_ACTIVATE  OK (external took over)
Q5 remove clears both    → navigate=RESOLVED(admin)  OK (documented both-slot clear)
Q6 ZOMBIE after replace  → navigate=RESOLVED(admin) canNavigateTo=true get().canActivate=external-factory
   verdict: VIOLATION (stale definition guard compiled — replace() left a zombie; API view diverges from behavior)
Q6b contrast ext-last    → navigate=rejected:CANNOT_ACTIVATE  OK (external stays effective)
```

Вердикты: Q1-Q5, Q6b — документированная семантика подтверждена (last-add-wins
при регистрации; #952 definitionOnly; external-wins на recompile; both-slot
remove — осознанный контракт, запинен property REMOVE_CLEARS_REGARDLESS_OF_ORIGIN).
**Q6 — Bug L-1 подтверждён**: `clearDefinitionGuards` (`RouteLifecycleNamespace.ts:313-328`)
для both-slot имён не трогает compiled («external already won at registration
time» — ложная посылка при last-add-wins): после `replace()` навигация исполняет
**стёртый** definition-guard, тогда как `getRoutesApi().get(name).canActivate` и
факторное хранилище показывают external. Полярность произвольна (allow-зомби при
block-external — пробит выше). Контраст Q6b: при ext-last порядке допущение
выполняется. Тот же seam, что filed #1174 (clone-order инверсия) — другой
call-path (same-router replace) и другой симптом.

## probe-02-one-shot-deactivate-reverify.ts

Ре-верификация filed #1171 + пин документированного external-контракта.

```
Q1 def one-shot   → leave#1 calls=1, leave#2 calls=1  CONFIRMED #1171 (definition guard erased after first leave)
Q2 get().canDeactivate after leave → undefined  CONFIRMED #1171 (config field evaporated)
Q3 ext auto-clean → leave#1=1 leave#2(no rearm)=1 leave#3(rearmed)=2  OK (documented one-shot external contract)
```

Вердикты: #1171 воспроизведён (definition canDeactivate — one-shot; config-поле
исчезает из read-API). Q3 фиксирует РЯДОМ документированный external-контракт
(router5 heritage, auto-cleanup + re-arm) — при фиксе #1171 (externalOnly cleanup)
Q3 должен остаться зелёным, Q1/Q2 перевернутся.
