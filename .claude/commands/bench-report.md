Проведи глубокий анализ cross-router бенч-репортов и выдай полный информативный отчёт: сводная таблица (rr-статус по сценариям × когортам), текстовый разбор + уточнения, выводы + анализ оптимизаций + рекомендации, анализ аномалий + рекомендации по устранению. Читает `results/` (ground truth) И REPORT-блёрбы (нарратив), сверяет их, делает выводы.

Входные данные:
$ARGUMENTS

Формат аргументов (всё опционально):
- **когорта** — `react|vue|solid|svelte|angular|all` (default `all`).
- **фокус** — конкретный сценарий (`link-build`), оптимизация для оценки («сработал ли #1248»), или `аномалии` (только Фаза 4).
- `--refresh` — перегенерить REPORT'ы из свежих `results/` перед анализом (`node cross-router/harness/report.mjs <fw>`); иначе анализируй как есть.

Каталог: `benchmarks/cross-router/`. Репорты: `REPORT.md` (react — НЕ REPORT-react.md!) + `REPORT-{vue,solid,svelte,angular}.md`. Сырьё: `results/<cohort>/<scenario>/<engine>.json` (`.metrics[key].{median,rme,p95,n}`).

---

## Принцип

REPORT состоит из ДВУХ слоёв: **авто-таблицы** (генерятся из `results/` — ground truth) и **курируемые блёрбы** (проза в `report.mjs` FW-конфиге — нарратив, который СИСТЕМАТИЧЕСКИ ОТСТАЁТ от таблиц). Анализ обязан читать **оба и сверять**: числа берутся из `results/`, а не из прозы; блёрб-число, разошедшееся с таблицей — это находка (Фаза 4). Второй столп: **perf и capability читаются ВМЕСТЕ** — per-nav стоимость rr ПОКУПАЕТ полный pipeline (guards/validated-search/data/immutable-state); лёгкость конкурента часто отражает, что он делает МЕНЬШЕ. Перф-only вывод без capability-контекста — вводит в заблуждение.

## Карта метрик — правильная headline-метрика на КАЖДЫЙ сценарий (не бери первую попавшуюся!)

`results/` кладёт МНОГО метрик на ячейку; ранжируй rr по правильной. Sweep'ы имеют endpoint'ы (`@1000`/`@90`/`@50`/`@10k`), не бери `@1`.

| сценарий | headline-метрика | почему |
| --- | --- | --- |
| cold-start | `scriptDurationMs` (boot) + `jsHeapMB` | rr тяжелее грузится (#1106, eager core) |
| nav-latency · param-nav · nested-switch · active-links | **`totalMs`** (script + Blink) | **НЕ script-only** — `script` завышает разрыв в разы; Blink `pushState` ~уравнивает (vue-router 2×/nav) |
| wide-config | `totalMs@1000` | matcher-crossover: flat=trie, rising=O(N)-scan |
| deep-config | `totalMs@90` (matcher — `script@90`) | tanstack-solid **N/A** (error 60+); rr solid #1094 RouteView |
| search-param-scaling | `totalMs@50` + **наклон** | flat=eager immutable · rising=lazy-reactive · tanstack взрывается O(count) |
| table-heap | `jsHeapMB@10000` | память route-таблицы |
| nav-churn | **`heapDeltaKB`** (retained/leak) + **`totalMsPerNav`** (CPU) | **НЕ `navsPerSec`** — confounded (см. Фаза 4) |
| link-build | `scriptMs` | rr WIN vs компонент-конкурентов, LAST vs plain-`<a>` (svelte) |
| `allocKBPerNav` (nav-lat/param-nav/search-param) | KB/nav | GC-pressure = transient-аллокация/nav; memory-counterpart к CPU. **Показывай ОБЕ строки: nav-lat (общий per-nav floor) + search@50 (eager-vs-lazy ПИК — там виден налог validate-pipeline'ов: tanstack ~11× rr). alloc-ранг МОЖЕТ расходиться с CPU-рангом (vue: CPU 🔴 но alloc 🟢 — eager платит CPU-floor, НЕ memory; ссылки, не копии) — это ГЛАВНЫЙ инсайт оси, НЕ сворачивай в одну строку.** Частична до полного прогона; пустые ячейки ≠ аномалия |

## Фаза 0 — Ground truth (сначала `results/`, потом блёрбы)

1. **Полнота + n:** сколько ячеек, какой `runs`. Дыры = failed-cell ИЛИ documented `KNOWN_NA` (не путать — Фаза 4).
2. **RME-gate:** `node harness/rme-gate.mjs 15 40 [cohort]` — stable ≤15% · noisy(blink/latency/fcp) ≤40%. PASS/offenders.
3. **Ранжируй rr** по headline-метрике (карта выше) для каждого (сценарий × когорта): median + ранг + margin к лидеру. `node harness/status-tables.mjs [cohort]` даёт быстрый flat-view, но СВЕРЬ метрику (он может брать не тот ключ).
4. **Sub-ms дисциплина:** абсолюты sub-ms метрик (active-links, param-nav, nav-latency, vue-всё) НЕ переносятся между прогонами (термал-дрейф ~10%). «Улучшилось ли vs старое» доказывается **same-session A/B**, не сравнением с прошлым прогоном (см. Фаза 3, [[feedback_same_session_ab_for_subms]]).

## Фаза 1 — Сводная таблица (матрица rr-статуса)

Таблица `сценарий × {react vue solid svelte angular}`, ячейка = rr-статус по headline-метрике:
- 🟢 **WIN** — rr самый низкий.
- 🟡 **near-tie** — rr **#2** в пределах ~15%, ИЛИ поле реально тесное / ранг шумозависим (частый случай на sub-ms: ранг флипается между прогонами — тогда 🟡 честнее, чем объявлять победителя).
- 🔴 **loss** — **ранг важнее margin, НО floor/шум важнее ранга.** rr **#3 (последний) = 🔴**, КРОМЕ двух carve-out'ов → 🟡: (а) **floor-parity** — всё поле у floor (rr ≈ baseline, разрыв +2-3% / доли ms; rr «добавляет ~0 над голым фреймворком» — напр. vue link-build 0.26 ≈ base 0.27); (б) **noise-3-way** — #2↔#3 в пределах шума (Δ ≲ RME; напр. solid search-param 0.418≈0.419). rr **#2 с margin >~15% = 🔴**; #2 ≤~15% или tight → 🟡. Плюс структурный проигрыш.

Аннотируй значимое (`🟢 ~2×`, `🔴 тяж.`, `⬆`/`⬇` vs прошлая таблица). Отдельная строка **capability** (feature-матрица: data/search/guard/scroll — perf+capability вместе). Ниже таблицы — 1-строчный tally на когорту (`react: 11🟢/1🔴 — доминирует`).

## Фаза 2 — Текстовый разбор + уточнения

- **Профиль на когорту:** доминирует / split / near-parity-heavy / rough — с механизмом.
- **Кросс-когортные паттерны** (то, что таблица не покажет одним взглядом):
  - **active-links** — системная сила rr (shared active-source, один `router.subscribe`); WIN где конкурент платит per-link active-машинерию, near-parity где конкурент уже лёгкий.
  - **link-build** — WIN vs компонент-конкурентов (react/solid/angular), LAST vs **plain-`<a>`** (svelte sv-router: компонент-vs-не-компонент структурно; use:link — escape hatch); vue = floor-паритет.
  - **scale-floor** (wide/deep/param-scaling/table-heap) — проигрыш ультра-лёгким (solid-router/vue-router/@angular ~0.06-0.2) = осознанный trade-off eager-immutable-pipeline.
  - **eager-vs-lazy** — rr плоский по CPU (search-param) И по аллокации (`allocKBPerNav`); ленивое преимущество конкурентов оборачивается O(count) при материализации всех значений.
- **Методологические caveat'ы (проговаривай, иначе читатель обманется):** `script`-ratio завышает total; nav-churn читать heap+CPU не navsPerSec; sub-ms абсолюты кросс-сессионно ненадёжны; `_baseline` = floor «router overhead over bare framework».

## Фаза 3 — Выводы · анализ оптимизаций · рекомендации

- **Идентичность rr:** одной фразой — за что платит (scale-floor + cold-start + link-build-vs-plain-`<a>`) и что покупает (per-nav лидерство + active-links + full eager pipeline). Честный, консистентный профиль.
- **Оценка отгруженных оптимизаций — ТОЛЬКО same-session A/B**, НЕ «n=30-сегодня vs baseline-вчера» (кросс-сессия утопит sub-ms в дрейфе; крупный сигнал типа link-build переживёт, sub-ms нет). Рецепт A/B: `git show <merge>^:<file>` → перезаписать src → `pnpm -F <pkg> bundle` → мерить OLD; `git checkout` → rebuild → мерить NEW; back-to-back n≥12. Пример: #1248 react — link-build −29%, active-links −34% script (чисто); vue #1250 инертен (уже был при floor).
- **Оставшиеся рычаги** — с честной оценкой преодолимости: одни структурны (svelte `<Link>`=компонент vs plain-`<a>` — НЕ преодолимо кодом `<Link>`, только use:link), другие symmetric-core (buildHref cold-flatten — все адаптеры, но ~0.9ms cold-only, ROI мал). Не рекомендуй то, что уже DEBUNKED (restProps-conditional мёртв; buildPath ceiling 0.1ms/#1254).
- **Рекомендации по оптимизации:** приоритизируй по «можно ли лучше», не по «переворачивает ли проигрыш» ([[feedback_best_tool_symmetric_improvements]]); асимметрия адаптеров (один получил fix, другие нет) = долг; но перед issue — same-session A/B, что рычаг реален.

## Фаза 4 — Аномалии · рекомендации по устранению

Прогони таблицу через фильтр «это баг / артефакт / KNOWN / stale-блёрб?» — НЕ криком «сломано» на каждый outlier:

- **Известные артефакты (НЕ баг):** `navsPerSec` в nav-churn confounded — rAF-capped ~121 у большинства, а solid rr settle'ится СИНХРОННО → цикл не capped → ~15k/s (не «битая ячейка»!). Читать nav-churn по heap+CPU. Проверяй RME: стабильный outlier (rme<1%) = артефакт метрики, не глюк.
- **`KNOWN_NA` (documented competitor-limit, НЕ failure):** `run-all.mjs` реестр скипает ячейки, где ПАДАЕТ КОНКУРЕНТ (`solid deep-config × tanstack` — tanstack-solid error на 60+ глубине). НЕ флагать как «failed cells». Добавить N/A → правка `KNOWN_NA`.
- **RME-флаги:** метрика >порога → чаще шум конкурента на sub-ms при малом n (re-run / accept / поднять n), не код-баг. Абсолют sub-ms машинно-шумен.
- **Кросс-сессионный конфаунд:** «регрессия/улучшение» из сравнения с baseline-другого-дня — вероятно термал-дрейф. Проверять same-session A/B; если |Δ| ≲ межсессионного дрейфа (~10% на sub-ms) — не доказано.
- **A/B-загрязнение `results/`:** прогон A/B/смоука ПОСЛЕ полного прогона перезаписывает ячейки (`results/` gitignored) → когорта смешивает сессии → восстановить: перегнать затронутый сценарий по ВСЕМ движкам когорты same-session.
- **Stale-блёрбы:** блёрб-числа/ранги расходятся с авто-таблицей (пример: svelte search-param блёрб «sv wins @50», а rr выигрывает; nav-latency блёрб «0.52 ms», results 0.84) → сверить каждое несущее блёрб-число с `results/`, поправить `report.mjs` + регенерить. **НО сверяй с ЧИСТОЙ n=30 ячейкой:** если сама ячейка загрязнена (n<30 из Фазы 0 — A/B/смоук перезаписал её) — staleness на ней **недоказуема** (и блёрб старый, и results кривой), бери другую когорту/сценарий с чистым n=30. Осторожно: блёрбы часто рефрешат ЧАСТИЧНО (одни сценарии обновлены под свежий n, другие отстали) — проверяй КАЖДЫЙ сценарий, не экстраполируй с одного.
  - **⚠️ КЛАСС МЕТРИКИ решает: sync абсолютов ИЛИ де-хардкод.** Прежде чем «синхронизировать блёрб к прогону», раздели: **(a) стабильные** (matcher `wide@1000` · память `table-heap`/`nav-churn heap` · `link-build` · `alloc` — big-signal, кросс-сессионный дрейф ~5%, нагрузка почти не бьёт) → **sync абсолютов ок**; **(b) sub-ms per-nav** (`nav-latency`/`param-nav`/`active-links`/`nested-switch` + vue-всё — крошечные числа) → **НЕ синхронизируй абсолютами**, они дрейфуют ~2× между сессиями И могут быть **load-инфлированы в самом прогоне**. Пиши sub-ms **отношениями/качественно** («rr ~1.3× floor конкурента, sub-ms, session/load-dependent»), а не хардкодом ms — иначе блёрб врёт каждый прогон. Подтверждено 07-05: `bench-cross-router.sh` (с readiness-gate!) выдал nav-latency rr 0.98, а same-session перемер тут же — 0.67 (прогон был загружен ~47%). **Диагноз sub-ms дрейфа/флипа — same-session перемер** (backup ячейки → `run.mjs <sc> <eng> <fw> 12` → сравни → restore): вернулось к старому → прогон был загружен, абсолют не запекать; ранг внутри когорты ratio-fair (движки подряд), но кросс-сессионный sub-ms флип (parity→#3) НЕ регрессия без same-session A/B (кода не менялось → механизма нет).
- **Частичная метрика:** новая метрика (`allocKBPerNav`) → старые `results/` её не содержат до следующего полного прогона; строка частична — это не аномалия, а «нужен прогон».

## Жёсткие правила

- Числа — из `results/` (ground truth), НЕ из блёрбов (блёрбы отстают). Несущее блёрб-число сверяй с `results/`.
- Ранжируй по ПРАВИЛЬНОЙ headline-метрике (карта) + правильному endpoint (`@1000`/`@90`/`@50`/`@10k`). `script` завышает total; nav-churn — heap+CPU, НЕ navsPerSec.
- Sub-ms «улучшилось?» — ТОЛЬКО same-session A/B. Кросс-сессионный абсолют = apples/oranges (audit «hardware-bound»).
- Не объявляй ячейку «сломанной», не отсеяв known-артефакт (navsPerSec-settle) и `KNOWN_NA` (competitor-limit).
- Perf + capability вместе: не выдавай «конкурент X легче» без «потому что делает меньше».
- react-репорт = `REPORT.md`, не `REPORT-react.md`.
- Не рекомендуй DEBUNKED-рычаги (restProps-conditional, buildPath-flatten как большой win).
- `results/` gitignored; REPORT-правки/регенерация = benchmark-infra → master, без changeset. Push/commit не делай без явной просьбы.

## Самокоррекция скила (ОБЯЗАТЕЛЬНО, в конце КАЖДОГО прогона)

Этот файл живой. После отчёта вынеси короткую секцию **«Самокоррекция»** — критику САМОГО СКИЛА, не своей работы: где текст промолчал/соврал/двусмыслен и это стоило шага, перебора или риска ошибки.

1. **Привязка к инциденту** ЭТОГО прогона: «скил сказал X / промолчал про X → реальность Y → потерял/чуть не ошибся на Z». Нет инцидента — нет правки. Особый кандидат: **новая метрика / новый сценарий / изменённая карта метрик**, которых нет в таблицах выше — занеси.
2. **Высокая планка:** правка, только если изменила бы исход (предотвратила ошибку, сняла двусмысленность, сократила перебор). Косметику отбрось.
3. **Разовое ≠ паттерн:** специфику конкретного прогона (разовый outlier) → в отчёт/память, НЕ в скил. В скил — повторяющийся класс.
4. **Сначала заточи, потом дописывай** (анти-раздувание): усиливай существующий абзац; правка делает старый текст избыточным — консолидируй.
5. **Предлагай, не применяй молча:** кандидаты таблицей (раздел | инцидент | предлагаемый текст), спроси. Применил по согласию → `.claude/commands/` = infra, в master напрямую.
6. **Честность про «нечего править»:** прогон чист и скил не подвёл → скажи «правок нет». Пустая самокоррекция честнее придуманной.
