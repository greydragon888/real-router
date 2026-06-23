Улучши mutation score пакета на основе логов прогона: классифицируй КАЖДОГО выжившего мутанта, убей killable точечными тестами, докажи и точечно подави эквиваленты, не трогая src-поведение.

Входные данные:
$ARGUMENTS

Формат аргументов:
- Путь к пакету (`packages/<name>`) — берёт его `reports/mutation-report.json`
- ИЛИ путь к конкретному `reports/mutation-report.json`
- Опционально:
  - `--report-only` — только классификация + отчёт, без правок (по умолчанию: классификация + правки)
  - `--file <src/...>` — сфокусироваться на одном мутируемом файле
  - `--no-disable` — не добавлять `// Stryker disable` (только убивать killable)

Пример:
```
/mutation-score packages/core
/mutation-score packages/core --file src/api/getRoutesApi.ts
/mutation-score packages/rx/reports/mutation-report.json --report-only
```

---

## Принцип

Mutation score измеряет, **ассертят** ли тесты поведение, а не **исполняется** ли код. Выживший мутант = строка исполнена, но ни один ассерт не падает при её порче. 100% строкового покрытия сосуществует с дырами: `?.`-short-circuit, не-проверенные сообщения, не-наблюдаемые ветки.

Цель — **не гнаться за 100%**. Потолок честного score ≈ 88–92%: значимая доля выживших — **эквиваленты** (мутант не меняет наблюдаемого поведения, убить корректным тестом НЕЛЬЗЯ). Цель: для КАЖДОГО выжившего вынести вердикт (killable / equivalent / suspected-bug / intentional) и действовать по классу. «Закрыть» эквивалент — это `// Stryker disable` с обоснованием ИЛИ документирование, **а не тест-театр** (тест, пиннящий поведение, который пройдёт и со сломанным кодом).

**Скептицизм в ОБЕ стороны.** Чтение кода систематически переоценивает критичность (defense-in-depth даёт эквиваленты) И недооценивает (рутина прячет реальные дыры). Единственный арбитр — **эмпирическая мутация** (ручная инъекция + полный сьют), не рассуждение. Перед объявлением «баг» — проверь design-intent (рядом лежащие тесты, комментарии, issue): сильное «воспроизводимое» подозрение бывает намеренным поведением.

**Третий класс системной ошибки: вердикт «недостижимо публично».** Read-based «эту ветку публично не достать» так же ненадёжен, как read-based «критично/некритично» (урок сессии 2026-06: из 7 вердиктов «недостижимо» **устояло 0** — все либо достижимы через пропущенный механизм, либо мёртвый код, где вход не доходит до ветки). Та же дисциплина: эмпирика (перебор ВСЕХ механизмов + проба покрытия конкретной строки), не аналогия. Даже одна «проверка» обманчива — пробуешь 2 механизма, пропускаешь 3-й; планка — перебор всех вызывающих и всех публичных точек входа.

## Шаг 0 — данные (не доверяй HTML и incremental)

1. **JSON, не HTML.** Stryker встраивает данные в HTML как JS-литерал с конкатенацией строк (`"<"+"Router"`) — это НЕ чистый JSON. Добавь в конфиг `json`-reporter и парси `reports/mutation-report.json` через `JSON.parse`:
   ```js
   reporters: ["progress", "clear-text", "html", "json"],
   jsonReporter: { fileName: "reports/mutation-report.json" },
   ```
2. **Только non-incremental — правда.** Incremental-кэш отдаёт устаревшие статусы (мутант помечен Survived, хотя новый тест его уже убивает). Для прогона по файлам без порчи основного кэша: `--incrementalFile /tmp/throwaway.json` (несуществующий файл → свежий прогон). Для финальной цифры — полный `stryker run` без `--mutate`.
3. **Stryker видит только то, что в его vitest-include** (обычно `*.test.ts`). `*.properties.ts` / `*.stress.ts` ему НЕвидимы — инварианты, проверяемые только там, для Stryker = дыры. Целевые kills клади в `*.test.ts` (или зеркаль ключевые примеры из property).
4. **Агрегация (node-скрипт по JSON):** статусы (Killed/Survived/NoCoverage/Timeout/CompileError/Ignored), формулы `Detected=Killed+Timeout`, `Valid=Detected+Survived+NoCoverage`, `Score=Detected/Valid` (CompileError + Ignored исключены из знаменателя — норма). Сгруппируй survived **по файлу** и **по строке+мутатору** (нужно для точечного disable).

