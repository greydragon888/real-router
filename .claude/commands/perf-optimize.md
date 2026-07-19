Реши ОДНУ perf-задачу (issue или находку из бенча) по замкнутому контуру: **измерь отставание на бенче** → классифицируй (устранимая слабость vs оплаченный trade-off) → если устранимо, копай до истинного корня → выбери **оптимальное** решение из кандидатов → реализуй (RED/GREEN по `/bugfix`) → **докажи выигрыш same-session A/B** → портируй симметрично → запиши в ledger. Терминал — не «число уменьшилось», а доказанный вердикт (FIXED / STRUCTURAL / FEATURE-COST / v2-CANDIDATE), записанный в `SCENARIO-LAG-ANALYSIS.md`.

Входные данные:
$ARGUMENTS

Формат аргументов:
- Номер issue (`#1483`) или ссылка — perf-задача (метка `performance`, или `[perf]` в заголовке без метки).
- Опционально свободное описание находки без issue (perf-вектор из прогона бенча / аудита) — тогда Фаза 0 работает от описания, а не от `gh issue view`.
- Опционально `--dry` — довести до **вердикта** (baseline измерен + корень + оптимальный кандидат + ROI-решение), без реализации. Для ROI-uncertain / research-issue (`#1483`-класс) это дефолт до явного go.

Пример:
```
/perf-optimize 1483
/perf-optimize 1437
/perf-optimize https://github.com/greydragon888/real-router/issues/1438
/perf-optimize 1483 --dry
```

> **Это НЕ hunt.** Поиск ВСЕХ оставшихся perf-векторов по всему репо — отдельный мультиагентный промпт `.claude/prompts/perf-optimization-deep-analysis.md` (perf-аналог `/debt-map`). ЭТОТ скил разрешает ОДИН вектор/issue (perf-аналог `/chain-resolve` + `/bugfix`). Реализационное ядро (RED/GREEN/REFACTOR/changeset/docs/commit/issue-comment) НЕ дублируется — берётся из `/bugfix`; раскопку корня — из `/chain-resolve`; дисциплину измерения, карту метрик и классификацию — из `perf-optimization-deep-analysis.md` (§2.3/§2.4/§4/§6). Меняется методология фикса → правится `/bugfix`, этот скил наследует.

## Принцип — доказанный вердикт, а не «число вниз»

Роутер прошёл несколько волн оптимизации; лёгкие победы выметены. Три самых дорогих провала, ровно в порядке вероятности:

