# Real-Router

> Simple, powerful, view-agnostic, modular and extensible router

pnpm monorepo with 23 packages + `benchmarks/` + bare `shared/` sources (symlinked into consumers' `src/dom-utils`, `src/browser-env`, and `src/shared-ssr`, except `packages/angular` which uses a git-tracked copy of `dom-utils`) + 87 top-level example applications across `examples/web/<framework>/*`, `examples/desktop/{electron,tauri}/*`, and `examples/console/*` (+52 subgroup sub-examples in `web/<framework>/{animation,ssr,hash}-examples/*` → 139 runnable; 145 example workspace packages incl. 6 framework aggregators — see [Desktop Integration](https://github.com/greydragon888/real-router/wiki/Desktop-Integration)). Run `pnpm install` after cloning.

`shared/` is a minimal workspace entry (name, type, devDeps) with no `src/` of its own — it owns sibling directories `shared/browser-env/`, `shared/dom-utils/`, and `shared/ssr/` that are git-tracked symlink targets. This entry exists so the symlinked shared sources resolve their workspace imports (`@real-router/core` — including its `/types` subpath — and `@real-router/sources`) from `shared/`'s own filesystem location during type-check and bundling. (Before wave-2 it also anchored the runtime `type-guards` import that `shared/browser-env` inlined via `alwaysBundle` and a direct `@real-router/types` dep; `type-guards` is now dissolved with `isStateStrict` local in `shared/browser-env/state-guard.ts`, and `@real-router/types` folded into `@real-router/core` so the shared sources import types from `@real-router/core`.) See IMPLEMENTATION_NOTES.md section "Shared Sources via Symlinks" for details.

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

| Tool / runtime  | Version                                          | Source of truth (actualize from here)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js         | 24                                               | **`.nvmrc`** — single source of truth; every workflow reads it via `node-version-file` (sole deliberate exception: `changesets.yml`, exact-pinned `24.18.0`, see its comment). Minor floats. `.husky/pre-commit` warns when the local major differs. No root `engines` — deliberately, see IMPLEMENTATION_NOTES. Do NOT dev on another major: host globals differ (Node ≥ 26 ships Web Storage unflagged and shadows jsdom's `sessionStorage` under vitest — IMPLEMENTATION_NOTES "Adapter scroll tests mock `sessionStorage`"). On macOS/Homebrew use `node@24` + `brew pin node`; the unversioned `node` formula tracks the latest major and will silently upgrade you |
| npm             | 11.16                                            | bundled with Node 24 — but npm's own `latest` is already **12.x**, and the smoke test is the repo's only contact surface with npm, so it runs `--strict-allow-scripts=true` to hold the v12 posture (dependency lifecycle scripts opt-in) regardless of which npm the runner bundles. **Not used for publishing** — pnpm 11 publishes natively (OIDC + provenance). npm's only deliberate use is the consumer smoke-test (`scripts/smoke-test-packages.sh`: `npm install` to simulate a real consumer). Installs/builds/publish are pnpm                                                                                                                                 |
| pnpm            | 11.18                                            | `packageManager` field, root `package.json`; behavioral config in `pnpm-workspace.yaml` (overrides/allowBuilds/settings — pnpm 11 no longer reads `.npmrc`/`package.json#pnpm`). Bumping the field is enough — all `pnpm/action-setup@v6` call-sites auto-detect from it, and pnpm self-switches locally                                                                                                                                                                                                                                                                                                                                                                 |
| TypeScript      | 6.0                                              | root `devDependencies` (pinned exact, `save-exact`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Vitest          | 4.1                                              | root `devDependencies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| tsdown          | 0.22                                             | root `devDependencies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Turbo           | 2.10                                             | root `devDependencies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ESLint          | 10.7                                             | root `devDependencies` (flat config)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| @changesets/cli | 2.31                                             | root `devDependencies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Prettier        | 3.9                                              | root `devDependencies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| husky           | 9.1                                              | root `devDependencies` (v9 config format — `.husky/*` are plain scripts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| fast-check      | 4.9                                              | root `devDependencies` (property tests)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| OS              | dev: macOS 26 (Darwin 25.x) · CI: Ubuntu (Linux) | local `uname` / `runs-on` in workflows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| bash            | dev: **3.2** (macOS) · CI: 5.x (Ubuntu)          | scripts must target the **3.2 lower bound** — no associative arrays, no `${v^^}`, no `mapfile`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Rules

- **NEVER** push without explicit user request
- **Infrastructure tasks go straight to `master` — no PR, no changeset.** Build/tooling/CI/packaging changes that don't touch `packages/*/src/` are committed directly on `master` (no feature branch, no PR). They need no changeset either — `changeset-check.yml` only requires one when public-package `src/` changes, so the fix simply ships with each package's next release
- After completing a task, run: `pnpm build` (turbo runs the full graph: type-check → test → build, with lint in PARALLEL — it is a `build` dependency, no longer a `test` one)
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused
- **Update `IMPLEMENTATION_NOTES.md` after any infrastructure change** — new scripts/hooks (`.husky/*`, `scripts/*.sh`), CI workflow edits (`.github/workflows/*.yml`), build pipeline changes (turbo.json, tsdown configs, custom export conditions), dependency-audit tooling, or anything that changes "how the repo builds/ships/audits itself." Use the Problem → Solution → Why format established there. This is what makes the file useful as the "why is it this way?" reference

## Docblocks and Code Comments

Applies to every docblock and inline comment in `packages/*/src` and `shared/`. It is the ARCHITECTURE.md present-tense rule, extended to the code.

### No historiography

**Describe what the code does NOW.** Not how it got there, not what it used to do, not what a refactor replaced, not what was measured and rejected on the way. Ban the whole family: "used to", "an earlier version", "before #NNNN", "this said X until", "the first draft", "shipped briefly and reverted".

A bare issue reference attached to a statement of what HOLDS is fine — `` `transition` is attached at construction (#1976) `` — because it points at the record without retelling it. A narrative of the change is not.

History has one home: **IMPLEMENTATION_NOTES.md**, changesets, commit messages and issues. It is searchable there, and nobody has to keep it true in a second place. A docblock that carries it is a second copy that will go stale on its own schedule and be believed anyway, because it sits next to the code.

### Keep them short

**Every sentence is an independently falsifiable claim, and you write them faster than you verify them.** Measured on one branch over two adversarial audit passes: ~67 confirmed defects, essentially all of them in prose — miscounted call tables, dangling `{@link}`s, rules retracted in one copy and left standing in two others, claims refuted by the paragraph below them. The code survived both passes untouched. Density is the defect generator.

What follows from that:

- **A number in a docblock is a promise to re-measure it.** Prefer naming the authority — "the census in `state-freeze-authority.test.ts` owns this count" — over restating the count. A number written twice goes stale twice, and the copy nobody reruns is the one that gets quoted.
- **Do not restate what a test already asserts.** Point at the test.
- **One claim per `⚠` / `⚑`.** Three claims in one paragraph are three places to be wrong, and reviewers check the first.
- **A correction is a new claim.** Re-verify the replacement — replacing a false sentence with another false one is the common failure — and grep for OTHER copies of the rule you are retracting. A rule worth writing has usually been written three times.
- **If nothing could falsify a paragraph, delete it.** It is decoration that future readers must still parse.

⚠ This does NOT license deleting a load-bearing `⚠` that names a real trap, an unenforceable boundary, or a measured trade-off. Those are statements about what holds today and they stay. The target is narrative, not caution.

## Key Commands

```bash
pnpm build              # Full validation + build (type-check → test → bundle; lint runs in parallel)
pnpm build:verbose      # Build with full output (debugging)
pnpm bundle             # Bundle only (tsdown/rollup/svelte-package, no validation)
pnpm test -- --run      # Run tests once (errors-only output)
pnpm test:verbose       # Tests with full output (debugging)
pnpm lint               # ESLint check only — the gate; fails on any violation (no --fix)
pnpm lint:fix           # ESLint with --fix (local auto-fix; not run by the gate)
pnpm type-check         # TypeScript
pnpm lint:deps          # Check dependency versions (syncpack)
pnpm lint:dedupe        # Check for duplicate deps
pnpm lint:e2e           # Verify e2e directories have spec files
pnpm lint:unused        # Check for unused code (knip)
pnpm resolve:dependabot <PR#>  # Rebase+dedupe a Dependabot PR — conflicting OR lint:dedupe-failing (keeps master linear)
```

**Dependabot PRs needing `resolve:dependabot`:** resolve with `pnpm resolve:dependabot <PR#>` (rebase onto master → semver-union resolve → regenerate + dedupe lockfile → squash-merge). Use it in **two** cases: (1) the PR **conflicts** with master, or (2) the PR's only failure is the **`lint:dedupe`** gate (`ERR_PNPM_DEDUPE_CHECK_ISSUES`) — Dependabot never runs `pnpm dedupe`, so grouped bumps leave duplicate versions in the lockfile (e.g. `semver` 7.8.1 **and** 7.8.2). The script's lockfile-reconcile step (`pnpm install` → `pnpm dedupe` → amend) runs even on a clean rebase, so it fixes the dedupe-only case too. Never resolve with a merge commit — `master` is protected with "Merge commits are not allowed". See IMPLEMENTATION_NOTES "Squash-resolve for CONFLICTING Dependabot PRs". (A lint failure from a linter-plugin **bump itself** — e.g. new `eslint-plugin-unicorn` rules — is a code/config fix, not something `resolve:dependabot` handles.)

## Non-Obvious Conventions

- 100% test coverage required (enforced in vitest.config). Framework adapters may sit below it, because compiler-generated phantom code is unreachable from a test (Solid: babel-preset-solid, Vue: defineComponent, Svelte: compiler transforms, Angular: JIT TestBed does not bind signal `input()`, so `contentChildren`/directive callbacks need AOT). ⚠ **The numbers are deliberately not repeated here.** This line carried Angular's as `94/84/94/94` while the config said `98/94/99/98`, and the correct value already had two homes inside that package. Each adapter's thresholds live in its own `vitest.config.mts` and are restated in that package's `CLAUDE.md` — read those, or `grep -A6 thresholds packages/*/vitest.config.mts`. ⚠ Nor is it only branches/functions: measured, Solid and Angular lower statements and lines too
- **Heap-threshold stress tests (`tests/stress/*.stress.ts`) MUST have proven discriminating power — coverage does not measure it.** A `expect(delta).toBeLessThan(N * MB)` test is worthless theatre if `N * MB` sits ABOVE the heap the targeted leak would actually add (the test passes even when fully broken). Before trusting any such test, validate it mutationally: (1) measure the **healthy** delta (temporarily force the threshold to `0` and read the printed `formatBytes(delta)`); (2) **simulate the exact leak** it guards — for a cleanup-cycle test (create→destroy loop), delete the cleanup call (`unsub()`/`remove()`/`teardown()`); for a "stable over N ops" test, retain one reference per op — and measure that delta; (3) the threshold MUST sit between them with ≥3× margin on both sides (`healthy < threshold < leak`), so the test fails on the leak and passes when healthy. Anchor the threshold to measured healthy, **never to a round MB guess**. Pitfalls that silently defeat discrimination: iteration count `N` too low (leak signal stays in KB — raise `N`, keep runtime <~2s); **hard caps** bounding the max possible leak (`EventEmitter` caps at 10k listeners/event, dependency store at 100 entries, guard storage is `Map<routeName>` last-add-wins so a removal-leak is bounded to one generation — set the threshold below the capped leak); and **GC-masking** (objects from a `create→dispose` loop left unreferenced are reclaimed regardless of whether `dispose()` ran, so the dispose-leak is structurally invisible to a heap snapshot — such tests are really throughput guards, fix by tightening the threshold to ~8–10× stable healthy, not by chasing a non-existent signal). Leave timing assertions (`< Xms`) alone — they flake under concurrent CPU load.
- Angular adapter is built with **ng-packagr** (not tsdown) — produces FESM2022 ESM-only (no CJS), partial-Ivy compilation linked by the consumer
- Pinned versions (`saveExact: true` in `pnpm-workspace.yaml` — pnpm 11 does not read `.npmrc` for this) — **exception:** UI frameworks, third-party (competitor) routers, and testing libraries float the **patch** (`~x.y.z`), since they're dev/test/example-only and never ship (adapters expose them as peer ranges). Governed by a `range: "~"` semverGroup in `syncpack.config.mjs` + patch-`ignore` in `.github/dependabot.yml` (`@angular/*` ignored entirely — exact cross-peers, moves only via coordinated `pnpm update`). Adding a new such dep → update both. See IMPLEMENTATION_NOTES "UI frameworks / third-party routers / testing libs float latest patch"
- Workspace packages use `workspace:^` protocol
- Dual ESM/CJS builds via tsdown (Solid uses rollup + babel-preset-solid, Svelte uses svelte-package)
- Vitest uses dynamic `resolve.alias` in `vitest.config.common.mts` to map workspace packages to `src/` for coverage — auto-generated from `package.json`, prefers the `@real-router/internal-source` export condition if present, falls back to deriving src path from ESM entry (handles `.ts`, `.tsx`, and directory index files)
- `@real-router/internal-source` custom export condition (monorepo-internal) — all public packages declare a `"@real-router/internal-source": "./src/..."` first entry in their `exports` field. Root `tsconfig.json` activates it via `compilerOptions.customConditions`, so `tsc` in the monorepo resolves `@real-router/*` imports to `src/*.ts` directly. External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name — they continue to resolve via `import`/`require` → `dist/`. Structurally eliminates the class of CI flakes where `type-check` depended on remote-cached `dist/` artifacts (#431). See `IMPLEMENTATION_NOTES.md` section "Custom `@real-router/internal-source` Export Condition" for the full saga
- **A `@real-router/*` dependency declared ONLY as a peer is invisible to turbo** — the task graph is built from `dependencies` / `devDependencies` / `optionalDependencies`, so a peer-only edge means a core change never invalidates that package's `type-check` / `test` / `bundle` and turbo replays results computed against an older core. Fix: add the same package to `devDependencies` as `workspace:^` (the peer entry stays — it is the published contract). `ssr-utils` is the one exception: `core` devDepends on it for three tests, so a dev entry there is a cycle turbo refuses to run — it uses `packages/ssr-utils/turbo.json` (`extends: ["//"]`) adding `../core/src/**/*.ts` to `type-check` + `bundle` inputs instead. See IMPLEMENTATION_NOTES "`peerDependencies` are invisible to turbo"
- Pre-push hook runs EIGHT steps, not three: `lint:changeset`, `lint:duplicates` (jscpd), `turbo run build lint:package lint:types` over non-example packages, `test:stress`, `lint:unused` (knip), `lint:deps` (syncpack), `lint:audit` (osv-scanner), `lint:security` (semgrep). Budget minutes, not seconds
- Pre-commit hook runs `lint:deps` + `lint:coverage-scope` + tests + `lint:e2e` + `scripts/check-angular-dom-utils-sync.mjs` (and auto-dedupes the lockfile when it's staged); `knip` + `jscpd` run in **pre-push**, not pre-commit
- `outputLogs: "errors-only"` in turbo.json for the seven REPORTING tasks; the four orchestrators (`build`, `lint:fix`, `lint:package`, `lint:types`) leave it unset — silent on success, full output on failure. Use `build:verbose`/`test:verbose` for debugging
- knip uses `ignoreWorkspaces: ["examples/**", "benchmarks"]` — example apps are excluded from unused code analysis
- Vue examples use `vue-tsc -b` (not `tsc -b`) for SFC type checking
- Svelte examples use `vite build` only (no tsc step — Svelte compiler handles types)
- Never use `workspace:^` for `peerDependencies` on 0.x packages — in semver `^0.x.y` is patch-only range, so any minor bump breaks the range and triggers a major bump from changesets
- `onlyUpdatePeerDependentsWhenOutOfRange: true` is set in `.changeset/config.json` to prevent unexpected major bumps when peer deps are updated within range
- Runtime validation is opt-in via `@real-router/validation-plugin` — core ships with structural guards plus a small always-on set, enumerated in [packages/core/CLAUDE.md](packages/core/CLAUDE.md) § _Invariant Guards_. ⚠ Neither the count nor the members are repeated here — a second copy of an enumerable set goes stale on its own schedule, and this one did, twice: it still read `five` after #1888 and after #2088 had each added one. Separately, an always-on **mode gate** (#1575) normalises rather than detects — a query key the active `queryParamsMode` will not print never enters `state.search`, so `state.search` ⊆ what `state.path` shows, in every mode
- Plugins publish per-route data via `state.context.<namespace>` using `api.claimContextNamespace()` + `claim.write()` + `claim.release()` — mirrors `extendRouter()` pattern. Module augmentation on `@real-router/core/types` for typed namespaces
- **A boolean parameter is a hypothesis, not a decision — study before adding one.** Wanting to add a `boolean` argument (positional, defaulted, or a `boolean` field on an options bag) means running `.claude/prompts/boolean-flag-audit.md` over the signature FIRST. The four signals it looks for are all measured against the CALL SITES, never read off the signature: the flag partitions callers into disjoint sets that never pass both polarities; some OTHER parameter gets the same constant from most callers; the flag names a role the caller already declared further up the chain; or 2^k combinations exist and only k+1 are reachable. Any of them means the function is two functions, and naming them removes more than the flag. Measured precedent: #1928 added `freezeResult` to `mergeWithDefault`; the audit found seven call sites in two disjoint sets, five of them passing `undefined` to the parameter the function is NAMED after, and the split (`mergePathChannel` / `mergeQueryChannel` / `adoptForeignBag`) removed **three** parameters plus a footgun the old signature could only warn about. ⚠ Moving a positional boolean into an options object is NOT the fix — a named field cures readability at the call site and none of the four signals

## Release Process

**Only workflow:** `changesets.yml` — publishing via npm OIDC Trusted Publishing, tokenless, with SLSA provenance. There is no `release.yml`. Adding a package to npm needs a one-time MANUAL first publish that cannot be scripted or delegated (the account's 2FA is a WebAuthn key). Run **`/release`** for the full procedure and its gates.

## Versioning

- **Pre-1.0 phase:** Use `minor` for all changes, including breaking changes
- Major version bump only when full scope of work is complete and ready for stable release
- In changesets: use `minor` even for breaking changes until 1.0 release

## Changesets

**MUST** follow rules in [.changeset/README.md](.changeset/README.md) — file naming, one package per file, PR/issue reference, version bump guidelines. Read it before creating changesets.

## New Package Checklist

Scaffold, mandatory docs (`CLAUDE.md` · `README.md` · `ARCHITECTURE.md`), tests at 100% coverage, changesets, monorepo integration and a wiki page — every item, none skipped silently. Run **`/new-package`**.

## Documentation Maintenance

Which root file owns what, and the opposite policies of `ARCHITECTURE.md` (present tense only) and `IMPLEMENTATION_NOTES.md` (the home of every "why it is this way"), live in `.claude/rules/docs.md` — a path-scoped rule that loads when you open one of those files.

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
- [packages/angular/CLAUDE.md](packages/angular/CLAUDE.md) — Angular 22+ integration architecture
- [packages/browser-plugin/CLAUDE.md](packages/browser-plugin/CLAUDE.md) — Browser plugin architecture
- [packages/navigation-plugin/CLAUDE.md](packages/navigation-plugin/CLAUDE.md) — Navigation API plugin architecture
- [packages/hash-plugin/CLAUDE.md](packages/hash-plugin/CLAUDE.md) — Hash plugin architecture
- [packages/logger-plugin/CLAUDE.md](packages/logger-plugin/CLAUDE.md) — Logger plugin architecture
- [packages/persistent-params-plugin/CLAUDE.md](packages/persistent-params-plugin/CLAUDE.md) — Persistent params plugin architecture
- [packages/ssr-data-plugin/CLAUDE.md](packages/ssr-data-plugin/CLAUDE.md) — SSR data plugin architecture
- [packages/rsc-server-plugin/CLAUDE.md](packages/rsc-server-plugin/CLAUDE.md) — RSC server plugin architecture (per-route ReactNode loading)
- [packages/ssr-utils/CLAUDE.md](packages/ssr-utils/CLAUDE.md) — Router-level SSR/SSG/hydration helpers (extracted from `@real-router/core/utils`, #1543)
- [packages/validation-plugin/CLAUDE.md](packages/validation-plugin/CLAUDE.md) — Validation plugin architecture
- [packages/search-schema-plugin/CLAUDE.md](packages/search-schema-plugin/CLAUDE.md) — Search schema plugin architecture
- [packages/lifecycle-plugin/CLAUDE.md](packages/lifecycle-plugin/CLAUDE.md) — Lifecycle plugin architecture
- [packages/preload-plugin/CLAUDE.md](packages/preload-plugin/CLAUDE.md) — Preload plugin architecture
- [packages/memory-plugin/CLAUDE.md](packages/memory-plugin/CLAUDE.md) — Memory plugin architecture
- [packages/navigation-plugin/CLAUDE.md](packages/navigation-plugin/CLAUDE.md) — Navigation API plugin architecture
- [packages/core/src/namespaces/RoutesNamespace/CLAUDE.md](packages/core/src/namespaces/RoutesNamespace/CLAUDE.md) — route table, CRUD during navigation, `subscribeChanges`
- [packages/core/src/namespaces/NavigationNamespace/CLAUDE.md](packages/core/src/namespaces/NavigationNamespace/CLAUDE.md) — transition pipeline and cancellation
- [packages/core/src/engine/CLAUDE.md](packages/core/src/engine/CLAUDE.md) — Routing engine (merged): route-tree facade + path-matcher + search-params layers (#1510); folded into core as `src/engine` (engine-merge iteration 2)
- [packages/core/src/utils/fsm/CLAUDE.md](packages/core/src/utils/fsm/CLAUDE.md) — FSM engine internals (the live, sole copy in core; the standalone `@real-router/fsm` package was deleted from source in wave-3, its published `0.6.1` deprecated on npm)
- [benchmarks/CLAUDE.md](benchmarks/CLAUDE.md) — Benchmark suite
- [MCP Servers Guide](.claude/mcp-guide.md)
- [Roadmap to 1.0](https://github.com/greydragon888/real-router/issues/296) — issue #296, milestone tracking
- [Wiki](https://github.com/greydragon888/real-router/wiki) (local: `/Users/olegivanov/WebstormProjects/real-router.wiki`)
