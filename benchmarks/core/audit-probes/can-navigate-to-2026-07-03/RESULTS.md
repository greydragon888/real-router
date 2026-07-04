# can-navigate-to deep-audit probes — 2026-07-03

Прогон: macOS, Apple M3 Pro, **Battery Power** → latency-пробы `[SKIPPED: battery]`
(legacy `probe-05-latency.ts` НЕ перегонялся; его baseline 245ns — **pre-#970**:
фикс добавил в фасад `getMetaForState` + `normalizeParams` + `buildPath` на вызов —
re-baseline на AC-питании отложен). Structural пробы выполнены; src
(`--conditions=@real-router/internal-source`) и dist — вывод идентичен
(probe-01: 7/7 OK на обоих; sweep: 0 drift на обоих). HEAD 25ad7932.

## probe-01-fix-wave-reverify.ts (новый)

Верификация фикс-волны d160e0b1 (#970/#958/#959, легла через 2 дня после
baseline-аудита 2026-06-25) + пост-#1035/#1192 поверхности:

```
Q1 PARITY intra-subtree → can=true navigate=true  OK (#970 fixed — ancestor guard not consulted, parity holds)
Q2 normalizeParams      → can keys=[] nav keys=[]  OK (drift #3 fixed)
Q3 async guard (#958)   → typeof=boolean value=false bareCoreWarns=0  OK (sync false, DX-warn is validator-opt-in)
Q4 throwing guard (#959)→ value=false loggerWarned=true  OK (false + operational warn, always-on)
Q5 deactivate order     → [users.view,users]  OK (innermost-first, #1b fixed)
Q6 inside listener      → verdict=true threw=undefined  OK (read-only predicate not banned in dispatch window)
Q7 zombie parity (#1192)→ can=true navigate=true  OK (parity preserved — both read the same compiled Map)
```

Вердикты: baseline-находки #1 (#970 HIGH), #1b, #3 — **подтверждённо закрыты**;
#958/#959 работают как задокументировано. Q6: post-#1035 предикат легален внутри
transition-листенера (не navigate-семейство, `#assertNotReentrant` не зовётся).
Q7: PARITY-инвариант держится даже в zombie-состоянии #1192 — оба читают один
compiled-Map (сам вердикт неверен — это баг #1192, не parity-drift). После фикса
#1192 Q7-ожидание не меняется (can=false navigate=false — по-прежнему равенство).

## Перегон legacy-набора 2026-06-25 (текущий src)

```
probe-02-parity-sweep:   66 comparisons, 0 drift ⇒ PARITY CONFIRMED   (было: 4 drift)
probe-03-segment-set-diff: все наборы SAME, deactivate innermost-first (было: over-evaluation + root→leaf)
```

probe-02/03 — регрессионный набор PARITY; probe-04 (meta-isolation) не
перегонялся (его вопрос закрыт probe-02/03 нулевым drift'ом); probe-05 — battery.