## Классификация выживших (вынеси класс КАЖДОМУ)

1. **KILLABLE** — тест не проверяет наблюдаемый эффект мутации. Чаще всего:
   - StringLiteral в сообщении ошибки / `caller`/`methodName` аргументе → тест есть, но `toThrow(TypeError)` без текста. 🚩
   - structural input-guard → невалидные входы (null/массив/примитив/битое поле) не подаются.
   - алгоритм (segments/ids/diff) → проверяется через `navigate()`, но не через точные массивы.
   - cleanup/one-shot logic → side-effect не считается (spy/membership).
   - validator call-site (`ctx.validator?.ns.fn(arg,"m")`) → в core-сьюте `validator===null`, ветка short-circuit'ится.
2. **EQUIVALENT** — мутант не меняет наблюдаемого поведения; убить корректным тестом НЕЛЬЗЯ. Подклассы:
   - **defensive-redundancy** — инвариант держат ≥2 механизма (concurrency: navigationId + signal.aborted + isActive; cleanup-guard, чей эффект дублирован downstream). 🚩 частый ложный «критический баг».
   - **entangled object-guard** — `→false`-операнд цепочки `a || b || c`, перекрытый соседним операндом/downstream-проверкой; его `→true`-сосед на той же строке **killed**.
   - **fast-path ↔ fallback** — ветка-оптимизация, general-путь даёт идентичный результат (`nameToIDs` fast-paths, `rest.length===0` vs базовый case).
   - **boundary-on-min** (`i<maxI`→`<=`: индекс на min даёт `undefined`, сравнение возвращает тот же индекс), **cache short-circuit** (`if(cached) return` → пересчёт того же), **idempotent merge** (`{...d,...{...d,...p}}`≡`{...d,...p}`), **`length>0`→`>=0`** где 0-случай no-op (emit на 0 слушателей), **`++`→`--`** для уникального id.
3. **LOW-IMPACT** — ObjectLiteral error-metadata (`{routeName}`→`{}`), StringLiteral логов/сообщений, не влияющие на поведение. Killable (assert текст), но ROI низкий.
4. **INTENTIONAL NoCoverage** — `/* v8 ignore @preserve */` defensive; validator-path (валидация opt-in в отдельном пакете); default-параметр (Stryker-артефакт атрибуции `cov=0`). НЕ дыра.
5. **SUSPECTED BUG** 🚩 — мутант указывает на реальную дыру в ЛОГИКЕ (не в тесте). СТОП — см. протокол.

## Эмпирический протокол (арбитр killable vs equivalent)

Для любого неочевидного выжившего (особенно concurrency / cleanup / defensive-guard / «похоже на баг»):

1. **Инъекцируй ровно эту мутацию в src** (по `replacement` из лога: `if(false)`, `===`→`!==`, удали тело блока, `→true`).
2. **Прогони ПОЛНЫЙ сьют пакета.**
   - **Зелёный** → эффект не наблюдается → **EQUIVALENT** (или непокрытый edge — проверь, есть ли наблюдаемый эффект В ПРИНЦИПЕ; если нет — эквивалент).
   - **Красный** → эффект наблюдаем; если сьют уже ловит, а лог говорит Survived → это **incremental-артефакт**, перепрогони non-incremental. Иначе — KILLABLE, пиши тест.
3. **Откати мутацию НЕМЕДЛЕННО.** `grep` по `src/**` на остатки (`if (false)`, `PROBE_`, `MUTANT`, инвертированные операторы) — ноль. Сверь `git diff src` — пусто.
4. **Перед вердиктом «BUG»:** найди design-intent — рядом лежащий тест (`*-cleanup.test.ts`), комментарий, ссылку на issue, stress-коммент. Если поведение задокументировано → это фича, не баг (а survivors — узкий edge задокументированной фичи). Если intent НЕ найден и эффект вредный → **REPORTED-BUG**: СТОП, сообщи, не пиннь поведение и не ослабляй (фикс — отдельной TDD-задачей через `/bugfix`).

## Действия по классу (если не --report-only)

- **KILLABLE** → точечный тест (паттерны ниже). Цель — ассерт на НАБЛЮДАЕМЫЙ эффект, не на исполнение.
- **EQUIVALENT** → точечный `// Stryker disable next-line <mutators>: equivalent — <причина>` (правила ниже). Если entangled — НЕ подавляй, документируй.
- **LOW-IMPACT** → assert текст/метаданные, если дёшево; иначе оставь, отметь.
- **INTENTIONAL** → оставь; опционально `// Stryker disable` чтобы убрать из знаменателя (для v8-ignored / default-param).
- **SUSPECTED BUG** → REPORTED-BUG, СТОП (см. протокол).

