Найди пробелы в покрытии стресс-тестами пакета: сопоставь стресс-чувствительную поверхность модуля с каноническим каталогом архетипов эксплуатации и для КАЖДОГО применимого, но непокрытого архетипа сгенерируй дискриминирующий стресс-тест — мутационно провалидированный по `/audit-stress`.

Входные данные:
$ARGUMENTS

Формат аргументов:
- Имя пакета (как в pnpm `-F`) — например `@real-router/core`, `path-matcher`, `@real-router/sources`. Резолвится в `packages/<dir>` (для scoped — отбрось `@real-router/`); анализируется вся стресс-поверхность + существующие `tests/stress/*.stress.ts`.
- Опционально `--scenarios-only` — только матрица пробелов + спецификации сценариев, без написания и мутационной валидации тестов (по умолчанию: спецификация → генерация теста → мутационная валидация каждого → отчёт).

```
/stress-scenarios @real-router/core
/stress-scenarios search-params --scenarios-only
```

---

## Принцип

Покрытие (coverage) НЕ измеряет полноту стресс-набора: пакет может иметь 100% line/branch и десяток зелёных стресс-тестов, и при этом целая ось эксплуатации (concurrency-гонка, teardown-mid-op, ReDoS, рост кэша, backpressure) не покрыта ничем — coverage зелёный, потому что функциональные тесты исполняют те же строки на «здоровом» входе при N=1, без состязания и без враждебного входа.

Стресс-тест защищает не строку, а **режим эксплуатации** под нагрузкой / состязанием / враждебным входом / churn'ом жизненного цикла. Цель скилла: перечислить все режимы, которым подвержен модуль, и для каждого непокрытого — родить дискриминирующий тест.

Двойная планка качества (иначе скилл генерирует театр):
1. **ПОЛНОТА** — каждый применимый архетип покрыт (или явно помечен N/A с причиной).
2. **ДИСКРИМИНАЦИЯ** — каждый рождённый тест мутационно доказан ещё до приёмки (протокол — Шаг 4.4). Тест, не падающий на смоделированном отказе, — не покрытие, а шум: переделай тип ассерта или удали. **Покрыть пробел недискриминирующим тестом ХУЖЕ, чем оставить пробел** — он создаёт ложное ощущение защиты.

**Третья планка — СКЕПСИС (важнее обеих).** Стресс-тест существует НЕ чтобы зафиксировать текущее поведение, а чтобы НАЙТИ баг, регрессию или место оптимизации. Относись к коду максимально враждебно: для каждой поверхности сформулируй КОНКРЕТНУЮ гипотезу, как код УЖЕ ломается или неоптимален на масштабе/враждебном входе, и СНАЧАЛА проверь её на РЕАЛЬНОМ коде (Шаг 1.5) — не на гипотетической мутации. Падение на ТЕКУЩЕМ коде — это твой главный результат (REPORTED-BUG → фикс), ценнее любого green-теста. Мутация (Шаг 4.4) валидирует ДИСКРИМИНАЦИЮ теста; скептическая проба (Шаг 1.5) ищет УЖЕ существующий баг. Если тест зелёный с первого прогона и просто пиннит вывод текущего кода — ты, скорее всего, использовал стресс не по назначению: вернись и спроси «что здесь сломается, чего автор не предусмотрел?».

База доктрины — корневой `CLAUDE.md` («Heap-threshold stress tests MUST have proven discriminating power») и `packages/core/tests/stress/README.md` (taxonomy ассертов + три структурные ловушки). Протокол мутационной валидации (Шаг 4.4) переиспользуется из `/audit-stress`.

## Шаг 0 — Прочитай документацию пакета и классифицируй его природу

**Сначала прочитай `packages/<dir>/CLAUDE.md` (+ `INVARIANTS.md`, `ARCHITECTURE.md`, если есть) и `packages/core/tests/stress/README.md`.** Рациональ для ОТСУТСТВУЮЩЕГО стресс-покрытия часто уже задокументирован в самом пакете — уважай это решение, не релитигируй. Пустой/отсутствующий `tests/stress/` — НЕ автоматически «всё пробелы».

Применимость архетипа зависит от того, ЧТО пакет содержит. Не навязывай stateful-архетипы чистым функциям и наоборот:
- **Чистые функции** (path-matcher, search-params, type-guards, route-tree): нет состояния, подписок, async, таймеров → применимы оси **C, D, J, K**. Оси A/B/E/F-async/G/H/I — **N/A**.
- **Stateful / реактивные / async** (core, sources, rx, плагины, адаптеры): применимы **все** оси A–K в зависимости от поверхности (Шаг 1).

