Создай GitHub issue по шаблону репозитория: проверь дубликаты, оформи заголовок и тело по конвенции, повесь корректные labels.

Входные данные:
$ARGUMENTS

Формат аргументов (всё опционально — недостающее выведи из контекста разговора или спроси):
- Свободное описание проблемы/задачи/фичи
- Можно указать тип (`bug`/`feat`/`perf`/`task`/`docs`/`gfi`), area, priority — иначе определи сам

Репозиторий: `greydragon888/real-router`. Всё содержимое issue — **на английском** (репо англоязычный, все issue на английском).

---

## Шаг 0 — Классифицируй тип

Определи тип по описанию. Тип задаёт **token в заголовке**, **label типа** и **структуру тела** (ближайший .github-шаблон):

| Тип | token в title | label типа | шаблон тела (`.github/ISSUE_TEMPLATE/`) |
| --- | --- | --- | --- |
| Баг | `[bug]` | `bug` | `bug_report.yml` |
| Фича / улучшение | *(нет)* | `enhancement` | `feature_request.yml` |
| Производительность | `[perf]` | `performance` | `feature_request.yml` (+ метрики) |
| Рефакторинг / cleanup / infra | *(нет)* | `enhancement` | `technical_task.yml` |
| Документация | `[docs]` | `documentation` | `docs_migration.yml` |
| Good first issue | *(нет)* | `good first issue` | `good_first_issue.yml` |

> ⚠️ **Шаблоны в `.github/ISSUE_TEMPLATE/` устарели и НЕ отражают реальную практику.** Их заголовки (`[Bug]: `, `[Feature]: `) и эмодзи-лейблы (`💡 enhancement`, `🔧 infra`, `📚 docs`, `🟢 good first issue`) **не используются** — таких labels в репо нет, `gh issue create --label "💡 enhancement"` упадёт. Бери из шаблонов **только структуру секций тела**; заголовок и labels — по реальной конвенции ниже (источник правды — `gh issue list` и `gh label list`).

## Шаг 1 — Определи area и priority

**area** (→ label, см. Шаг 5) — какой пакет/слой затронут: core, react, vue, svelte, solid, plugins, ci/cd, build, npm, tests, benchmarks.

**priority**:
- `critical` — блокирует пользователей, чинить немедленно
- `high` — важно, чинить скоро
- `medium` — обычный приоритет
- `low` — nice to have