## Точечный disable (не слепой, не теряющий покрытие)

- **НЕ** `mutator.excludedMutations` в конфиге — отключает мутатор глобально, теряет десятки честно-убитых того же класса. Только inline.
- Синтаксис: `// Stryker disable next-line <Mutator1,Mutator2>: equivalent — <доказанная причина>`. Причина — обязательна и конкретна.
- **Перечисляй ТОЛЬКО мутаторы, у которых на этой строке НЕТ killed-варианта** (сверь по логу статусы всех мутантов строки). Пример: на строке `if (a !== b)` `EqualityOperator ===` killed, а `ConditionalExpression →false` + `BlockStatement` survived-эквиваленты → подавляй `ConditionalExpression,BlockStatement`, НЕ `EqualityOperator`.
- **Entangled**: один мутатор даёт И killed (`→true`), И survived-эквивалент (`→false`) на одной строке — подавить нельзя (потеряешь `→true`-kill). Оставь survived, задокументируй в аудите.
- **Конфликт с `eslint-disable-next-line`**: Stryker `disable next-line` пропускает строки-комментарии и целит следующую КОДОВУЮ строку — ставь Stryker-коммент ВЫШЕ eslint-коммента. Проверь прогоном, что мутант ушёл в `Ignored`, а eslint не сломался.

## Паттерны kill

- **validator call-site** → spy-валидатор через `getInternals(router).validator = <spy>` (Proxy, лениво создающий `vi.fn()` per-метод). НЕ ставь реальный validation-plugin (цикл зависимостей). Ассертируй `toHaveBeenCalledWith(arg, "caller")` — убивает И context-строку, И логику вокруг вызова. _(Обоснованный white-box — нет чисто-публичной поверхности; см. «Публичный контракт».)_
- **StringLiteral сообщения/caller** → ассерт ТЕКСТА: `toThrow("точный текст")`, `toHaveBeenCalledWith(..., "method")`. `toThrow(TypeError)` без текста НЕ убивает `""`-мутант.
- **structural guard** → через ПУБЛИЧНУЮ границу, где guard живёт: `createRouter([], {}, <badDeps>)` / `getRoutesApi(r).add([<bad>])` / `createRouter([], { logger: <bad> })` — по-одному невалидным входом (null / примитив / массив / битое поле) + текст сообщения. (Guard достижим публично — НЕ импортируй его из `src`; см. «Публичный контракт».)
- **алгоритм (segments/ids)** → ассерт ТОЧНЫХ массивов через ПУБЛИЧНУЮ поверхность: `state.transition.segments.{activated,deactivated,intersection}` после `navigate()` по иерархии 4-5+ уровней. `toStrictEqual` ловит off-by-one / отсутствие reverse / битый slice. Прямой вызов чистой функции из `src` — крайне редкое исключение; СНАЧАЛА исчерпай публичные двери к «внутренним» веткам: `start()` (initial nav) бьёт `fromState===undefined` fast-path; `router.shouldUpdateNode(router.makeState(name, params))` БЕЗ meta-аргумента подаёт meta-less состояния в `getTransitionPath` (его meta-less fast-path + `reverseArray`); `forwardTo` с роута на `/` даёт corner-матчи. В сессии 2026-06 ВСЕ подозреваемые «недостижимые pure-fn ветки» (вкл. `getTransitionPath` FAST PATH 1/3) оказались публично достижимы — прямой вызов не понадобился ни разу.
- **one-shot / cleanup / splice** → ассерт side-effect: spy-счётчик вызова (`toHaveBeenCalledTimes(1)`), membership (`has(name)===false`), длина реестра до/после. Двойной вызов проверяет идемпотентность.
- **reactivation / edge-условие** → сконструируй вход, где условие именно различает (route в `toDeactivate` И `toActivate` одновременно — смена `:param` у предка и т.п.).

## Публичный контракт, НЕ white-box (+ поиск мёртвого кода)

**Убивай мутанта через ПУБЛИЧНЫЙ API, не прямым вызовом внутренней функции.** Импорт `../src/...`, `getInternals`, инстанцирование `*Namespace`-классов, чтение приватных полей в `tests/functional/**` — 🚩. White-box-kill даёт ложную защищённость: (а) пиннит реализацию, не контракт; (б) ассертит **bookkeeping** (внутренняя map/массив/счётчик), а не то, что исполняет система — десинхронизация двух map оставляет тест зелёным при сломанном поведении; (в) обходит wiring — голый namespace + ручной прогон FSM не доказывает, что `navigate()` зовёт пайплайн; (г) **подпирает 100%-coverage-гейт над мёртвым/недостижимым кодом.**