**Жёсткий фильтр применимости (применяй ДО объявления пробела).** Архетип — пробел ТОЛЬКО если дискриминирующий тест реально возможен И ещё не покрыт. Это НЕ пробел (пометь `N/A` с причиной), когда:
1. **Структура ограничена** (hard-cap: `|states|×|events|`, deps-store ≤100, LRU=N, last-write-wins → одно поколение) → max-утечка ниже шумового пола → heap нечего отличать; а cap/cleanup-инвариант обычно уже несёт property/unit-тест.
2. **Поведение под churn ридит ТОТ ЖЕ путь, что уже мутационно-валидированный property/unit-тест** (напр. рост `#listeners` = тот же код, что reuse-correctness инвариант) → стресс-тест избыточен.
3. **Объекты транзиентны → GC-masked** (rest-args, временные DTO) → это GC-pressure/throughput, владение у `tests/benchmarks/`, не у стресса.
4. **Синхронный, однопоточный** → нет async/concurrency-поверхности (оси B / F-async / G / H — N/A).
5. **Решение задокументировано** в CLAUDE.md пакета («No stress tests — intentional, not a gap») → не предлагай, не релитигируй.

Канонические примеры ОПРАВДАННОГО отсутствия (НЕ пробелы): **`fsm`** — всё ограничено (`#listeners` bounded-by-peak и ридит reuse-property; `#actions` hard-capped; send-args GC-masked; синхронный; единственный unbounded-путь — misuse `on(undeclaredFrom)` — это guard-кандидат, не стресс-тест) — и **`logger`** — singleton с фиксированным набором полей, нет растущих коллекций/подписок/таймеров. Оба документируют это явно в CLAUDE.md. Анализируешь такой пакет → отчёт = «N/A по всем осям, причина: <…>», ноль сгенерированных тестов — это валидный, правильный результат, а не недоработка.

**Зрелость модуля калибрует ОЖИДАНИЯ (но не строгость).** На ЗРЕЛОМ пакете с обширным functional+stress (как `core` — единственный крупный модуль; остальные в несколько раз меньше) ожидай МАЛО пробелов: бóльшая часть работы — доказать, что кандидат избыточен/N-A, а не родить тест; таймбоксируй sweep, не выдумывай пробел ради числа. На НОВОМ модуле с пустым `tests/stress/` — наоборот: пустота тут означает «не начато», и каждый применимый (по фильтру) архетип = реальный пробел; не списывай в N/A из усталости. «Ноль тестов — валидный результат» относится ТОЛЬКО к пакетам, где архетипы генуинно N/A (fsm/logger), НЕ к новому непокрытому модулю.

## Шаг 1 — Картируй стресс-чувствительную поверхность из `src/`

Прочитай `src/**`. Каждый сигнал ниже → семейство архетипов, которое ОБЯЗАНО иметь покрытие:

| Сигнал в `src` | Семейство архетипов (оси) |
| --- | --- |
| мутабельное состояние / `Map` / `Set` / кэш, растущий по динамическому ключу | (A) утечка, (I) рост кэша, (C) масштаб |
| подписки / listeners / `EventEmitter` / `addEventListener` | (A) listener-churn, (B) destroy-during-notification, (E) teardown, (H) fan-out/ordering |
| `async`/`Promise`/`AbortController`/generation-счётчик | (B) гонки, in-flight cancel, abort-leak, (F) unhandledRejection |
| таймеры (`setTimeout`/debounce/throttle) | (H) timer-churn, (E) timer-cleanup-on-stop |
| lifecycle: `start`/`stop`/`dispose`/`teardown`/`unsubscribe` | (E) teardown-mid-op, start/stop churn, dispose-completeness |
| обработчики внешних событий (`popstate`/`hashchange`/navigate/`storage`) | (G) переплетение внешних событий |
| рекурсия / обход дерева / unwind в `finally` | (D) deep-nesting no-overflow, (J) done-set/recursion-depth recovery |
| `RegExp` на недоверенном входе | (J) ReDoS-sentinel |
| парсер/билдер недоверенного URL/query | (D) патологический вход, (J) анти-квадратичность, (K) аллокация |
| структура с жёстким cap (history maxLength, LRU, deps-store ≤100) | (I) cap-bounded — **count-инвариант, НЕ heap** |
| hot-path аллокация (per-render / per-nav / per-match / per-emit) | (K) аллокация на горячем пути |
| producer/consumer, async-iterator | (H) backpressure |

Выход шага: список применимых архетипов с привязкой к конкретному месту `src` (файл/символ), который их порождает.

**Эвристика приоритета охоты:** сравни имена `src/`-модулей с именами `tests/stress/*` — модули БЕЗ одноимённого стресс-файла дают наибольший выход (там архетипы чаще вообще не покрыты). Так на `core` нашлась поверхность `utils/` (`serializeState`, `getStaticPaths` — 0 stress, при этом реальный баг). Для маленьких пакетов (большинство) вся поверхность влезает в один проход, но эвристика всё равно экономит время и обязательна для крупных.

