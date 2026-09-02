Заведи новый пакет в `packages/*` по чеклисту репозитория: скаффолд, обязательные доки, тесты, changeset, интеграция в монорепо и вики. Ни один пункт не пропускается молча — недоделанное называется в отчёте.

Входные данные:
$ARGUMENTS

Формат аргументов: имя пакета (`@real-router/foo` или `foo`) и одна фраза о назначении.

## Чеклист

Выполни КАЖДЫЙ пункт.

### Scaffold

- `package.json` — version **`0.0.1`** (changesets will bump to `0.1.0` on first release), `"type": "commonjs"`, dual ESM/CJS exports (`types` → `import` → `require`), `"bundle"` script (not `"build"` — turbo `build` task is an orchestrator with no own command)
- `tsconfig.json` — extends `../../tsconfig.json`, include `src` and `tests`
- `tsconfig.node.json` — extends `../../tsconfig.node.json`, include `*.mts` and root configs
- `tsdown.config.mts` — use `createBrowserConfig()` or `createIsomorphicConfig()` from `../../tsdown.base.js` (the file on disk is `tsdown.base.ts` — the `.js` specifier is NodeNext resolution, not a typo)
- `vitest.config.mts` — extend `../../vitest.config.unit.mjs`, set `environment: "node"`
- `eslint.config.mjs` — re-export `../../eslint.config.mjs`

### Documentation (mandatory for every package)

- `CLAUDE.md` — Exports table, module structure diagram, gotchas section
- `README.md` — Quick Start, API reference tables, code examples per feature
- `ARCHITECTURE.md` — Source Structure diagram, key design decisions, data flow

### Tests

- Functional tests (`tests/functional/`) — 100% coverage required
- **Property-based tests** — evaluate whether the package has invariants that benefit from generative testing (pure functions, encode/decode symmetry, idempotent operations, ordering guarantees). If yes:
  - Create `vitest.config.properties.mts`, `tests/property/` directory
  - Create `INVARIANTS.md` — document each invariant with name, description, and why it must hold
  - Add `"test:properties"` script to `package.json`
- **Stress tests** — evaluate whether the package has concurrency, memory, or performance-sensitive paths (adapters with rapid re-renders, plugins handling thousands of transitions, reactive subscriptions). If yes:
  - Create `vitest.config.stress.mts`, `tests/stress/` directory
  - Add `"test:stress"` script to `package.json`

### Changesets

- Create changeset file(s) per [.changeset/README.md](.changeset/README.md) rules
- One file per affected public package, `minor` bump for new packages (pre-1.0)
- If the new package required core changes — separate changeset for core

### Monorepo integration

- Run `pnpm install` to register workspace package
- Update `CLAUDE.md` — package count (line 5), See Also link
- Update `ARCHITECTURE.md` — Package Map tree, Public packages list, Mermaid diagram node + deps
- Verify `pnpm build` passes with 0 failures — read the task COUNT off the run, never off a number written here

### Wiki (separate repo: `real-router.wiki/`)

- Create dedicated page for the new package (API, examples, configuration)
- Update `_Sidebar.md` — add link to the new page
- Update existing pages affected by the new package (e.g., `Route.md` if new route config fields, `plugin-architecture.md` if new plugin pattern)

## Гейты

- `pnpm install` обязателен до первой валидации — иначе фильтр по новому пакету молча не совпадёт.
- Число задач в графе `pnpm build` смотри прогоном (`turbo run build --dry=json`), а не по памяти: оно растёт с каждым примером.
- Первый publish в npm — человеческий, см. `/release`.