**Перед kill'ом — спроси: достижима ли ветка через публичный API?**
- **ДА** → убей через публичную точку входа (`navigate`/`createRouter([],{},badDeps)`/`buildPath`/`matchPath`/`get*Api`/`state.transition.segments`/throw-контракт `ROUTER_DISPOSED`). Доказывает контракт И убивает мутанта.
- **НЕТ** (никакая публичная точка не достигает/не ассертит эффект) → это **СИГНАЛ МЁРТВОГО / OVER-DEFENSIVE КОДА**, а не повод тестировать напрямую.

**«НЕТ» — высокая планка, доказывается перебором, не аналогией** (урок сессии: 7 из 7 вердиктов «недостижимо» неверны). Прежде чем объявить ветку недостижимой:
1. `grep` ВСЕ вызывающие функцию в `src/**`; для КАЖДОГО — какой публичный API его драйвит и каким входом.
2. Перебери триггер-механизмы, не 1-2: `forwardTo` (роут на `/` → source-mismatch в matchPath), sync-listener зовущий `stop()`/`dispose()` (синхронно абортит internal-сигнал → already-aborted-ветки), `makeState`-без-meta + `shouldUpdateNode` (meta-less пути), `start()` (`fromState===undefined`), `canNavigateTo`. Пробуй КАЖДЫЙ эмпирически (проба + покрытие конкретной строки).
3. Для «защитной» ветки проверь, доходит ли вход ДО неё: upstream-gate (`if (loggerConfig)` отсекает falsy ⇒ `config===null` внутри мёртв) или TS-narrowing вызывающего (`state ? fn(state)`) фильтруют триггер раньше. «Функционально нужная защита» при отсечённом входе = мёртвый код, а не KEEP.

**Достижимость ≠ наблюдаемость.** Ветка может быть публично ДОСТИЖИМА, но конкретная деталь её выхода — нет; это НЕ повод для white-box. Пример: `getTransitionPath` FAST PATH 3 достижим через `shouldUpdateNode(makeState-без-meta)`, но его boolean — по ЧЛЕНСТВУ, не порядку → `reverseArray` ORDER не наблюдаем. Вывод: покрой НАБЛЮДАЕМУЮ часть публично (membership-мутанты killable), а ненаблюдаемую деталь классифицируй EQUIVALENT — ИЛИ удали ненужный transform из src (порядок, который никто не читает → `reverseArray` удаляется целиком). Одна ветка через одну дверь даёт И killable, И equivalent.

**Поиск мёртвого кода (побочный продукт аудита).** Выживший в публично-недостижимой ветке часто = мёртвый код, который white-box-тест держит «covered». Протокол:
1. `grep` вызывающих функцию/параметр/поле в `src/**` по ПУБЛИЧНЫМ путям (исключи тесты и `?.validator`-null-ветку).
2. Только тесты / только validator-path / нет конструирующего кода → кандидат на удаление. Маркеры из аудита: **мёртвый параметр** (`clearCan*(name, origin)` — `origin` без вызывающего), **почти-мёртвое публичное поле** (`RouterError.redirect` — нигде не конструировалось, под него ~30 тестов deep-freeze/circular-ref), **validator-path** (`getHandlerCount` — только через `?.validator`=null), **wrong-arity test-double** (инжект `compileFactory=()=>factory()` vs реальный `factory(router,getDependency)` — DI-контракт не тестируется).
3. Перед удалением — проверь design-intent (как для SUSPECTED BUG: issue/комментарий/история; «зачем добавляли?»). Подтверждено мёртвым → **удали ветку**. **НЕ маскируй white-box-тестом** и предпочитай удаление `v8 ignore`-у. Toolkit упрощения (в порядке предпочтения, все опробованы в сессии — `v8 ignore` НЕ понадобился ни разу):
   - **built-in уже обрабатывает кейс** → удали guard целиком. `Object.freeze(null)===null` (не бросает) ⇒ `if (!state) return state` избыточен; `freezeStateInPlace` = одна строка `return Object.freeze(state)`.
   - **TS требует narrowing, но вход gated-out** → non-null assertion, документирующая инвариант вызывающего (`config!`, `segments.at(-1)!`) + `eslint-disable no-non-null-assertion -- <почему gate гарантирует>`. Это чище `v8 ignore` (конвенция запрещает `@preserve` на guard против TS-инварианта). Пример: `assertLoggerConfig` — `|| config === null` удалён (gate `if(loggerConfig)` не пускает null), `const obj = config!`.
   - **только при реальном TS-defensive без чистого упрощения** → `v8 ignore` (последний выбор).
   Публичное API → changeset + migration note. Перепись white-box→public ОГОЛИТ мёртвый код (coverage/branches упадут) — это нужный сигнал, не регресс; глобально score растёт (мёртвые ветки уходят из знаменателя).

