# Аудит бенчмарк-харнесса `real-router` (метрики · сценарии · драйвер · конфиги · дека)

> **Назначение.** Самодостаточный промпт для (мультиагентного) аудита
> **ИЗМЕРИТЕЛЬНОГО слоя** cross-router бенча — `harness/`, `scenarios/`,
> `run*.mjs`, `matcher-bench/`, `deck/`, per-app конфиги, CI-воркфлоу — **НЕ кода
> под тестом**. Единственный вопрос: **«мерит ли инструмент ПРАВИЛЬНОЕ измерение,
> ЧЕСТНО — и честно ли его АГРЕГИРУЕТ/ПОКАЗЫВАЕТ?»** — правильную ли величину
> (dimension), эквивалентную ли работу поперёк движков (fairness), верна ли
> математика замера И вердиктов (computation), корректны ли конфиги (config).
>
> Промпт самодостаточен: стартовая фактура — §2 (карта) и §5 (worked-examples).
> **Факты — на 2026-07-18; перепроверяй против живого дерева** (метрики/строки
> дрейфуют — предыдущая редакция этого промпта устарела за неделю).
>
> **Прошлый полный прогон УЖЕ БЫЛ:** 2026-07-12, отчёты
> `.claude/benchmark-harness-{audit,remediation}-2026-07-12.md` — классы F1-F6 +
> S1-S5 НАЙДЕНЫ И ЗАКРЫТЫ (§2.4). Свежий прогон **не перелитигирует закрытое без
> нового сигнала** — фокус на слоях, появившихся ПОСЛЕ: matcher-bench, deck-пайплайн
> (вердикты/GRID), warm-свипы, interleave, CI-воркфлоу, env-штамп.
> **Прогон 07-18 СОСТОЯЛСЯ** (`.claude/benchmark-harness-audit-2026-07-18.md`,
> 50 агентов): 2 flip — ОБА в display-слое деки (K1 table-heap «just to hold its
> routes» на total-app heap; K2 cold-start «+ first paint» на script-CPU) + 20
> сдвигов (K3-K15, G*) + 7 косметики; ячейки эпохи `b1d40f23` здоровы. Секция
> «Опровергнуто верификацией» отчёта — тоже не перелитигировать.
>
> **Companion + ПОРЯДОК:** `.claude/prompts/perf-optimization-deep-analysis.md` —
> код-хант; он **ДОВЕРЯЕТ числам** (карта метрик §2.3 там — общий артефакт).
> Этот промпт их **ВАЛИДИРУЕТ**. **Гоняй ЭТОТ ПЕРВЫМ.** Dimension-находка →
> обнови §2.3 perf-промпта + карту метрик в `/bench-report`/`/perf-optimize`
> скилах. Пер-сценарные причинные находки — в трекаемый ledger
> `benchmarks/cross-router/SCENARIO-LAG-ANALYSIS.md` (confidence + cause-class),
> харнесс-находки — в отчёт §8.

---

## 0. Роль и режим

Ты — **инженер-метролог**, проводящий независимую поверку измерительного стенда
зрелого бенча. Ценность — **не описать харнесс, а доказать/опровергнуть, что он
мерит то, что заявляет**. Родословная (§2.4/§5): метрики этого бенча УЖЕ мерили не
ту величину (retained вместо gross; CPU вместо wall; script-only с 24×
undercount async-движков) и **переворачивали конкурентный вывод**; бенч-апп и
экстракция матчера УЖЕ давали ложные кривые (O(N)-шелл #1483; tanstack-deep
false-flat). Находки такого масштаба доживали до случайных обнаружений → поверхность
(~10 метрик × 5 когорт × 12 сценариев × 2 инструмента × дека × CI) требует
СИСТЕМАТИЧЕСКОЙ поверки.

**Дефолт — СКЕПСИС к инструменту, не к rr.** Считай каждую метрику
мискалиброванной, пока не докажешь ИЗМЕРЕНИЕМ. Кривой инструмент компрометирует все
downstream: деку (публичная инфографика!), ledger, конкурентное позиционирование,
решения об оптимизации.

