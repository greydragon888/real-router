# Real-Router

> Simple, powerful, view-agnostic, modular and extensible router

pnpm monorepo with 32 packages + `benchmarks/` + bare `shared/` sources (symlinked into consumers' `src/dom-utils`, `src/browser-env`, and `src/shared-ssr`, except `packages/angular` which uses a git-tracked copy of `dom-utils`) + 91 example applications (incl. `examples/electron/*` and `examples/tauri/*` — see [Desktop Integration](https://github.com/greydragon888/real-router/wiki/Desktop-Integration)). Run `pnpm install` after cloning.

`shared/` is a minimal workspace entry (name, type, devDeps) with no `src/` of its own — it owns sibling directories `shared/browser-env/`, `shared/dom-utils/`, and `shared/ssr/` that are git-tracked symlink targets. This entry is required for `type-guards` resolution during bundling via symlinks. See IMPLEMENTATION_NOTES.md section "Shared Sources via Symlinks" for details.

### Shared Sources Tree

```
shared/
├── browser-env/   # History API + URL primitives — for browser/hash/navigation plugins
├── dom-utils/     # DOM helpers (links, scroll, a11y, view-transitions) — for framework adapters
└── ssr/           # SSR per-route loader plugin scaffolding — for ssr-data / rsc-server plugins
```

(Per-file contents change often — `ls shared/<dir>` for the current layout; see each consumer package's CLAUDE.md for what it pulls in.)

### Symlink Consumers

| Shared path           | Symlink alias in consumer | Consumer packages                                    |
| --------------------- | ------------------------- | ---------------------------------------------------- |
| `shared/browser-env/` | `src/browser-env`         | `browser-plugin`, `hash-plugin`, `navigation-plugin` |
| `shared/dom-utils/`   | `src/dom-utils`           | `preact`, `react`, `solid`, `svelte`, `vue`          |
| `shared/ssr/`         | `src/shared-ssr`          | `ssr-data-plugin`, `rsc-server-plugin`               |

**Any edit to `shared/browser-env/utils.ts`, `shared/dom-utils/link-utils.ts`, or `shared/ssr/createSsrLoaderPlugin.ts` propagates instantly to every consumer via its symlink** — verify with `pnpm build` across all affected packages. For `shared/ssr/` specifically, both `ssr-data-plugin` and `rsc-server-plugin` consume the same generic factory `createSsrLoaderPlugin<T>` with different type parameters (`unknown` vs `ReactNode`) and namespaces (`"data"` vs `"rsc"`) — one source of truth, two plugins; an edit that breaks one breaks the other.

`packages/angular/src/dom-utils` is **not** a symlink — it is a git-tracked copy, re-materialized from `shared/dom-utils/` by the `prebundle` npm script before every build (ng-packagr does not follow symlinks the same way tsdown does). **When editing `shared/dom-utils/*.ts`, also update `packages/angular/src/dom-utils/*.ts`** — or run `pnpm -F @real-router/angular bundle` to sync the copy. Verify with `readlink packages/angular/src/dom-utils`; returns empty.

## Toolchain Versions

`major.minor` of the key tooling/runtime, kept in context so suggested APIs, flags and config formats match what's actually installed (this stack is bleeding-edge — TS 6, ESLint 10 flat-config, Vitest 4, Turbo 2 — so defaults from training tend to lag). **When a version changes, or you notice a mismatch with the "source of truth" column, update this table.** `major.minor` only — patch drift is noise.

| Tool / runtime  | Version | Source of truth (actualize from here)                                      |
| --------------- | ------- | -------------------------------------------------------------------------- |
| Node.js         | 24.16   | CI pins major `24` (`.github/workflows/*`); no `engines`/`.nvmrc`, minor floats |
| npm             | 11.6    | bundled with Node 24; used for **publishing** (`changeset publish` → npm OIDC Trusted Publishing in `changesets.yml`; manual `npm publish` for a new package's first release). Installs/builds are pnpm, not npm |
| pnpm            | 10.33   | `packageManager` field, root `package.json`                                |
| TypeScript      | 6.0     | root `devDependencies` (pinned exact, `save-exact`)                         |
| Vitest          | 4.1     | root `devDependencies`                                                      |
| tsdown          | 0.22    | root `devDependencies`                                                      |
| Turbo           | 2.9     | root `devDependencies`                                                      |
| ESLint          | 10.5    | root `devDependencies` (flat config)                                        |
| @changesets/cli | 2.31    | root `devDependencies`                                                      |
| Prettier        | 3.8     | root `devDependencies`                                                      |
| husky           | 9.1     | root `devDependencies` (v9 config format — `.husky/*` are plain scripts)    |
| fast-check      | 4.8     | root `devDependencies` (property tests)                                     |
| OS              | dev: macOS (Darwin 26.x) · CI: Ubuntu (Linux) | local `uname` / `runs-on` in workflows         |
| bash            | dev: **3.2** (macOS) · CI: 5.x (Ubuntu) | scripts must target the **3.2 lower bound** — no associative arrays, no `${v^^}`, no `mapfile` |

## Rules

- **NEVER** push without explicit user request
- **Infrastructure tasks go straight to `master` — no PR, no changeset.** Build/tooling/CI/packaging changes that don't touch `packages/*/src/` are committed directly on `master` (no feature branch, no PR). They need no changeset either — `changeset-check.yml` only requires one when public-package `src/` changes, so the fix simply ships with each package's next release
- After completing a task, run: `pnpm build` (turbo runs the full graph: type-check → lint → test → build)
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused
- **Update `IMPLEMENTATION_NOTES.md` after any infrastructure change** — new scripts/hooks (`.husky/*`, `scripts/*.sh`), CI workflow edits (`.github/workflows/*.yml`), build pipeline changes (turbo.json, tsdown configs, custom export conditions), dependency-audit tooling, or anything that changes "how the repo builds/ships/audits itself." Use the Problem → Solution → Why format established there. This is what makes the file useful as the "why is it this way?" reference

## Key Commands

```bash
pnpm build              # Full validation + build (type-check → lint → test → bundle)
pnpm build:verbose      # Build with full output (debugging)
pnpm bundle             # Bundle only (tsdown/rollup/svelte-package, no validation)
pnpm test -- --run      # Run tests once (errors-only output)
pnpm test:verbose       # Tests with full output (debugging)
pnpm lint               # ESLint
pnpm type-check         # TypeScript
pnpm lint:deps          # Check dependency versions (syncpack)
pnpm lint:dedupe        # Check for duplicate deps
pnpm lint:e2e           # Verify e2e directories have spec files
pnpm lint:unused        # Check for unused code (knip)
pnpm resolve:dependabot <PR#>  # Rebase+dedupe a Dependabot PR — conflicting OR lint:dedupe-failing (keeps master linear)
```

**Dependabot PRs needing `resolve:dependabot`:** resolve with `pnpm resolve:dependabot <PR#>` (rebase onto master → semver-union resolve → regenerate + dedupe lockfile → squash-merge). Use it in **two** cases: (1) the PR **conflicts** with master, or (2) the PR's only failure is the **`lint:dedupe`** gate (`ERR_PNPM_DEDUPE_CHECK_ISSUES`) — Dependabot never runs `pnpm dedupe`, so grouped bumps leave duplicate versions in the lockfile (e.g. `semver` 7.8.1 **and** 7.8.2). The script's lockfile-reconcile step (`pnpm install` → `pnpm dedupe` → amend) runs even on a clean rebase, so it fixes the dedupe-only case too. Never resolve with a merge commit — `master` is protected with "Merge commits are not allowed". See IMPLEMENTATION_NOTES "Squash-resolve for CONFLICTING Dependabot PRs". (A lint failure from a linter-plugin **bump itself** — e.g. new `eslint-plugin-unicorn` rules — is a code/config fix, not something `resolve:dependabot` handles.)

## Non-Obvious Conventions

- 100% test coverage required (enforced in vitest.config). Framework adapters may have slightly lower thresholds for branches/functions due to compiler-generated phantom code (Solid: babel-preset-solid, Vue: defineComponent, Svelte: compiler transforms, Angular: JIT TestBed does not bind signal `input()` so `contentChildren`/directive callbacks are unreachable without AOT — threshold 94/84/94/94)
- **Heap-threshold stress tests (`tests/stress/*.stress.ts`) MUST have proven discriminating power — coverage does not measure it.** A `expect(delta).toBeLessThan(N * MB)` test is worthless theatre if `N * MB` sits ABOVE the heap the targeted leak would actually add (the test passes even when fully broken). Before trusting any such test, validate it mutationally: (1) measure the **healthy** delta (temporarily force the threshold to `0` and read the printed `formatBytes(delta)`); (2) **simulate the exact leak** it guards — for a cleanup-cycle test (create→destroy loop), delete the cleanup call (`unsub()`/`remove()`/`teardown()`); for a "stable over N ops" test, retain one reference per op — and measure that delta; (3) the threshold MUST sit between them with ≥3× margin on both sides (`healthy < threshold < leak`), so the test fails on the leak and passes when healthy. Anchor the threshold to measured healthy, **never to a round MB guess**. Pitfalls that silently defeat discrimination: iteration count `N` too low (leak signal stays in KB — raise `N`, keep runtime <~2s); **hard caps** bounding the max possible leak (`EventEmitter` caps at 10k listeners/event, dependency store at 100 entries, guard storage is `Map<routeName>` last-add-wins so a removal-leak is bounded to one generation — set the threshold below the capped leak); and **GC-masking** (objects from a `create→dispose` loop left unreferenced are reclaimed regardless of whether `dispose()` ran, so the dispose-leak is structurally invisible to a heap snapshot — such tests are really throughput guards, fix by tightening the threshold to ~8–10× stable healthy, not by chasing a non-existent signal). Leave timing assertions (`< Xms`) alone — they flake under concurrent CPU load.
- Angular adapter is built with **ng-packagr** (not tsdown) — produces FESM2022 ESM-only (no CJS), partial-Ivy compilation linked by the consumer
- Pinned versions (`save-exact=true` in .npmrc)
- Workspace packages use `workspace:^` protocol
- Dual ESM/CJS builds via tsdown (Solid uses rollup + babel-preset-solid, Svelte uses svelte-package)
- Vitest uses dynamic `resolve.alias` in `vitest.config.common.mts` to map workspace packages to `src/` for coverage — auto-generated from `package.json`, prefers the `@real-router/internal-source` export condition if present, falls back to deriving src path from ESM entry (handles `.ts`, `.tsx`, and directory index files)
- `@real-router/internal-source` custom export condition (monorepo-internal) — all public packages declare a `"@real-router/internal-source": "./src/..."` first entry in their `exports` field. Root `tsconfig.json` activates it via `compilerOptions.customConditions`, so `tsc` in the monorepo resolves `@real-router/*` imports to `src/*.ts` directly. External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name — they continue to resolve via `import`/`require` → `dist/`. Structurally eliminates the class of CI flakes where `type-check` depended on remote-cached `dist/` artifacts (#431). See `IMPLEMENTATION_NOTES.md` section "Custom `@real-router/internal-source` Export Condition" for the full saga
- Pre-push hook runs full validation (build + lint:types + lint:package)
- Pre-commit hook runs `lint:deps` + `lint:coverage-scope` + tests + `lint:e2e` (and auto-dedupes the lockfile when it's staged); `knip` + `jscpd` run in **pre-push**, not pre-commit
- `outputLogs: "errors-only"` in turbo.json for all tasks — silent on success, full output on failure. Use `build:verbose`/`test:verbose` for debugging
- knip uses `ignoreWorkspaces: ["examples/**"]` — example apps are excluded from unused code analysis
- Vue examples use `vue-tsc -b` (not `tsc -b`) for SFC type checking
- Svelte examples use `vite build` only (no tsc step — Svelte compiler handles types)
- Never use `workspace:^` for `peerDependencies` on 0.x packages — in semver `^0.x.y` is patch-only range, so any minor bump breaks the range and triggers a major bump from changesets
- `onlyUpdatePeerDependentsWhenOutOfRange: true` is set in `.changeset/config.json` to prevent unexpected major bumps when peer deps are updated within range
- Runtime validation is opt-in via `@real-router/validation-plugin` — core ships with structural guards and three invariant guards only (subscribe, navigateToNotFound, claimContextNamespace)
- Plugins publish per-route data via `state.context.<namespace>` using `api.claimContextNamespace()` + `claim.write()` + `claim.release()` — mirrors `extendRouter()` pattern. Module augmentation on `@real-router/types` for typed namespaces

## Release Process

- **Main workflow:** `changesets.yml` — publishing via npm OIDC Trusted Publishing
- **Manual workflow:** `release.yml` — for emergency releases
- Trusted Publisher configured for all @real-router/\* packages with workflow `changesets.yml`
- New packages must be published manually first (`npm publish`), then configure Trusted Publisher

## Versioning

- **Pre-1.0 phase:** Use `minor` for all changes, including breaking changes
- Major version bump only when full scope of work is complete and ready for stable release
- In changesets: use `minor` even for breaking changes until 1.0 release

## Changesets

**MUST** follow rules in [.changeset/README.md](.changeset/README.md) — file naming, one package per file, PR/issue reference, version bump guidelines. Read it before creating changesets.

## New Package Checklist

When creating a new `packages/*` package, complete every item:

### Scaffold

- `package.json` — version **`0.0.1`** (changesets will bump to `0.1.0` on first release), `"type": "commonjs"`, dual ESM/CJS exports (`types` → `import` → `require`), `"bundle"` script (not `"build"` — turbo `build` task is an orchestrator with no own command)
- `tsconfig.json` — extends `../../tsconfig.json`, include `src` and `tests`
- `tsconfig.node.json` — extends `../../tsconfig.node.json`, include `*.mts` and root configs
- `tsdown.config.mts` — use `createBrowserConfig()` or `createIsomorphicConfig()` from `../../tsdown.base.js`
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
- Verify `pnpm build` passes (207+ tasks, 0 failures)

### Wiki (separate repo: `real-router.wiki/`)

- Create dedicated page for the new package (API, examples, configuration)
- Update `_Sidebar.md` — add link to the new page
- Update existing pages affected by the new package (e.g., `Route.md` if new route config fields, `plugin-architecture.md` if new plugin pattern)

## Documentation Maintenance

When adding packages or features, keep these root files in sync:

### ARCHITECTURE.md

- Update **Package Map** directory tree, **Public packages** list, **Mermaid diagram** (add nodes + deps), and **Layer Rules** diagram
- **Invariants** section documents constraints that break the system if violated — not features
- Mermaid diagrams must remain valid (test rendering)

### IMPLEMENTATION_NOTES.md

- **Problem → Solution → Why** format for every decision record
- Include **Before/After** code examples where applicable
- **Never delete** historical decisions — they explain "why it's this way"
- New build strategies, tooling changes, and infrastructure decisions go here

### README.md

- **Framework Integration** table must list all adapter packages
- **Quick Start** shows core + one framework example only (keep concise)
- Link to **wiki** for detailed docs — README is an overview, not a manual
- Update "Framework-agnostic" feature bullet when adapters change

### CLAUDE.md (this file)

- Keep **package count** on line 5 accurate
- **See Also** must link to every package's CLAUDE.md
- **Non-Obvious Conventions** — only things that are hard to guess from code alone

### Package-level docs (per adapter)

- **ARCHITECTURE.md** — Source Structure diagram, key design decisions, data flow
- **CLAUDE.md** — Exports table, composables/hooks table, gotchas
- **README.md** — Quick Start, API tables, code examples per feature

### Wiki (separate repo: `real-router.wiki/`)

- **Integration Guide** per framework (Preact/Solid/Vue/Svelte/Angular-Integration.md) — kept in sync with adapter features
- **Per-API pages** (RouterProvider, Link, RouteView, useRouter, etc.) — include import alternatives for all frameworks
- **\_Sidebar.md** — links to all integration guides
- Move features from **Planned Features** → implemented sections when shipped

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and package structure
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) — Infrastructure decisions
- [packages/core/CLAUDE.md](packages/core/CLAUDE.md) — Core package architecture
- [packages/sources/CLAUDE.md](packages/sources/CLAUDE.md) — Subscription layer for UI bindings (cached factories, canonicalJson)
- [packages/react/CLAUDE.md](packages/react/CLAUDE.md) — React integration architecture
- [packages/preact/CLAUDE.md](packages/preact/CLAUDE.md) — Preact integration architecture
- [packages/solid/CLAUDE.md](packages/solid/CLAUDE.md) — Solid.js integration architecture
- [packages/vue/CLAUDE.md](packages/vue/CLAUDE.md) — Vue 3 integration architecture
- [packages/svelte/CLAUDE.md](packages/svelte/CLAUDE.md) — Svelte 5 integration architecture
- [packages/angular/CLAUDE.md](packages/angular/CLAUDE.md) — Angular 21+ integration architecture
- [packages/browser-plugin/CLAUDE.md](packages/browser-plugin/CLAUDE.md) — Browser plugin architecture
- [packages/navigation-plugin/CLAUDE.md](packages/navigation-plugin/CLAUDE.md) — Navigation API plugin architecture
- [packages/hash-plugin/CLAUDE.md](packages/hash-plugin/CLAUDE.md) — Hash plugin architecture
- [packages/logger-plugin/CLAUDE.md](packages/logger-plugin/CLAUDE.md) — Logger plugin architecture
- [packages/persistent-params-plugin/CLAUDE.md](packages/persistent-params-plugin/CLAUDE.md) — Persistent params plugin architecture
- [packages/ssr-data-plugin/CLAUDE.md](packages/ssr-data-plugin/CLAUDE.md) — SSR data plugin architecture
- [packages/rsc-server-plugin/CLAUDE.md](packages/rsc-server-plugin/CLAUDE.md) — RSC server plugin architecture (per-route ReactNode loading)
- [packages/validation-plugin/CLAUDE.md](packages/validation-plugin/CLAUDE.md) — Validation plugin architecture
- [packages/search-schema-plugin/CLAUDE.md](packages/search-schema-plugin/CLAUDE.md) — Search schema plugin architecture
- [packages/lifecycle-plugin/CLAUDE.md](packages/lifecycle-plugin/CLAUDE.md) — Lifecycle plugin architecture
- [packages/preload-plugin/CLAUDE.md](packages/preload-plugin/CLAUDE.md) — Preload plugin architecture
- [packages/memory-plugin/CLAUDE.md](packages/memory-plugin/CLAUDE.md) — Memory plugin architecture
- [packages/navigation-plugin/CLAUDE.md](packages/navigation-plugin/CLAUDE.md) — Navigation API plugin architecture
- [packages/path-matcher/CLAUDE.md](packages/path-matcher/CLAUDE.md) — Segment trie URL matcher, encoding, constraints
- [packages/route-tree/CLAUDE.md](packages/route-tree/CLAUDE.md) — Route tree builder, matcher factory, validation
- [packages/fsm/CLAUDE.md](packages/fsm/CLAUDE.md) — FSM engine internals
- [benchmarks/CLAUDE.md](benchmarks/CLAUDE.md) — Benchmark suite
- [MCP Servers Guide](.claude/mcp-guide.md)
- [Roadmap to 1.0](https://github.com/greydragon888/real-router/issues/296) — issue #296, milestone tracking
- [Wiki](https://github.com/greydragon888/real-router/wiki) (local: `/Users/olegivanov/WebstormProjects/real-router.wiki`)