1. **Гнаться за красной ячейкой, которая не рычаг.** Большинство отставаний в `SCENARIO-LAG-ANALYSIS.md` намеренно НЕ преследуются: `INHERENT`/`STRUCTURAL` (иммутабельный frozen-state, eager-core покупает O(1)-матч) или `FEATURE-COST` (`<Link>` покупает active-class, которого у конкурента нет). «Конкурент структурно легче (делает МЕНЬШЕ)» — это НЕ рычаг real-router. Оптимизация без триажа «слабость vs оплаченный trade-off» воюет против собственного дизайна проекта. **Только класс `WINNABLE (open)` заслуживает issue/PR.**
2. **Point-fix поверх более глубокого корня.** Perf-заплатки особенно рецидивны: рычаг, ДОБАВЛЯЮЩИЙ спец-кейс/кэш/флаг вокруг концерна, часто симптом нарушенного инварианта, который породит следующий follow-up ([[feedback_effort_signals_wrong_axis]] — «много усилий = не та ось → ищи нарушенный инвариант»). Копай до владельца, гасящего весь класс, прежде чем латать один сайт.
3. **«Выигрыш», доказанный рассуждением или cross-session числом.** Для sub-ms это самообман: дрейф ~2×/сессия дал физически невозможный **−51%** на строгом суперсете (#1455). Выигрыш реален ТОЛЬКО при same-session A/B ([[feedback_same_session_ab_for_subms]]); отставание реально ТОЛЬКО когда margin ≫ RME.

Планка `WINNABLE` (жёсткая, из deep-analysis §4): (1) убирает работу, которую система делает **впустую**; (2) не теряет ни одной возможности из pipeline (guards/lifecycle/validated-search/immutable-state); (3) не ломает корректность; (4) даёт **измеримый** выигрыш на **правильной** метрике (§2.3). Не проходит хоть один пункт → не рычаг. Micro-ROI (невидимый в headline, торгующий контракт ради долей µs) → INHERENT/не-стоит, не REAL.

## Как формулировать вопрос пользователю

Design-call (ROI-развилка, structural-vs-point, «портируем ли в адаптер X») формулируй **просто, для человека без накопленного тобой контекста** — по разделу «Как формулировать вопрос пользователю» в `/bugfix`: (1) что за сценарий/ось простым языком; (2) в чём отставание и чем бьёт; (3) один чёткий выбор с вариантами и рекомендацией. НЕ вываливай плотную сводку из cause-class-жаргона и метрик. **ROI-развилки веди в прозе, по одному открытому вопросу** ([[feedback_open_discussion_not_multiselect]]), не карточками.

## Фаза 0 — Контекст + не-переоткрывай

1. Извлеки номер (или прими свободное описание находки). `gh issue view <number> --comments` — комментарии ВСЕГДА (уточнения скоупа, контр-примеры, готовый механизм). Issue закрыт как duplicate/invalid → ПРЕКРАТИ.
2. **Ветка ≠ `master`** (гейт `/bugfix` 0.3): на `master` — ПРЕКРАТИ, заведи ветку (`gh issue develop <number> --name <number>-<slug>` + worktree) сам. `#<number>` дублируй в коммит/changeset. Скил ветку НЕ заводит.
3. **Свериться с уже-известным — не переоткрывай отгруженное/опровергнутое.** До измерений прочитай:
   - `SCENARIO-LAG-ANALYSIS.md` — есть ли уже запись по этой ячейке? Вердикт `STRUCTURAL`/`FEATURE-COST`/`ARTIFACT`/`DEBUNKED` = премиса, вероятно, закрыта; воскрешай ТОЛЬКО с новым доказательством. `WINNABLE (open)` = зелёный свет.
   - `perf-optimization-deep-analysis.md` §5 (SHIPPED/DEBUNKED/INHERENT) — 34-агентный hunt уже прочесал оси; не трать бюджет на переоткрытие.
   - Память: [[project_cross_router_bench_handoff]], [[project_benchmark_engine_doctrine]] (CodSpeed-гейт CI ОТКЛЮЧЁН #984 — competitive-мерятся своим harness'ом, НЕ CodSpeed), [[project_perf_vector_analysis]], [[project_cross_router_sweep_point_sets]].
4. **Гипотеза механизма в issue — критически** (`/bugfix` 0.7). Механизм, «verified in issue», всё равно перепроверь из кода на HEAD; предложенный фикс — гипотеза автора, не истина. Своё же прошлое предложение доверия не повышает.
5. Раздели **что за отставание** (сценарий · когорта · конкурент · заявленная метрика) от **что делать** — второе решает Фаза 2, не тело issue.

## Фаза 1 — Baseline: обязательный прогон бенча (триаж-гейт)

Perf-аналог «воспроизведи баг эмпирически» (`/bugfix` 0.6): отставание НЕ реально, пока не измерено на HEAD. **Это гейт — может закоротить работу в «reframe → ledger» без единой правки.**

0. **Определи ПОД-КЛАСС задачи — от него зависит, нужен ли бенч вообще:**
   - **(a) Competitive-lag** (проигрыш конкуренту на оси cross-router: nav-latency / `<Link>` / active-links / table-heap / alloc) → полный контур: baseline-бенч (ниже) → same-session A/B (Фаза 5.2) → ledger (Фаза 7.1). Метрика sub-ms / competitive.
   - **(b) Structural / contract-regression** (fast-path не подключён на call-site, cache-key split, лишняя подписка — класс #1416/#1437/#1438): НЕ competitive; доказывается **discriminator-тестом** (subscription / cache-key count, Фаза 5.1) + bugfix-ядром — **пропусти Фазу 1 бенч И Фазу 7.1 ledger** (нет cohort/scenario/competitor → формат неприменим; финал = обычные docs/changeset, как `/bugfix`). Cross-router на структурный дефект НЕ гони — эффект в тесте, не в sub-ms (#1438: `use:link` `{}`-default раскалывал #776 cache-key → discriminator `router.subscribe` delta 1→0, бенч не нужен). **Запись в ledger — только для (a).**

   Пункты 1-7 ниже — путь **(a)**. Для **(b)** сразу к Фазе 2 (классификация как обычный bug) → Фаза 5 (RED discriminator по `/bugfix`), минуя баг-прогон и ledger.
1. **Выбери измерительную систему по классу задачи** (не путать — [[project_benchmark_engine_doctrine]], «2.5 движка»):
   - **Competitive / adapter / end-to-end** (проигрыш конкуренту, `<Link>` render, nav-latency, table-heap) → cross-router harness (Playwright+CDP, PRODUCTION `dist`, 5 когорт на локальном M3 Pro под sudo-оркестратором). Каталог `benchmarks/cross-router/`. **Единственный evidence-слой для competitive** — CodSpeed для этого не годится (см. ниже).
   - **Core µs hot-path / alloc / footprint** (transition-pipeline, matcher, per-router память) → `pnpm -F @real-router/core bench` (tinybench, `packages/core/tests/benchmarks/default.bench.ts` — это и есть CodSpeed-сюит, CI-гейт на паузе #984, локально гоняется) и/или node micro-bench (`node --conditions=@real-router/internal-source --import tsx <probe>`, `--expose-gc` для памяти). Эталон метода — `packages/core/.claude/perf-baseline-1169-commit-gate.md`. **⚠ Недостаточный warmup врёт**: mitata/node-bench при малом warmup даёт фантомные аномалии (прогон дал rr 4188 B vs r6 2 B = 2000× — оказался чистым артефактом JIT-warmup, при 200+ итерациях overhead исчез); прогревай TurboFan, читай медиану многих прогонов.
   - **Sub-ms матч спрятан под render-шумом браузера** («волны» в navMsTask@N) → изолированный `matcher-bench`: `node --expose-gc run.mjs [cohort]` из `benchmarks/cross-router/matcher-bench/` (pure Node, µs-per-match, interleaved) вскрывает O(1)-vs-O(N), которого браузерный per-nav не показывает — карта: ТОЛЬКО real-router + tanstack O(1), все прочие O(N) ([[project_cross_router_sweep_point_sets]]). Coupled-матчеры (solid/sv-router) — direct-file; angular(JIT)/mateo(runes) — не изолируются headless (холдаут).
2. **Правильная headline-метрика на сценарий — НЕ первая попавшаяся** (карта deep-analysis §2.3):
   - per-nav (nav-latency/param-nav/nested-switch/active-links): **`navMsWall`** (felt) + **`navMsTask`** (CPU, microtask-inclusive) — НЕ `scriptMs` (слеп к async-microtask, #1451).
   - sweeps (wide/deep/search): **`navMsTask@N`** (headline) + `navMsWall@N` (endpoint); читай **КРИВУЮ/slope**, не абсолют @N; `totalMs@N`/`scriptMs@N` retired/диагностика.
   - alloc (GC-pressure): **`allocKBPerNav`** (gross, `includeObjectsCollectedByGC` #1417); gc-per-nav деки = среднее тоггла @256↔@1, НЕ чистый @256-нав. table-heap/nav-churn/cold-start → retained (force-GC) `jsHeapMB`. ⚠ Аудит 07-18: table-heap `jsHeapMB@100` = **total-app** retained (route-таблица 0.3–5% — движковую память бери Δ-growth @100−@10 или −`_baseline`); cold-start = boot-CPU ось, felt-ось = `fcpMs@10` (angular на felt — wash); nav-churn `heapDeltaKB` = Δ за 200-нав окно, warmup-dominated (не per-nav rate и не leak).
3. **Готовность машины** (иначе sub-ms контаминирован): `pnpm cpu`; power adapter; thermal Nominal (`sudo powermetrics --samplers thermal -i 1 -n 1`); закрыть Chrome/Telegram/Slack/Spotify. Память (table-heap/nav-churn) load-толерантна (rme~0).
4. **Провенанс dist** ([[feedback_no_dist_build_in_worktree]], #1459/#1460): бенч читает `dist`, не `src`. После ЛЮБОЙ правки `packages/*/src` — `pnpm -F <pkg> bundle` (core инлайнит path-matcher's dist → правил path-matcher, пересобери `path-matcher` И `@real-router/core`). Provenance-gate роняет `exit 3` на стейл-dist. Свежий worktree НЕ имеет собранного графа → браузерный бенч упадёт `Failed to resolve @real-router/*` — competitive-A/B гоняй в ОСНОВНОМ чекауте (см. Фаза 5); node micro-bench в worktree ок (резолвит через `--conditions` из `src`).
5. **Прогон baseline:** `node cross-router/run.mjs <scenario> <engine> <fw> <runs>` (дефолт `runs=30`) для rr И конкурента (или `pnpm bench:cross-router -- <scenario> <engine> <fw> <runs>`; несколько сценариев — `run-subset.mjs <csv> [runs=50]`). Зафиксируй **median + RME + n** обоих. Отставание реально ТОЛЬКО когда margin ≫ RME (гейт: stable ≤ 15%, noisy blink/latency/fcp/sweep-@N ≤ 40% — `harness/rme-gate.mjs`); для sub-ms верь только same-session паре. `n < 10` (`N_MIN`) в `results/` не пишется (#1455) — но `run.mjs` всё равно измеряет и печатает, так что A/B на `n≥20` работает.
6. **Сними baseline-док** (как `perf-baseline-1169-commit-gate.md`) в scratchpad/`packages/*/.claude/`: числа «до», метод, drift-anchor-контроль (`buildPath/warm-static` ≈ 83 ns — если сдвинулся, весь сдвиг = дрейф, вычесть). Это референс для A/B Фазы 5.
7. **Не воспроизводится / в пределах RME → `NOISE`**, премиса устарела: НЕ оптимизируй по тексту. Останови, запиши вердикт `NOISE` в ledger (по надобности), сообщи. Короткое замыкание — валидный исход.

## Фаза 2 — Классификация: слабость vs оплаченный trade-off (ГЕЙТ до оптимизации)

Самая важная perf-специфика. **До** любого решения — изолируй механизм и вынеси вердикт.

1. **Изолируй, где тратится** — не верь заявленному слою issue. Профиль/трейс/микробенч: matcher (обычно O(1) через static-cache — `#traverseFrom` не бежит) · adapter render (O(N) per-link/per-node) · core alloc (per-nav frozen-state) · boot (eager-parse ~100 KB) · sources-notify. Раздели **subscription-слой** (rr сделал O(1) shared, #1099/#1094) от **render-слоя** (может остаться O(N), #1483) — это РАЗНЫЕ слои, не смешивай.
2. **Классифицируй** — cause-class (ledger) × вердикт (deep-analysis §4):
   - cause-class: `EAGER-CORE` · `<Link>-COMPONENT` · `IMMUTABLE-STATE` · `SCALE-FLOOR` · `FRAMEWORK-NATIVE` · `DEFERRED-COMMIT` · `COMPETITOR-ARTIFACT` · `NOISE`.
   - вердикт: `WINNABLE (open)` · `FEATURE-COST` · `STRUCTURAL` · `v2-CANDIDATE` · `FIXED` · `ARTIFACT`/`NOISE`; расширенно — `INHERENT`/`SHIPPED`/`DEBUNKED`/`CORRECTNESS-RISK`/`NEEDS-AB` (deep-analysis §4).
3. **Три исхода:**
   - **Не рычаг** (`INHERENT`/`FEATURE-COST`/`STRUCTURAL`/`SHIPPED`/`DEBUNKED`/`ARTIFACT`/`NOISE`) → НЕ оптимизируй. Обнови `SCENARIO-LAG-ANALYSIS.md` (вердикт + доказательство file:line / A/B-число), закрой/переформулируй issue как reframe или `v2-CANDIDATE`. Это ЧЕСТНЫЙ терминал (#1106 закрыт без code-fix → ledger; #966 «156 KB/clone = цена изоляции» + regression-guard). Стоп.
   - **`NEEDS-AB` / research / ROI-uncertain** (#1483-класс: тело помечено «research / scope first / ROI uncertain») → перейди в **scope-режим**: Фазы 3-4 как ОЦЕНКА (кандидаты + прикидка достижимого выигрыша), затем **измерь achievable gain ДО коммита** (лёгкий A/B прототип), вынеси ROI-развилку пользователю. Может закончиться «не делаем» → ledger `v2-CANDIDATE`. При `--dry` останавливаешься здесь.
   - **`WINNABLE (open)`** → к Фазе 3.
4. **Планка REAL — жёсткая** (Принцип). «Конкурент делает меньше» отсеки явно (это не рычаг rr). Micro-ROI (sub-noise в headline, торг contract) → не REAL.

## Фаза 3 — Более глубокий корень (копай до коренной породы)

Только для `WINNABLE`. Из `/chain-resolve` + `/bugfix` 0.8 — но дёшево, инлайн, по коду; не RFC-крестовый-поход.

1. **Виноват ли вообще rr, или это НЕРАВНЫЙ БЕНЧ? (проверь ПЕРВЫМ, до раскопки rr-кода).** Competitive-отставание может жить не в rr, а в **асимметрии bench-app**: конкурент с view-isolation (`RouterView` / `Outlet` / `Router+routes`) держит свой shell стабильным, а rr-app с inline route-read (`useRoute()` в shell) над списком из N компонентов ре-рендерит весь shell каждую навигацию → O(N) reconciliation, которого конкурент не делает. Сверь СТРУКТУРУ обоих app'ов, не только числа. Неравно → cause-class `COMPETITOR-ARTIFACT`, fix = **выровнять bench-app** (вынести route-часть в свой компонент), адаптер НЕ трогать. Класс #1456/#1483 (#1483: vue active-links «O(N) render» был ровно этим — shell на `useRoute()` каскадил N `<Link>`; селектор уже O(1)+O(changed) #1416; после view-isolation rr O(changed) бьёт vue-router 4.3×, A/B-proven). Кусается на **VDOM**-когортах (vue/react — coarse shell re-render); **fine-grained** (solid `<For>` / svelte runes / angular OnPush) не каскадят → иммунны.
2. **Не заплатка ли фикс поверх более глубокого владельца.** Признаки НЕ-дна: рычаг ДОБАВЛЯЕТ спец-кейс/кэш/флаг вместо удаления напрасной работы (Variant-A-запах); тело/комменты ссылаются «same class as #N / same family / parallel to #N» в другом адаптере (сквозная **ось**); тот же perf-класс уже чинили в другом пакете (whack-a-mole → отсутствующий общий примитив/контракт, напр. #776 shared active-source).
3. **Инлайн-раскопка** (`git blame` горячих строк → residual-vs-original; «ложная полнота» родительского perf-фикса — заявил, что покрыл, а шов отрицает; sweep сиблингов). **Deeper-root vs point-fix — решающее правило:** point-fix = 1 файл/функция, «эта строка делает X per nav», «measured back to parity» (регресс-репэр, #1432/#1285). Deeper root = `!`-breaking-коммит, новые/удалённые pipeline-файлы или целые структуры, тело reframe'ит/опровергает гипотезу (H1…), нарратив нарушенного инварианта («третья удержанная копия», «async overhead доминирует» #307/#1426), issue-родитель, порождающий child-lands (#1009→#1414/#1415).
4. **Исход:** `COMPETITOR-ARTIFACT` / bench-app-fix (пункт 1 — адаптер невиновен) · point-fix (локальный rr-рычаг — продолжай к Фазе 4) · structural (нарушенный инвариант / отсутствующий владелец — возможен RFC через `/brainstorm`→`/audit-rfc`→`/implement-rfc`, если добавляешь контракт, а не слой) · грань более широкой оси (эскалируй: полное разрешение = ось, запиши в ledger + вынеси развилку). Калибровка (`/chain-resolve`): «глубже» — ГИПОТЕЗА, легко переоценить; ссылка на другой issue ≠ доказанный корень. Триаж + ограниченная раскопка, не блокируй фикс, если корень не доказан кодом.

## Фаза 4 — Оптимальное решение (не первая заплатка)

1. **Сгенерируй 2-3+ кандидата-рычага.** На каждый: механизм устранения напрасной работы · прикидка выигрыша (на какой метрике §2.3) · capability-risk (что теряем) · blast-radius · **симметрия** (в скольких адаптерах/сайтах применим). Для сложной развилки — параллельные кандидаты + оценка (judge-подход), не первая мысль.
2. **Выбери оптимальный** по ROI × сохранение capability × симметрия. Отклони micro-ROI и любой, теряющий возможность/ломающий контракт. Если issue предлагает конкретный рычаг — прими только с доказательством, что он корень+оптимум (`/bugfix` 0.7); своё решение лучше — используй и объясни, почему issue-вариант не подошёл.
3. **Симметрия — first-class** ([[feedback_best_tool_symmetric_improvements]]): рычаг, применимый ко всем fine-grained-адаптерам (Vue→Solid) или всем 6 адаптерам (shared active-source #776), проектируй сразу симметрично — отсутствие в части мест = долг. Не-применимость где-то (React O(N) by-design — конкуренты тоже O(N)) — назови явно.

## Фаза 5 — Реализация + доказательство выигрыша (обязательный A/B)

1. **RED/GREEN/REFACTOR — по `/bugfix` Фазы 1-3.** Perf-RED = не output-разница (её нет), а **дискриминатор ресурсного следствия** (`/bugfix` 1.2): O(changed) вместо O(N) render · 1 shared subscription на 1000 links · alloc-дельта · 1 пересчёт вместо N. **Дискриминатор ОБЯЗАН доказывать, что fast-path достигается на РЕАЛЬНОМ call-site** — «landed in dead code» рецидивен (#1416: fast-path отгружен в `<Link>`, который его не звал → prod-dead + doc-drift; #1437/#1438 тот же класс). Тест: subscription-count / render-count / alloc-guard; проверь дискриминирующую силу мутацией (сломай fast-path — тест обязан упасть).
2. **Обязательный same-session A/B** (ledger «A/B recipe», [[feedback_same_session_ab_for_subms]], [[feedback_no_git_stash_for_comparison]]): OLD/NEW/OLD/NEW interleaved (n≥20, как реальные ledger-записи), drift-cancelled, порог = конкурента **same-session** median. **Браузерный competitive-A/B — в ОСНОВНОМ чекауте** (dist собран; свежий worktree его не имеет — bugfix-batch урок): patch-apply фикс → `pnpm -F <pkg> bundle` → `run.mjs <scenario> <engine> <fw> 20` → `git checkout` src + re-bundle → measure BEFORE → **контрольный re-run base (бит-в-бит)** → restore. Harness `measure()` без `writeCell` НЕ контаминирует `results/`; бэкапь ячейку перед `run.mjs` (перезаписывает). Нормализуй на drift-anchor. **Sub-ms — НИКОГДА cross-session** (−51%-урок #1455). Node micro-bench для памяти → browser table-heap авторитетнее (node V8 завышает абсолют ~2×, deep-analysis §6.1). **Корень в bench-app, а не в `packages/src` (Фаза 3.1)? A/B ПРОЩЕ** — dist пакетов не меняется: правь `apps/<fw>/<engine>/…/main.*` прямо в ОСНОВНОМ чекауте → `run.mjs` сам пересобирает app через `vite build` (никакого `pnpm bundle` / `checkout src + rebundle`) → measure → `git checkout` app → control. Так и проверен #1483.
3. **Докажи выигрыш ЧИСЛОМ, не «должно быть быстрее».** Зафиксируй median+RME+n до/после; выигрыш = дискриминирующая дельта (не в пределах RME).
4. **Портируй симметрично** (Фаза 4.3) — реализуй рычаг во ВСЕ применимые адаптеры/сайты в этом же прогоне (один RED per сайт, [[feedback_layer_consistency]], [[feedback_probe_each_sibling_no_analogy]]).
5. **Проверь отсутствие регресса** соседних сценариев/когорт (рычаг мог сдвинуть другой шов) — прогон затронутых ячеек.

## Фаза 6 — Валидация + changeset

1. **Точечная валидация затронутых пакетов** (`/bugfix` 4, НЕ полный `pnpm build` — [[feedback_no_full_build]]): на каждый — `pnpm -F <pkg> type-check`, `lint`, `test -- --run` (+ `test:properties`/`test:stress`, если правил core-timing/инвариант/память — [[feedback_sweep_properties_stress_on_timing_change]]). 100% coverage; для адаптеров с phantom-порогом (vue/solid/svelte/angular) проверяй **per-file** строку coverage-таблицы = 100%, не только `Tests N passed`. Финальный lint большого пакета — свежим (`rm .eslintcache`), в фоне, читая собственный exit-код.
2. **Discriminator-тест из Фазы 5.1 остаётся постоянным** (доказывает, что fast-path достигается — не «просто быстрее»). Бенч-числа в коммит НЕ пиннятся (флейк); дискриминатор пиннит структурный факт.
3. **Changeset** через `/changeset` — если правил `packages/*/src` публичного пакета (perf-фикс = `patch`; в pre-1.0 breaking → `minor`). Правки harness/ledger (не трогают `packages/*/src`) — в master без changeset.

## Фаза 7 — Ledger (обязательно) + docs/wiki

1. **Запись в `SCENARIO-LAG-ANALYSIS.md` — обязательна для КАЖДОГО прогона** (даже терминал «не рычаг» из Фазы 2), это проектная дисциплина «record every investigation here, not only in memory». По разделу «How to add an entry»: (1) строка в **Summary matrix** (cohort · scenario · margin · cause-class · confidence · verdict); (2) на A/B-proven/значимый trace — **Detailed subsection**: numbers (median+RME+n), A/B recipe/result ИЛИ code-trace `file:line`, root cause в один параграф, verdict; (3) cite issue/PR; (4) **commit directly to `master`, no changeset** (benchmark infra). Confidence честно: `A/B-proven` только если same-session A/B пинил причину; иначе `code-traced`/`inferred` (помечай, пока A/B не апгрейдит).
2. **Локальные доки + вики** (`/bugfix` 5) — perf-фикс часто означает расхождение задокументированного контракта: `packages/<pkg>/CLAUDE.md` (секции «Performance Notes»), `ARCHITECTURE.md` (если тронут инвариант / O-нотация — #1316 урок: «ARCHITECTURE заявлял O(n), а было O(n²)»), `IMPLEMENTATION_NOTES.md` (Problem→Solution→Why для structural-фикса). Вики — абсолютным путём (`Additional working directories`), коммить ТОЛЬКО свои файлы.
3. **Симметричные сиблинги/долги, не покрытые в прогоне** → `/create-issue` (родословная + class-guard), назови в отчёте.

## Фаза 8 — Commit + issue-comment

1. **Commit message** через `/commit-msg` — тип `perf(<scope>): ...`. Выведи, НЕ коммить без явной просьбы.
2. **Комментарий в issue** (`/bugfix` 7, на английском, черновик — публикуй только по явной просьбе): подтверждённый корень · рычаг + ключевой диф · **measured before/after** (median+RME+n, same-session A/B recipe) · что портировано симметрично · дискриминатор-тест · вердикт ledger. Не переобещай «merged/released», если на ветке.
3. **Push** — только по явной просьбе (`/bugfix` 6.3): `git push -u origin HEAD`; в worktree pre-push `lint:audit` спурьозно падает → верифицируй в основном чекауте, повтори `--no-verify`.

## Итоговый отчёт

- Ветка · issue/находка · сценарий×когорта.
- **Baseline** (Фаза 1): метрика · median+RME+n rr vs конкурент · система измерения.
- **Классификация** (Фаза 2): cause-class + вердикт + доказательство. Если терминал «не рычаг» — что записано в ledger, issue reframed.
- **Корень** (Фаза 3): point-fix / structural / ось; как отличил.
- **Решение** (Фаза 4): кандидаты + почему выбран этот; симметрия (где применён / где by-design нет).
- **Выигрыш** (Фаза 5): before→after same-session A/B (median+RME+n); дискриминатор-тест (путь+имя).
- Валидация затронутых пакетов; changeset (пакет/бамп или почему нет).
- **Ledger**: строка + Detailed (обязательно). Docs/wiki: что обновлено.
- Commit message (`perf(...)`); черновик issue-комментария.

Важно:
- НЕ коммить / НЕ пуш / НЕ публиковать issue-комментарий без явной просьбы.
- НЕ помечай выполненным без **измеренного** same-session выигрыша (competitive sub-ms) — «должно быть быстрее» не считается.
- Терминал «не рычаг» (INHERENT/FEATURE-COST/STRUCTURAL/reframe) с записью в ledger — ПОЛНОЦЕННЫЙ успех, не провал. Пустой список рычагов честнее придуманного.
- CodSpeed — это core µs hot-path сюит (tinybench), CI-гейт на паузе (#984, гетерогенный GHA-пул); **competitive НИКОГДА не мерялся CodSpeed'ом** — только cross-router harness. Не жди CodSpeed-числа для адаптерного отставания.

## Самокоррекция скила (ОБЯЗАТЕЛЬНО, в конце КАЖДОГО прогона)

Этот файл — живой; каждый прогон обязан его затачивать. После отчёта вынеси секцию **«Самокоррекция»** — критику не своей работы, а САМОГО ЭТОГО СКИЛА: где его текст промолчал, соврал, был двусмыслен или избыточен — и это стоило времени, лишнего шага или риска ошибки.

1. **Привязка к ИНЦИДЕНТУ, не общие советы.** Каждая правка — из конкретного момента ЭТОГО прогона: «скил сказал X / промолчал про X → реальность Y → я потерял/чуть не ошибся на Z». Нет инцидента — нет правки. Особые кандидаты для perf: неверная headline-метрика увела вердикт; A/B в worktree упал на dist; cross-session дельта соврала; погнался за FEATURE-COST; корень оказался глубже/мельче гипотезы.
2. **Высокая планка: изменило бы исход?** Только если правка реально предотвратила бы ошибку/перебор/ложный вердикт. Косметику — отбрасывай.
3. **Граница со смежными скилами.** Методология RED/GREEN → `/bugfix`; раскопка корня → `/chain-resolve`; карта метрик/классификация/дисциплина замера → `perf-optimization-deep-analysis.md`; ledger-формат → сам `SCENARIO-LAG-ANALYSIS.md`. Сюда идёт только оркестрация perf-контура (measure→классифицируй→корень→оптимум→A/B→ledger). Не дублируй.
4. **Сначала заточи, потом дописывай (анти-раздувание).** Усиливай существующий абзац; не плоди секции.
5. **Предлагай, не применяй молча.** Выведи кандидатов таблицей (раздел | инцидент | предлагаемый текст), спроси разрешения. Применил по согласию → `.claude/commands/` это infra, в master напрямую, без changeset.
6. **Честность про «нечего править».** Прогон прошёл чисто → так и скажи: «правок нет».