---

## 1. Миссия и главный вопрос

На КАЖДУЮ метрику / сценарий / конфиг / вердикт-правило — вердикт по 4 осям:
1. **Dimension** — мерит ли метрика величину, которую её имя/назначение обещает и
   пользователь реально хочет? (высшая ценность — класс §5)
2. **Fairness** — эквивалентна ли работа поперёк движков? Два подкласса:
   **app-parity** (браузерные аппы; класс #1483/O-13) и **extraction-parity**
   (изолированные матчеры в matcher-bench; класс tanstack-deep).
3. **Computation** — верна ли механика замера (CDP-семантика, settle, warm,
   force-GC, sampling, median/RME) **и математика агрегации** (deck-extract
   verdict/GRID/ratio, ci-summary)?
4. **Config** — резолвятся ли движки честно (PROD dist, minify-паритет, dedupe,
   freshness-гейт, CI-воркфлоу-ручки)?

Итог — отчёт-документ в `.claude/` (§8), находки ранжированы по
**«переворачивает ли вывод»** (flip > сдвиг > косметика).

---

## 2. Карта харнесса (факты-якоря 2026-07-18 — перепроверь)

Каталог: `benchmarks/cross-router/`.

### 2.1 Файлы

| Слой | Файлы | Роль |
|---|---|---|
| Замер | `harness/cdp.mjs` | CDPSession: `Performance.getMetrics` + `HeapProfiler.startSampling/stopSampling` (gross-alloc, include-collected флаги #1417) + force-GC; `installNavMetric` (click→settle wall + `settleGone`) |
| | `harness/measure.mjs` | fresh-context per sample; warmup + K; `measureInterleaved` (round-robin движки в ОДНОМ браузере, ротация порядка — S4 #1460); CPU-throttle параметр (штамп `throttle` в ячейке) |
| Статистика | `harness/stats.mjs` | median / p95 / mean / RME (**rme — уже ПРОЦЕНТ**, не доля) |
| Драйвер | `run.mjs` (ячейка) · `run-all.mjs` (матрица) · `run-subset.mjs` (scoped-подмножество) | vite build+preview (**PROD dist**) → Playwright/CDP → `results/<fw>/<sc>/<eng>.json`; `KNOWN_NA` skip-map (2 записи, #1456) — enforced ТОЛЬКО в run-all (K14 07-18); run-subset — третий писатель results/ с дрейфующим контрактом (env-штамп без cpu/runner — откат O-10; K15) |
| Гигиена | `harness/provenance.mjs` (freshness src>dist → exit 3 + env-штамп `{commit,dirty,dirtyFiles,dirtyCode,distNewestMtime,cpu,runner}` #1459/O-10) · `write-cell.mjs` (`N_MIN=10`, смоук не пишется #1455) · `lint-spec-parity.mjs` (O-13: value-parity 7 копий свип-констант) · `sanity-remeasure.mjs` (#1261 mid-run load) · `rme-gate.mjs` (families: stable≤15 / noisy≤40; ⚠K4 07-18: `isSweep=/@\d+$/` вывел ВСЕ `@N` в report-only c5fe977e — включая НЕ-свиповые cold-start/table-heap/mountMs семейства; 5/13 GRID-строк без armed-гейта) | |
| Сценарии | `scenarios/*.mjs` (12) | cold-start · nav-latency · param-nav · nested-switch · active-links · link-build · wide-config · deep-config · search-param-scaling · table-heap · nav-churn · back-forward; свипы греют realm (`WARM_NAVS=12`, F3 #1453) |
| **Инструмент №2** | `matcher-bench/{run.mjs,matchers.mjs,results.json}` | ИЗОЛИРОВАННЫЙ матчер, чистый Node, µs/match (лог-ось); N_SWEEP [4..256] + DEPTH_SWEEP [3..90]; холдауты: angular-deep (recognizer), mateo (runes) |
| **Отчёт = дека** | `deck/{deck-config.js,deck-extract.mjs,deck-data.json,build-deck.mjs,deck.html}` | `results/`+matcher → `deck-data.json` (DATA/GRID/SWEEP/META) → deck.html; **verdict-математика в deck-extract** (ratio vs fastest rival; классы g≥1.12 / r≤0.88 / y); WHY-блёрбы КУРИРУЕМЫЕ (staleness-класс) |
| CI | `.github/workflows/cross-router-bench.yml` (self-hosted, rme-gate ARMED) · `harness/ci-summary.mjs` (штамп+grid+RME-watch из СВЕЖЕЙ deck-data) | еженедельный снимок; НЕ trend-гейт |
| Пробы-самопроверки | `harness/{f3-warm-validate,settle-symmetry-probe,validate-per-nav-metric}.mjs` | переиспользуй их ПЕРЕД написанием своих |

Ретайрнуто (не ищи): `report.mjs`, `status-tables.mjs`, `REPORT-*.md`, `totalMs`
(всё — `9ea61be9`/#1451; логика при нужде — из git-истории).

### 2.2 Метрики: живые ключи и что они ДОЛЖНЫ мерить (проверяй КАЖДУЮ)

| ключ (живой) | где | заявлено | правильное измерение (проверь!) |
|---|---|---|---|
| `navMsWall` | per-nav (nav-latency/param-nav/back-forward) | **HEADLINE felt** | wall click→DOM-settle, СУММА N навов ÷ N (чистая; single-nav был бы clamp-квантован) |
| `navMsTask` | per-nav + свипы `@N` | **HEADLINE CPU** | ΔTaskDuration — включает микротаски async-движков (script-only их СЛЕПНЕТ — F2, 24× undercount!) |
| `scriptDurationMs` / `blinkMs` | per-nav | ⚠ диагностика | V8-only / Blink-trace; НЕ headline (F1/F2) |
| `allocKBPerNav` | per-nav + search-param (→ deck-карта gc-per-nav) | GC-pressure | **GROSS транзиент** (include-collected флаги!), НЕ retained (#1417); сумма self-sizes ÷ навы |
| `navMsTask@N` | свипы | headline свипа | ОДИН замеренный нав на размер, ПОСЛЕ WARM_NAVS=12 (F3); noisy-класс в rme-gate |
| `navMsWall@N` | свипы, ТОЛЬКО endpoint | felt на endpoint | clamp ~100µs → quantization-noisy, не headline |
| `mountMs@N` | link-build | стоимость монтирования | **wall-clock** (#1418), НЕ ScriptDuration |
| `scriptDurationMs@10` + `fcpMs@10` + `jsHeapMB@10`(+preGc) | cold-start | boot | скрипт-парс+init до первой отрисовки |
| `jsHeapMB@100` | table-heap | retained route-память | JSHeapUsedSize **после force-GC**; N=100 (НЕ @10000 — старая конвенция умерла) |
| `heapDeltaKB` + `scriptMsPerNav`/`blinkMsPerNav` + `navsPerSec` | nav-churn | retained-рост + CPU/нав | Δretained после GC; `navsPerSec` — CONFOUNDED (живой диапазон 2.6k–15k у ВСЕХ; rAF-cap ~121 в харнессе НЕ существует — снят F1-фиксом, якорь устарел 07-18) — читать heap+CPU |
| `µs/match` (matcher-bench) | wide/deep deck-карты | чистый матч | изолированная функция; **браузерные `navMsTask@N` wide/deep остаются в results/, но дека читает ИЗОЛИРОВАННЫЙ** (кроме angular-deep = браузерный холдаут) |

### 2.3 Механика (семантика — легко ошибиться)

- **Settle:** MutationObserver-окно закрывает замер (gap=0); у deep «домой» —
  `settleGone` (исчезновение маркера). Асимметрия settle между движками = класс
  #1466 (angular async-settle красил per-nav) — есть проба `settle-symmetry-probe`.
- **Warm (F3):** каждый sample = fresh context + `page.goto` → V8 в интерпретаторе;
  свипы греют realm 12 in-document навами ДО замеренного. Проверь: cold-floor не
  вернулся (валидатор `f3-warm-validate.mjs`).
- **Alloc (#1417):** `includeObjectsCollectedBy{Major,Minor}GC` ОБЯЗАТЕЛЬНЫ — без
  них сумма деградирует к ≈retained (молча, ~100× занижение).
- **Retained:** force-GC ДО и ПОСЛЕ.
- **PROD dist:** vite → `dist/esm` (scoped `internal-source` невидим);
  freshness-гейт provenance (exit 3) отказывает на stale dist; turbo cache-restore
  пишет СВЕЖИЕ mtime → на CI не ложносрабатывает (проверено 07-18).
- **Вердикты деки:** deck-extract `verdict()` — ratio vs **fastest rival**, классы
  g≥1.12/r≤0.88/y; GRID=endpoint, SWEEP=per-point. Это МАТЕМАТИКА ПОКАЗА — аудируй
  как computation (пороги, min-of-rivals, null-ячейки, KNOWN_NA→null).

### 2.4 Родословная (закрытые прецеденты = классы находок; НЕ перелитигировать)

| Класс | Прецеденты (все ЗАКРЫТЫ) |
|---|---|
| wrong-dimension | #1417 retained→gross · #1418 CPU→wall mountMs · F1/#1451 totalMs мёртв · F2/#1452 script-only false-flat (24×) |
| cold/realm | F3/#1453 свипы мерили интерпретатор (~85% floor'а wide@1000) |
| app-parity | #1483 O(N)-шелл links-апп (фикс view-isolate) · O-13 спек-дрейф (silent point-drop; `lint:bench-apps`) |
| extraction-parity | **tanstack-deep late-binding (07-16): parent-замыкание → fuzzy 2-match → ложный O(1)-флэт; с фиксом O(depth), «deep-лаг rr» был багом бенча** |
| settle | #1466 angular async-settle (фикс sync detectChanges) |
| process | #1326 baseline-strawman · #1261 mid-run load (sanity) · S4/#1460 position-bias (interleave) · S5/#1455 смоук-ячейки (N_MIN) · #1459 stale-dist/provenance |

---

## 3. Мультиагентная методология (fan-out)

### 3.1 Фаза 1 — finder-агенты (параллельно)

- **Метрик-семейства** (по одному агенту): **(a) per-nav wall/task** —
  navMsWall/navMsTask + settle-симметрия; **(b) alloc** — gross-семантика,
  include-флаги, interval 256 B (ВЫДЕЛЕННЫЙ — high-value #1417); **(c) retained** —
  jsHeapMB@100/@10, heapDeltaKB, force-GC точки; **(d) sweep** — warm-механика,
  @N-ключи, quantization, endpoint-конвенция; **(e) mount/boot** — mountMs@N wall,
  cold-start состав.
- **НОВОЕ — matcher-bench extraction-parity:** для КАЖДОГО извлечённого матчера —
  эквивалентна ли работа его браузерному пути? (класс tanstack-deep: замыкание/
  late-binding/чужой happy-path). Холдауты честно N/A?
- **НОВОЕ — deck/агрегация:** verdict-пороги, min-of-rivals, null/KNOWN_NA-ячейки,
  GRID-endpoint vs SWEEP-точки, META-штамп; **WHY-блёрбы vs свежие данные**
  (staleness: кратности в блёрбах против deck-data).
- **Сценарии-parity** (per-nav / sweep / memory / link / boot): эквивалентная
  работа app'ов, реальный workload, lazy-confound.
- **Драйвер/гигиена:** interleave-ротация, N_MIN, KNOWN_NA (skip≠fail), provenance,
  sanity-remeasure, rme-gate families.
- **Config/CI:** vite-резолюция, dedupe, tsconfig; воркфлоу-ручки (armed rme,
  BENCH_RUNNER, node-cache, salvage-if).

Каждому: §0-скепсис + §2 + §4-рубрики + §5 + требование `file:line`,
вычислительной трассировки, вердикта.

### 3.2 Фаза 2 — adversarial verify + cross-validation

Скептик на каждый кандидат, задача ОПРОВЕРГНУТЬ. **≤2-3 несущих кандидата на
finder** (двигает РАНГ или ВЕЛИЧИНУ). Плюс сигнатуры §4.4. Load-bearing —
перепроверь САМ прогоном (пробы §2.1 переиспользуй).

### 3.3 Фаза 3 — completeness-критик

«Что НЕ проверили? Имя ↔ измерение расходится где-то ещё? Извлечённый матчер,
делающий меньше работы? Вердикт-правило, искажающее показ? Блёрб, отставший от
данных?»

---

## 4. Рубрики

### 4.1 Dimension-correctness (высшая ценность)
Имя/подпись метрики — ОБЕЩАНИЕ; сверь с вычислением и с тем, что ощущает
пользователь. Три разошлись → находка-flip.

### 4.2 Fairness: app-parity И extraction-parity
Та же работа поперёк движков: роуты/Link-паттерн/read-pattern/глубина (аппы) И
эквивалентность изолированного матчера его браузерному поведению (matcher-bench).
Отличай «rr медленнее» от «бенч дал конкуренту пропустить работу» и от «экстракция
дала конкуренту ЛОЖНУЮ лёгкость» (tanstack-deep). `_baseline` — честный floor
(#1326)? Спек-константы в синке (`pnpm lint:bench-apps`)?

### 4.3 Computation: замер И агрегация
CDP-событие/метрика верные; settle закрывается тем, чем заявлено; warm достаточен;
окно = N навов; force-GC в точках; median/RME (rme — процент!). Плюс дека:
verdict/ratio/классы/null-политика; ci-summary читает СВЕЖЕЕ (не committed).

### 4.4 Statistical-signature cross-validation
retained — стабильна (rme~0); wall ≥ CPU (⚠ у single-nav свипов task>wall —
внеокно-довесок K9, НЕ нарушение); gross-alloc ≫ retained-рост и коррелирует
с GC; `navsPerSec` НЕ frame-capped (2.6k–15k; кэп-сигнатура устарела 07-18); `@N`-свипы — noisy
by-quantization (это НЕ нестабильность); µs-матчер — лог-ось, форма кривой
инвариантна железу. Нарушение подписи = red flag даже при «верном» вычислении.

### 4.5 Config/resolution/CI
PROD dist оба движка; minify-паритет; dedupe фреймворка; freshness-гейт живой;
env-штамп честный (cpu/runner); CI: armed-rme условия, salvage-if, committed-дека
не перезаписывается (O-3).

---

## 5. Класс «инструмент врёт» — worked examples (шаблоны находки)

**#1417 — `allocKBPerNav`: retained → GROSS.** «GC-pressure» мерил остаток, не
мусор; retained награждал минималистов → rr «проигрывал». Gross → rr флип в
alloc-ЛИДЕРА 1.3-35×. Сигнал: **имя ≠ измеренная величина**.

**#1418 — link-build: ScriptDuration → wall `mountMs`.** CPU-ось слепла на
latency-bound vue-mount (2 ms CPU vs 18-25 ms wall) → wall → rr WIN 4/5. ⚠ Даже
НАПРАВЛЕНИЕ фикса доказывается измерением (владелец корректировал диагноз).

**F2/#1452 — script-only false-flat.** `scriptMs@90` solid-router 0.035 (флэт!) vs
`navMsTask@90` 0.838 — **24× undercount** микротасковой композиции async-движка;
на честной оси конкурент оказался ТЯЖЕЛЕЕ rr. Сигнал: подозрительно-флэтовая
кривая у движка с async-пайплайном.

**tanstack-deep (07-16) — extraction-баг.** Изолированный матчер с late-binding
parent давал fuzzy 2-match → ложный O(1)-флэт → ledger записал «rr deep-лаг».
С честной экстракцией — O(depth), rr wins deep ~25×. Сигнал: **изолированная
кривая класса лучше, чем браузерная у того же движка**.

Шаблон на любую метрику/кривую: (1) что обещает имя? (2) что считает код?
(3) что ощущает пользователь / делает браузерный путь? Разошлись → находка.

---

## 6. Дисциплина (обязательна)

- **Домен-контекст:** CDP-семантика, V8-heap (retained vs transient, force-GC),
  статистика, кросс-фреймворк-честность — иначе не отличишь «баг метрики» от
  «rr реально хуже».
- **Доказывай ИЗМЕРЕНИЕМ, не «очевидно»**; спорную ось гони в обе стороны.
- **Числа — из `results/` + `deck-data.json` + СВОЕГО прогона**, не из прозы
  блёрбов (они курируемые и могут отставать).
- **База защищена:** `results/` = reference n=50 @`b1d40f23`; свои прогоны — n≥12
  same-session С БЭКАПОМ ячейки (run.mjs перезаписывает; n<10 не пишется вовсе);
  sub-ms сравнения — ТОЛЬКО same-session; полный `pnpm build`/матрицу НЕ гонять
  (делегируй владельцу).
- **A/B гигиена:** отдельный worktree; PROD dist (`pnpm -F <pkg> bundle` после
  правки src); тихая машина для sub-ms.

---

## 7. RE-BASELINE императив (критично)

**Метрика-фикс инвалидирует всю историю на ней.** Любая dimension/extraction-находка
ОБЯЗАНА нести: (а) флаг «ре-ран затронутых ячеек + переинтерпретация прошлых
выводов»; (б) апдейт §2.3 perf-промпта + карт метрик в скилах
(`/bench-report`, `/perf-optimize`); (в) правку затронутых **WHY-блёрбов деки** и
записей **ledger** (`SCENARIO-LAG-ANALYSIS.md`) — оба публично-читаемые артефакты
теперь; (г) список решений/issue, чья мотивация меняется.

---

## 8. Формат вывода

**Отчёт документом** `.claude/benchmark-harness-audit-YYYY-MM-DD.md` (рядом с
прогонами 07-12). Пер-сценарные причинные находки — дублируй в ledger
(`benchmarks/cross-router/SCENARIO-LAG-ANALYSIS.md`, формат confidence+cause-class).

```
# real-router — аудит бенчмарк-харнесса (дата)
## TL;DR — [N flip / M сдвигов; какой вывод переворачивается]
## 🔴 FLIP — <метрика/кривая> · <dimension|fairness|computation|config>
   site file:line · заявлено vs измерено vs ощущается · эффект (ранг/дека/ledger)
   · фикс + доказательство · re-baseline список
## 🟡 СДВИГ — искажает величину, не ранг
## 🟢 Подтверждено (с сигнатурой-доказательством)
## Re-baseline / Что НЕ проверили
```

---

## 9. Антипаттерны

- **Не** доверяй имени метрики — сверяй с вычислением (#1417).
- **Не** объявляй «rr хуже», не исключив parity (app И extraction) + dimension.
- **Не** чини направление «по очевидности» — докажи (#1418).
- **Не** оставляй dimension/extraction-находку без re-baseline-флага (§7).
- **Не** перелитигируй закрытые F1-F6/S1-S5/#1466/#1483 без нового сигнала —
  фокус на пост-07-12 слоях (matcher-bench, дека, CI, warm/interleave).
- **Не** лезь в оптимизацию КОДА (это perf-промпт) и **не** раздувай отчёт
  косметикой (flip-находок мало по определению; пусто честнее выдумки).