## Шаг 1.5 — Скептическая проба РЕАЛЬНОГО кода (ищи баг ДО написания регресс-теста)

Для каждой применимой поверхности сформулируй враждебные гипотезы «как это УЖЕ ломается/тормозит» и проверь их на ТЕКУЩЕМ src **до** написания guard-теста. Типовые вектора:

- **Arg-limit спреда:** `arr.push(...big)` / `fn.apply(null, big)` / `Math.max(...big)` бросают `RangeError: Maximum call stack size exceeded` при ~124k+ элементов (V8, Node 24). Любой spread от данных неизвестного размера — кандидат. (Реальная находка: `getStaticPaths` падал на секции из >124k статических маршрутов.)
- **Скрытый O(N²):** `includes`/`indexOf` в цикле; `[...acc, x]`/`acc.concat` на аккумуляторе; пере-парс/пере-обход на итерацию.
- **Рекурсия без итеративной защиты:** обход дерева/структуры на недоверённой глубине → переполнение стека.
- **Unbounded рост:** `Map`/`Set`/массив по динамическому ключу без cap/cleanup.
- **Пропущенный класс входа:** экранирование/валидация покрывает НЕ все опасные значения (символ, формат, поколение, граничный юникод).
- **Окно гонки:** мутация коллекции во время dispatch/await; supersede/abort на полпути.

Проба = минимальный прямой запуск (node-скрипт / разовый vitest) на РЕАЛЬНОМ src, на масштабе/входе, которого functional-тесты не достигают. Падает на текущем коде → **реальный баг** → TDD Red→fix→Green, changeset для public consumer, веди как REPORTED-BUG (это лучший исход прогона). Держится → переходи к Шагу 4: регресс-тест охраняет уже проверенную тобой границу.

**Граница пробы должна быть ОБОСНОВАННОЙ, не заниженной.** Скепсис ≠ занижение порогов. Баг/утечку подтверждай реальным лимитом (engine/spec — как 124k у spread; измеренный healthy-дельта), точку оптимизации — **бенчмарк-пробой** (до/после в `tests/benchmarks/`), а не догадкой. Искусственно заниженный порог, фабрикующий фейковую проблему, — анти-цель: это не охота за багом, а генерация шума. Найти реальный баг/утечку/оптимизацию — отлично; занизить границу, чтобы «что-то нашлось», — плохо.

## Шаг 2 — Канонический каталог архетипов

Выжимка из изучения всей стресс-базы репозитория. Для каждого архетипа: **абьюз-паттерн** (реальный режим эксплуатации) · **триггер применимости** · **механизм дискриминации** (как тест не вырождается в театр) · **эталон** в репо.