**Обоснованный white-box (редкое исключение, KEEP) держится на СТРУКТУРНОМ барьере, не на «не нашёл публичный путь»:** plugin-internal seam через санкционированный subpath (`hydrationState` via `/validation`), spy-валидатор call-site (избегает цикла зависимостей core↔validation-plugin). Барьер тут — архитектурный (dependency cycle / sanctioned seam), доказуемый, а не «перебрал и не достал». Категория «Stryker-невидимая pure-fn ветка, недостижимая публично» в сессии 2026-06 **схлопнулась в ноль** (functional allowlist 7→0): каждый кандидат либо оказался достижим, либо мёртв. Прежде чем заявить такой KEEP — пройди перебор выше; «недостижимо по перебору» почти всегда значит «мёртвый код».

Полный разбор кейсов: `packages/core/.claude/whitebox-test-audit-2026-06-23.md`.

## Жёсткие правила

- **Тесты ищут баги, не пиннят.** Если мутант эквивалент — `// Stryker disable`, НЕ тест, который «проходит и так».
- **Kill через публичный контракт, НЕ white-box.** Прямой импорт внутренней функции/`getInternals`/namespace-класса ради kill'а — 🚩 запрещён (см. «Публичный контракт»). «Недостижимо публично» доказывай перебором всех вызывающих + механизмов, не аналогией (см. «НЕТ — высокая планка»); подтверждено → мёртвый/over-defensive код (упрости по toolkit; `v8 ignore` — последний выбор), а не повод тестировать напрямую.
- **НЕ ослабляй и не удаляй src ради score** без доказательства мёртвого кода. Мёртвый код (напр. неиспользуемый возврат функции) — удаляй (это валидный kill), но докажи отсутствие потребителей (`grep`).
- **Откатывай ручные мутации немедленно**, `grep` остатки, сверяй `git diff src`.
- **Не гонись к 100%.** После закрытия killable + disable доказанных эквивалентов — СТОП. Остаток (defensive/entangled/low-impact) документируй, не выдумывай театр.
- **non-incremental** для любой финальной/сравнительной цифры.

## Валидация и отчёт

1. Полный сьют пакета зелёный. Если enforced 100% покрытия упало после перевода white-box→public или удаления кода — это ОГОЛЁННЫЙ мёртвый/недостижимый код: упрости его по toolkit (built-in / gated non-null assertion / удаление ненаблюдаемого transform), `v8 ignore` — последний выбор; НЕ возвращай white-box-тест ради покрытия.
2. Lint чистый (disable-комментарии длинные — проверь max-len; eslint-disable не сломан).
3. non-incremental прогон затронутых файлов (`--incrementalFile /tmp/throwaway.json --mutate "<files>"`) → подтверди: killable → Killed, эквиваленты → Ignored, **ни один killed-собрат не пропал** (сверь по строкам).
4. `grep` остатки проб/мутаций в `src/**` — ноль. `git diff src` — только намеренные (dead-code/disable, все no-op для runtime).
5. **Отчёт-таблица:** file | survived было→стало | killed | Ignored | класс остатка | вердикт (CLOSED / EQUIVALENTS-DISABLED / REPORTED-BUG). Веди с любым найденным реальным багом и его доказательством.
6. Обнови `packages/<pkg>/.claude/mutation-audit-*.md` (если есть): новый score, per-file расклад, классификация остатка, любые REPORTED-BUG. Не удаляй историю — добавляй веху.

## Замечание

- Изменения только в тестах → changeset не нужен. Изменения в `src/` (dead-code → `void`, `// Stryker disable`-комментарии) затрагивают публичный пакет → при коммите нужен changeset (даже если no-op для runtime). `stryker.config.mjs` / vitest-конфиги — infra, в master напрямую, без changeset.
- Push/commit не делай без явной просьбы. Финальный полный прогон — дорогой; предложи запустить, не запускай молча в долгом цикле без нужды.