Пограничный случай (например, high vs critical) — сначала найди прецедент того же класса дефекта среди closed (`gh issue list --state all --search "<класс симптома>"`), калибруйся по его priority и сошлись на прецедент в теле issue (пример: «start() throws» — #736 critical без adversarial-входа, #738 high на valid configs). Прецедента нет и priority всё ещё неоднозначен — спроси одним вопросом, не угадывай критичность.

## Шаг 2 — Проверь дубликаты (ОБЯЗАТЕЛЬНО до создания)

Извлеки 2–4 ключевых слова (имена API/символов, не общие слова) и прогони **оба** поиска по **open и closed**:

```bash
gh issue list --repo greydragon888/real-router --state all --search "<keywords>" \
  --json number,title,state,labels --limit 20
gh search issues --repo greydragon888/real-router "<keywords>" --limit 20
```

> ⚠️ `gh search issues` has **no `--state all`** (only `open`|`closed`) — passing `--state all` errors out. Omit `--state` to search both. (Only `gh issue list --search … --state all` accepts `all`.)

- Проверяй **и closed тоже**: закрытый как `wontfix`/`duplicate` означает, что вопрос уже решён — не воскрешай его молча.
- Нашёл вероятный дубль/родственника → **покажи его (номер, заголовок, state) и СПРОСИ**, прежде чем создавать. Часто верный ход — не новый issue, а комментарий к существующему или ссылка `parallel to #NNN` / `follow-up of #NNN` в теле нового (так делают реальные issue репо).

## Шаг 3 — Собери заголовок (реальная конвенция)

Формат: **`[<area>][<type>] <concise declarative description>`**

- `<area>` — короткий токен пакета: `core`, `react`, `vue`, `svelte`, `solid`, `ci`, `build`, … (НЕ полный `area: core`).
- `<type>` — только для баг/perf: `[bug]`, `[perf]`. Для фич/рефактора/cleanup type-токен **опускается**.
- Описание — техничное, по сути, без точки в конце. Указывай симптом → следствие через `→`, добавляй `(parallel to #NNN)` при родстве.

Реальные примеры из репо:
```
[core][bug] add() does not dedupe names within a single batch — second route silently overwrites the first
[core][perf] cloneRouter allocates ~156 KB per clone (~2x the 20-80 KB target)
[core] RoutesNamespace.#getBuildPathOptions silently ignores its options argument after the first call
```

## Шаг 4 — Собери тело по структуре шаблона

`gh` **не применяет** YAML-шаблоны (они только для веб-UI) — реплицируй секции выбранного шаблона вручную как `### Heading` + markdown. Минимум по типам:

- **bug** → `### What happened?`, `### Reproduction steps`, `### Environment`, `### Additional context`
- **feature** → `### What's the feature?`, `### Why is it useful?`, `### Additional context`
- **perf** → как feature + раздел с замерами (текущее vs целевое, как мерили)
- **task** → `### What needs to be done?`, `### Related context`
- **docs** → `### What needs documentation?`, `### Suggestions / Draft`
- **gfi** → `### What's the task?`, `### Where to find it in the code?`, `### Additional notes`

Для bug — давай конкретный, по возможности минимальный, repro. Ссылайся на код как `packages/core/src/...:line` и на связанные issue (`#NNN`).

## Шаг 5 — Подбери labels (сверяйся с реальным списком!)

Issue получает **3 labels**: `<тип>` + `priority: <x>` + `<area>`.

**Имена area-лейблов в репо НЕсогласованы — не угадывай, сверяйся с `gh label list`:**

```bash
gh label list --repo greydragon888/real-router --limit 100
```

Известные подвохи на данный момент:
- core/react/plugins/tests/build/npm/benchmarks/ci-cd → префикс `area: ` (`area: core`, `area: react`, `area: ci/cd`, …)
- **solid → `area:solid`** (без пробела!)
- **vue → `vue`**, **svelte → `svelte`**, **angular → `angular`** (вообще без префикса `area:`)
- **dependencies → `dependencies`** (bare; для dep-bump / dep-migration задач)
- **foundation-пакеты (search-params, path-matcher, route-tree, event-emitter, fsm — последний публичный, но тоже) area-лейбла НЕ имеют** — критерий не приватность пакета, а отсутствие лейбла в `gh label list`; issue получает **2 labels** (тип + priority), area живёт только в титульном токене `[search-params]…` (прецеденты #1051, #1155, #1159)
- тип: `bug` / `enhancement` / `performance` / `documentation` / `good first issue`
- priority: `priority: critical|high|medium|low`

`gh issue create --label X` падает, если label не существует. Поэтому **каждый** label сначала подтверди по выводу `gh label list`. Нужного нет → возьми ближайший реальный или (с согласия пользователя) создай через `gh label create`.

## Шаг 6 — Превью и подтверждение

Перед созданием покажи пользователю **title + labels + полное тело** и дождись подтверждения. Никогда не создавай issue молча. Пользователь не ответил на превью (таймаут AskUserQuestion / afk) → создавай по **рекомендованному** варианту превью и явно отметь это в ответе — превью с проставленными рекомендациями и есть форма согласования для автономного прогона.

## Шаг 7 — Создай и верни ссылку

```bash
gh issue create --repo greydragon888/real-router \
  --title "[core][bug] ..." \
  --body "$(cat <<'EOF'
### What happened?
...
EOF
)" \
  --label bug --label "priority: medium" --label "area: core"
```

Выведи номер и URL созданного issue.

**Батч связанных issues** (типовой случай — пачка находок одного аудита): создай **якорный** (главный) первым → компаньоны создавай уже с его реальным номером в теле (`#NNN`) → затем `gh issue view NNN --json body` + правка + `gh issue edit NNN --body-file …`, подставив номера компаньонов в якорный. Не вставляй плейсхолдеры `#<tbd>` в создаваемые тела.

**Опционально предложи** завести рабочую ветку `<number>-<slug>` — скиллы `/changeset` и `/create-pr` извлекают номер issue именно из этого формата имени ветки. (Багфиксы при этом часто **батчат** в одну ветку — не создавай ветку, если идёт работа в существующей батч-ветке.)

---

## Чеклист перед `gh issue create`

- [ ] Прогнал дедуп по **open + closed**, дубля нет (или согласовал с пользователем)
- [ ] Заголовок в формате `[<area>][<type>] …`, на английском, без точки
- [ ] Тело по секциям нужного шаблона, есть repro/контекст и ссылки на код/issue
- [ ] Все 3 labels подтверждены по `gh label list` (не из устаревшего YAML-шаблона)
- [ ] Показал превью и получил подтверждение

## Самокоррекция скила (ОБЯЗАТЕЛЬНО, в конце КАЖДОГО прогона)

Этот файл — живой; каждый прогон обязан его затачивать. После создания issue вынеси короткую секцию **«Самокоррекция»** — критику не своей работы, а САМОГО ЭТОГО СКИЛА: где его текст промолчал, соврал, был двусмыслен или избыточен — и это стоило времени, лишнего шага или риска ошибки.

1. **Привязка к ИНЦИДЕНТУ, не общие советы.** Каждая правка — из конкретного момента ЭТОГО прогона: «скил сказал X / промолчал про X → реальность Y → я потерял/чуть не ошибся на Z». Нет инцидента — нет правки (не выдумывай улучшения впрок). Особый кандидат: **новый/переименованный label или area-токен**, которого нет в таблицах выше, — занеси в подвохи Шага 5.
2. **Высокая планка: изменило бы исход?** Предлагай, только если правка реально предотвратила бы ошибку, сократила перебор или сняла двусмысленность, на которой ты споткнулся. Косметику и «было бы неплохо» — отбрасывай.
3. **Разовое ≠ паттерн.** Специфику конкретного issue (разовую) → в память, НЕ в скил. В скил идёт только повторяющийся класс, полезный СЛЕДУЮЩЕМУ ДРУГОМУ issue.
4. **Сначала заточи, потом дописывай (анти-раздувание).** Предпочитай усиление существующего абзаца новой секции; если правка делает прежний текст избыточным — консолидируй, не дублируй.
5. **Предлагай, не применяй молча.** Выведи кандидатов таблицей (раздел | инцидент | предлагаемый текст), спроси разрешения. Применил по согласию → `.claude/commands/` это infra, в master напрямую, без changeset.
6. **Честность про «нечего править».** Прогон прошёл чисто и скил нигде не подвёл → так и скажи: «правок нет». Пустая самокоррекция честнее придуманной — пункты 1–2 это допускают.