### (A) Память / утечки

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| listener-churn | N×subscribe→unsubscribe; триггер — любой стор подписок | COUNT net-zero (added===removed) или heap genuine-linear; `core/event-listener-memory`, `event-emitter/subscription-churn`, `sources/listener-set-integrity` |
| dynamic-key record cleanup | on/off по 200k уникальных имён; триггер — `Map` по динамическому ключу | heap genuine-linear: запись удаляется при `size→0`; `event-emitter/event-emitter` (#750) |
| interceptor/extension accumulation | N×add→remove обёрток/расширений; триггер — wrap/extend с cleanup | heap genuine-linear (~1.7MB при поломке vs ~106KB healthy); `core/plugin-lifecycle-memory` |
| eager-subscription leak | много рефов на один cached-source; триггер — eager-подписка вверх по потоку | WeakMap GC-eligible на dispose; `sources/eager-subscription-leak`, `rx/lifecycle-leak` |
| abort-controller leak | abort-listener на `signal` не снят на `complete()`; триггер — `addEventListener` на AbortSignal | COUNT released; `rx/lifecycle-leak`, `navigation-plugin/abort-controller-leak` |
| dual-subscription teardown | обе подписки сняты на ЛЮБОМ терминале (complete/error/unsub); триггер — оператор notifier+source | `rx/takeuntil-lifecycle` |
| long-run stability | 10k+ навигаций/циклов, heap к baseline; триггер — per-op состояние | heap genuine-linear при N≥порога; `sources/long-run-leak`, `core/navigation-memory` |
| state-retention per-op | удержание State/entry на операцию; триггер — core/плагин держит per-nav | heap genuine-linear **только при N≥20k** (иначе сигнал в шуме); `core/guards-stress` S5.3 |

### (B) Конкурентность / гонки

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| concurrent-supersede | N параллельных операций, выигрывает последняя, прочие отменяются; триггер — отменяемая async-операция | инвариант: ровно один success + точный счёт CANCELLED; `core/fsm-transitions` S8.2 |
| in-flight cancellation | stop/dispose/new-op прерывает текущую; триггер — AbortController-backed async | promise rejects (НЕ молча success); `core/dispose-completeness` S4.3 |
| destroy-during-notification | listener зовёт destroy()/unsubscribe() во время dispatch; триггер — emit-цикл по мутабельному Set | итерация безопасна (snapshot); `sources/destroy-during-notification`, `rx/subscription-storm` |
| generation-guard async | N параллельных back()/go() с async-guard; поздний отказ не откатывает чужое поколение; триггер — generation-счётчик + async guard | `memory-plugin/generation-guard-async` |
| two-writer atomicity | replace во время активной навигации = no-op; два писателя в общий `history.state` не рвут друг друга; триггер — общее изменяемое состояние | `browser-plugin/replace-vs-navigate`, `core/replace-atomicity` |
| pending-key handshake | traverse/navigate гонка; pendingKey очищен до следующей операции **даже на throw/cancel**; триггер — handshake через pending-ключ | `navigation-plugin/traverse-evicted-key`, `concurrent-traverse` |
| mid-execution self-removal | guard/listener снимает себя во время своего исполнения; триггер — self-mutating callback | удалённый перестаёт срабатывать, выживший продолжает; `core/guard-removal` S20.2 |
| factory-last-wins | 2 инстанса от одной фабрики; событие доходит до последнего стартовавшего; триггер — общее состояние фабрики | `browser-plugin/factory-instance-cleanup` |
| captured-meta cancel | отменённая транзакция не оставляет stale meta для следующей; триггер — per-transition захваченное состояние | `navigation-plugin/captured-meta-cancel`, `mixed-duration-guards` |

### (C) Масштаб / пропускная способность

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| operation churn linear | 1k–20k операций, heap bounded + correctness финального состояния | heap throughput + PARITY на финале; `core/navigation-memory` |
| trie/tree scaling | 500–10k маршрутов + deep/wide дерево; build+match без drop/alias | TIMING <~1ms/pair + correctness; `core/route-tree-scaling`, `path-matcher/registration-scale` |
| wide-breadth N-distinct | N уникальных ключей register/parse без drop/merge/alias | correctness **sampled every Kth** + catastrophe-ceiling; `search-params/parse-scale` (50k), `type-guards/serializable-scale` (300k) |
| listener fan-out | N listeners × M events = точно N×M вызовов; триггер — широковещание | PARITY точный счёт; `core/navigate-to-not-found` S12.3, `sources/cross-source` |
| predicate hot-path | 10k+ `isActiveRoute`/`areStatesEqual`/`shouldUpdate`; триггер — предикат на каждый transition | TIMING < X µs/call + детерминированный split count; `core/is-active-route`, `hot-path-utilities` |
| CRUD under nav | add/remove/update/clear 3k циклов; `has()`/config проверены per cycle | PARITY per-cycle + heap throughput; `core/route-crud` |

### (D) Враждебный / патологический вход

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| malformed-encoding flood | 15k невалид-UTF-8 `%`-последовательностей; триггер — percent-decode недоверенного | 0 throws + все → `undefined`; `path-matcher/decode-safety` |
| multi-MB / massive-count | 5MB значение / 100k params / 100k повторов ключа; триггер — парсер недоверенного URL | `not.toThrow` + bounded **correct** output (length+sampling); `search-params/pathological-input` |
| corrupted / exotic state | null/partial/proto-polluted/Map/Symbol как внешний state; триггер — потребление внешнего объекта | URL/fallback корректен + нет prototype pollution; `browser-plugin/corrupted-state-storm`, `exotic-state` |
| fragment/separator leak | `?q#frag` × 30k — фрагмент не утекает в значение param; триггер — парсинг query | равенство значения + scan на `#`; `path-matcher/fragment-strip` |
| circular reference | прямой+непрямой цикл; триггер — рекурсивный сериализатор/валидатор | throw `TypeError` (не `RangeError`); `sources/canonical-json-pathological`, `type-guards/serializable-scale` |
| deep-nesting no-overflow | 500k-глубокая цепочка; триггер — рекурсивная структура на недоверенном | итеративный обход, **нет `RangeError`**; `type-guards/serializable-scale`, `route-tree/build-scale` (1000-level) |
| DAG-shared subtree | 100+ ссылок на один объект; триггер — done-set vs on-path | не ложный цикл + линейно; `sources/canonical-json`, `type-guards` diamond |

### (E) Жизненный цикл / teardown

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| dispose-completeness | create→dispose ×100; после dispose мутации throw, in-flight cancel | **GC-masked → НЕ heap-as-leak**, а functional reject-checks + heap throughput; `core/dispose-completeness` |
| plugin-lifecycle churn | N×usePlugin/unsubscribe; hook не срабатывает после detach | PARITY: hook-count после detach; `lifecycle-plugin/plugin-churn`, `core/plugin-lifecycle-memory` |
| start/stop churn | 8k start/stop; `isActive` корректен, listener net-zero, onStart/onStop точный счёт | COUNT + PARITY; `core/stop-start-cycles`, `*/start-stop-churn` |
| teardown-mid-nav | unsubscribe во время in-flight навигации; claim освобождён, поздний onSuccess no-op, без `console.error` | инвариант на отсутствие позднего эффекта; `{memory,browser,hash,navigation}-plugin/teardown-mid-nav` |
| factory-reuse | одна фабрика → 50 инстансов; изоляция per-instance | PARITY изоляции; повсеместный `factory-reuse` |
| timer/listener cleanup-on-stop | stop при pending hover/timer → таймер отменён, listener снят | COUNT/инвариант на отсутствие срабатывания после stop; `preload-plugin/plugin-lifecycle` |
| partial-rollback on factory-error | фабрика бросает на середине → claim освобождён, переригистрация успешна | PARITY: повторная регистрация ОК; `ssr-data-plugin/loader-error-handling` |

### (F) Ошибочные пути

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| error-storm recovery | 500×CANNOT_ACTIVATE/SAME_STATES/ROUTE_NOT_FOUND; FSM остаётся READY | точные счётчики + готовность к след. операции; `core/error-path-storm` |
| error fan-out | 10 плагинов × 500 onError, каждый ровно 500 | PARITY точный счёт; `core/error-path-storm` S11.5 |
| listener/hook throw isolation | бросающий listener/hook не валит транзакцию, прочие исполняются | инвариант изоляции; `core/event-depth`, `lifecycle-plugin/rapid-lifecycle-hooks` |
| loader-rejection / sync-throw | loader reject/throw → корректно через Promise; mixed concurrent | `Promise.allSettled` исходы; `ssr-data-plugin/loader-error-handling` |
| factory-throw retry | бросающая фабрика не кэшируется, ретраится каждую операцию | PARITY: N навигаций → N вызовов фабрики; `lifecycle-plugin/rapid-lifecycle-hooks` |
| error-handler exception isolation | `next()` throws → `error()` called; `error()` throws → swallowed, non-terminal | `subscription.closed===false`; `rx/error-cascade` |
| unhandledRejection no-leak | late-rejection / never-settling / abort | guard на отсутствие unhandledRejection; `ssr-data-plugin/inject-deferred-scripts`, `rx/lifecycle-leak` |
| recursion-depth recovery | overflow до MAX_DEPTH → ошибка; **легальная рекурсия работает после** | poison-recovery probe; `event-emitter/recursion-recovery`, `core/event-depth` |

### (G) Переплетение внешних событий

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| popstate/hashchange storm | 50–200 быстрых событий → дедуп, последний выигрывает, intermediates dropped | финальное состояние = последняя цель; `{browser,hash}-plugin/popstate-storm` |
| navigate-event serialization | Navigation API intercept сериализует; последний выигрывает | `navigation-plugin/navigate-event-storm` |
| event↔navigate interleave | внешнее событие racing programmatic navigate → state↔URL consistency | PARITY state↔URL; `*/popstate-navigate-interleave`, `event-navigate-interleave` |
| event-during-recovery | popstate во время replaceState-recovery → deferred queue, no wedge | инвариант на отсутствие зависшего `isTransitioning`; `browser-plugin/popstate-during-recovery` |
| event-during-teardown | событие после stop → игнорируется, state pinned | `navigation-plugin/teardown-navigate` |

### (H) Backpressure / pipeline

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| async-iterator backpressure | producer 500 emissions за один await → consumer получает ≤k (latest-wins) | consumer.length ≤ k (не «получил хоть что-то»); `rx/async-iterator-backpressure` |
| notification ordering | все подписчики получают каждое событие; snapshot consistent; dedup корректен | точные счётчики на источник; `sources/notification-pipeline` |
| operator-chain dispatch | 9 операторов × 1000 значений все доходят; 50 concurrent pipelines изолированы | PARITY всех значений; `rx/operator-chain-depth`, `concurrent-pipelines` |
| debounce-timer churn | 1000 sync emit → 1 debounced (последний); error чистит таймер | **fake timers** (детерминирован, не флакает) — оставить как есть; `rx/debounce-timer-churn` |

### (I) Рост кэша по динамическому ключу

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| unbounded-by-design | N уникальных ключей → N записей (leak-by-design) + per-key идемпотентность | **PARITY (size===N для уник, ===1 для повторов), НЕ heap**; `sources/active-route-source-cache-growth`, `ssr-data-plugin/defer-registry-growth` |
| LRU-bounded | N уникальных → только `cap` записей | **COUNT cap, НЕ heap** (max-утечка < heap-порога); `preload-plugin/memory-leak` (STATE_CACHE_LIMIT=32) |
| dispose GC-eligibility | кэш per-router освобождается на dispose (WeakMap) | WeakRef-проба; `sources/should-update-cache-growth` |

### (J) Алгоритмическая сложность / ReDoS / backtracking

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| exponential-fork memoization | K последовательных optional → O(2^K) без memo; триггер — fork-расширение | wallclock-ceiling ~500ms (~500× healthy, ~15× ниже broken) + correctness; `path-matcher/optional-expansion` (K=26) |
| ReDoS sentinel | adversarial near-limit **FAIL-кейс** (полный скан); триггер — `RegExp` на недоверенном | ceiling ~1000× healthy; мутация = уязвимый regex виснет; `type-guards/route-name-redos` |
| done-set linear traversal | 1k-level diamond (2^1000 unfolded vs 1001 nodes); триггер — обход с разделяемыми узлами | < 800ms + correctness; `type-guards/serializable-scale` S3 |
| anti-quadratic membership | `Set.has` O(1) vs `array.includes` O(n); 50k declared×input; триггер — членство в цикле | ceiling 300–500ms (20–33× healthy, 7.5× ниже broken); `path-matcher/pathological-input` strict, `route-tree/validate-scale` |
| backtracking-at-scale | splat-fallback 50k; триггер — backtracking-ветка | per-op correctness (`rest===remainder`, не `startsWith`) + per-op ceiling; `path-matcher/splat-backtrack` |

### (K) Аллокация на горячем пути

| Архетип | Абьюз-паттерн · триггер | Дискриминация · эталон |
| --- | --- | --- |
| per-iteration alloc O(1) | splat childParams / query merge не накапливает per-op; триггер — аллокация в hot-loop | per-op ceiling + correctness; `path-matcher/splat-backtrack` |
| buildUrl/closure alloc | 30k buildUrl/закрытий; триггер — аллокация per-render/per-call | heap throughput GC-masked; `browser-plugin/buildurl-allocation` |
| state-factory churn | 10k makeState/buildState уник params; триггер — фабрика состояния per-nav | heap throughput + correctness per-call; `core/state-factory-stress` |

## Шаг 3 — Матрица пробелов

Прочитай `tests/stress/*.stress.ts` пакета. Для каждого применимого архетипа (Шаг 1 ∩ Шаг 2) отметь:

- **COVERED** — есть тест, и он дискриминирует (по `/audit-stress`).
- **FALSE-COVER** 🚩 — тест есть, но классифицируется как NO-CRASH-театр / TAUTOLOGY / heap-на-GC-masked-петле / heap-при-hard-cap. **Считать пробелом**: недискриминирующий тест не защищает режим. (Не чини его здесь — это работа `/audit-stress`; здесь он лишь делает архетип «непокрытым».)
- **GAP** — применим, теста нет.
- **N/A** — неприменим к природе пакета (Шаг 0). Указать причину, не оставлять молча.

Вывод: таблица `ось | архетип | применим? | покрыт (дискриминир.?) | вердикт (COVERED/FALSE-COVER/GAP/N/A)`.

Если `--scenarios-only` — на этом останови, добавив спецификации сценариев для всех GAP/FALSE-COVER (имя файла/теста, абьюз-паттерн, N, тип ассерта, helper'ы) и заверши.

## Шаг 4 — Генерация недостающего сценария + мутационная валидация

Для каждого GAP/FALSE-COVER:

### 4.1 Выбери ПРАВИЛЬНЫЙ тип ассерта под архетип (анти-театр на этапе рождения)

| Класс архетипа | Ассерт, который ДИСКРИМИНИРУЕТ | Анти-паттерн (НЕ рождать) |
| --- | --- | --- |
| утечка, живой достижимый объект | heap genuine-linear: `healthy < порог < leak`, запас ≥3× обе стороны | round-MB-догадка; N слишком мал |
| create→dispose loop (GC-masked) | functional: post-dispose мутация throws/rejects; heap — только throughput 8–10× healthy | heap как leak-детектор (петля GC-маскирует) |
| структура с hard-cap | count/`has`-инвариант (cap соблюдён / cleanup произошёл) | heap (max-утечка ниже порога by construction) |
| concurrency-гонка | инвариант ПОСЛЕ гонки (финальный state / parity URL↔state / точный счёт) | `not.toThrow` / «промис разрешился» / «нет console.error» |
| патологический / complexity | wallclock-ceiling 30–1000× healthy + **correctness-at-scale (sampled every Kth)** | ceiling без correctness; `expect` в hot-loop искажает timing |
| exhaustive-transform (escape/encode/sanitize КАЖДОЕ вхождение — security/transform) | «ноль сырых опасных значений в выходе» + точный счёт преобразований против независимого оракула, на входе с N≫1 вхождений | `.toContain(escaped)` (ловит ≥1 — пропускает `replaceAll`→`replace`); вход N=1 |
| ReDoS | ceiling ~1000× healthy на **FAIL-кейсе** (заставляет полный скан) | success-кейс (не провоцирует backtracking) |
| backpressure | consumer получает ≤k из N (latest-wins) | «получил хоть что-то» |
| рост кэша | `size===N`(уник)/`===cap`(LRU)/`===1`(повтор); WeakRef GC на dispose | heap |
| count-leak | net-zero `added===removed` | heap при hard-cap |

### 4.2 Структурные ловушки (не роди невалидируемый тест)

- **GC-masking:** петля create→drop (новый инстанс за итерацию, ссылка отброшена) → per-cycle утечка недостижима на снимке. Heap здесь НЕ дискриминирует — бери functional/count-прокси.
- **Hard-cap:** структура ограничена (EventEmitter ≤10k listeners/event, deps-store ≤100, `Map` last-write-wins → одно поколение, LRU=32) → max-утечка может быть НИЖЕ heap-порога → театр by construction. Бери count/`has`.
- **N-too-low:** сигнал утечки/нелинейности остаётся в KB/sub-ms, ниже шумового пола (~100–300KB heap; ~таймерный jitter) → не отличить от шума. Подними N (runtime <~2s).
- **Correctness-at-scale без sampling:** `expect` на каждой из 50k итераций либо доминирует в timing (убивает throughput-гард), либо отсутствует (нет гарда корректности). Накапливай счётчик расхождений в hot-loop, ассерть `=== 0` ПОСЛЕ цикла; точечные `expect` — только sampled every Kth.
- **Wallclock с тугим запасом** (<~100×) флакает под turbo-контеншном. Либо ceiling ≥100× (catastrophe-guard), либо конвертируй в детерминированный op-count, либо fake-timers.

### 4.3 Напиши тест

Используй helper-примитивы пакета (НЕ изобретай): `forceGC`, `takeHeapSnapshot`, `formatBytes`, `MB`, `measureTime(Async)`, `createStressRouter`, `createFlatRoutes`/`createParamRoutes`/`createDeepRouteTree`, `noopPluginFactory`/`fullPluginFactory` (см. `<pkg>/tests/stress/helpers.ts`). Для чистых пакетов helper'ов часто нет — `performance.now()` + sampled-every-Kth + крупные генераторы входа (как `search-params`/`path-matcher`/`type-guards`). Заголовок теста — правдивый: что за абьюз, какой инвариант, какой класс дискриминации.

### 4.4 Мутационно провалидируй (полный протокол `/audit-stress`)

1. **Измерь healthy:** временно замени порог на `throw new Error("PROBE_<uniq> " + <величина>)`, прогони тест в изоляции 3× серийно (`pnpm vitest run --config vitest.config.stress.mts <file> -t "<name>"`), запиши min/med/max. Откати пробу СРАЗУ.
2. **Смоделируй ИМЕННО тот отказ в `src`**, который тест клеймит охранять: удали `unsubscribe()`/`teardown()`/`clearTimeout()`; удержи ссылку на поколение/состояние за итерацию; ослабь regex (`[\w-]`→`[\w.-]`); замени `Set.has`→`array.includes`; убери memo-Set; убери `try/catch` декодера; замени iterative-обход на рекурсию. Прогони ТОЛЬКО этот тест → ассерт **ДОЛЖЕН упасть**. Откати `src`. `grep`-ом проверь, что мутация/проба не осталась.
   - Ассерт НЕ упал на мутации → тест-театр → вернись к 4.1, смени тип ассерта. **Не принимай.**
   - Ассерт падает на ТЕКУЩЕМ (корректном) коде → это **реальный баг** → СТОП, сообщи, оформи как находку, НЕ прячь ослаблением.
3. **Зафиксируй порог** строго между healthy и смоделированной утечкой/blow-up, запас ≥3× обе стороны (heap) либо ≥100× catastrophe-ceiling (wallclock). Инлайн-комментарий: healthy / leak / порог / почему этот тип ассерта (особенно «throughput-guard, per-cycle проверяется functional-ассертом выше»).

### 4.5 Не плоди дублей

Если архетип уже покрыт дискриминирующим тестом — не генерируй второй. Новый тест должен закрывать РАЗЛИЧНЫЙ архетип или различный класс входа, не быть пере-формулировкой существующего.

## Жёсткие правила

- **Полнота без театра:** не закрывай пробел тестом, который сам не прошёл мутацию (4.4). Пробел лучше ложного покрытия.
- **Каждый рождённый тест несёт свою дискриминацию в инлайн-комментарии** (healthy/leak/порог, либо «throughput-guard + functional-ассерт несёт дискриминацию»).
- **Не роди heap-тест там, где дискриминирует только count/parity** (GC-mask / hard-cap reality). Уважай природу петли.
- **Применимость симметрична:** не навязывай stateful-архетипы чистым функциям. Неприменимый архетип — не пробел: `N/A` с причиной, а не молчаливый пропуск и не натянутый театр.
- **Порог ВСЕГДА ≥3× от макс. наблюдённого healthy** (иначе вводишь новый флак). Timing-ассерты с тугим запасом не роди — конвертируй в op-count или fake-timers.
- **Заголовки правдивы:** убери ложные «heap»/«leak» клеймы там, где это throughput-guard; точные `× N cycles`.
- **`src` трогаешь ТОЛЬКО временно для мутации — откати.** Реальный src-фикс (если 4.4 вскрыл баг) веди ОТДЕЛЬНО, флагни, оформи changeset для public consumer.
- Изменения только в тестах → changeset не нужен. Push/commit не делай без явной просьбы.

## Валидация и отчёт

1. Прогони ПОЛНЫЙ (старый + новый) stress-suite пакета 3× зелёным серийно, напрямую через `vitest.config.stress.mts` (heap-тесты стохастичны — без параллельного контеншна). Property-тесты пакета могут флакать под turbo — это не связано.
2. `grep` на остатки проб/мутаций (`PROBE_`, `MUTANT`, временные `return true`/`if (false)`) в `packages/**/*.ts` — ноль.
3. `git diff` затрагивает ТОЛЬКО `*.stress.ts` (+ при нужде `tests/stress/helpers.ts`) — никаких `src/` (кроме отдельно-веденного реального фикса).
4. **Отчёт — матрица пробелов:** `ось | архетип | применим? | было покрыто (дискриминир.?) | новый тест | healthy/порог | мутация падает? | вердикт`. Вердикты: `COVERED-NEW` (родил и провалидировал) / `ALREADY-OK` (уже дискриминирует) / `FALSE-COVER→NEW` (был театр, заменён) / `N/A-<причина>` / `REPORTED-BUG`. Веди с любым найденным реальным багом.
5. **Итог:** список всё ещё непокрытых архетипов с причиной. Отступление на honest-note оправдано ТОЛЬКО когда генерация дискриминирующего теста принципиально невозможна (поведение обеспечивает другой слой; нет наблюдаемого инварианта на результат) — как в `/audit-pbt`. «Потребовало бы нового генератора/helper'а» — НЕ основание: создай и закрой.

## Замечание

Изменения только в тестах → changeset не нужен. Если 4.4 вскрыл реальный баг и в `src` ушёл фикс → changeset для public consumer (private-пакет → его public consumer). Push не делай без явной просьбы.

## Самокоррекция скила (ОБЯЗАТЕЛЬНО, в конце КАЖДОГО прогона)

Этот файл — живой; каждый прогон обязан его затачивать. После отчёта (Валидация п.4–5) вынеси короткую секцию **«Самокоррекция»** — критику не своей работы, а САМОГО ЭТОГО СКИЛА: где его текст промолчал, соврал, был двусмыслен или избыточен — и это стоило времени, лишнего шага или риска ошибки.

1. **Привязка к ИНЦИДЕНТУ, не общие советы.** Каждая правка — из конкретного момента ЭТОГО прогона: «скил сказал X / промолчал про X → реальность Y → я потерял/чуть не ошибся на Z». Нет инцидента — нет правки (не выдумывай улучшения впрок).
2. **Высокая планка: изменило бы исход?** Предлагай, только если правка реально предотвратила бы ошибку, сократила перебор или сняла двусмысленность, на которой ты споткнулся. Косметику и «было бы неплохо» — отбрасывай.
3. **Разовое ≠ паттерн.** Специфику конкретного пакета (разовую) → в отчёт/память, НЕ в скил. В скил идёт только повторяющийся класс, полезный СЛЕДУЮЩЕМУ прогону на ДРУГОМ пакете.
4. **Сначала заточи, потом дописывай (анти-раздувание).** Предпочитай усиление существующего абзаца новой секции; если правка делает прежний текст избыточным — консолидируй, не дублируй.
5. **Предлагай, не применяй молча.** Выведи кандидатов таблицей (раздел | инцидент | предлагаемый текст), спроси разрешения. Применил по согласию → `.claude/commands/` это infra, в master напрямую, без changeset.
6. **Честность про «нечего править».** Прогон прошёл чисто и скил нигде не подвёл → так и скажи: «правок нет». Пустая самокоррекция честнее придуманной — пункты 1–2 это допускают.
