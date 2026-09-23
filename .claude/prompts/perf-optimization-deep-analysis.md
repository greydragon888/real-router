# Сверх-глубокий мультиагентный анализ `real-router` на perf-оптимизации

> **Назначение.** Самодостаточный промпт для модели / агент-оркестратора, выполняющей **исчерпывающий поиск ОСТАВШИХСЯ
> векторов perf-оптимизации** в монорепо `real-router` (view-agnostic роутер:
> `path-matcher → route-tree → core` + адаптеры react/vue/solid/svelte/angular +
> reactive-слой `sources` + плагины). Цель — не список желаний, а **честная,
> эмпирически обоснованная карта**: что реально устранимо vs что — inherent
> capability-цена / уже отгружено / debunked.
>
> Промпт самодостаточен: вся стартовая фактура — в секциях 2 (карта проекта), 5
> (выводы предыдущего исследования — НЕ переоткрывать) и 6 (дисциплина
> измерения). **Факты — на 2026-07-10; перепроверяй против живого дерева** (номера
> строк/issue дрейфуют; секция 2 помечает якоря, а не истину).
>
> **Companion-доки в репо** (читай, не дублируй): `benchmarks/CLAUDE.md`
> (методология бенча), `benchmarks/cross-router/REPORT-SUMMARY.md` (кросс-когортная
> матрица rr-статуса), `benchmarks/cross-router/REPORT-<fw>.md` (нарратив по
> когорте), `packages/*/CLAUDE.md` (архитектура пакетов), `ARCHITECTURE.md`,
> `IMPLEMENTATION_NOTES.md`.
>
> **⚠ ПРЕДПОСЫЛКА.** Валидируй инструмент промптом
> `.claude/prompts/benchmark-harness-audit.md` **ПЕРЕД тем, как доверять числам** —
> сама карта метрик (§2.3) бывает мискалибрована (#1417 retained→gross alloc,
> #1418 CPU→wall-clock link-build — оба переворачивали конкурентный вывод).

---

## 0. Роль и режим

Ты — **principal performance-инженер**, ведущий независимый аудит зрелого
OSS-роутера перед стабилизацией 1.0. Твоя ценность — **не найти «оптимизации», а
отделить настоящую устранимую неэффективность от неизбежной цены возможностей**.
Роутер уже прошёл несколько волн оптимизации; пространство «лёгких побед»
выметено. Работай как **скептик-опровергатель**: по умолчанию считай любой
кандидат-рычаг мнимым, пока не докажешь обратное первоисточником (код + замер).

Ключевая рамка: `real-router` платит per-nav / boot / память **ценой, которая
ПОКУПАЕТ полный pipeline** — guards+lifecycle, validated search-schema, data
loaders, иммутабельный frozen-state, scroll/a11y. «Рычаг» реален, только если
устраняет **напрасную работу, сохраняя эту capability И корректность**. Чаще
всего кажущийся рычаг — это либо inherent-цена возможности, либо конкурент просто
**делает меньше**.

---

## 1. Миссия и главный вопрос

**Есть ли ещё РЕАЛЬНЫЕ векторы perf-оптимизации?** Для каждого проверенного
кандидата вынеси вердикт (см. §4) и подкрепи его `file:line` + числом из
`results/` ИЛИ фактом кода — **не интуицией**. Итог — ранжированная карта (§8):
addressable-векторы вперёд, затем NEEDS-AB, затем — для полноты —
подтверждённые inherent/shipped/debunked с доказательством.

Планка глубины — **«сверх-глубоко»**: мультиагентный fan-out по осям →
adversarial-верификация КАЖДОГО кандидата → completeness-критик → синтез (§3).

---

## 2. Карта проекта (факты-якоря — перепроверь)

### 2.1 Слои и hot-path файлы

| Слой | Пакет | Hot-path файлы (якоря) |
|---|---|---|
| URL-матчер (segment trie) | `packages/path-matcher/src` | `SegmentMatcher.ts` (match-walk `#traverseFrom`, `#scanPath`, static-cache), `registration/{index,trie,trieNodes}.ts` (построение трие), `pathUtils.ts` (`createSegmentNode`), `types.ts` (`SegmentNode`), `parseSegment.ts` (токенайзер) |
| Матчер-фабрика | `packages/route-tree/src` | `createMatcher.ts` |
| Ядро (FSM + immutable state) | `packages/core/src` | `helpers.ts` (`normalizeParams`, `freezeStateInPlace`, `buildNavigateState`), `namespaces/NavigationNamespace/*` (transition, commit-gate), `namespaces/EventBusNamespace/*` (`#setupFSMActions`), `namespaces/StateNamespace/*` (`makeState`), `completeTransition.ts`, `fsm/routerFSM.ts` |
| FSM-движок | `packages/fsm/src` | `fsm.ts` (`send`/dispatch, `#actions`-таблица) |
| Reactive-слой (UI-байндинги) | `packages/sources/src` | `BaseSource`, `createRouteSource`, `createActiveRouteSource`, `createActiveNameSelector`, `canonicalJson` |
| Адаптеры | `packages/{react,vue,solid,svelte,angular}/src` | react `hooks/useIsActiveRoute.tsx` + `components/Link.tsx`; vue `Link.ts`; angular `RealLink.ts`; solid/svelte Link |

**Бандл-факт (для cold-start-оси):** `packages/core/dist/esm` ≈ **100 KB
minified** и **инлайнит весь граф** (`path-matcher`+`route-tree`+`sources`+`event-emitter`
внутри; внешние рантайм-импорты — только `@real-router/fsm` + `@real-router/logger`).
Доминируют 2 чанка: монолит `Router-*.mjs` ~52 KB (все namespaces сшиты) + shared
matcher/tree ~33 KB. Минимальное приложение, вызвав `createRouter`, парсит ~85 KB
монолита — parse-cost ∝ размер, это ось cold-start.

### 2.2 Бенчмарки — ground truth + как читать

- **Каталог:** `benchmarks/cross-router/` (real browser: Playwright + programmatic
  Chromium + `CDPSession`). **5 когорт** (react/vue/solid/svelte/angular), каждая
  сравнивается ТОЛЬКО внутри себя (кросс-фреймворк-ранга нет — это сравнение
  фреймворков, не роутеров).
- **Сырьё (ground truth):** `results/<cohort>/<scenario>/<engine>.json` →
  `.metrics[key].{median, p95, mean, rme, n}`. `results/` **gitignored** (может
  отсутствовать — тогда прогони, см. ниже).
- **Сводки:** `REPORT-SUMMARY.md` (кросс-когортная матрица rr-статуса 🟢/🟡/🔴,
  генератор `harness/status-matrix.mjs`), `REPORT-<fw>.md` (проза по когорте —
  **отстаёт от таблиц**, сверяй с `results/`).
- **12 сценариев:** cold-start · nav-latency · param-nav · nested-switch ·
  active-links · link-build · wide-config · deep-config · search-param-scaling ·
  table-heap · nav-churn · back-forward.
- **Запуск (если `results/` пуст/устарел):** `node cross-router/run.mjs <scenario>
  <engine> [framework=react] [runs=30]`; полная матрица —
  `node cross-router/run-all.mjs 15 [cohort]`. Движки: react `real-router|react-router|tanstack`;
  vue `real-router|vue-router|tanstack`; solid `real-router|solid-router|tanstack`;
  svelte `real-router|sv-router|mateo-router`; angular `real-router|angular-router`.

### 2.3 Карта метрик — правильная headline на КАЖДЫЙ сценарий (НЕ бери первую)

> ⚠️ **Аудит харнесса 2026-07-12** (`.claude/benchmark-harness-audit-2026-07-12.md`)
> нашёл flip-дефекты в оси per-nav CPU — **до фикса харнесса и ре-рана**:
> **F1** blink-слагаемое `totalMs` взято из paced-режима (gap=80) и инфлировано
> idle-wake ~5-15× (в sub-ms итогах blink = 46-95% — величины и near-tie ранги
> не годны; `_baseline` платит тот же blink); **F2** `ScriptDuration` слеп к
> promise-microtask работе — vue-router/@solidjs/router/tanstack-solid
> недосчитаны до 22-41×, rr (sync) посчитан полностью → script-ранги vue/solid
> занижали rr; **F3** sweep-`scriptMs@N` (wide/deep/search) = холодная ПЕРВАЯ
> навигация после reload — кросс-движковые АБСОЛЮТЫ @N нелегитимны (solid rr
> cold-excess +0.29 ms vs solid-router ~0), кривые/slope валидны; **F4**
> cold-start `jsHeapMB` — БЕЗ force-GC (retained+мусор; angular-флип). До
> ре-рана из per-nav-CPU строк доверяй только рангам react-когорты
> (направление) и внутри-движковым КРИВЫМ; alloc/retained-оси чисты.

> ⚠️ **Аудит харнесса 2026-07-18** (`.claude/benchmark-harness-audit-2026-07-18.md`) —
> F1-F6 ЗАКРЫТЫ+landed, ре-ран СОСТОЯЛСЯ (база n=50 @`b1d40f23`, 181 ячейка,
> эпоха единая) — ограничения «до ре-рана» из блока 07-12 СНЯТЫ, но ключи
> СМЕНИЛИСЬ: **таблица ниже — историческая эпоха `totalMs`, ключи из неё НЕ брать.**
> Живая карта: per-nav headline = **`navMsWall`** (felt wall) + **`navMsTask`**
> (ΔTaskDuration CPU); свипы = **`navMsTask@N`** (⚠K9: single-nav несёт
> внеокно-довесок p50 ~0.15 ms, движко-зависимый — кратности browser-sweep карт
> консервативнее felt до 1.7×), `navMsWall@N` только endpoint (клэмп-квантован);
> `scriptDurationMs`/`blinkMs` = ⚠-диагностика; link-build = **`mountMs@N`** (wall).
> **table-heap = `jsHeapMB@100`** (бар @100, НЕ @10000), и величина = **total-app
> retained heap** — route-таблица лишь 0.3–5.1% показанного; по Δ-growth оси
> (@100−@10, обе в results/) движки различаются 5–20×, дека-вывод «route memory
> isn't where they differ» = артефакт аддитивного floor'а (K1-FLIP).
> **cold-start (бар @10)** = `scriptDurationMs@10` (boot-CPU) + `fcpMs@10` (felt)
> + `jsHeapMB@10` (retained ПОСЛЕ force-GC, F4 закрыт) + `jsHeapPreGcMB` (диаг):
> на felt-оси angular-плитка r 2.93 → **WASH** (fcp 28≈28 ms; K2-FLIP) — CPU-факт
> EAGER-CORE жив, felt-вывод «angular уступает на boot» — нет.
> **nav-churn `heapDeltaKB`** = Δ за 200-нав ОКНО (НЕ per-nav; 80-87% warmup,
> #1462); `navsPerSec` живой диапазон 2.6k–15k — **rAF-cap ~121 в харнессе НЕ
> существует** (снят F1-фиксом). **alloc gc-per-nav @256** = среднее 50/50
> тоггла @256↔@1 — буквальный @256-нав до ~2× выше у lazy-движков (K8).
> **matcher-bench:** react-router таймируется с construct-фазой (flatten+rank
> per call), которую его Data-mode апп амортизирует — публичные «~2000×» =
> per-call; амортизированно ~40× endpoint / ~109× scan-only (K6+G1p); остальные
> экстракции parity-чисты, tanstack-deep фикс ПРИМЕНЁН. Первые точки SWEEP-полос
> nested/active/wide завышены неравномерно (first-point bump, K10) — @1/@4-классы
> сигналом не считать.

| сценарий | headline-метрика | почему |
|---|---|---|
| cold-start | `scriptDurationMs` (boot) + `jsHeapMB` | rr тяжелее грузится (eager core, ~100 KB parse); ⚠️F4: heap пока = used без GC — footprint-выводы только после фикса |
| nav-latency · param-nav · nested-switch · active-links | **`totalMs`** (script + Blink) | **НЕ script-only** — script завышает разрыв в разы; Blink pushState ~уравнивает (vue-router 2× Blink/nav). ⚠️F1/F2: сумма пока режим-несовместима, а script слеп к microtask (vue/solid) — читать event-count + script-only и только для sync-движков |
| wide-config | `totalMs@1000` | matcher-breadth: flat=trie, rising=O(N)-scan — **читать КРИВУЮ**; ⚠️F3: абсолюты @N cold-контаминированы |
| deep-config | `totalMs@90` | rr deep = render-композиция, не матчер; ⚠️F2: flat-кривые async-конкурентов (solid-router 0.07@90) — undercount-артефакт; ⚠️F3 для абсолютов |
| search-param-scaling | наклон (slope), НЕ абсолюты | eager-immutable плоский vs O(count)-материализация; ⚠️F3: `totalMs@N` = first-nav cold (solid «@1 crushes rr» был 100% артефактом, «@50 converge» прятал rr WIN ~5×) |
| table-heap | `jsHeapMB@10000` | память route-таблицы (retained, форсит GC) — ось чиста (RME ~0%) |
| nav-churn | **`heapDeltaKB`** + `scriptMsPerNav` | **НЕ `navsPerSec`** — frame-capped ~121 (confounded; solid rr 15k = sync-семантика); ⚠️F1: `totalMsPerNav` нарушает wall-bound (0.355 > wall 0.066) — до фикса брать script-часть; heapDeltaKB ~80% warmup-транзиент, не leak |
| link-build | `mountMs` (wall-clock, #1418) | rr WIN vs компонент-конкурентов, LAST vs plain-`<a>`; окно = DOM-commit (pre-paint, common-mode) |
| back-forward | `totalMs` (popstate) | отдельный history-path; ⚠️F1 (blink-доминирован — величины мягкие, 2×→1× событий rr после #1353 остаётся структурным фактом) |
| alloc (nav-lat/param/search/back-fwd) | `allocKBPerNav` | GC-pressure = transient bytes/nav; alloc-ранг МОЖЕТ расходиться с CPU-рангом. **Самая здоровая ось бенча** (аудит: эстиматор несмещён, gross подтверждён пробой) |

### 2.4 Как мерить (критично для любого A/B)

- **Веди весь анализ в ОТДЕЛЬНОМ git worktree** (`git worktree add <path>
  origin/master` → работай там → `git worktree remove <path>` в конце), чтобы НЕ
  было конфликтов: A/B правит `packages/*/src` + пересобирает `dist` + делает
  `git checkout`-revert для BEFORE-замера — в основном рабочем дереве (и
  параллельно с другими сессиями) это затирает `dist`, гоняется за рабочей копией
  и делит общий git-stash. Изолированный worktree снимает это и даёт чистый revert.
- **Бенч читает PRODUCTION `dist`, не `src`** (vite build+preview, minify). После
  ЛЮБОЙ правки `packages/*/src` — **`pnpm -F <pkg> bundle`** затронутых пакетов
  (для core-изменения: `path-matcher` → `@real-router/core`, т.к. core инлайнит
  path-matcher's dist). Иначе бенч мерит стейл-dist.
- Фильтры pnpm: приватные пакеты — bare имя (`-F path-matcher`), публичные —
  `@real-router/*` (`-F @real-router/core`).
- Не гоняй бенчи под чужой CPU-нагрузкой (контаминация sub-ms). Память
  (`table-heap`/`nav-churn heap`) load-толерантна (rme~0).

---

## 3. Мультиагентная методология (сверх-глубокий fan-out)

### 3.1 Фаза 1 — finder-агенты по осям (параллельно, по одному на ось)

Разверни агента на КАЖДУЮ ось; каждому дай §0-рамку + §5 (что НЕ переоткрывать) +
§6 (дисциплина) + точные файлы (§2.1) + требование `file:line` и структурного
вывода (кандидат: `lever / site / mechanism / evidence / classification / roi /
capabilityRisk / validationNeeded`). Оси:

1. **Core per-nav CPU + allocation** — transition-pipeline (`helpers.ts`
   normalizeParams/freezeStateInPlace/buildNavigateState, `NavigationNamespace`
   transition, `StateNamespace.makeState`, `completeTransition.ts`, `fsm.ts`
   send-dispatch). Что аллоцируется/CPU-тратится per-nav и **что из этого — не
   контракт иммутабельности**?
2. **Cold-start / bundle-parse** — что core грузит eagerly (~100 KB, §2.1), что
   НЕ нужно для first-paint и **отложимо/сплитабельно**, tree-shaking-дыры.
3. **Table-heap / trie-память** — что держит `SegmentNode` (`trieNodes.ts`/`types.ts`),
   где per-node **жир** (лишние/eager структуры), сжимаемый БЕЗ потери скорости матча.
4. **Adapter `<Link>` re-render** — param-nav alloc: `useIsActiveRoute.tsx`
   (useMemo store), `createActiveRouteSource.ts` (кэш), Link.tsx (+ vue/angular).
5. **Matcher CPU at scale** — `SegmentMatcher` match-walk на wide@1000/deep@90.
   ⚠ проверь: не байпасит ли static-cache весь walk (см. §5.1).
6. **Sources per-nav notification** — `sources/*`: сколько источников
   нотифицируют/нав, есть ли **избыточность** (повторный canonicalJson, over-notify
   неизменных срезов) vs inherent framework-model gap.

### 3.2 Фаза 2 — adversarial verify КАЖДОГО кандидата (REFUTE by default)

На каждый кандидат — отдельный агент-скептик, задача **опровергнуть**: прочитать
цитируемый код + `results/`, вернуть вердикт (§4) с решающей строкой кода. `REAL`
— только если это genuine устранимая неэффективность, сохраняющая capability +
корректность. **НЕ доверяй вердикту одного агента на load-bearing-claim** —
перепроверь сам (компиляция / трассировка code-path / замер).

### 3.3 Фаза 3 — completeness-критик

Один агент: «какую ось НЕ покрыли?» — SSR/hydration, bundle tree-shaking за
пределами core, event-emitter dispatch, плагин-overhead (validation/search-schema/
lifecycle/persistent-params), canonicalJson hot-path, dom-utils (scroll/announcer/
view-transitions), interceptor-chain глубина, subscribeLeave/leave-approval,
`Object.freeze`-гейтинг. Только векторы с **правдоподобной** реальной
неэффективностью, не для галочки.

### 3.4 Синтез

Собери выжившие `REAL`/`NEEDS-AB`, отранжируй по «можно ли лучше» (не по «флипает
ли проигрыш»), для каждого — план валидации (§6). Приоритизируй **симметричные**
улучшения (рычаг, применимый ко всем адаптерам/местам) — их отсутствие в части
мест = долг.

---

## 4. Классификация и планка REAL-вектора

| вердикт | значение |
|---|---|
| **REAL** | genuine устранимая напрасная работа; сохраняет capability + корректность; измеримый выигрыш |
| **INHERENT** | цена возможности / структурная (иммутабельный контракт, O(1)-матч, FSM-детерминизм) — не устранить без потери capability |
| **SHIPPED** | уже реализовано (см. §5.2) |
| **DEBUNKED** | уже опровергнуто (§5.3); воскрешай ТОЛЬКО с новым доказательством |
| **CORRECTNESS-RISK** | ломает контракт/инвариант при наивном устранении |
| **NEEDS-AB** | правдоподобно, но **не верить, пока не доказано same-session A/B** |

**Планка REAL (жёсткая):** (1) убирает работу, которую система реально делает
впустую; (2) не теряет ни одной возможности из §0-pipeline; (3) не ломает
корректность (тесты, инварианты); (4) даёт **измеримый** выигрыш на правильной
метрике (§2.3). Не проходит хотя бы один пункт → не REAL.

**Micro-ROI ловушка:** рычаг, невидимый в `totalMs` (sub-noise, ~0.02% script-бюджета),
торгующий capability/контракт ради долей µs — **НЕ стоит того**, даже если
технически «устраним». Пометь INHERENT/не-стоит, не REAL.

---

## 5. Выводы предыдущего исследования — НЕ переоткрывать (учти)

> Это результат 34-агентного hunt-а (2026-07-10) по тем же осям. Не трать бюджет
> на переоткрытие; заходи сюда, только если нашёл **новое** доказательство,
> противоречащее пункту. Твоя задача — найти то, что hunt пропустил, ИЛИ
> подтвердить, что пространство исчерпано.

### 5.1 INHERENT — цена возможности (не рычаг)

- **Core per-nav pipeline** (`makeState`/`buildTransitionMeta`/`forwardState`/`Promise.resolve`)
  — публичные контракты (иммутабельный frozen-state, per-call-уникальный
  `Promise<State>`, interception-seam). rr **уже ВЫИГРЫВАЕТ** nav-latency (react/solid)
  и **лидер по alloc**. Свежая `{id}`-копия в `normalizeParams` = контракт (#1027
  `EMPTY_PARAMS` sentinel только для ПУСТЫХ params).
- **#1169 FSM commit-gate** — ~15-20% на navigate/* = **намеренная** capability-цена
  (FSM-as-sole-state-authority детерминизм; `forceState` изгнан из core; send-through-table
  via `EventBusNamespace.#setupFSMActions`; commit-gate `NavigationNamespace.ts:~343`).
  **НЕВИДИМА в totalMs** (~0.02% от ~620 µs script-бюджета; ~0.1 µs microbench-дельта).
  Refactor E ОТГРУЖЕН — не «to-do».
- **Cold-start** — introspection (`./api`), SSR (`./utils`), validation-подсистемы
  **уже расщеплены в subpath-экспорты** (не парсятся в минимальном апе); остаток
  eager-машинерии — **first-paint-critical** (`start()` гонит первый рендер через
  полный FSM/guard/transition pipeline).
- **Matcher static-cache БАЙПАСИТ trie-walk** — все-статик роуты резолвятся через
  ОДИН O(1) `Map.get` (shared frozen result, zero alloc); `#traverseFrom` не бежит.
  ⇒ проигрыши wide@1000/deep@90 ультра-лёгким = **фиксированный N-независимый
  per-nav offset** (конкурент делает меньше), НЕ работа матчера; deep@90 O(depth)-рост
  = вложенная RouteView **render**-композиция, не матчинг.
- **Sources per-nav floor** — проигрыш нативной реактивности (vue-router/solid-router)
  = **framework-model gap** (coarse re-render через useSyncExternalStore vs
  fine-grained), НЕ устранимая избыточность; canonicalJson/snapshot уже оптимизированы.
- **param-nav alloc** (#2 у rr во всех когортах) = **честная feature-цена**: `<Link>` с
  меняющимися `routeParams` ре-рендерится и пересобирает active-source + buildPath на
  меняющемся `:id`; VDOM/CD-фреймворки (react/vue/angular) «прыгают», fine-grained
  (solid/svelte) плоские. Конкурент берёт готовую строку `to`, делает меньше.

### 5.2 SHIPPED — уже сделано (не переделывать)

- Link fast-paths **#1094** (solid RouteView), **#1099/#1101** (svelte Link),
  **#1103/#1104** (angular Link), **#1248** (react active-name selector): 1000
  router-подписок → 1 shared `createActiveNameSelector`.
- Matcher **static-cache**; **#1027** `EMPTY_PARAMS` singleton; **#1009**
  hidden-class sentinels (uniform node shape, frozen `EMPTY_*`); **#1169** commit-gate;
  **#1353** skip no-op popstate replaceState; **#1332** parse-segment токенайзер-унификация.
- ⭐ **#1379 — trie `staticChildren` frozen sentinel** (ЕДИНСТВЕННЫЙ REAL-вектор,
  найденный hunt-ом): листовые узлы больше не аллоцируют пустой `Object.create(null)`
  под staticChildren — общий frozen sentinel + copy-on-write. **~10% table-heap @10k**
  (browser CDP A/B 8.585→7.709 MB). **НЕ ищи его заново.**

### 5.3 DEBUNKED — опровергнуто (не воскрешать без нового доказательства)

- **CPU throttling** — floor-bound, per-nav реальной router-работы ~0.03 ms; откачен.
- **buildPath reduction** — param-slot замыкания предсобраны при регистрации трие
  (`registration/index.ts:~152`); per-nav = интерполяция, выходная строка неизбежно
  разная (target меняется).
- **`useIsActiveRoute` fast-path на non-strict+params** (name-only) = **КОРРЕКТНОСТНЫЙ
  БАГ**: `isActiveRoute` СРАВНИВАЕТ params, когда `activeName===name`
  (`RoutesNamespace.ts:~443` «Exact match case») — расширение сделало бы Link
  ложно-активным.

### 5.4 Открытые probe-worthy (низкий ROI — оцени, но не жди чуда)

- **Vue Link #1257 gap** — vue `Link.ts:~166` строит полный `createActiveRouteSource`
  в watch, НЕ гоняет default-линки через shared `createActiveNameSelector` (react/
  svelte/angular гоняют). Адаптерная асимметрия (симметричный долг).
- **Unbounded active-source кэш** — `createActiveRouteSource` кэширует по
  `canonicalJson(params)` с noop-destroy, **никогда не эвиктит** (Map растёт); в
  param-heavy апе неограниченный рост. Bounded LRU рискует корректностью (CORRECTNESS-RISK).
- **Interceptor-chain глубина (measurement gap)** — бенч вешает ~1 interceptor, прод
  стекает 3-4 (browser+search-schema+persistent-params+ssr-data) LIFO N-глубоко/нав
  → бенч может ЗАНИЖАТЬ реалистичную per-nav стоимость. Это про честность измерения.
- **`Object.freeze` dev-gating** — ~8 freeze/нав, без `__DEV__`-гейта. Но ~1 µs/нав =
  sub-noise + прод-снятие ослабляет immutable-контракт → скорее НЕ стоит.

---

## 6. Дисциплина измерения (уроки — обязательны)

1. **Browser A/B — АВТОРИТЕТ над node micro-bench для ПАМЯТИ.** Node micro-bench
   (createRouter(N), `--expose-gc`, heapUsed-дельта) в hunt-е показал ~16%, браузер
   (`jsHeapMB@10000`) — ~10% (истина). Пустой null-proto объект ≈192 B в Node V8,
   ≈88 B в Chrome V8. Node-прокси **направленно верен, но завышает абсолют ~2×** —
   для memory-claim гоняй БРАУЗЕРНЫЙ table-heap (memory-класс: стабилен, rme~0,
   load-толерантен). Рецепт A/B: bundle path-matcher+core dist (fix) →
   `run.mjs table-heap real-router react 6` → `git checkout` src + rebuild → мерь
   no-fix → restore. **Бэкапь ячейку `results/` перед прогоном** (run.mjs перезаписывает).
2. **Sub-ms — ТОЛЬКО same-session A/B.** Кросс-сессионный дрейф sub-ms ~2×
   (термал/нагрузка); memory/matcher/link-build стабильны ~5%. «Улучшилось vs
   прошлый прогон» на sub-ms без same-session A/B — не доказано.
3. **Числа — из `results/`, НЕ из REPORT-прозы** (проза отстаёт). Ранжируй по
   ПРАВИЛЬНОЙ headline-метрике (§2.3) + правильному endpoint (@1000/@90/@50/@10k).
4. **Load-bearing / неожиданный claim перепроверь САМ** — компиляция (`tsc`), прогон
   (`node`/бенч), трассировка code-path. Вердикт субагента = гипотеза, не факт.
5. **Measurement-realism** — помни, что бенч может недо-представлять прод (1 vs 3-4
   interceptors; SSR/hydration не покрыт вовсе). Занижение ≠ отсутствие цены.

---

## 7. Протокол достоверности (обязателен)

- Доказывай **первоисточником** (код + замер), не рассуждением и не REPORT-прозой.
- `file:line` на каждый несущий claim; число — из `results/` или собственного замера.
- REFUTE by default; планка REAL (§4) — жёсткая.
- Раздели **«конкурент структурно легче (делает меньше)»** и **«rr тратит впустую»** —
  первое НЕ рычаг rr.
- Перф-claim без A/B (browser для памяти, same-session для sub-ms) = **не доказан**.
- Не объявляй ячейку/ветку «сломанной/недостижимой» рассуждением — мерь эмпирически.

---

## 8. Формат вывода (отчёт)

**Сохрани отчёт ДОКУМЕНТОМ в папке `.claude/`** (напр.
`.claude/perf-vector-analysis-YYYY-MM-DD.md` — gitignored, рядом с прочими
аудит/анализ-доками репо), а не только выводи в чат. Структура документа:

```
# real-router — perf-vector анализ (дата)

## TL;DR
[вердикт: N REAL / M NEEDS-AB; пространство исчерпано? да/частично; 1-2 фразы]

## ⭐ REAL-векторы (addressable)
### <lever> · ROI <high/med/low/micro> · <capability-risk>
- site: file:line
- mechanism: что за напрасная работа + как убрать
- evidence: results/-число ИЛИ факт кода
- validation: какой A/B нужен (browser table-heap / same-session sub-ms / …)

## NEEDS-AB (правдоподобно, требует замера)
[тот же формат + почему не доказано без A/B]

## Подтверждено INHERENT / SHIPPED / DEBUNKED (для полноты)
[короткий список с file:line-доказательством — почему НЕ рычаг]

## Measurement-realism зазоры (не рычаги — слепые зоны бенча)
[interceptor-depth, SSR, …]

## Что НЕ удалось проверить / нужен прогон
```

---

## 9. Антипаттерны (чего НЕ делать)

- **Не** выдавай «конкурент X легче» за рычаг rr без «потому что делает МЕНЬШЕ».
- **Не** воскрешай §5.3 (DEBUNKED) и не переделывай §5.2 (SHIPPED) без нового
  доказательства.
- **Не** гонись за micro-ROI, невидимым в totalMs, ценой capability/контракта (§4).
- **Не** доверяй node micro-bench-абсолюту для памяти (§6.1) и кросс-сессионному
  sub-ms (§6.2).
- **Не** ранжируй по script-only (завышает); **не** читай nav-churn по `navsPerSec`.
- **Не** объявляй пространство «исчерпанным» без completeness-критика (§3.3) —
  и **не** раздувай отчёт мнимыми рычагами ради объёма. Пустой REAL-список честнее
  придуманного.
