# Implementation Notes

> Non-obvious architectural decisions and infrastructure setup

## Project Rename

Project renamed from `router6` to `real-router`. Updated in:

- `package.json` (name, repository, bugs, homepage)
- `sonar-project.properties` (projectKey, projectName)
- `.changeset/config.json` (repo)
- `tsconfig.json` (paths: `router6*` → `@real-router/*`)
- `.github/workflows/release.yml` (repository name in comments)

### Directory Structure

Source directories renamed: `modules/` → `src/`. Updated in:

- `turbo.json` (inputs patterns)
- `tsconfig.json` (paths)
- All package.json files

## Versioning Strategy

### Independent Versioning

Each package has its own version. NOT using `fixed` mode in changesets (where all packages share the same version).

### Version Synchronization

Root `package.json` version is synced from `@real-router/core`:

```bash
pnpm version  # runs changeset version + sync + changelog aggregation
```

Scripts executed:

1. `changeset version` — updates package versions and changelogs
2. `.changeset/cap-major-bumps.mjs` — prevents accidental major bumps in pre-1.0 packages (caps at minor)
3. `.changeset/sync-version.mjs` — syncs root package.json version from core
4. `.changeset/aggregate-changelog.mjs` — aggregates package changelogs to root CHANGELOG.md

Root package is private and never published (cosmetic only).

### Changelog Aggregation

Root `CHANGELOG.md` is auto-populated from package changelogs:

```markdown
## [2026-01-24]

### @real-router/core@0.2.0

### Minor Changes

- Feature X

### @real-router/helpers@0.1.1

### Patch Changes

- Updated dependencies
```

**Features:**

- Runs after `changeset version`
- Only includes public packages (skips private)
- Includes ALL versions: initial releases, patches, dependency updates
- Incremental — only adds new entries (checks existing `### package@version`)
- Sorted by package name (alphabetical), then version (descending)
- Uses date-based sections (`## [YYYY-MM-DD]`)

**Script:** `.changeset/aggregate-changelog.mjs`

### Private Packages Versioning

`.changeset/config.json`:

```json
{
  "privatePackages": {
    "version": true, // Version private packages (route-tree, search-params, etc.)
    "tag": false // Don't publish to npm
  }
}
```

**Why?** Public packages depend on private packages. Changesets needs to update versions in lock step, but shouldn't try to publish private packages.

**Note:** `@real-router/types` (formerly `core-types`) is now a **public** package published to npm.

## Release Automation

### Workflow: `.github/workflows/changesets.yml`

**Trigger:** `workflow_run` — runs after `Post-Merge Build` workflow completes successfully on master.

**Flow:**

1. Developer runs `pnpm changeset` → creates `.changeset/*.md`
2. Push to master triggers `Post-Merge Build` workflow
3. Build passes → triggers changesets workflow
4. If changesets exist → creates/updates "Version Packages" PR (uses `PAT_TOKEN` to trigger CI on created PR)
5. Maintainer merges Release PR
6. Next CI pass on master → `pnpm changeset publish` publishes to npm + creates GitHub Releases via `gh release create`

**OIDC Trusted Publishing:**

- Uses npm's native OIDC (no NPM_TOKEN secret needed)
- Requires Node.js 24+ (npm >= 11.5.1)
- First publish must be manual (`npm publish`) - can't configure Trusted Publisher before package exists
- Trusted Publisher configured with workflow: `changesets.yml`

**Build optimization:** Release workflow uses `pnpm turbo run build:dist-only --filter='!./examples/**'` and `pnpm turbo run test --filter='!./examples/**'` — packages only, skipping ~130 example apps. Previously used bare `pnpm build` / `pnpm test` which ran the full ~1200-task pipeline including all examples, adding ~10 minutes to release time.

### Critical: Use `pnpm publish` NOT `npm publish`

**Problem discovered (Issue #18):** `npm publish` does NOT convert `workspace:^` protocol to actual versions. Packages were published with literal `"@real-router/logger": "workspace:^"` in dependencies, causing `npm install` to fail.

**Solution:** Use `pnpm publish` which:

1. Converts `workspace:^` → `^0.2.0` (actual version)
2. Internally calls `npm publish` (OIDC works)

```bash
# ❌ WRONG - publishes with workspace:^
npm publish --provenance --access public

# ✅ CORRECT - converts workspace protocol
pnpm publish --provenance --access public --no-git-checks
```

**Sources:**

- [pnpm workspaces docs](https://pnpm.io/workspaces) — workspace protocol conversion
- [pnpm/pnpm#9812](https://github.com/pnpm/pnpm/issues/9812) — "pnpm publish runs npm publish under the hood"

### Publish Order in changesets.yml

`pnpm changeset publish` handles dependency-ordered publishing automatically. It:

- Checks which versions are not on npm
- Publishes in dependency order
- Skips already published (warns, doesn't fail)
- Creates git tags (with fallback for silent tag failures — see [changesets#1621](https://github.com/changesets/changesets/issues/1621))
- Uses `pnpm publish` internally (detects from lockfile, OIDC works)

### TypeScript Declarations Generation

**Problem (Issue #21):** `dts-bundle-generator` inlined ALL types into each package's `.d.ts` file, making `Router` from `@real-router/core` and `Router` from `@real-router/browser-plugin` structurally identical but nominally different types:

```typescript
router.usePlugin(browserPluginFactory()); // ❌ TypeScript Error
// Type 'PluginFactory<object>' is not assignable to type 'PluginFactory<object>'
```

**Solution:** Publish `@real-router/types` as a standalone public package. All packages import types from it.

**JS bundling:** tsdown with `deps.alwaysBundle` option bundles private packages:

```typescript
// packages/core/tsdown.config.mts
export default createIsomorphicConfig({
  deps: {
    alwaysBundle: ["event-emitter", "route-tree"],
  },
});
```

**DTS generation:** tsdown with `dts: true` generates type declarations and automatically resolves types from bundled dependencies.

**Results:**

| Metric               | Before | After | Change |
| -------------------- | ------ | ----- | ------ |
| Total .d.ts lines    | 12,080 | 3,793 | -69%   |
| core .d.ts           | 1,807  | 216   | -88%   |
| browser-plugin .d.ts | 1,831  | 500   | -73%   |
| react .d.ts          | 1,813  | 80    | -96%   |

This approach ensures:

- Types are not duplicated across packages
- Module augmentation works correctly
- Type compatibility between packages (same type identity)

**Removed:** `dts-bundle-generator` and `scripts/generate-dts.mjs` are no longer used.

**GitHub Releases:**
Per-package releases — each published package gets its own GitHub release via `gh release create`:

- Tag format: `{package-name}@{version}` (e.g., `@real-router/core@0.2.0`)
- Release notes extracted from each package's `CHANGELOG.md` (first `## ` section)
- Skips if release already exists (idempotent)
- Two-pass creation: dep-bump-only releases first (sink to bottom on GitHub), then featured releases with actual code changes (float to top)

### SonarCloud Version

The `sonarcloud` job inside `.github/workflows/ci.yml` (consolidated from the former standalone `sonarcloud.yml`) gets version dynamically:

```yaml
- id: version
  run: |
    VERSION=$(node -p 'require("./packages/core/package.json").version')
    echo "version=$VERSION" >> $GITHUB_OUTPUT

- name: SonarCloud Scan
  uses: SonarSource/sonarqube-scan-action@... # v7
  with:
    args: >
      -Dsonar.projectVersion=${{ steps.version.outputs.version }}
```

This ensures SonarCloud shows correct version without manual updates.

## Git Hooks

### Commit Message Validation

`.husky/commit-msg`:

```bash
pnpm commitlint --edit "$1"
```

Enforces conventional commits. Types and scopes defined in `commitlint.config.mjs`.

### Pre-commit

`.husky/pre-commit` runs (correctness validation, fast — <2 min on a typical commit):

- **Auto-dedupe** — if `pnpm-lock.yaml` is staged, runs `pnpm dedupe` and re-stages the lockfile. This eliminates manual `pnpm dedupe` runs after dependency updates ([pnpm/pnpm#7258](https://github.com/pnpm/pnpm/issues/7258) — no auto-dedupe setting exists in pnpm 10)
- `pnpm lint:deps` (syncpack — workspace version consistency, ~1s static scan)
- `pnpm turbo run test --filter='!./examples/**'` (includes type-check and lint via turbo task graph, excludes examples)
- `pnpm lint:e2e` (verifies example e2e directories have spec files)

### Pre-push

`.husky/pre-push` runs (artifact validation, NOT a superset of pre-commit):

- `pnpm lint:duplicates` (jscpd — copy-paste detection across the full tree)
- `pnpm turbo run build lint:package lint:types --filter='!./examples/**'` (full build + validate package.json exports via publint + validate `.d.ts` via arethetypeswrong)
- `pnpm lint:unused` (knip — dead code detection across the full tree)
- `pnpm lint:deps` (syncpack — final gate before the push reaches the remote)
- `pnpm lint:audit` (osv-scanner — vulnerability scan against the GHSA database; non-blocking if the binary is missing locally)

**Rationale:** Pre-commit validates correctness in <2 min so it stays painless on every commit. Pre-push validates artifacts (full build pipeline + dist surface area + dep consistency + GHSA audit) — slower, runs once per push. `lint:deps` lives in **both** layers: pre-commit catches workspace version drift the moment a `package.json` is staged (~1s static check), pre-push acts as the final gate. `lint:duplicates`/`lint:unused` live only in pre-push because their analysis depends on the full tree, not on a single commit's diff. `lint:audit` was added after PR #643 (see "Local Dependency Audit" below) so contributors can catch CVEs locally before CI Dependency Review flags them.

The full build orchestrator (`pnpm turbo run build`) is wired in `turbo.json` to depend on `bundle`, `test`, `test:properties`, AND `test:stress` — so pre-push exercises stress tests for every human push. Stress coverage is intentionally **not** duplicated in CI workflows (see "CI: `test:stress` lives only in pre-push" below).

## Commit Conventions

### Scope Sync

`commitlint.config.mjs` is the single source of truth for commit types and scopes:

```javascript
// commitlint.config.mjs
export const TYPES = ["feat", "fix", "docs", ...];
export const SCOPES = ["core", "logger", "browser-plugin", ...];

// cz.config.js imports from commitlint
import { TYPES, SCOPES } from "./commitlint.config.mjs";
```

To add a new scope, edit only `commitlint.config.mjs`.

### Release Type

Added `release` type for release commits:

```javascript
{ value: "release", name: "release:  Release commit" }
```

### Empty Scope Allowed

```javascript
"scope-empty": [0]  // Allow commits without scope
```

## CI Pipeline

### Single Pipeline Architecture

`.github/workflows/ci.yml` — single workflow with a unified `Pipeline` job that replaces the former parallel Lint & Type Check + Test + Build jobs. Downstream jobs: Coverage (Codecov), SonarCloud, Bundle Size, Package Smoke Test. Gate job: "CI Result" (single required status check).

Pipeline runs two turbo invocations in one VM:

1. `turbo run test test:properties test:stress -- --coverage` — full validation (type-check → lint → test), vitest receives `--coverage` via turbo passthrough
2. `turbo run bundle` — only tsdown/rollup/svelte-package, deps cached from step 1

**Why not parallel jobs:** Parallel lint and test jobs caused a turbo remote cache race condition — both ran `type-check` simultaneously, neither could read the other's cache. Merging into one job eliminates the race and saves one VM's billing time.

**Why two turbo invocations:** `turbo run build -- --coverage` passes `--coverage` to `build` scripts (tsdown), not to `test` scripts (vitest). Separate invocations ensure vitest gets `--coverage` and bundle step gets cache hits from step 1.

### Package Smoke Test

CI job `smoke` (added after #413 and #418): packs all 24 public packages into tarballs, installs them into an isolated temp project via `npm install`, and verifies every export resolves with `import()`.

**Script:** `scripts/smoke-test-packages.sh`

**Catches:**

- Private packages leaking into dependencies (#413 — `dom-utils` in published deps)
- Broken export paths, missing dist files

**Skipped packages** (cannot be imported in plain Node.js):

- `@real-router/types` — types-only package, no runtime exports
- `@real-router/solid` — solid-js runtime requires browser/DOM environment
- `@real-router/svelte` — `.svelte` files require Svelte compiler

These packages are verified as installed (directory exists) but not imported.

Node.js 24 only (no matrix). Runs on `ubuntu-latest`.

### Incremental Builds with --filter

CI uses turbo `--filter` with git diff syntax for incremental builds:

```yaml
# Pipeline job — two turbo invocations:
pnpm turbo run test test:properties test:stress --filter='...[$TURBO_BASE]' --filter='!./examples/**' -- --coverage
pnpm turbo run bundle --filter='...[$TURBO_BASE]' --filter='!./examples/**'

# Smoke job — all packages, cache from pipeline:
pnpm turbo run bundle --filter='./packages/*'
```

`$TURBO_BASE` is computed by the `check` job: `github.event.before` for push events, `origin/master` for PRs.

**Why not `--affected`:** Turbo does not allow `--affected` with `--filter`. The `--filter='!./examples/**'` exclusion is required — without it, ~90 example apps run their lint/test/build, adding ~20 minutes to CI. The `...[ref]` syntax provides equivalent git-diff filtering while allowing combination with exclusion filters.

**Check job:** Pre-filters by changed files (skips CI for docs-only changes, skips for `changeset-release/*` PRs). Computes `turbo_base` as a job output consumed by all downstream jobs.

### Concurrency

All workflows use concurrency control:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Cancels in-progress runs when new commit pushed.

### CI: `test:stress` lives only in pre-push

**Problem.** A full PR rebuild used to take ~28 min (measured on PR #651, sha=06adf39b parent, lockfile-bump scenario where every package was cache-missed). The `test:stress` stage contributed ~5 min of that budget across ~17 stress tasks (one per package with reactive subscriptions or async pipelines). The signal-to-cost ratio is bad: stress tests catch leak/race-condition regressions that virtually never originate in PR diffs — they appear when a framework adapter's dependency (React/Vue/Solid/Svelte) bumps and changes cleanup semantics, or when a new plugin is introduced.

**Solution (commits `06adf39b`, `d2fbfa4a`).** Drop `test:stress` from both CI workflows that previously ran it:

- `ci.yml` "Test with coverage" step: `pnpm turbo run test test:properties test:stress …` → `pnpm turbo run test test:properties …`
- `post-merge.yml` "Build" step: `pnpm turbo run build …` → `pnpm turbo run bundle test test:properties …` (avoids the `build` orchestrator dependency on `test:stress` declared in `turbo.json`)

The `build` task in `turbo.json` still lists `test:stress` in its `dependsOn` — so anyone running `pnpm build` locally (and the **pre-push hook**, which does exactly that) continues to exercise the full stress suite. Stress coverage is preserved for every human push.

Post-removal numbers:

| Workflow             | Before        | After                 |
| -------------------- | ------------- | --------------------- |
| PR CI full rebuild   | ~28 min       | **~22–23 min**        |
| Post-Merge Build full rebuild | ~25 min | **~18–20 min**       |
| Cache hit (any)      | unchanged     | unchanged (~1–5 min)  |

**Why this is safe enough.** Pre-push covers stress for every human push. Dependabot PRs bypass pre-push (the bot pushes directly to its fork), so framework-adapter bumps (React/Vue/Solid/Svelte) lose their stress safety net here — a deliberate trade-off, on the bet that adapter bumps are rare and locally re-runnable when a leak is suspected.

**How to undo.** Re-add `test:stress` to either `ci.yml`'s "Test with coverage" step or to `post-merge.yml`'s explicit task list, and the orchestration kicks back in. Both workflows carry inline comments pointing at this rationale so the trade-off is rediscoverable.

### pnpm/action-setup v6

All CI workflows use `pnpm/action-setup@v6` (`ci.yml`, `changesets.yml`, `danger.yml`, `post-merge.yml`, `examples.yml`, `codeql.yml`). v5 introduced auto-detection of pnpm version from the `packageManager` field in root `package.json` — no explicit `version` input needed; v6 preserved this behavior.

### Workflows

| Workflow             | File                       | Purpose                                                                           |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| CI                   | `ci.yml`                   | Single Pipeline job on PRs: test + bundle, then smoke test, coverage, bundle size |
| Post-Merge Build     | `post-merge.yml`           | Build-only verification on master push                                            |
| Changesets           | `changesets.yml`           | Versioning and npm publish (triggered by Post-Merge Build success)                |
| Changeset Check      | `changeset-check.yml`      | Validate changesets on PRs (format, references)                                   |
| CodeQL               | `codeql.yml`               | Security scanning + dependency audit                                              |
| Dependabot Automerge | `dependabot-automerge.yml` | Auto-merge patch/minor updates                                                    |
| Danger               | `danger.yml`               | Automated PR review checks                                                        |
| Examples             | `examples.yml`             | Scheduled e2e tests for example apps (Mon & Thu)                                  |

**Removed:** `build.yml`, `sonarcloud.yml`, `coverage.yml`, `size.yml`, `release.yml` (consolidated into `ci.yml` and `changesets.yml`)

### Bundle Size Reporting

Bundle Size job (in `ci.yml`) compares bundle sizes between PR and base branch:

- Creates/updates PR comment with size diff table
- Shows per-package sizes and total
- Warns if size limit exceeded

**Optimization:** PR sizes use dist artifacts downloaded from the Pipeline job (no rebuild). Base branch uses `bundle` task (only tsdown, skips tests/lint). The PR's `turbo.json` is saved before checking out base and restored after — ensures `bundle` task definition is available even on older base branches.

### Security Scanning

`.github/workflows/codeql.yml`:

- Runs CodeQL analysis on push/PR to master
- Weekly scheduled scan (cron: `0 3 * * 1`)
- Uses config file `.github/codeql/codeql-config.yml` for query configuration
- Dependency review on PRs (fails on moderate+ severity, uses `.github/dependency-review-config.yml` for license allow-list and inline `allow-ghsas:` for individual GHSA exemptions)

#### Local Dependency Audit (PR #643)

**Problem:** `actions/dependency-review-action` only runs on PRs in CI — contributors discover GHSAs after pushing, and the action only flags vulns *newly introduced* by the PR relative to base, so pre-existing CVEs in the lockfile stay invisible until something changes them.

**Solution:** `scripts/check-deps-audit.sh` wraps `osv-scanner` (`brew install osv-scanner`) to scan `pnpm-lock.yaml` + every `Cargo.lock` against the same GHSA database GitHub uses. Wired as `pnpm lint:audit` and runs in pre-push.

**Behavior:**
- Skips gracefully with a hint if `osv-scanner` is not installed (fresh clones / non-security contributors can still push).
- `scripts/osv-scanner.toml` is the single source of truth for ignored advisories — mirrors `allow-ghsas:` in `codeql.yml` AND lists RUSTSEC unmaintained advisories without CVSS that GitHub Dependency Review ignores but osv-scanner reports (gtk/atk/gdk/glib/unic-\*/proc-macro-error — all transitive via Tauri 2.x in desktop examples only).

**Sync rule:** when adding a new exemption, update **both** files (`scripts/osv-scanner.toml` + `.github/workflows/codeql.yml`) — they must stay aligned.

**Coverage difference vs CI Dependency Review:**
- CI: only flags vulns introduced by the PR (delta vs base).
- Local: full state of current lockfiles (catches pre-existing CVEs too).

### Dependabot

`.github/dependabot.yml` configures automated dependency updates:

- Weekly schedule (Monday 04:00)
- Groups: dev-dependencies, eslint, typescript, testing, turbo
- GitHub Actions updates (separate config)

`.github/workflows/dependabot-automerge.yml`:

- Auto-merges patch updates
- Auto-merges minor dev dependency updates
- Uses squash merge

### Danger JS

`.github/workflows/danger.yml` runs automated PR review checks via `dangerfile.ts`:

**Checks performed:**

| Check                   | Trigger                            | Action         |
| ----------------------- | ---------------------------------- | -------------- |
| IMPLEMENTATION_NOTES.md | Infrastructure files changed       | Warn           |
| Architectural changes   | Public API, types, or new packages | Message/Warn   |
| Changeset reminder      | Source files changed, no changeset | Warn           |
| PR size                 | >500 lines changed                 | Message/Warn   |
| PR description          | Empty or short description         | Warn           |
| Lockfile sync           | package.json deps changed, no lock | Warn           |
| Test coverage           | New source files without tests     | Message        |
| Console statements      | console.log added to source files  | Warn           |
| PR statistics           | Always                             | Markdown table |

**Skip checks:** Add `#trivial` to PR title or body.

**Local testing:**

```bash
pnpm danger:local
```

**Configuration:** `dangerfile.ts` in project root.

## GitHub Repository Config

### CODEOWNERS

`.github/CODEOWNERS` defines code ownership for PR reviews:

```
* @greydragon888
/packages/ @greydragon888
/.github/ @greydragon888
```

### Funding

`.github/FUNDING.yml`:

```yaml
github: [greydragon888]
ko_fi: greydragon888
```

## Quality Tools

| Tool             | Purpose                           | Command                               |
| ---------------- | --------------------------------- | ------------------------------------- |
| syncpack         | Dependency version consistency    | `pnpm lint:deps`                      |
| knip             | Dead code detection               | `pnpm lint:unused`                    |
| jscpd            | Copy-paste detection              | `pnpm lint:duplicates`                |
| size-limit       | Bundle size tracking              | `pnpm size`                           |
| arethetypeswrong | TypeScript declaration validation | `pnpm lint:types`                     |
| publint          | Package.json exports validation   | `pnpm lint:package`                   |
| smoke test       | Consumer install + import check   | `bash scripts/smoke-test-packages.sh` |
| SonarCloud       | Code quality & security           | `pnpm sonar:local`                    |
| CodeQL           | Security vulnerabilities          | GitHub Actions                        |
| Codecov          | Coverage reporting                | GitHub Actions                        |
| Danger           | Automated PR review               | `pnpm danger:local`                   |

### jscpd Configuration

`.jscpd.json`:

```json
{
  "threshold": 2,
  "minLines": 5,
  "minTokens": 50,
  "skipComments": true,
  "format": ["typescript", "tsx", "svelte"]
}
```

Ignores: `*.d.ts`, `*.test.ts`, `*.test.tsx`, `*.bench.ts`, `*.spec.ts`, `*.properties.ts`, `benchmarks/**`, `packages/preact/src/**`, `packages/hash-plugin/src/**`, `packages/*/src/dom-utils/**`, `packages/dom-utils/src/**` (last two are symlinks to `shared/dom-utils/` — see #437 section; without the ignore jscpd would report 6 false-positive duplicates).

**`svelte` format (jscpd 4.2+).** Adds Svelte SFC tokenization — jscpd parses each `<script>`/`<template>`/`<style>` block with its native format and cross-detects clones across formats (e.g., duplicated logic between a `.svelte` script block and a `.ts` helper). Currently exercised by `packages/svelte/src/RouterProvider.svelte`. No false positives on the current source tree (clones: 4 / 0.15%, well under the 2% threshold).

### size-limit Configuration

`.size-limit.js` defines per-package limits. esbuild measures dist bundles as consumers receive them — no custom export conditions.

**Historical:** Previously used `modifyEsbuildConfig: addDevelopmentCondition` to resolve workspace deps to `src/` for granular tree-shaking measurement. Removed after `"development"` condition was dropped from exports (#421). Size measurements now reflect actual consumer bundle sizes. `@real-router/sources` limit increased from 1.5 kB to 1.7 kB (measurement methodology change, not code regression).

React package ignores `react`, `react-dom`, `@real-router/core`, `@real-router/route-utils`, and `@real-router/sources` from size calculation.

### knip Configuration

Uses knip v6+ (migrated from v5). Schema URL updated to `https://unpkg.com/knip@6/schema.json`.

Global `ignoreDependencies`: `@stryker-mutator/api`, `jsdom` (test infrastructure).

Per-workspace configurations in `knip.json`:

- **Root**: entry scripts, ignores `fast-check` (used but not detected by knip)
- **`benchmarks`** (now at root level, excluded via `ignoreWorkspaces`): was `packages/router-benchmarks` with custom `entry: ["src/**/*.ts"]`; `src/` renamed to `core/`
- **`packages/react`**, **`packages/preact`**, **`packages/vue`**, **`packages/solid`**, **`packages/svelte`**: each lists `"ignore": ["src/dom-utils/**"]` to skip the symlinked shared sources (see #437 section)
- **`packages/solid`**: additionally ignores `@babel/preset-typescript`, `babel-preset-solid` (build-only deps)
- **`packages/svelte`**: additionally ignores `@real-router/browser-plugin` (workspace dep used at runtime)
- **`packages/dom-utils`**: `entry: ["tests/**/*.{ts,tsx}"]`, `project: ["tests/**/*.ts"]` — src is a symlink, not analyzed
- **`packages/vue`** and **`packages/svelte`**: explicit vitest config paths
- **`packages/*`** (catch-all): includes stryker config support

`ignore` array is intentionally empty — knip excludes `dist/`, `coverage/`, and `*.d.ts` by default.

`ignoreWorkspaces: ["examples/**"]` — examples have different dependency structures (Express, Vite, Playwright) that would trigger false positives in knip analysis. Uses `**` glob to match the nested `examples/{framework}/{app}` directory structure.

### syncpack Configuration

Uses syncpack v14 (Rust rewrite). `syncpack.config.mjs` enforces:

- Workspace packages use `workspace:^` protocol (pinned via `policy: "pinned"` version group)
- Peer dependencies use `>=` ranges
- All other dependencies are pinned (exact versions)
- Consistent versions across all packages (`policy: "sameRange"`)

**v13 → v14 migration notes:**

- `lintFormatting`, `lintSemverRanges`, `lintVersions` config options removed (always enabled in v14)
- `fix-mismatches` command → `fix`
- Local package versions (`.version` field) must be ignored in both `semverGroups` and `versionGroups` — v14 includes them in `sameRange` checks, causing false positives when comparing `0.x.y` with `workspace:^`
- Workspace dependencies moved to a separate `pinned` version group (`pinVersion: "workspace:^"`) — v14's `sameRange` cannot compare `workspace:^` specifiers

## Turbo Configuration

Uses turbo v2.9.6.

**v2.9 migration:** Adopted `futureFlags` for the new global configuration schema:

```json
"futureFlags": {
  "globalConfiguration": true,
  "errorsOnlyShowHash": true,
  "affectedUsingTaskInputs": true,
  "watchUsingTaskInputs": true,
  "filterUsingTasks": true
}
```

`globalConfiguration: true` moves top-level settings into a `global` block: `concurrency`, `passThroughEnv`, `inputs`, `env`. This replaces the deprecated flat `globalPassThroughEnv`, `globalDependencies`, etc.

`global.inputs` defines config-level inputs that affect all tasks (e.g., `tsconfig.json`, `pnpm-lock.yaml`, `eslint.config.*`).

`global.env` passes `BENCH_ROUTER`, `BENCH_NO_VALIDATE`, `BENCH_SECTIONS` for benchmark configuration.

**v2.8.11 migration (historical):** Removed `"daemon": false` from `turbo.json` — daemon was removed from `turbo run` in v2.8.11 (option deprecated, daemon only used for `turbo watch`).

### Concurrency Limit

`turbo.json` → `global.concurrency`:

```json
{
  "global": {
    "concurrency": "4"
  }
}
```

**Why:** Without a limit, turbo runs all tasks in parallel on uncached runs. Property-based tests (fast-check) are memory-intensive — running 5+ property test suites + builds simultaneously causes OOM kills (exit code 137). With cache, most tasks are hits and memory stays low. The limit prevents OOM on cold runs (cleared cache, new CI runner, fresh clone).

### Environment Variables

`turbo.json` → `global.passThroughEnv`:

```json
{
  "global": {
    "passThroughEnv": ["CI", "GITHUB_ACTIONS"],
    "env": ["BENCH_ROUTER", "BENCH_NO_VALIDATE", "BENCH_SECTIONS"]
  }
}
```

`CI` and `GITHUB_ACTIONS` are passed through globally. `BENCH_*` variables are declared as global env inputs for cache invalidation. Test task uses additional `passThroughEnv` for `CI`.

### Task Renames

- `publint` → `lint:package`
- Added `lint:types` for arethetypeswrong

### Build Dependency Chain

```
bundle → depends on ^bundle (upstream packages only, no test/lint)
build  → depends on bundle + test + test:properties + test:stress (orchestrator, no own command)
test → depends on ^bundle + lint + type-check
test:properties → depends on ^bundle + test + lint + type-check
test:stress → depends on ^bundle + test:properties + test + lint + type-check
type-check → no dependencies (reads src directly via customConditions, #431)
lint:package → depends on bundle (publint validates exports paths in dist)
lint:types → depends on bundle (attw validates .d.ts across module variants)
```

**`bundle` vs `build`:** `bundle` is a lightweight task that only runs the bundler (tsdown/rollup/svelte-package) and upstream `^bundle`. `build` is an orchestrator with `Command = <NONEXISTENT>` (no script in package.json) that depends on `bundle` + all test tiers. turbo runs all dependencies, skips the non-existent command, and records cache. This allows `turbo run bundle` to produce dist/ without running tests.

**Cache sharing:** `turbo run build` triggers `bundle` as a dependency → caches `bundle:*`. Subsequent `turbo run bundle` gets cache hits. CI Pipeline uses this: step 1 (test) triggers `^bundle` for upstream, step 2 (`turbo run bundle`) gets cache hits for upstream and only runs bundle for leaf affected packages.

**Why `^bundle` instead of `^build`:** Test/lint tasks only need upstream `dist/` (for import resolution), not upstream test results. Depending on `^build` would run upstream tests before downstream tests — unnecessary serialization. Upstream tests run via their own `turbo run build` in pre-push hooks and CI.

**Why type-check has no dependencies:** After the `@real-router/internal-source` custom export condition was added (#431 root fix), monorepo `tsc --noEmit` resolves workspace packages directly to `src/*.ts` via `tsconfig.json` `customConditions`. No `dist/` is required. See "Custom `@real-router/internal-source` Export Condition" below for the full saga.

### Input Patterns Performance

**Problem:** Turbo `--dry-run` took 92 seconds with valid cache due to glob patterns scanning `node_modules`.

**Root cause:** Patterns like `**/*.{ts,tsx}` in `inputs` were scanning 536MB of `node_modules` (50k+ files) for hash calculation.

**Solution:** Add explicit exclusion to all tasks with recursive globs:

```json
{
  "lint": {
    "inputs": [
      "**/*.{ts,tsx,js,jsx}",
      "!dist/**",
      "!coverage/**",
      "!**/node_modules/**"
    ]
  },
  "type-check": {
    "inputs": ["**/*.{ts,tsx}", "!dist/**", "!**/node_modules/**"]
  },
  "test": {
    "inputs": [
      "src/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "!**/node_modules/**"
    ]
  }
}
```

**Result:** 92s → 1.4s (65x improvement).

**Rule:** Always add `!**/node_modules/**` when using `**/*.{ext}` patterns in turbo.json inputs.

### `outputLogs: "errors-only"` for All Tasks

**Problem:** With 25 packages + 70 example applications, turbo output was noisy — successful tasks printed verbose logs, making it hard to spot failures.

**Solution:** Added `"outputLogs": "errors-only"` to every task in `turbo.json`. Tasks are silent on success; full output appears only on failure.

**Verbose mode:** Root `package.json` provides `build:verbose` and `test:verbose` scripts that override with `--output-logs=full` for debugging:

```bash
pnpm build:verbose      # Build with full output
pnpm test:verbose       # Tests with full output
```

### Input Patterns for Vue and Svelte

**Problem:** Turbo `inputs` patterns only covered `*.{ts,tsx}`. Vue SFCs (`.vue`) and Svelte components (`.svelte`) were not tracked — turbo could miss cache invalidation for changes in these files.

**Solution:** Extended input patterns in `build` and `type-check` tasks:

```json
// Before
"src/**/*.{ts,tsx}"
"**/*.{ts,tsx}"

// After
"src/**/*.{ts,tsx,vue,svelte}"
"**/*.{ts,tsx,vue,svelte}"
```

### `build:dist-only` → `bundle` Task Evolution

**Phase 1 — `build:dist-only` (#403):** Introduced as a "fast build without tests" for CI bundle size comparison. Became a workaround for flaky CI after #421 forced `type-check` to read `dist/` artifacts. Created a race condition with parallel `tsdown` invocations exposed by #431.

**Phase 2 — Removed (#431 root fix):** `build:dist-only` removed entirely. `@real-router/internal-source` custom export condition let `tsc` read `src/*.ts` directly. See "Custom `@real-router/internal-source` Export Condition" below.

**Phase 3 — `bundle` task (current):** Re-introduced as `bundle` with a cleaner design. Unlike the old `build:dist-only` (which was a parallel copy of `build`), `bundle` is the **canonical build step** — `build` depends on it:

```json
"bundle": {
  "dependsOn": ["^bundle"],
  "outputs": ["dist/**"],
  "inputs": ["src/**/*.{ts,tsx,vue,svelte}", "tsdown.config.*", "tsconfig.json", "package.json"]
},
"build": {
  "dependsOn": ["bundle", "test", "test:properties", "test:stress"],
  "inputs": [],
  "outputs": []
}
```

Package.json scripts: `"bundle": "tsdown"` (no `"build"` script — turbo handles `<NONEXISTENT>` by running dependencies and recording cache). Cache sharing: `turbo run build` caches `bundle:*`, subsequent `turbo run bundle` gets hits.

Used in CI: smoke test and bundle-size run `turbo run bundle` (~32 tasks) instead of `turbo run build` (~161 tasks with full test graph).

### Custom `@real-router/internal-source` Export Condition

**Problem:** After #421 removed the `"development"` export condition (because Vite auto-activates it at dev time and broke external consumers via resolution of missing `src/`), monorepo `tsc` was forced to resolve workspace types via `exports` → `dist/*.d.ts`. This created a chain of cascading failures:

1. **Race condition:** `type-check.dependsOn: ["build:dist-only"]` and `test.dependsOn: ["^build"]` both triggered `tsdown` on the same `dist/` directory in parallel. `tsdown` cleans `dist/` before writing, creating a window where downstream `type-check` would see missing files.

2. **Incomplete `.d.ts` generation (#425):** tsdown + rolldown RC (pre-1.0) had gaps in declaration generation. Monorepo `tsc` started seeing these gaps directly instead of reading the richer original `src` types.

3. **Remote-cache staleness (#431):** turbo's remote cache served stale `dist/` artifacts for packages whose own `src/` hadn't changed, even when their workspace dependencies' `src/` had. Downstream `type-check` then ran against a `dist/` that didn't match the current source graph.

All three of these caused flaky CI across the `#413 → #414 → #418 → #419 → #421 → #423 → #424 → #425` saga that started with #413 (April 6, 2026) and manifested as the first red build on April 8.

**Solution:** Use a custom scoped export condition `@real-router/internal-source` that external tools (Vite, Webpack, Node.js) don't activate automatically. The condition is just a **string key** in `package.json` `exports` — it does nothing until a resolver explicitly activates it by including that exact string in its list of active conditions. Enable it explicitly in all four monorepo-internal resolvers:

- **`tsc`** — Root `tsconfig.json` via `compilerOptions.customConditions: ["@real-router/internal-source"]`. Activates the condition for `tsc --noEmit` and IDE type-checking (VSCode TypeScript server).
- **Vitest** — `vitest.config.common.mts` via the `workspaceSourceAliases()` helper. The helper reads `exports["."]["@real-router/internal-source"]` directly from each workspace `package.json` and synthesizes a `resolve.alias` entry. Preferred over setting `resolve.conditions` globally because a naive conditions list breaks `preact` tests (dual-package hazard from condition order interference with `preact/hooks`).
- **ESLint (`import-x/no-unresolved`)** — `eslint.config.mjs` via `createTypeScriptImportResolver({ conditionNames: [...] })`. The `eslint-import-resolver-typescript` package maintains its **own** `conditionNames` list independent of `tsconfig.json` `customConditions`. Without adding `@real-router/internal-source` to it, the resolver falls through to the `types` condition, reads `dist/*.d.mts`, and fails when `dist/` isn't built yet (discovered on first CI push — `lint` has `dependsOn: ["^build"]` which only builds upstream, not own package).
- **Package declaration** — `packages/*/package.json` first key in every `exports` subpath: `"@real-router/internal-source": "./src/<entry>.ts"`. Declares the condition — without this no resolver can see it.

All four sites must use the **exact same string**. The name itself is arbitrary but must be byte-identical everywhere. Forgetting one site means the resolver silently falls through to the legacy `dist/`-based path.

Example from `packages/core/package.json`:

```jsonc
{
  "exports": {
    ".": {
      "@real-router/internal-source": "./src/index.ts",
      "types": {
        "import": "./dist/esm/index.d.mts",
        "require": "./dist/cjs/index.d.ts",
      },
      "import": "./dist/esm/index.mjs",
      "require": "./dist/cjs/index.js",
    },
  },
}
```

For `tsc` in the monorepo with `customConditions: ["@real-router/internal-source"]`:

- Resolution enters conditional exports
- First-match `@real-router/internal-source` wins → reads `./src/index.ts` directly
- No `dist/` lookup, no dependency on `tsdown` having run

For external consumers (Vite, Webpack, Node.js, etc.):

- They don't know about `@real-router/internal-source` — skip it
- Fall through to the standard `import` / `require` / `types` keys
- Resolve via `dist/` exactly as before — published package behavior is unchanged

**Why "development" wasn't viable:** Vite automatically activates the `"development"` condition in dev mode, so any package shipping `"development": "./src/..."` would have Vite trying to load `src/*.ts` from the installed tarball. This broke external Vite consumers even when they didn't want source resolution.

**Why a custom scoped name is safe:** Standard export conditions (`import`, `require`, `browser`, `node`, `default`, `development`, `production`) are reserved by tooling and may be auto-activated. Custom names like `@real-router/internal-source` — prefixed with a package-like scope — are only activated when a tool explicitly lists them. TypeScript `customConditions` supports this since 5.0.

**Why the `internal-source` suffix, not just `source`:** The first implementation used `@real-router/source`, but that visually collided with the real workspace package `@real-router/sources` (plural). Seeing both in the same `package.json` — one as a dependency and one as an exports key — caused immediate confusion ("are these related?"). Renamed to `@real-router/internal-source` to:

- Preserve the TypeScript-recommended scoped naming convention
- Make the "internal / not public API" signal explicit for future maintainers
- Be visually distinct from the `sources` package (no risk of misreading `sources` vs `source` as a typo)

**Rejected alternatives:**

- Strip `"development"` at publish time — requires a pre-publish transform hook, brittle and hidden magic
- Wait for `tsdown`/`rolldown` to stabilize `.d.ts` generation — no upstream timeline, out of our control
- Keep `"development"` and add `resolve.conditions` override to external consumer configs — pushes burden to users
- Rename to a standard condition like `"development"` — Vite breaks external consumers, #418 all over again

**Staged rollout (6 commits on the fix branch, PR #443):**

1. **Stage 1 — POC (`4e756cdc`):** Added `@real-router/internal-source` to `@real-router/types` only, plus `customConditions` in root `tsconfig.json`. Validated with `rm -rf packages/core-types/dist && tsc --traceResolution` from a downstream package — confirmed the resolver entered conditional exports and matched the new condition before the `types` fallback. Vitest side deliberately untouched during POC to isolate the TypeScript-side signal.

2. **Stage 2 — Mass migration (`a336b2d2`):** Added `@real-router/internal-source` to all 28 packages that publish an `exports` field (27 with the condition plus `@real-router/types` from Stage 1). Ran via a one-off Node script walking `packages/*/package.json` and inserting the condition as the first key of each subpath export. Initial script assumed `.ts` entries only; had to be extended with `.tsx` and directory-index fallbacks (discovered for `@real-router/solid` uses `src/index.tsx` and `@real-router/core` has `./api` / `./utils` subpaths backed by directory indexes rather than flat files). `svelte` was intentionally excluded — `svelte-package` build emits a non-standard exports shape using a `"svelte"` condition instead of `import`/`require`, and `.svelte` source files aren't directly readable by `tsc`. `svelte` is a leaf adapter in the monorepo (nothing imports it), so the race condition doesn't affect it.

3. **Stage 3 — Task graph cleanup (`e1d135b7`):** Removed the `build:dist-only` task entirely, reset `type-check.dependsOn` to `[]`, moved `lint:package` and `lint:types` to depend on `build`, removed `build:dist-only` scripts from all package.json files, and updated every workflow and hook to use `build`. Also fixed a long-hidden bug in `workspaceSourceAliases()` that failed to generate aliases for `@real-router/solid` because it only tried `.ts` while solid uses `.tsx`. The bug had been **silently masked** before Stage 3 by the old `type-check.dependsOn: ["build:dist-only"]` dependency chain, which eagerly built solid's `dist/` and let Vitest fall through to the dist-based resolution via exports. Removing that dependency chain exposed the broken alias, which surfaced as `Failed to resolve entry for package "@real-router/solid"` in solid's Vitest tests.

4. **Stage 4 — Documentation + changesets (`b5800dbe`):** `CLAUDE.md` bullet point in Non-Obvious Conventions. This `IMPLEMENTATION_NOTES.md` section. 22 changeset files (one per public package that received the condition, `minor` bump, referencing #431), generated by a helper script. `svelte` excluded (exports not modified); private packages excluded (don't publish).

5. **Stage 5 — ESLint resolver activation (`fbb9fe9b`):** First push to CI failed with `Unable to resolve path to module '@real-router/core'` in core's test setup files. Root cause: `eslint-import-resolver-typescript` maintains its **own** `conditionNames` list (in `eslint.config.mjs`), independent of `tsconfig.json` `customConditions`. Without `@real-router/internal-source` in that list, the resolver skipped the new condition and fell through to `types` → `dist/*.d.mts`, which doesn't exist at lint time (`lint.dependsOn: ["^build"]` only builds upstream, not own package). The regression was masked locally by a persistent `.eslintcache` from earlier green runs. Fix: replaced `"development"` (a dead condition since #421) with `"@real-router/internal-source"` as the first entry in the resolver's `conditionNames`. Full clean validation (including `.eslintcache` deletion) caught the issue on a second attempt.

6. **Rename `@real-router/source` → `@real-router/internal-source` (`990c5f2f`):** Pre-merge cleanup after spotting the naming collision with the real `@real-router/sources` package. Script replaced the string across 76 files (5 config + 28 package.json + 22 changeset content + 22 changeset filenames renamed from `source-condition-*.md` to `internal-source-condition-*.md`). Used `sed` with `[^s]` negative lookahead to avoid touching the `@real-router/sources` package name. Grep verification confirmed zero remaining `@real-router/source` references and unchanged `@real-router/sources` count.

**Trade-off analysis:**

- **Monorepo `tsc` overhead:** Now reads `src/*.ts` directly (larger AST, more files), adds a few seconds to cold type-check. Acceptable — the source types are richer and correct.
- **Vitest alias generation:** `workspaceSourceAliases()` continues to handle Vitest runtime resolution. Adding `@real-router/internal-source` to Vitest `resolve.conditions` globally was attempted in Stage 1 POC but broke `preact` tests (dual-package hazard from condition order interference with `preact/hooks`). Left as future work — alias is sufficient and deterministic.
- **`svelte` coverage:** Not migrated, but it's a leaf adapter. Its `type-check` still reads its own `src` and uses `svelte-check` which has its own resolution logic.
- **Four activation sites:** Each new monorepo-internal tool (type-checker, bundler, linter) must explicitly opt into the condition. Not zero-config, but the alternative (standard condition name like `"development"`) collides with auto-activation in external tools — which is exactly what broke #418 and triggered the entire saga.

**Related issues closed by this fix:**

- **#431** — Flaky CI `type-check` from stale `dist/`. Structurally impossible now that `type-check` doesn't depend on `dist/`.
- **#425** — Incomplete `.d.ts` from tsdown+rolldown RC. No longer affects monorepo `tsc`. Still affects external consumers until tsdown/rolldown stabilize, but that's out of our hands.
- **#403** — Build:dist-only optimization. Evolved into the `bundle` task — lightweight bundling without test dependencies. CI bundle size and smoke test use `turbo run bundle` instead of `turbo run build`.

### `test:e2e` Task

New turbo task for Playwright e2e tests in example applications:

```json
"test:e2e": {
  "dependsOn": ["^bundle"],
  "inputs": [
    "src/**/*.{ts,tsx,vue,svelte}",
    "e2e/**/*.{ts,tsx}",
    "playwright.config.*",
    "index.html",
    "vite.config.*",
    "package.json"
  ]
}
```

Depends on `^bundle` to ensure packages are compiled before examples run e2e tests. Uses `^bundle` (not `^build`) — e2e tests only need dist/, not upstream test validation.

### Self-Hosted Turbo Remote Cache (#490)

**Problem:** Vercel Remote Cache evicted artifacts non-deterministically on the free tier. Same SHA rerun showed **4 tasks going HIT → MISS** in ~2 minutes with zero input drift (#490 evidence: `@real-router/{angular,preact,react,solid}#lint`; `@real-router/svelte#test:properties` never landed remotely). Cost: 30–60 s wasted per PR at random.

**Solution:** Self-hosted [`ducktors/turborepo-remote-cache`](https://github.com/ducktors/turborepo-remote-cache) on Google Cloud Run with Cloudflare R2 as S3-compatible backend. Deployment runbook: [`.github/turbo-remote-cache-deployment.md`](.claude/turbo-remote-cache-deployment.md).

**Why R2 + Cloud Run:**

| Constraint | How this stack satisfies it |
|---|---|
| $0/mo for OSS-scale CI | R2: 10 GB + 1M Class A / 10M Class B ops free. Cloud Run: 2M req/mo + 360 K GB·s free. Well above footprint. |
| Deterministic retention | We control TTL via R2 lifecycle rules; no vendor-side eviction. |
| Compatible with existing `TURBO_*` env contract | Adds `TURBO_API` (public URL var); `TURBO_TOKEN`/`TURBO_TEAM` reused. |
| Minimal moving parts | Single stateless container, public endpoint, static bearer auth (`AUTH_MODE=static`). |

**Client wiring.** All 4 workflows (`ci.yml`, `post-merge.yml`, `changesets.yml`, `examples.yml`) declare `TURBO_API: ${{ vars.TURBO_API }}` alongside existing `TURBO_TOKEN`/`TURBO_TEAM`. When `TURBO_API` is unset, turbo falls back to Vercel's default endpoint — trivial rollback.

**Security model.** Cloud Run deployed with `--allow-unauthenticated`; access gated solely by `TURBO_TOKEN` (Bearer header). IAM-based auth (Workload Identity Federation) was rejected as dead weight: a GHA-secret leak compromises both models equally, and IAM adds GCP SA provisioning + 4-workflow auth steps — blows the 1–2 h setup budget without improving the threat model.

**Cost-control guardrails.** `--max-instances=3`, `--min-instances=0`, `--memory=512Mi`, `--timeout=60s`. Caps runaway autoscale (malicious replay or misconfigured CI loop) at free-tier ceiling.

**Operational notes.** Cold start ~2–5 s (min-instances=0) — still strictly better than 30–60 s Vercel miss. Bucket size reviewed monthly; R2 lifecycle rule (delete > 30 d old) added when approaching 10 GB.

**Empirical results (PR #491, April 2026).** Four back-to-back CI runs on the self-hosted cache validated both the headline fix and cascade precision:

| Scenario | Pipeline | Tasks cached | Notes |
|---|---|---|---|
| Cold (first run, empty R2) | 14m39s | baseline | Populates R2 |
| Rerun on same SHA | **3m5s** | ~100 % | `>>> FULL TURBO`. Zero `HIT → MISS` — the #490 failure mode is gone |
| Foundation change (`@real-router/types`) | 13m1s | 30/162 | ~132 tasks invalidated by `dependsOn: ^bundle` cascade — unavoidable for a foundational package |
| Leaf change (`@real-router/memory-plugin`) | **1m34s** | **156/162** | Only the 6 tasks of the edited package are MISS; cascade is surgically precise |

R2 HTTP summary across all four runs: 0× 401, 0× 5xx, `PUT 200` on every upload, `GET 200/404` split matches expected cold/warm state. Typical PR touches 1–3 leaf-ish packages → expect ~1–3 min CI vs 14+ min with a hypothetical cold cache.

**Gotcha — GitHub Variables vs Secrets.** `TURBO_API` must be added as a **repository Variable**, not a Secret. The URL is not sensitive, and the workflows reference it as `${{ vars.TURBO_API }}`. Creating it as `secrets.TURBO_API` is silently wrong: `vars.TURBO_API` then resolves to an empty string, turbo falls back to the Vercel default, all requests authenticate with a token Vercel doesn't know → 100 % cache MISS. Diagnose via any workflow log — if the `env` block of a step shows `TURBO_API:` with nothing after the colon (while `TURBO_TOKEN: ***` is masked), the variable is missing from the Variables tab. Only `TURBO_TOKEN` belongs in Secrets.

## macOS Development Setup

### Spotlight Exclusion

**Problem:** macOS Spotlight continuously indexes `node_modules`, causing high I/O during file operations.

**Symptoms:**

- `pnpm install` slow even with warm cache
- High `system` time in `time` output (2:1 ratio system:user = I/O bottleneck)
- `mds_stores` process using CPU

**Solution:** Exclude `node_modules` from Spotlight indexing:

```
System Settings → Siri & Spotlight → Spotlight Privacy → "+" → select node_modules folder
```

**Verification:**

```bash
# Should return 0 results if excluded
mdfind -onlyin ./node_modules "kMDItemFSName == '*.ts'" | wc -l
```

**Additional recommendations:**

- Exclude `node_modules` from Time Machine backups
- Exclude from antivirus real-time scanning (if applicable)

## Supply-Chain Security

### GitHub Actions Pinned by SHA

Third-party (non-GitHub) actions are pinned to commit SHAs instead of mutable tags. GitHub-official actions (`actions/checkout`, `actions/setup-node`, etc.) use mutable version tags since GitHub's own actions are considered trusted.

```yaml
# ❌ Third-party with mutable tag - can be hijacked
uses: changesets/action@v1

# ✅ Third-party with immutable commit SHA
uses: changesets/action@6a0a831ff30acef54f2c6aa1cbbc1096b066edaf # v1.7.0

# ✅ GitHub-official with version tag (trusted)
uses: actions/checkout@v6
```

**Pinned third-party actions:**

| Action                              | SHA         | Tag     |
| ----------------------------------- | ----------- | ------- |
| `changesets/action`                 | `6a0a831f`  | v1.7.0  |
| `codecov/codecov-action`            | `57e3a136`  | v5      |
| `SonarSource/sonarqube-scan-action` | `a31c9398`  | v7      |
| `dependabot/fetch-metadata`         | `ffa630c6`  | v2      |
| `github/codeql-action/*`            | version tag | v3.30.3 |

**Why:** Mutable tags can be force-pushed by a compromised maintainer. SHA pins are immutable — even if the tag is moved, the pinned commit stays the same.

### Minimum Release Age (Removed)

Previously used `minimum-release-age=1440` in `.npmrc` to block packages published less than 24 hours ago. Removed due to high maintenance overhead — every dependency update required temporary exclusions in `pnpm-workspace.yaml` with manual cleanup. The `strict-dep-builds=true` setting (pnpm 10) and `pnpm.onlyBuiltDependencies` allowlist now provide the primary supply-chain protection for lifecycle scripts.

**`onlyBuiltDependencies` allowlist:** `@parcel/watcher`, `core-js`, `electron`, `esbuild`, `fsevents`, `lmdb`, `msgpackr-extract`, `unrs-resolver`, `vue-demi`. Only these packages are permitted to run post-install scripts. `vue-demi` was added after it started failing in CI with `ERR_PNPM_IGNORED_BUILDS` (pnpm 10 blocks unapproved build scripts by default); `electron` and its transitive native deps (`@parcel/watcher`, `lmdb`, `msgpackr-extract`) were added when the Electron desktop examples landed.

### Security Overrides

`pnpm.overrides` in root `package.json` pins transitive dependencies to patched versions. Overrides are version-range-scoped where possible (e.g., `minimatch@3`, `minimatch@9`) to target specific major versions:

```json
"flatted": ">=3.4.2",
"axios": ">=1.13.5",
"qs": ">=6.14.2",
"rollup": ">=4.59.0",
"undici": ">=7.24.0",
"path-to-regexp": ">=8.4.0",
"node-forge": ">=1.4.0"
```

Each override addresses a known vulnerability in older versions. Version-scoped overrides (e.g., `"minimatch@3": "~3.1.4"`) prevent inadvertent major bumps of transitive dependencies.

### Dependency License Review

`.github/dependency-review-config.yml` defines allowed licenses for all dependencies. Dependency Review check fails on PRs that introduce packages with licenses outside the allow-list.

**Allowed licenses:** MIT, MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, CC-BY-4.0, BlueOak-1.0.0, Python-2.0, LGPL-3.0-only, GPL-3.0-only, GPL-3.0-or-later.

**GPL allowance:** GPL licenses are allowed for devDependencies only (build tools like `rollup-plugin-dts`). They don't link with production code, so no copyleft concern.

**OpenSSF Scorecard:** `warn-on-openssf-scorecard-level: 0` — warns on low-scored packages instead of failing. Specific GHSAs can be allowed via `allow-ghsas` when a vulnerability is assessed as non-applicable.

## ESLint 10 Migration

### Overview

Migrated from ESLint 9.39 to ESLint 10.x (currently 10.2.1). Tracking issue: [#237](https://github.com/greydragon888/real-router/issues/237).

### Package Changes

| Package                         | Before | After       | Notes                                            |
| ------------------------------- | ------ | ----------- | ------------------------------------------------ |
| `eslint`                        | 9.39.2 | 10.1.0      | Major upgrade                                    |
| `@eslint/js`                    | 9.39.2 | 10.0.1      | Major upgrade                                    |
| `@eslint-react/eslint-plugin`   | 2.13.0 | 4.2.1       | v3: absorbs react-hooks; v4: JSX rules split out |
| `eslint-plugin-react-jsx`       | —      | 4.2.1       | New: JSX-specific rules (split from react-x)     |
| `typescript-eslint`             | 8.53.1 | 8.58.0      | Minor                                            |
| `@stylistic/eslint-plugin`      | 5.7.1  | 5.10.0      | Minor                                            |
| `eslint-plugin-import-x`        | 4.16.1 | 4.16.2      | Patch                                            |
| `eslint-plugin-unicorn`         | 62.0.0 | 64.0.0      | 2 major versions, 5 new rules                    |
| `eslint-plugin-sonarjs`         | 3.0.5  | 4.0.2       | Major — ESLint 10 support                        |
| `eslint-plugin-jsdoc`           | 62.4.1 | 62.9.0      | Minor                                            |
| `eslint-plugin-testing-library` | 7.15.4 | 7.16.2      | Patch                                            |
| `@vitest/eslint-plugin`         | 1.6.12 | 1.6.13      | Patch                                            |
| `eslint-plugin-promise`         | 7.2.1  | **Removed** | Covered by typescript-eslint                     |
| `eslint-plugin-react-hooks`     | 7.0.1  | **Removed** | Absorbed by @eslint-react v3                     |

### eslint-plugin-promise Removal

All critical promise rules were already covered by `typescript-eslint strictTypeChecked`:

| promise rule              | typescript-eslint replacement             |
| ------------------------- | ----------------------------------------- |
| `promise/always-return`   | `@typescript-eslint/no-floating-promises` |
| `promise/catch-or-return` | `@typescript-eslint/no-floating-promises` |
| `promise/no-return-wrap`  | `@typescript-eslint/no-misused-promises`  |

### @eslint-react v3 Migration (replaces eslint-plugin-react-hooks)

**Problem:** `eslint-plugin-react-hooks` 7.0.1 did not declare ESLint 10 in peer deps ([facebook/react#35758](https://github.com/facebook/react/issues/35758)).

**Solution:** `@eslint-react/eslint-plugin` v3.0.0 absorbed `rules-of-hooks` and `exhaustive-deps` (ported verbatim from react-hooks). This eliminated the need for a separate plugin.

**Breaking changes applied:**

- Removed rules now native to ESLint 10: `jsx-uses-vars`, `jsx-uses-react`, `jsx-no-undef`
- Renamed: `react-hooks/exhaustive-deps` → `@eslint-react/exhaustive-deps` in eslint-disable comments
- `eslint-plugin-react-hooks-extra` merged into `react-x` namespace
- Preact adapter uses `@eslint-react` v3 with `settings["react-x"].importSource: "preact"`

**Node.js requirement:** v3.0.0 requires Node >=22.0.0. Acceptable because real-router is a client-side library — Node version only constrains dev tooling.

### eslint-plugin-sonarjs v4 Migration

**Problem:** Old GitHub repo (`SonarSource/eslint-plugin-sonarjs`) was archived. Appeared abandoned.

**Solution:** Development moved to [`SonarSource/SonarJS`](https://github.com/SonarSource/SonarJS) monorepo. v4.0.0 added ESLint 10 support. [CHANGELOG](https://github.com/SonarSource/SonarJS/blob/master/packages/analysis/src/jsts/rules/CHANGELOG.md) is public.

**Removed rules:** `enforce-trailing-comma` (covered by `@stylistic/comma-dangle`), `super-invocation` (covered by ESLint core `constructor-super`).

**New security rules (recommended):** `hardcoded-secret-signatures`, `dynamically-constructed-templates`, `review-blockchain-mnemonic`, `no-session-cookies-on-static-assets`. Last two disabled as irrelevant for client-side router.

### ESLint 10.4 — `includeIgnoreFile()` for `.gitignore` parity

**Problem.** Our `globalIgnores([...])` list in `eslint.config.mjs` partially duplicated `.gitignore` (build artifacts, coverage, `.turbo`, etc.) and partially diverged (extra entries like `**/*.bak*`, `cz.config.js`). Maintaining two lists invited drift — when CI added `.angular/`, `.svelte-kit/`, `playwright-report/`, `tools/`, `.spike/`, `**/CLAUDE.md` to `.gitignore`, none of those landed in `globalIgnores`. ESLint still skipped them in practice (no `.ts`/`.tsx` files inside) but the defence-in-depth was theoretical.

**Solution (ESLint 10.4+).** `eslint/config` ships `includeIgnoreFile(absolutePath, label?)` — an official helper that reads `.gitignore`-style patterns and converts them into a flat-config ignore block. We prepend it to the config array and trim the manually-maintained list to entries that are NOT in `.gitignore`:

```js
import { fileURLToPath } from "node:url";
import path from "node:path";
import { globalIgnores, includeIgnoreFile } from "eslint/config";

const gitignorePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".gitignore",
);

export default tsEslint.config(
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  globalIgnores([
    "**/*.min.js",
    "**/*.d.ts",
    "**/generated/**",
    "**/*.bak*",        // Backup files
    "**/*.mjs",         // JS config files
    "cz.config.js",
    ".changeset/**",
    "**/e2e/**",
  ]),
  // ...
);
```

After the swap, `globalIgnores` carries only the ESLint-specific exclusions that `.gitignore` legitimately doesn't (mjs configs, e2e tests, generated dirs, backup files). Build artifacts, coverage, `.turbo`, `.stryker-tmp`, `node_modules`, framework outputs, AI tooling dirs — all flow from `.gitignore` automatically and stay in lockstep.

### Adapter Config Cleanup (~2,000 lines removed)

**Problem:** Each adapter config (React, Preact, Vue, Solid, Svelte) duplicated ~250-300 lines of rules already covered by the root config: TypeScript, JSDoc, Unicorn, Promise, SonarJS, Prettier, Vitest, no-only-tests.

**Root cause:** Root config targets `**/*.ts` and `**/*.tsx`. Adapters extend root via `...eslintConfig`. All root rules already apply to adapter files.

**Solution:** Stripped all duplicated blocks. Each adapter now contains only framework-specific configuration:

| Adapter | Before    | After    | Content                                                  |
| ------- | --------- | -------- | -------------------------------------------------------- |
| React   | 556 lines | 82 lines | `@eslint-react` v3 + testing-library/react               |
| Preact  | 442 lines | 68 lines | `@eslint-react` v3 (Preact source) + testing-library/dom |
| Vue     | 419 lines | 22 lines | testing-library/dom (no .vue files)                      |
| Solid   | 410 lines | 22 lines | testing-library/dom (no solid plugin — dormant project)  |
| Svelte  | 442 lines | 55 lines | eslint-plugin-svelte + testing-library/dom               |

### eslint-plugin-solid — Not Added

Evaluated `eslint-plugin-solid@0.14.5` for the Solid adapter. Decision: not added.

- Project dormant (last release Dec 2024, maintainer inactive on the project)
- Does not declare ESLint 10 support (works at runtime but no guarantee)
- No alternatives exist (checked npm, GitHub, Solid.js org)
- Solid adapter is 804 lines with 100% test coverage — all Solid patterns are correct (`props.xxx` everywhere, no destructuring, correct `splitProps` usage). The plugin's key rules target mistakes not present in the codebase.

### typescript-eslint transitive pin saga (8.57.1 → removed 2026-05-19)

**Historical context.** `typescript-eslint@8.57.2` introduced a fixer crash in `no-unnecessary-type-arguments`. The rule's `fix()` function accessed `typeArguments.params[-1]` → `undefined` → crash on `.range`. Occurred on both ESLint 9 and 10, even without `--fix`. Bisected: 8.57.1 OK → 8.57.2 CRASH. For roughly two months the main `typescript-eslint` umbrella package moved forward (eventually to `8.59.0`) while `pnpm.overrides` pinned the transitive `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to `8.57.1` to avoid the crashing code path.

**Why the pin became a suppressor, not a workaround.** The original crash was fixed upstream by 8.59.0 (verified 2026-05-18), but the pin had silently transitioned into an implicit suppressor for newer typescript-eslint rules introduced between 8.58 and 8.59 — `no-base-to-string`, `no-unnecessary-condition`, `prefer-promise-reject-errors` — plus `@typescript-eslint/no-unnecessary-type-assertion` got noticeably stricter. The pin no longer paid for itself: keeping it meant `pnpm lint:dedupe` failed on every dependabot bump of `typescript-eslint` (transitive `@typescript-eslint/tsconfig-utils`/`types` resolved to the new version, but the pinned umbrella stayed on 8.57.1, breaking pnpm's strict dedupe). Each bump arrived as a CI red and had to be closed by hand.

**Removal (commits `a35dcb60`, `53bfb92e`, `42215b52`).** The pin came off in three logical steps:

1. **Drop the pin from `pnpm.overrides`** + reinstall to let the umbrella pull the matching transitive versions. `pnpm lint:dedupe` immediately turned green for dependabot bumps.
2. **Lift the suppression debt explicitly.** 10 `eslint-disable-next-line` markers + 1 file-level disable, each with an inline `-- reason` comment so a future audit can decide whether to refactor or keep:
   - `@typescript-eslint/no-base-to-string` × 4 — `String(value)` on `unknown`-typed route params (`path-matcher` source + test helpers). Route params are contractually primitive (`string | number | boolean | bigint`) but typed `unknown` — refactor would mean throwing on Symbol/Function values, a runtime semantics change.
   - `@typescript-eslint/prefer-promise-reject-errors` × 3 — `Promise.reject(error)` from `NavigationNamespace` catch blocks. Wrapping in `error instanceof Error ? error : new Error(...)` brings a defensive untestable branch (RouterError extends Error, the else is unreachable) which breaks the 100% branch-coverage gate; `error as Error` gets reverted by `--fix` as an "unnecessary assertion". The disable is the residual fixed point.
   - `@typescript-eslint/no-unnecessary-condition` × 2 — `decoder(params) ?? params` / `encoder(params) ?? params` runtime fallbacks in `getRoutesApi.ts`. The `??` guards against a user-provided callback violating its declared return type — removing it would require changing the public API signature to `(p) => Params | null | undefined`.
   - `sonarjs/no-undefined-argument` (file-level, 7 occurrences) — `tests/.../edge-cases-callback.test.ts` exists specifically to lock the navigate-with-trailing-`undefined` behaviour for Issues #53/#58. Stripping the trailing `undefined` defeats the tests.
   - Three structural cleanups avoided disables entirely: `Record<string | symbol, unknown>` in two `shallowEqual.properties.ts` files (preact + svelte) lets symbol-keyed writes type-check without a cast, and `react-server-entry.test.ts` swapped string-indexing-via-cast for the `in` operator.
3. **Eat the `--fix` collateral on the rest.** 103 source/test files had redundant `as X` casts removed by `eslint --fix` once the stricter `no-unnecessary-type-assertion` came online. Three of those casts were load-bearing and re-introduced with a targeted disable: `preact/tests/property/shallowEqual.properties.ts:337-338` (symbol-index on `Record<string, unknown>` — `TS2538`), `svelte/tests/property/shallowEqual.properties.ts:460` (same shape via `buildLargeRecord`'s return type), and `react/tests/functional/react-server-entry.test.ts:34` (typed namespace import widened to `Record<string, unknown>` for dynamic key access — `TS7053`). The remaining 100 cast removals are pure cleanup, no runtime impact (type assertions are compile-time only).

**Audit workflow for future strictness bumps.** When `pnpm build` fails after a typescript-eslint major:

1. Run `pnpm lint` to surface the manual errors. They will be a small set (`<20` typical).
2. Run once more with `eslint --fix` enabled (already the default in our `lint` script) to absorb the auto-fixable rewrites.
3. Run `pnpm type-check` — every `TS2538`/`TS7053`/`TS2322` from the `--fix` pass is a load-bearing cast that was wrongly removed. Re-introduce each with `// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- <load-bearing reason>`. The fixed point converges in 2–3 passes.

**Lesson.** A `pnpm.overrides` pin is the right tool for a confirmed upstream bug with a known fix-version ETA. It is the **wrong** tool for "this newer rule annoys me" — that's a config-level decision and belongs in `eslint.config.mjs`, not in dependency overrides. Once a pin starts suppressing things it wasn't installed to suppress, the cost of keeping it grows silently until something forces the audit (in our case, recurring dependabot dedupe failures).

### New Rules Added

**Unicorn v63-v64 (5 rules):**

- `unicorn/isolated-functions` (warn) — functions without `this` should be standalone
- `unicorn/consistent-template-literal-escape` (error) — consistent escaping in template literals
- `unicorn/no-useless-iterator-to-array` (error) — no unnecessary `Iterator#toArray()`
- `unicorn/prefer-simple-condition-first` (warn) — simpler condition first in logical expressions
- `unicorn/switch-case-break-position` (warn) — consistent break position in switch cases

**ESLint 10 recommended changes:**

- `no-useless-assignment` promoted to `error` — kept as `warn` for gradual adoption
- `no-unassigned-vars` added to recommended — disabled for test files (common `let unsubscribe` in describe scope pattern)

### @eslint-react v4 Migration (from v3.0.0)

**v4.0.0 breaking changes applied:**

- Rule prefixes changed: `@eslint-react/dom/<rule>` → `@eslint-react/dom-<rule>` (slash → hyphen). No impact — project didn't use slash-prefixed rules.
- JSX rules (`no-useless-fragment`, `no-children-prop`, `no-comment-textnodes`, `no-key-after-spread`, `no-namespace`) moved to new `eslint-plugin-react-jsx` package. Installed separately.

**New rules enabled:**

| Rule                                  | Severity | Reason                                                                                     |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `@eslint-react/immutability` ⚗️       | warn     | Catches mutations of props/state — valuable for library code                               |
| `@eslint-react/refs` ⚗️               | warn     | Prevents ref reads/writes during render                                                    |
| `eslint-plugin-react-jsx/recommended` | preset   | JSX-specific rules: `no-key-after-spread`, `no-useless-fragment`, `no-children-prop`, etc. |

**Suppressed (intentional patterns):**

- `RouterErrorBoundary.tsx`: `onErrorRef.current = onError` — "latest ref" pattern for callback sync
- `RouteView.tsx`: `hasBeenActivatedRef.current` — stable Set read for keepAlive tracking

Both experimental rules disabled in test files (intentional anti-patterns).

### ESLint React Plugin Migration (historical)

_Previous migration from eslint-plugin-react v7 to @eslint-react v2. Now superseded by v3/v4 migration above._

**Original preset:** `recommended-type-checked` — disables rules already enforced by TypeScript, adds type-aware rules.

**Gaps:** `react/no-unescaped-entities` has no equivalent — dropped (JSX compiler catches most cases).

## TypeScript 6.0 Migration

### Problem

TypeScript 6.0.2 released 2026-03-23 as the final JS-based compiler before the Go rewrite (TS 7.0). Needed to migrate from TS 5.9.3 to stay on the supported path.

### Solution

Migrated on 2026-03-28. Single config change required:

```json
// tsconfig.json
{
  "compilerOptions": {
    "ignoreDeprecations": "6.0"
  }
}
```

### Why `ignoreDeprecations` Was Removed

tsup 8.5.1 (via rollup-plugin-dts 6.4.1) internally set `baseUrl` when generating `.d.ts` files. `baseUrl` is deprecated in TS 6.0, requiring `"ignoreDeprecations": "6.0"` in tsconfig.json.

**Resolved:** Migration to tsdown eliminated this issue — tsdown uses rolldown-plugin-dts which doesn't set `baseUrl`. The `ignoreDeprecations` setting has been removed from tsconfig.json.

### Pitfall: Stale pnpm Binary Shims

After `pnpm add -Dw typescript@6.0.2`, packages with `rollup-plugin-dts` as a dependency (`solid`, `svelte`, `vue`) retained stale `node_modules/.bin/tsc` shims pointing to `typescript@5.9.3` in the pnpm store — even though the lockfile only referenced 6.0.2. This caused `tsc --noEmit` to run with TS 5.9.3 where `"ignoreDeprecations": "6.0"` is an invalid value.

**Fix:** `rm -rf node_modules && pnpm install` to regenerate all shims.

**Root cause:** pnpm doesn't regenerate binary shims in package-local `node_modules/.bin/` when a workspace root devDependency is updated. The old shim hardcodes the pnpm store path including the version (`typescript@5.9.3`).

### Peer Dependency Warnings

Originally three packages declared `typescript <6.0.0` or `^5.0.0` as peer deps: typescript-eslint, tsconfck (via vite-tsconfig-paths), and svelte2tsx. All work correctly with TS 6.0, but pnpm's strict peer checking fails on install.

**Fix:** `peerDependencyRules.allowedVersions` in root package.json:

```json
"pnpm": {
  "peerDependencyRules": {
    "allowedVersions": {
      "typescript": "6"
    }
  }
}
```

**Progress:** `typescript-eslint` (now `>=4.8.4 <6.1.0`) and `svelte2tsx` (now `^4.9.4 || ^5.0.0 || ^6.0.0`) have updated their peer ranges to include TS 6. The override remains needed solely because of `tsconfck` (still `^5.0.0`, reached transitively through `vite-tsconfig-paths`).

**TODO:** Remove the override once `tsconfck` widens its `typescript` peer range to include 6.x.

### What Did NOT Need Changing

- **No code changes** — zero source files modified
- **`"Bundler"` casing** — TS compiler is case-insensitive for option values; no need to lowercase
- **typescript-eslint** — works with TS 6.0 via `projectService` despite no official support yet ([typescript-eslint#12123](https://github.com/typescript-eslint/typescript-eslint/issues/12123))
- **`noUncheckedSideEffectImports: true`** (new default) — no false positives in the project
- **All explicit tsconfig values** (`strict`, `module`, `target`, `types`) — already set, unaffected by new defaults

## React 18/19 Split via Subpath Exports

### Problem

`@real-router/react` needs to support both React 18 and React 19.2+. React 19.2 stabilized `<Activity>` — new components like `ActivityRouteNode` require React 19.2+. Options considered:

| Approach                                       | Pros                              | Cons                                                   |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Separate package (`@real-router/react-legacy`) | Clear separation                  | Duplicated code, double maintenance, double versioning |
| Runtime version checks                         | Single package                    | Bundle bloat, complexity, fragile                      |
| **Subpath exports**                            | Single package, zero runtime cost | Slightly more complex `exports` field                  |

### Solution

Subpath exports: `@real-router/react` (React 19.2+) and `@real-router/react/legacy` (React 18+).

```jsonc
// package.json
{
  "exports": {
    ".": {
      /* main entry — full API */
    },
    "./legacy": {
      /* legacy entry — without React 19.2-only components */
    },
  },
}
```

### Architecture

Flat structure — all shared code in `src/`. The `modern/` subfolder holds React 19.2-only components. Entry points are pure re-export files:

- `src/index.ts` — all exports (shared + modern)
- `src/legacy.ts` — shared exports only (no modern)

No barrel files — both entry points use explicit imports. No code duplication.

### Build

`tsdown.config.mts` uses multi-entry to produce shared chunks:

```ts
export default createIsomorphicConfig({
  custom: {
    entry: {
      index: "src/index.ts",
      legacy: "src/legacy.ts",
    },
  },
});
```

tsdown generates a shared chunk for code common to both entries — no duplication in the output.

### Key Decision: `useContext` vs `use()`

`use()` (React 19) and `useContext` are functionally identical for unconditional context reads. Hooks always call unconditionally, no try/catch or conditional blocks. `use()` advantage (conditional reads) is unused. Therefore `useContext` + `<Context.Provider value>` is the target for shared code — works in React 18 and 19 identically.

`modern/` is reserved exclusively for components that require React 19.2-only APIs (`<Activity>`), not for hooks.

### Testing Strategy

Full test suite runs against the main entry point. Legacy entry gets a single smoke test (export availability, basic render, navigation) — since both entries re-export the same code.

### Details

Architecture and design: [`packages/react/ARCHITECTURE.md`](packages/react/ARCHITECTURE.md)

## Framework Adapter Build Strategies

### Build Tool Per Adapter

| Adapter | Build Tool                  | Reason                                          | Output               |
| ------- | --------------------------- | ----------------------------------------------- | -------------------- |
| React   | tsdown                      | Standard — pure `.tsx`                          | Dual ESM/CJS bundle  |
| Preact  | tsdown                      | Standard — pure `.tsx`                          | Dual ESM/CJS bundle  |
| Solid   | rollup + babel-preset-solid | Solid's JSX needs babel transform               | Dual ESM/CJS bundle  |
| Vue     | tsdown                      | Pure `.ts` with `defineComponent` + `h()`       | Dual ESM/CJS bundle  |
| Svelte  | svelte-package              | `.svelte` and `.svelte.ts` need Svelte compiler | ESM individual files |

### Svelte Package Specifics

`@real-router/svelte` uses `@sveltejs/package` (not tsdown):

- `.svelte` files are copied as-is (consumer's bundler compiles them)
- `.svelte.ts` files are compiled to `.svelte.js` (runes processed)
- `.ts` files are transpiled to `.js`
- ESM only (standard for Svelte ecosystem)
- Type-checking via `svelte-check` (not `tsc`)

### Solid Package Specifics

`@real-router/solid` uses rollup + `babel-preset-solid`:

- Solid's JSX is compiled by babel-preset-solid (not standard JSX transform)
- rollup-plugin-dts for bundled type declarations
- Coverage: `branches: 90` threshold due to babel-generated phantom branches

### Coverage Threshold Exceptions

Framework compilers generate code that v8 coverage tracks but tests can't reach:

| Adapter | Exception                     | Cause                                                   |
| ------- | ----------------------------- | ------------------------------------------------------- |
| Solid   | `branches: 90, functions: 97` | babel-preset-solid phantom branches, `.catch(() => {})` |
| Vue     | `branches: 95, functions: 97` | `defineComponent` internal type guards                  |
| Svelte  | `branches: 96, functions: 93` | Svelte compiler `$derived`/`$props` transforms          |
| React   | None                          | tsdown preserves original code                          |
| Preact  | None                          | tsdown preserves original code                          |

## Shared Sources via Symlinks: `shared/dom-utils/` and `shared/browser-env/` (#437)

### Problem

Two groups of code were shared across multiple packages via full workspace packages:

1. **`dom-utils`** — 5 framework adapters (React, Preact, Solid, Vue, Svelte) needed identical DOM helpers: `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y`, `createRouteAnnouncer` (WCAG route announcements, #337). ~200 LOC.

2. **`browser-env`** — 3 URL plugins (browser-plugin, hash-plugin, navigation-plugin) needed identical browser API wrappers: History API, popstate handling, SSR fallback, URL parsing, plugin utilities. ~520 LOC.

Original approach (pre-#437): both lived as `"private": true` workspace packages with their own `tsdown.config.mts`, `vitest.config.mts`, `tsconfig.json`, `tsconfig.node.json`, `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`, `INVARIANTS.md`, `CHANGELOG.md`. Bundled into consumers via three different mechanisms: tsdown `alwaysBundle`, rollup `nodeResolve`, and a svelte-specific symlink + `kit.alias` rewrite. Problems:

- Full package infrastructure duplicated for each shared helper (~10 files per package)
- Three different bundling strategies across consumers — fragile (#413 root cause)
- Each consumer had `"dom-utils"` / `"browser-env"` in devDependencies plus bundle-time config
- Turbo cache nodes for `dom-utils:build` and `browser-env:build` — any change invalidated all downstream builds
- Svelte already used a committed symlink workaround for `dom-utils` — the pattern was inconsistent across adapters

### Solution

Source files live in `shared/` at the repo root. Each consumer has a git-tracked symlink inside its `src/` pointing to the corresponding `shared/*` directory. Imports use local-looking relative paths (`from "./dom-utils/index.js"`, `from "../browser-env/index.js"`).

```
shared/
├── package.json                  # Minimal workspace entry: name, type, devDeps on core + type-guards
├── dom-utils/
│   ├── index.ts
│   ├── link-utils.ts
│   └── route-announcer.ts
└── browser-env/
    ├── index.ts
    ├── detect.ts
    ├── history-api.ts
    ├── popstate-handler.ts
    ├── popstate-utils.ts
    ├── safe-browser.ts
    ├── ssr-fallback.ts
    ├── plugin-utils.ts
    ├── url-parsing.ts
    ├── url-utils.ts
    ├── utils.ts
    ├── validation.ts
    └── types.ts

packages/react/src/dom-utils               → ../../../shared/dom-utils      (symlink, git-tracked)
packages/preact/src/dom-utils              → ../../../shared/dom-utils      (symlink)
packages/vue/src/dom-utils                 → ../../../shared/dom-utils      (symlink)
packages/solid/src/dom-utils               → ../../../shared/dom-utils      (symlink)
packages/svelte/src/dom-utils              → ../../../shared/dom-utils      (symlink)
packages/dom-utils/src                     → ../../shared/dom-utils         (tests-only wrapper)

packages/browser-plugin/src/browser-env    → ../../../shared/browser-env    (symlink, git-tracked)
packages/hash-plugin/src/browser-env       → ../../../shared/browser-env    (symlink)
packages/navigation-plugin/src/browser-env → ../../../shared/browser-env    (symlink)
packages/browser-env/src                   → ../../shared/browser-env       (tests-only wrapper)
```

All tooling follows symlinks transparently and sees shared files as if they live locally inside each consumer's `src/`:

- **tsdown** (react, preact, vue, browser-plugin, hash-plugin, navigation-plugin) — follows symlinks, bundles inline. No `alwaysBundle` entry for shared names (relative imports bundle by default). `type-guards` stays in `alwaysBundle` because it's still a real workspace package used by `shared/browser-env`.
- **rollup + babel-preset-solid** (solid) — follows symlinks; `tsconfig.build.json` keeps `rootDir: "./src"` because tsc sees files at their virtual path inside `src/dom-utils/`.
- **svelte-package** (svelte) — follows symlinks, compiles `.svelte.ts` files as local sources. No `kit.alias` needed.

### Minimal `shared/package.json`

`shared/` IS a workspace package, but intentionally minimal: no source files of its own (those live in `dom-utils/` and `browser-env/` subdirs), no build script, no tsdown config, no docs, no tests, no changesets. Only the fields required for transitive dependency resolution:

```json
{
  "name": "@real-router/shared-sources",
  "version": "0.0.0",
  "private": true,
  "type": "commonjs",
  "devDependencies": {
    "@real-router/core": "workspace:*",
    "type-guards": "workspace:*"
  }
}
```

**Why it's a workspace entry at all:** some shared files import `type-guards` (e.g., `shared/browser-env/popstate-utils.ts` uses `isStateStrict`). When rolldown processes these files via a consumer's symlink, the import is transitively listed under `alwaysBundle: ["type-guards"]` in the consumer's tsdown config — meaning rolldown must **resolve and inline** the module. Resolution starts from the file's real filesystem location (`shared/browser-env/*.ts`), walking up through `node_modules` directories. Without `shared/node_modules/type-guards`, rolldown cannot find it and fails with `UNRESOLVED_IMPORT`. Adding `shared/` to `pnpm-workspace.yaml` with `type-guards` as a devDep makes pnpm create the `shared/node_modules/type-guards` symlink, giving rolldown a resolution anchor.

**Why `@real-router/core` is also listed** even though it's a scoped package treated as external by rolldown: for consistency, and so tsc's type resolution sees the same module instance from any location. Prevents subtle dual-package hazards during incremental rebuilds.

**Why `"type": "commonjs"`:** without it, TypeScript walks up to the root `package.json` (`"type": "module"`). Shared files would get ESM type resolution while consumers (all `"type": "commonjs"`) would see CJS types, creating a dual-package hazard where `Router` from `dist/esm/` and `Router` from `dist/cjs/` become nominally different types with conflicting `#private` fields.

**What's deliberately missing:**

- No `main`/`module`/`exports` — not a published package, not imported by name. Consumers reach into `shared/` only through the symlinks.
- No `scripts` — no build, no tests, no lint target. The package is inert from Turbo's perspective.
- No runtime `dependencies` — all deps are devDeps because shared files are inlined into consumers' bundles, not shipped as a separate artifact. Prevents accidental publication of `@real-router/shared-sources` as a real package.

### Scoped vs unscoped dependency resolution (why both cases are needed)

`@real-router/core` and `type-guards` are handled differently by rolldown despite both being workspace packages:

- `@real-router/core` is in each consumer's runtime `dependencies`. rolldown marks it as **external** — the specifier stays in the output bundle as a peer import. No resolution needed at build time.
- `type-guards` is listed in each consumer's `alwaysBundle` tsdown config. rolldown must **resolve and inline** it into the output bundle. Resolution requires `type-guards` to be findable from the importing file's real path via pnpm's `node_modules`.

This asymmetry is why `dom-utils` **appears** to work without workspace deps on `shared/` (its only foreign import is `@real-router/core`, treated as external), but `browser-env` **requires** `type-guards` to be resolvable from `shared/`'s location (inlined). The shared-as-workspace-entry pattern covers both cases uniformly, and is the canonical setup.

### Why each consumer's `src/<shared>` is a symlink (not relative imports)

- **Uniform pattern across all consumers** — previously Svelte was the only package with a symlink. Now every consumer uses the same pattern.
- **Clean local imports** — `from "./browser-env/index.js"` reads as a local directory. No ugly `../../../../shared/browser-env/...` chains.
- **No Solid `rootDir` expansion** — tsc sees the symlinked file at its virtual path (`packages/solid/src/dom-utils/*.ts`), which is inside `rootDir: "./src"`. Accesing via relative path would put files outside rootDir and require widening it (tried in an earlier prototype, rejected).
- **Identical DX across all 8 consumers** — browser-plugin, hash-plugin, navigation-plugin, react, preact, vue, solid, svelte all work the same way.

### `packages/dom-utils/` and `packages/browser-env/` as tests-only wrappers

Both packages are retained as minimal wrappers to host existing tests. Each has:

- `package.json` — minimal: name (kept for backward compat), test scripts, deps on `@real-router/core` and (for browser-env) `type-guards` to satisfy the test runner
- `tsconfig.json` — includes `src` and `tests`
- `vitest.config.mts` + `vitest.config.properties.mts` — existing test runners
- `src` — symlink to `../../shared/<name>` (tests still import via `../../src` unchanged — no test file diff)
- `tests/` — unchanged

Full test migration to a dedicated location (e.g., `tests/shared/`) is a **deferred follow-up**. Doing it now would mean restructuring vitest workspace, turbo tasks, CI configs, and pre-commit hooks — out of scope for #437.

### Windows symlink requirement

Git-tracked symlinks work on Unix/macOS/Linux out of the box. Windows contributors need `git config --global core.symlinks true` plus Developer Mode (or elevated shell). This was already required for Svelte's pre-#437 symlink. #437 scales it from 1 symlink to 10 (5 dom-utils consumers + 3 browser-env consumers + 2 tests-only wrappers). See README "Development" section.

### Tooling configuration

**knip** (`knip.json`):

- Each consumer workspace (8 entries: react, preact, vue, solid, svelte, browser-plugin, hash-plugin, navigation-plugin) lists `"ignore": ["src/dom-utils/**"]` or `"src/browser-env/**"` to skip symlinked directories from dead-code analysis
- `packages/dom-utils` and `packages/browser-env` use tests-only project patterns
- `packages/browser-env` and `packages/navigation-plugin` add `type-guards` to `ignoreDependencies` — knip doesn't see the transitive import through the symlinked `shared/browser-env/popstate-utils.ts` and would otherwise flag it as unused

**jscpd** (`.jscpd.json`): ignores `packages/*/src/dom-utils/**`, `packages/dom-utils/src/**`, `packages/*/src/browser-env/**`, `packages/browser-env/src/**` — without these, jscpd follows symlinks and reports the same shared files as duplicates across every symlinked location.

**vitest coverage**: shared code is tracked by the file's real path (`shared/**/*.ts`), not the symlinked virtual path. The global include pattern `packages/*/src/**/*.ts` does not match `shared/**`, so shared code is currently excluded from per-package 100% coverage enforcement. This is accepted as a trade-off — test migration for shared code is the deferred follow-up.

### History

- **#413** — `dom-utils` as workspace package leaked into published `dependencies`. Fixed by moving to `devDependencies` + tsdown `alwaysBundle`. Smoke test added (`scripts/smoke-test-packages.sh`).
- **#437** (two commits on the same branch):
  - First commit — migrated `dom-utils` from workspace package to `shared/dom-utils/` with symlinks for all 5 framework adapters. Eliminated package infrastructure. Initially used a minimal `shared/package.json` without workspace deps (worked because `@real-router/core` is external-treated, so no resolution was needed).
  - Second commit — migrated `browser-env` the same way for all 3 URL plugins. Hit a `type-guards` resolution failure because `alwaysBundle` requires the package to be resolvable from `shared/`'s physical location, not just marked external. Fix: added `shared/` to `pnpm-workspace.yaml` and put `@real-router/core` + `type-guards` as workspace devDeps. This retroactively became the canonical shape for `shared/package.json` — it's stricter than strictly necessary for `dom-utils` alone, but uniform across both migrations.

## Module Resolution: Clean Exports + Vitest Source Aliases

### History

Originally used manual `paths` in tsconfig → replaced with `customConditions: ["development"]` + `"development"` export condition in all packages. The `"development"` condition pointed to `./src/index.ts` for IDE navigation.

**Problem (#418, #421):** `"development"` is a well-known condition name. Vite (both v7 and v8) resolves it by default in dev mode. External consumers' Vite would resolve to `./src/index.ts`, hitting bare imports of private packages (`dom-utils`, `route-tree`, etc.). Removing `src` from `files` didn't help — Vite errors instead of falling through when a matched condition points to a missing file. Renaming to a custom condition caused dual-package hazard in Vitest.

**Root cause:** Developer-facing configuration (`"development"` condition for IDE navigation) was placed in the consumer-facing contract (`package.json` exports). This polluted exports with infrastructure concerns.

### Current Solution

Clean exports — no `"development"` condition. Same approach as TanStack Router.

**Package.json exports (all packages):**

```json
"exports": {
  ".": {
    "types": { "import": "./dist/esm/index.d.mts", "require": "./dist/cjs/index.d.ts" },
    "import": "./dist/esm/index.mjs",
    "require": "./dist/cjs/index.js"
  }
}
```

**`"files": ["dist", "src"]`** — source shipped for consumer IDE navigation (sourcemaps reference `../../src/` paths) and future declaration maps (#423).

**Vitest source resolution:** `vitest.config.common.mts` has `workspaceSourceAliases()` — auto-generates `resolve.alias` from `packages/*/package.json` at runtime. Maps package names to `src/` entry points so v8 coverage tracks source files. No manual sync — deterministic from package.json. Aliases sorted by key length (longest first) to prevent prefix-match conflicts (`@real-router/core/api` before `@real-router/core`).

**Solid exception (#422):** 7 Solid adapter tests (`RouterProvider.test.tsx`) are `.todo()` — babel-preset-solid compiles JSX at transform time, and `resolve.alias` creates dual-module hazard with Solid's `createContext()`. These tests pass when `"development"` condition exists in exports (uniform resolution). Fix tracked in #422.

### Self-Import Fix (historical)

Packages that imported themselves by published name broke with `customConditions` during build. Fixed by replacing self-imports with relative imports in `@real-router/core` (2 files) and `@real-router/react` (3 files). This fix remains valid — self-imports are still relative.

## Infrastructure Changes (rou3 Migration — historical)

### SonarQube Scanner Rename

Package `sonarqube-scanner` renamed to `@sonar/scan` (upstream rename). Updated in `package.json`:

```json
// Before
"sonarqube-scanner": "4.3.4"
// After
"@sonar/scan": "4.3.4"
```

Script updated: `sonar-scanner` → `sonar` in `package.json` scripts.

### Core Package Exports

Removed `"./dist/*": "./dist/*"` wildcard export from `packages/core/package.json`. This was used by `router-benchmarks` (now at `benchmarks/`) to load compiled dist directly. Replaced with direct require of `@real-router/core/dist/cjs/index.js`.

### Vitest: Removed `clearMocks`

Removed `clearMocks: true` from `vitest.config.common.mts`. `restoreMocks: true` + `mockReset: true` already cover all cleanup. `clearMocks` was redundant (subset of `mockReset`).

### Workspace Cleanup

`pnpm-workspace.yaml`: removed `tools/*` glob and `minimumReleaseAgeExclude` entries for legacy `router6`/`router6-types` packages.

### Examples Workspace

~130 example applications across 6 framework adapters (React, Preact, Solid, Vue, Svelte, Angular) plus terminal and desktop runtimes. Organized by runtime:

```
examples/
├── web/
│   ├── react/{app-name}/         # incl. animation-examples × 4 + ssr-examples × 5 (RSC adds 1)
│   ├── preact/{app-name}/        # incl. animation-examples × 4 + ssr-examples × 4
│   ├── solid/{app-name}/         # incl. animation-examples × 4 + ssr-examples × 4
│   ├── vue/{app-name}/           # incl. animation-examples × 4 + ssr-examples × 4
│   ├── svelte/{app-name}/        # incl. animation-examples × 4 + ssr-examples × 4
│   └── angular/{app-name}/       # incl. animation-examples × 4 + ssr-examples × 4
├── console/
│   └── react-ink/                # CLI demo via @real-router/react/ink + memory-plugin
└── desktop/
    ├── electron/{react,react-hash,react-navigation}/
    └── tauri/{react,react-navigation}/
```

`pnpm-workspace.yaml` includes nested globs (`examples/*/*`, `examples/*/*/*`, `examples/*/*/*/*`) to pick up the deepest sub-app directories (`animation-examples/*`, `ssr-examples/*`). Examples are private packages (`"private": true`) that use workspace packages via `workspace:^`.

**Turbo exclusion:** Examples use `build:app` instead of `build` in their scripts to avoid triggering turbo's `build` pipeline. `turbo run build` only matches packages with a `build` script — examples are excluded.

**knip exclusion:** `ignoreWorkspaces: ["examples/**"]` prevents false positives from example-specific dependencies. Uses `**` glob to match the nested directory structure.

**syncpack exclusion:** `syncpack.config.mjs` `source` only covers `packages/*/package.json` — examples are automatically excluded from version consistency checks.

### E2e Spec Lint Check

**Problem:** Examples with `playwright.config.ts` but empty or missing `e2e/` directories pass CI silently — the e2e test task finds nothing to run and reports success.

**Solution:** `scripts/check-e2e-specs.sh` iterates over `examples/*/*/playwright.config.ts`, verifies each has an `e2e/` directory with at least one `*.spec.ts` file. Exits with error if any violations found.

```bash
pnpm lint:e2e    # runs scripts/check-e2e-specs.sh
```

Added to pre-commit hook to catch missing specs before push.

### knip: Router Benchmarks Entry

Added `packages/router-benchmarks` (now at `benchmarks/`, `src/` renamed to `core/`) workspace to `knip.json` with `entry: ["src/**/*.ts"]` to recognize standalone benchmark scripts (like `isolated-anomalies.ts`) that are not imported from `index.ts`. Later moved to `ignoreWorkspaces` when benchmarks were relocated to root level.

## FSM Package

### Why a Separate Package?

`@real-router/fsm` is a standalone synchronous finite state machine engine extracted as its own package. It has **zero dependencies** and can be used independently of the router.

### Design Decisions

**Single-class, no validation:** The entire FSM is ~148 lines. TypeScript generics enforce correctness at compile time — no runtime validation of config, states, or events. This keeps the hot path allocation-free.

**O(1) transitions:** A `#currentTransitions` cache stores the transition map for the current state, avoiding double lookup (`transitions[state][event]`).

**`canSend(event): boolean`** — O(1) check if event is valid in current state. Uses cached `#currentTransitions`.

**`on(from, event, action): Unsubscribe`** — typed action for a specific `(from, event)` pair. Lazy `#actions` Map (`null` until first `on()`). Uses nested `Map<TStates, Map<TEvents, action>>` for O(1) lookup without string concatenation. Actions fire before `onTransition` listeners. Overwrite semantics (second `on()` for same pair replaces first).

**`forceState(state)`** — direct state update without dispatching actions or notifying listeners. Used by router's navigate hot path to bypass `send()` overhead.

**Null-slot listener pattern:** Unsubscribed listeners are set to `null` instead of spliced, preventing array reallocation. New listeners reuse null slots.

**Listener count fast-path:** `#listenerCount` tracks active listeners. When zero, `send()` skips `TransitionInfo` object creation and listener iteration entirely.

**Type-safe payloads via `TPayloadMap`:** A fourth generic parameter maps event names to payload types. Events not in the map accept no payload. Uses optional `payload?` parameter (not rest params — V8 always allocates an array for rest params even when empty).

### Reentrancy

`send()` inside `onTransition` is allowed and executes synchronously inline (no queue). State is updated before listeners fire, so reentrant `send()` reads the already-updated state. Callers must prevent infinite loops.

### Package Structure

```
packages/fsm/
├── src/
│   ├── fsm.ts    — FSM class (all logic, ~137 lines)
│   ├── types.ts  — FSMConfig, TransitionInfo, TransitionListener
│   └── index.ts  — public exports
└── tests/
    ├── functional/  — vitest tests (100% coverage)
    └── benchmarks/  — mitata benchmarks
```

## Logger Package

### Why?

**Isomorphic** — works in browser, Node.js, and environments without `console` (React Native, Electron, edge runtimes).

### Features

| Feature                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| **Level filtering**     | `all` → `warn-error` → `error-only` → `none`          |
| **Safe console access** | Checks `typeof console !== "undefined"` before output |
| **Callback system**     | Custom log handler for any environment                |

### Callback Use Cases

```typescript
// 1. Console emulation (environments without console)
callback: (level, context, message) => {
  NativeModules.Logger[level](`[${context}] ${message}`);
}

// 2. Error tracking (Sentry, etc.)
callback: (level, context, message) => {
  if (level === "error") Sentry.captureMessage(message);
}

// 3. Both: silent console + full monitoring
{
  level: "none",              // No console output
  callbackIgnoresLevel: true, // Callback gets everything
  callback: sendToMonitoring,
}
```

### Configuration via Router

```typescript
const router = createRouter(routes, {
  logger: { level: "error-only", callback: errorTracker },
});
```

### Package Dependencies

All packages using logger declare `"logger": "workspace:^"` dependency.

Migrated: `@real-router/core`, `@real-router/browser-plugin`, `@real-router/logger-plugin`.

## Logger Plugin Performance Tracking

### Timing Display

Transition duration with adaptive units:

| Duration | Format       | Example     |
| -------- | ------------ | ----------- |
| < 0.1ms  | Microseconds | `(27.29μs)` |
| ≥ 0.1ms  | Milliseconds | `(15.00ms)` |

### Time Provider

Monotonic time source with environment-aware fallback:

```
Browser           → performance.now()
Node.js 16+       → performance.now() from perf_hooks
Node.js <16       → Date.now() with monotonic emulation
```

**Monotonic emulation** — `Date.now()` can go backwards (NTP sync, DST). Wrapper tracks `lastTimestamp` and adds offset if time decreases.

### Performance API Integration

Creates marks and measures for DevTools Performance tab:

```
Marks:
├── router:transition-start:{from}→{to}
├── router:transition-end:{from}→{to}     (success)
├── router:transition-cancel:{from}→{to}  (cancelled)
└── router:transition-error:{from}→{to}   (error)

Measures:
├── router:transition:{from}→{to}           (success)
├── router:transition-cancelled:{from}→{to} (cancelled)
└── router:transition-failed:{from}→{to}    (error)
```

**Safe API access** — checks `typeof performance.mark === "function"` before use.

### SSR Note

For high-precision timing in Node.js without global `performance`:

```typescript
import { performance } from "perf_hooks";
globalThis.performance = performance;
```

## Route Utils Package

### Why?

`@real-router/route-utils` provides a cached read-only query API for route tree structure and segment testing utilities. Consolidates `@real-router/helpers` (segment testers) and adds new pre-computed queries (chains, siblings, descendant checks).

### Design Decisions

**Pre-computed chains and siblings:** Constructor eagerly walks the entire tree once, building `Map<string, readonly string[]>` for chains and siblings. All subsequent lookups are O(1) Map reads returning frozen arrays (referential equality on repeated calls).

**WeakMap factory caching:** `getRouteUtils(root)` caches instances via `WeakMap<RouteTreeNode, RouteUtils>`. Since `RouteTree` is immutable (`Object.freeze`), every mutation creates a new root — automatic cache invalidation without manual `rebuild()`.

**Structural typing for RouteTree:** `route-utils` defines a minimal `RouteTreeNode` interface locally (`fullName`, `children`, `nonAbsoluteChildren`) instead of importing `RouteTree` from the internal `route-tree` package. This eliminates the runtime dependency — TypeScript structural typing ensures compatibility when passing the real `RouteTree` object.

**Static facade for segment testers:** `RouteUtils.startsWithSegment`, `.endsWithSegment`, `.includesSegment`, `.areRoutesRelated` are static properties delegating to standalone functions. This provides a single import entry point while keeping functions tree-shakeable as standalone exports.

### Removed Packages

- **`@real-router/helpers`** — all functionality migrated into `@real-router/route-utils` (segment testers + `areRoutesRelated`)
- **`@real-router/cache-manager`** — `KeyIndexCache` and `CacheManager` were unused after RouteUtils adopted WeakMap-based caching; removed entirely

## Dependencies

### Pinned Versions

`.npmrc` has `save-exact=true` - all dependencies use exact versions, not ranges.

### @types/node Override

```json
"pnpm": {
  "overrides": {
    "@types/node": "$@types/node"
  }
}
```

Forces all packages to use the same @types/node version from root.

### pnpm 10 Settings

`.npmrc`:

```ini
strict-dep-builds=true       # Lifecycle scripts disabled by default; only onlyBuiltDependencies allowed
cleanup-unused-catalogs=true # Auto-cleanup unused catalog entries
script-shell=bash            # Use bash for script execution
```

`pnpm.onlyBuiltDependencies` in root `package.json` allowlists packages that may run lifecycle scripts: `@parcel/watcher`, `core-js`, `electron`, `esbuild`, `fsevents`, `lmdb`, `msgpackr-extract`, `unrs-resolver`, `vue-demi`. See "Supply-Chain Security › Minimum Release Age (Removed)" above for the rationale.

### Strict Peer Dependencies

`.npmrc`:

```ini
auto-install-peers=true
strict-peer-dependencies=true
```

**Why this combination:**

| Setting                    | Value | Effect                                                  |
| -------------------------- | ----- | ------------------------------------------------------- |
| `auto-install-peers`       | true  | pnpm automatically selects compatible peer dep versions |
| `strict-peer-dependencies` | true  | Peer dep conflicts = error (not warning)                |

**Why not `auto-install-peers=false`:**

Tried full strict mode but it broke React tests. When manually specifying react/react-dom versions (18.2.0 or 18.3.1), 2 tests failed. pnpm's auto-install-peers resolves complex version compatibility that's hard to replicate manually.

**Issues found and fixed:**

1. **Missing `react-dom` in peerDependencies** — `@real-router/react` had `react` but not `react-dom`
2. **Hidden dependency on auto-install-peers** — Tests relied on pnpm selecting compatible React versions automatically

**Result:** Peer dep conflicts now fail `pnpm install` instead of being silent warnings.

## Core Architecture

### Namespace-Based Design

**Problem:** Original `@real-router/core` had a monolithic structure with decorators in `src/core/`:

```
src/core/
├── dependencies.ts    (700+ lines)
├── middleware.ts      (300+ lines)
├── navigation.ts      (400+ lines)
├── observable.ts      (700+ lines)
├── options.ts         (300+ lines)
├── plugins.ts         (300+ lines)
├── routeLifecycle.ts  (400+ lines)
├── routerLifecycle.ts (400+ lines)
├── state.ts           (700+ lines)
└── routes/
    ├── routeConfig.ts (900+ lines)
    ├── routePath.ts   (300+ lines)
    ├── routeQuery.ts  (400+ lines)
    └── routeTree.ts   (700+ lines)
```

Issues:

- Circular dependencies between decorators
- Hard to test individual concerns
- Unclear boundaries of responsibility
- Router.ts was a god class (2500+ lines)

**Solution:** Migrated to **facade + namespaces + standalone API** pattern:

```
src/
├── Router.ts (facade, ~670 lines)
├── createRouter.ts           — factory function (public entry)
├── getNavigator.ts           — frozen read-only router subset
├── internals.ts              — WeakMap<Router, RouterInternals> registry
├── guards.ts                 — guard-related logic
├── validation.ts             — structural validation
├── typeGuards.ts             — type guard functions
├── stateMetaStore.ts         — WeakMap<State, Params> (replaces State.meta)
├── helpers.ts                — internal utilities
├── constants.ts              — error codes, constants
├── types.ts                  — core type definitions
├── types/                    — additional type modules
├── fsm/
│   ├── routerFSM.ts          — FSM config, states, events, factory
│   └── index.ts
├── api/                      — standalone functions (tree-shakeable)
│   ├── getRoutesApi.ts       — route CRUD
│   ├── getDependenciesApi.ts — dependency CRUD
│   ├── getLifecycleApi.ts    — guard management
│   ├── getPluginApi.ts       — plugin management
│   ├── cloneRouter.ts        — SSR cloning
│   ├── types.ts              — API return types
│   └── index.ts
├── utils/                    — SSR/SSG utilities
│   ├── serializeState.ts     — XSS-safe JSON serialization
│   ├── getStaticPaths.ts     — static path enumeration for SSG
│   └── index.ts
├── wiring/
│   ├── RouterWiringBuilder.ts — Builder: namespace dependency wiring
│   ├── wireRouter.ts          — Director: calls wire methods in correct order
│   ├── types.ts               — WiringOptions<Dependencies> interface
│   └── index.ts
└── namespaces/
    ├── RoutesNamespace/
    │   ├── RoutesNamespace.ts
    │   ├── routesStore.ts     — plain data store (RoutesStore)
    │   ├── forwardToValidation.ts
    │   ├── constants.ts
    │   ├── helpers.ts
    │   ├── validators.ts
    │   └── types.ts
    ├── DependenciesNamespace/
    │   ├── dependenciesStore.ts — plain data store (DependenciesStore)
    │   └── validators.ts
    ├── EventBusNamespace/     — FSM + EventEmitter encapsulation (replaces ObservableNamespace)
    ├── StateNamespace/
    ├── NavigationNamespace/
    ├── OptionsNamespace/
    ├── PluginsNamespace/
    ├── RouteLifecycleNamespace/
    ├── RouterLifecycleNamespace/
    └── index.ts               — (9 namespaces total)
```

**Benefits:**

- Clear separation of concerns
- Each namespace is independently testable
- No circular dependencies
- Router.ts is thin facade (validation + delegation)
- Namespace internals are encapsulated
- Standalone API functions are tree-shakeable (only bundled when imported)

**Migration:** Completed January 2026. Legacy `src/core/` folder deleted after full test coverage verification.

### Validation Pattern

**Two entry points, same validators:**

1. **Facade methods** (Router.ts) — call through `ctx.validator?.ns.fn()` (optional chaining)
2. **Standalone API** (`api/get*Api.ts`) — same pattern

```typescript
// Router.ts (facade path)
buildPath(route: string, params?: Params): string {
  ctx.validator?.routes.validateBuildPathArgs(route);  // no-op if plugin absent
  return getInternals(this).buildPath(route, params);
}

// api/getRoutesApi.ts (standalone API path)
add(routes) {
  ctx.validator?.routes.validateAddRouteArgs(routes);  // no-op if plugin absent
  addRoutes(store, routes);
}
```

Validators live in the namespace folder (`namespaces/XxxNamespace/validators.ts`) and are imported by `@real-router/validation-plugin`, not by core itself. Core only defines the `RouterValidator` interface in `src/types/RouterValidator.ts`.

### Validation Plugin Extraction

**Problem:** Validation code accounted for roughly 25% of the core bundle. It was always included — even in production builds where argument errors are impossible (TypeScript enforces call sites). Users had no way to opt out.

**Solution:** `@real-router/validation-plugin` — a standalone opt-in plugin. Core ships with structural guards and invariant protection only — no DX validation logic. The plugin installs a `RouterValidator` object into `RouterInternals.validator` at registration time. All call sites in core use `ctx.validator?.ns.fn()` — a no-op when the plugin is absent.

**Before:**

```typescript
// Router.ts — validation always ran, bundled unconditionally
buildPath(route: string, params?: Params): string {
  if (!this.#noValidate) {
    validateBuildPathArgs(route);  // always in the bundle
  }
  return this.#routes.buildPath(route, params, this.#options.get());
}
```

**After:**

```typescript
// Router.ts — validation is a no-op when plugin is not registered
buildPath(route: string, params?: Params): string {
  ctx.validator?.routes.validateBuildPathArgs(route);  // tree-shaken if unused
  return getInternals(this).buildPath(route, params);
}

// App setup — opt in explicitly
router.usePlugin(validationPlugin());
```

**Why this approach:**

- **Preact debug pattern** — Preact ships `preact/debug` as a separate opt-in import. Same idea: DX tooling is separate from the runtime.
- **User control** — production builds skip the plugin entirely. Development builds register it. No `__DEV__` flags, no build-time conditionals, no bundler magic required.
- **Runtime-agnostic** — works identically in browser, Node.js, and edge runtimes. No environment detection.
- **Retrospective validation** — the plugin validates already-registered routes and dependencies on install, catching mistakes made before the plugin was registered.
- **Atomic rollback** — if retrospective validation fails, `ctx.validator` is reset to `null` before the error propagates. The router stays in a consistent state.

### Phase 2 — DX Validator Extraction

**Problem:** After Phase 1, roughly 17 DX validators and warnings remained in core, called unconditionally (not behind `ctx.validator?.`). These included dependency count checks, clone arg validation, lifecycle overwrite warnings, plugin key validation, and route callback guards.

**Solution:** Moved all remaining DX validators behind the `ctx.validator?.` pattern. Added 17 new slots to the `RouterValidator` interface. Core now contains only structural guards (constructor, plugin registration) and two invariant guards.

**Why:** Completes the "zero DX validation in core" principle. Every DX check is now opt-in through the plugin.

### Invariant Guard Policy

**Problem:** After extracting all validation, the question arose: should core have any runtime checks at all? The RFC proposed 12 crash guards. Architectural review argued most are redundant — TypeScript catches at compile time, the plugin catches at dev runtime, and the JS runtime crashes with a stack trace.

**Solution:** Only 2 invariant guards remain in core: (1) `subscribe(listener)` — deferred crash with an actionable hint, (2) `navigateToNotFound(path)` — silent state corruption. The criterion: guard only for (a) silent corruption or (b) a deferred crash in a user-facing API where context is lost.

**Why:** Three-tier protection (TypeScript, plugin, JS runtime) covers most cases. Core guards are reserved for cases where the error manifests far from the cause or doesn't manifest at all.

### Error Message Consistency

**Problem:** The validation plugin had three different prefix formats (`[router.METHOD]`, `[real-router]`, no prefix), missing "got X" clauses, and inconsistent `Error` types for the same error class.

**Solution:** Unified to `[router.METHOD]` for API errors and `[validation-plugin]` for retrospective validation. Added `"got ${typeDescription}"` to all type errors. Standardized error types: `TypeError` (wrong type), `ReferenceError` (not found), `RangeError` (limit exceeded).

**Why:** Consistent format improves grep-ability and debuggability. Typed errors enable `instanceof`-based error handling.

### usePlugin Falsy Filtering

**Problem:** Conditional plugin registration requires verbose `if` blocks. The common JS pattern `__DEV__ && plugin()` produces `false` which `usePlugin` rejected with `TypeError`.

**Solution:** `usePlugin()` filters arguments with `plugins.filter(Boolean)` before validation. Falsy values (`undefined`, `null`, `false`) are silently skipped.

**Why:** Enables inline conditional registration — a familiar JS pattern (like React children). `router.usePlugin(browserPlugin(), __DEV__ && validationPlugin())` reads naturally and works without wrapper `if` blocks.

### Plugin Interception Pattern

**Problem discovered:** After moving business logic into namespaces, plugins could no longer intercept router methods by overriding `router.forwardState` (monkey-patching). The namespace calls its own `forwardState`, bypassing any plugin override on the router facade.

**Original (broken) approach:** Plugins monkey-patched router methods directly:

```typescript
// persistent-params-plugin (old approach)
const originalForwardState = router.forwardState;
router.forwardState = (name, params) => {
  const result = originalForwardState(name, params);
  return { ...result, params: withPersistentParams(result.params) };
};
```

**Solution:** Universal `addInterceptor()` API on `PluginApi`:

```typescript
// persistent-params-plugin (new approach)
const api = getPluginApi(router);
api.addInterceptor("forwardState", (next, routeName, routeParams) => {
  const result = next(routeName, routeParams);
  return { ...result, params: withPersistentParams(result.params) };
});
```

**Implementation:** `createInterceptable(fn, interceptors, method)` in `internals.ts` wraps router methods at wiring time. When an interceptor is registered, the wrapped method executes the interceptor chain (FIFO order) before calling the original. The `InterceptableMethodMap` interface defines interceptable methods: `start`, `buildPath`, `forwardState`.

**Rule:** Methods that plugins may intercept must go through `RouterInternals` (WeakMap-based), not be called directly on namespace instances.

### Router Extension Pattern

**Problem:** Plugins that add methods to the router instance (e.g., `browser-plugin` adding `buildUrl`, `matchUrl`, `replaceHistoryState`) used manual property assignment with no conflict detection and manual cleanup:

```typescript
// browser-plugin (old approach)
Object.assign(this.#router, { buildUrl, matchUrl, replaceHistoryState });
// teardown:
delete (this.#router as any).buildUrl;
delete (this.#router as any).matchUrl;
delete (this.#router as any).replaceHistoryState;
```

Issues: no conflict detection if two plugins assign the same key, manual `delete` cleanup is error-prone, no safety net if plugin forgets cleanup.

**Solution:** `extendRouter()` on `PluginApi`:

```typescript
// browser-plugin (new approach)
const api = getPluginApi(router);
const removeExtensions = api.extendRouter({
  buildUrl,
  matchUrl,
  replaceHistoryState,
});
// teardown:
removeExtensions(); // idempotent, auto-cleans all keys
```

**Implementation:** `extendRouter()` in `getPluginApi.ts` uses a two-loop pattern (validate-all, then assign-all) for atomicity. Throws `RouterError(PLUGIN_CONFLICT)` if any key already exists. Tracks assigned keys in `RouterInternals.routerExtensions` for safety-net cleanup during `dispose()`.

### Standalone API Extraction (Modular Architecture)

**Problem:** All API surface was on the Router class, making it impossible to tree-shake unused features (e.g., dependency management, guard management, cloning).

**Solution:** Extract domain-specific operations into standalone functions that access router internals via a `WeakMap`:

```typescript
// internals.ts — module-level registry
const internals = new WeakMap<object, RouterInternals>();

export function getInternals(router: Router): RouterInternals {
  const ctx = internals.get(router);
  if (!ctx) throw new TypeError("Invalid router instance");
  return ctx;
}

// Router.ts — registers on construction
registerInternals(this, { makeState, forwardState, dependenciesGetStore, ... });

// api/getDependenciesApi.ts — consumer
export function getDependenciesApi(router: Router): DependenciesApi {
  const ctx = getInternals(router);
  const store = ctx.dependenciesGetStore();
  return { set(name, value) { /* operates on store directly */ } };
}
```

**Store pattern:** Heavy namespaces (DependenciesNamespace, RoutesNamespace parts) replaced with plain data stores (`DependenciesStore`, `RoutesStore`) — interfaces + factory functions, no classes. CRUD logic moved into the corresponding API function as module-private functions. This enables tree-shaking: if `getDependenciesApi` is not imported, its CRUD logic is dead-code-eliminated.

**Extracted APIs:** `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getPluginApi`, `cloneRouter`.

**Tree operations injection:** Heavy route-tree functions (`addRouteNode`, `removeRouteNode`) are injected via `store.treeOperations` at runtime (set during wiring), avoiding static import chains that would pull in route-tree code into every API consumer.

### FSM Migration: dispose(), TransitionMeta, Event Flow

#### dispose() — Terminal State

Router supports permanent disposal via `router.dispose()`. RouterFSM transitions to terminal `DISPOSED` state. All mutating methods throw `ROUTER_DISPOSED` after disposal.

**Cleanup order:** plugins → eventBus → routes+lifecycle → state → deps → currentToState → markDisposed

**Idempotency:** Second call is a no-op (FSM state check prevents double-cleanup).

#### Enhanced State Object (TransitionMeta)

After each navigation, `state.transition` contains `TransitionMeta` with:

- `reload` — `true` after `navigate(..., { reload: true })` (optional)
- `redirected` — `true` if navigation was redirected via `forwardTo` (optional)
- `phase` — last pipeline phase reached (`"deactivating"` | `"activating"`)
- `from` — previous route name (undefined on first navigation)
- `reason` — always `"success"` for resolved navigations
- `blocker` — guard name that blocked the transition (reserved, not yet populated by core)
- `segments` — `{ deactivated, activated, intersection }` (all deeply frozen arrays)

`TransitionMeta` is built by `NavigationNamespace` after each successful navigation and attached to the state object before freezing. Transition timing is available via `@real-router/logger-plugin`.

#### FSM-Driven Event Flow

Router events originate from FSM state changes. The navigate hot path uses `forceState()` for direct state updates + manual emit (bypassing `send()` dispatch overhead):

```
navigate() → fsm.forceState(TRANSITION_STARTED) + emitTransitionStart()
           → [guard pipeline — optimistic sync execution]
           → fsm.forceState(READY) + emitTransitionSuccess()

stop()    → routerFSM.send("CANCEL")  → emitTransitionCancel()  (if transitioning)
          → routerFSM.send("STOP")    → emitRouterStop()
```

Non-navigate transitions (start, stop, dispose) still use `send()` with FSM actions via `fsm.on()`.

**Key change vs master:** `invokeEventListeners` lambdas replaced by typed FSM actions. No manual flag management (`#started`, `#active`, `#navigating` booleans removed).

#### Removed API

- **`router.cancel()`** — replaced by `AbortController` API: pass `{ signal }` to `navigate()` for external cancellation. Internally, `stop()`, `dispose()`, and concurrent navigation abort the current controller
- **`emitSuccess` parameter** — removed from `navigateToState()` (core + browser-plugin)

#### Bundle Size

Size limit: `20 kB` for `@real-router/core (ESM)` and `20 kB` for `@real-router/core/api (ESM)` in `.size-limit.js`.

### Type Guard Hierarchy

**Problem:** `isState` function existed in two places with different semantics:

1. `type-guards` package — strict validation, rejects circular refs in params (not JSON-serializable)
2. `helpers.ts` (local) — structural check only, allows any object structure

**Issue discovered:** After removing local `isState` and using `type-guards` version, `deepFreezeState` tests failed for circular reference cases.

**Root cause:** `type-guards/isState` calls `isParams` which validates serializability:

```typescript
// type-guards/isParams
function isSerializable(value, visited = new WeakSet()) {
  if (visited.has(value)) {
    return false; // Circular reference - not serializable!
  }
  // ...
}
```

**Solution:** Two-tier validation:

```typescript
// type-guards (public API)
export function isState(value): value is State {
  // Full validation: structure + params serializability
  return isRequiredFields(obj); // Uses isParams internally
}

// helpers.ts (internal)
function isStateStructural(value): value is State {
  // Structural only: just checks name/path/params exist
  return (
    typeof obj.name === "string" &&
    typeof obj.path === "string" &&
    typeof obj.params === "object" &&
    obj.params !== null
  );
}
```

**Usage:**

- `isState` from `type-guards` — for public API validation (params must be serializable)
- `isStateStructural` in `helpers.ts` — for internal operations like `deepFreezeState` that handle any structure

**Lesson:** Validation strictness depends on context. Public API should be strict; internal utilities may need flexibility.

## State.meta → WeakMap

### Problem

`State.meta` (StateMeta) — internal implementation detail (param source mapping) that leaked into the public `State` interface. Visible via autocomplete, JSON.stringify, DevTools, spread operator.

### Solution

Module-level `WeakMap<State, Params>` inside `@real-router/core` (`stateMetaStore.ts`). All consumers use `getStateMetaParams(state)` / `setStateMetaParams(state, params)` instead of `state.meta`. The `StateMeta` wrapper type was removed — the WeakMap stores `Params` directly.

### What was removed

- `meta.id` and the `#stateId` auto-increment counter — nobody read `meta.id`, so the whole pipeline was dead code
- `forceId` parameter removed from the entire `PluginApi.makeState` chain
- `areStatesEqual` no longer reads from the WeakMap — uses the cached `#urlParamsCache` instead
- `freezeStateInPlace` no longer freezes meta — it's internal, no need to freeze

### Why WeakMap over Symbol

- No TypeScript complexity (`unique symbol` + cross-package export)
- State type is fully clean — no hidden fields
- WeakMap entries are auto-collected by GC when State is dereferenced
- Complete invisibility: JSON.stringify, Object.keys, DevTools, spread — nothing leaks

### Caveats

- `deepFreezeState()` uses `structuredClone()` → clone loses WeakMap entry. `err.redirect` intentionally has no meta (only needs name + params for redirect target).
- `_MP` phantom generic preserved on `State<P, _MP>` for backward compatibility.

## TRANSITION_LEAVE_APPROVE — Observable phase between guard phases

### Problem

No hook existed for side-effects between deactivation and activation guards. Developers were forced to abuse `canDeactivate` guards for side-effects (scroll save, analytics, fetch abort) — mixing decision logic (boolean return) with side-effects (void). Guards are the wrong place: they block navigation, they run per-route, and their boolean contract makes side-effect intent invisible.

### Solution

New FSM state `LEAVE_APPROVED` between `TRANSITION_STARTED` and `READY`. New FSM event `LEAVE_APPROVE`. Public API `router.subscribeLeave(listener)` fires after all deactivation guards pass but before activation guards run. Plugin hook `onTransitionLeaveApprove(toState, fromState?)` added alongside `onTransitionStart`. Uses `forceState()` on the hot path — consistent with NAVIGATE and COMPLETE.

**Why `forceState()` not `send()`:** The pipeline is the authority on order; the FSM is a state tracker. `forceState()` is honest about this. Consistent with NAVIGATE/COMPLETE. Avoids Map lookup + action dispatch overhead on the hot path.

**Why between deactivation and activation:** Deactivation passing is the commitment point — the user (or guard) has confirmed leaving. Side-effects should only run after this decision, not before. This is the earliest safe moment for scroll save, analytics, fetch abort, and similar concerns.

**State change remains atomic** — `router.getState()` updates in one step via `completeTransition`. What's new is an observable phase (`LEAVE_APPROVED`) between deactivation and activation guard phases where side-effects are safe.

### Before

```typescript
canDeactivate: async (toState, fromState) => {
  // Mixed decision + side-effect
  const ok = await showDialog();
  if (ok) saveDraft(); // side-effect in guard
  return ok;
};
```

### After

```typescript
canDeactivate: ((toState, fromState) => showDialog(), // pure decision
  router.subscribeLeave(({ route }) => {
    if (route.name === "settings") saveDraft(); // pure side-effect, only fires when confirmed
  }));
```

## Turbo `--filter` Does Not Exclude Downstream Dependents

### Problem

`pnpm turbo run test --filter='!./examples/**'` still executes `test` tasks for example packages. Turbo `--filter` controls the initial scope but does not prevent downstream dependents from being included in the execution graph. This is a known turbo limitation ([vercel/turborepo#6505](https://github.com/vercel/turborepo/discussions/7453)) with no planned fix.

Pre-push hook and CI were running dozens of example `test` and `build` tasks on every run (today the example set alone is ~1000 turbo tasks) — adding minutes to both local and CI pipelines.

### Solution

Rename task scripts in examples so turbo cannot find them:

- `"test": "vitest run"` → `"test:unit": "vitest run"` in 30 example package.json files
- `pnpm turbo run test` no longer finds `test` script in examples → `<NONEXISTENT>` → skipped
- Examples don't have `bundle` script, so `turbo run bundle` skips them automatically
- `lint:package`/`lint:types` dependsOn changed to `bundle` (only need dist/, not full validation)

### Why not `--filter-deep`

Turbo has no `--filter-deep` flag. The RFC was closed without implementation. Our workaround (task name mismatch) is the same approach recommended in the turbo discussion — ensure filtered-out packages don't have matching script names.

### Also removed

- `pnpm-lock.yaml` from `turbo.json` `global.inputs` — lockfile changes were invalidating cache for ALL tasks across ALL packages. Dependencies are resolved by `pnpm install` before turbo runs.

### `examples/*` workspace is required

`examples/web/react/package.json` (`react-examples-shared`) hosts shared deps (`react`, `@types/react`, `@real-router/react`) for all nested examples. `../shared/Layout.tsx` imports from these — without the workspace entry, pnpm doesn't install them and `tsc -b` fails with "Cannot find module 'react'".

## CI Split: PR-only CI + Post-Merge Build

### Problem

Push to master (after PR merge) re-ran the full CI pipeline: Test ~8min + Lint ~8min + Build. Code was already verified in the PR — test and lint were redundant.

### Solution

Split into two workflow files:

- `ci.yml` — `on: pull_request` only. Single Pipeline job (test + bundle) → downstream: smoke, coverage, sonarcloud, bundle-size → CI Result gate.
- `post-merge.yml` — `on: push: branches: [master]`. Only `bundle` via turbo (remote cache makes most tasks cache hit). No test, no lint, no coverage.

### Why not conditions in one file

Adding `github.event_name == 'pull_request'` to each job makes the file harder to read. Two files — each does one thing, no conditions.

### Why no coverage on push

Coverage and SonarCloud depend on test job artifacts. Without test, there are no coverage files to upload. Codecov updates baseline from PR merge commits — no separate push upload needed.

### Release pipeline coupling

`changesets.yml` uses a `workflow_run` trigger and must reference the workflow that runs on master push. After the split, this trigger was updated from `workflows: [CI]` to `workflows: [Post-Merge Build]`. Missing this update breaks the release pipeline — changesets never triggers after merge, no Version PR is created.

## State Context — Plugin-Extensible Route Data via Claim-Based API

### Problem

Plugins stored per-route data in `WeakMap<State, T>` — parallel storage next to State. This meant no reactivity, no data locality, and each plugin inventing its own WeakMap. Consumers accessed plugin data via global methods (`router.getNavigationMeta(state)`) instead of route properties. Five plugins independently implemented the same pattern: allocate a WeakMap, set data during transition, expose a getter. The data lived outside the State object, invisible to framework adapters and to `JSON.stringify` debugging.

### Solution

New `state.context` field — required, mutable, present on every State object. Claim-based API mirrors the `extendRouter()` pattern:

```typescript
// Plugin registration
const claim = api.claimContextNamespace("navigation");

// During transition — O(1) property assignment
claim.write(state, { direction: "forward", userInitiated: true });

// Teardown
claim.release();
```

**Collision detection:** `claimContextNamespace` tracks claimed keys in a `Set<string>`. Duplicate claims throw immediately — O(1) lookup, caught at registration time, not at runtime.

**Freeze pipeline refactored:** Recursive `deepFreezeState()` replaced with targeted shallow freezes. Core freezes `state` and `state.context` (the container). Plugin authors are responsible for freezing their own payloads — they know the shape, core does not. This avoids freezing third-party objects with non-configurable properties and removes the `structuredClone` overhead from the hot path.

### Why

- **Data locality** — plugin data lives on the State object itself. No WeakMap indirection, no parallel storage. `state.context.navigation.direction` is a property read.
- **Framework adapter access** — adapters expose `route.context` directly. React: `useRoute().context.navigation.direction`. Vue: `route.value.context.ssr.loaderData`. No extra hooks, no separate subscriptions.
- **TypeScript DX** — module augmentation on `@real-router/types` `StateContext` interface. Each plugin augments its own namespace. Consumers get full autocompletion on `state.context.*`.
- **Zero hot-path overhead** — `claim.write(state, value)` is a literal property assignment (`state.context[namespace] = value`). No proxy, no observable wrapper, no clone.

### Before

```typescript
// navigation-plugin — WeakMap storage, global getter
const metaMap = new WeakMap<State, NavigationMeta>();

// During transition
metaMap.set(toState, { direction: "forward", userInitiated: true });

// Consumer access — must import and call a global method
const meta = router.getNavigationMeta(router.getState());
```

### After

```typescript
// navigation-plugin — claim-based, data on state
const claim = api.claimContextNamespace("navigation");

// During transition — direct property assignment
claim.write(toState, { direction: "forward", userInitiated: true });

// Consumer access — property read on route
const direction = route.context.navigation.direction;
```

### Migrated plugins

| Plugin                     | Context namespace(s)    | Data                                            |
| -------------------------- | ----------------------- | ----------------------------------------------- |
| `navigation-plugin`        | `navigation`            | direction, sourceElement, userInitiated         |
| `ssr-data-plugin`          | `data` (+ `ssrDataMode`, `ssrDataDeferred`, `ssrDataDeferredKeys`) | per-route loader result + mode marker + deferred-promise registry (#610) |
| `rsc-server-plugin`        | `rsc` + `rscAction`     | per-route ReactNode + server-action results     |
| `persistent-params-plugin` | `persistentParams`      | persistent params snapshot                      |
| `browser-plugin`           | `browser` + `url`       | popstate/navigate source + URL fragment (#532)  |
| `memory-plugin`            | `memory`                | direction, historyIndex                         |

### Not migrated

`hash-plugin` (low-priority analog of browser-plugin), `search-schema-plugin`, `preload-plugin`, `validation-plugin`, `lifecycle-plugin`, `logger-plugin` — none of these produce data consumed by UI. They either transform inputs (search-schema, validation), orchestrate side-effects (lifecycle, preload), or observe without writing (logger, hash).

## Leading Zeros in `numberFormat: "auto"` (search-params)

### Problem

`autoNumberStrategy.decode("00")` returned `0` — leading zeros were silently stripped during URL roundtrip. Property-based test (`pathRoundtrip.properties.ts`) caught this with counterexample `{q: "00"}`: `buildPath → matchPath` changed `"00"` to `0`.

Similarly, `decode("99999999999999999")` returned `100000000000000000` — precision loss for unsafe integers.

### Solution

Two guards added to `autoNumberStrategy.decode()` in `packages/search-params/src/strategies/number.ts`:

1. **Leading zeros**: strings starting with `0` where second char is not `.` return `null` (stay as strings). `"0"` and `"0.5"` still parse as numbers.
2. **Unsafe integers**: `Number.isSafeInteger()` check rejects integers beyond `MAX_SAFE_INTEGER`.

### Why this matters

URL query params are fundamentally strings. `numberFormat: "auto"` is a convenience that should only convert unambiguous canonical numbers. `"00"` is not canonical (it's a string with semantic leading zero, e.g., ZIP codes, product codes). `"99999999999999999"` cannot be represented without precision loss.

## `defaultParseQueryString` Missing URI Decoding (path-matcher)

### Problem

`defaultBuildQueryString` encodes values via `encodeURIComponent`, but `defaultParseQueryString` returned raw slices without `decodeURIComponent`. Roundtrip: `{q: "hello world"}` → `"q=hello%20world"` → `{q: "hello%20world"}`.

### Solution

Added `decodeURIComponent()` to both key and value extraction in `defaultParseQueryString`.

### Why low priority

`defaultParseQueryString` is a fallback for standalone `path-matcher` usage. Standard configuration uses `search-params` package (injected via DI in `route-tree/createMatcher.ts`) which handles encoding correctly.

## Unified Strict-Mode Behavior on Unmatched URLs (#483)

### Problem

`allowNotFound: false` had inconsistent semantics depending on the entry point:

| Entry point                    | Behaviour on unmatched URL + strict mode                            |
| ------------------------------ | ------------------------------------------------------------------- |
| `router.start(path)`           | throws `ROUTE_NOT_FOUND`                                            |
| `browser-plugin` popstate      | silent `router.navigateToDefault({ reload, replace })`              |
| `navigation-plugin` navigate   | silent `router.navigateToDefault()` in `event.intercept`            |
| `hash-plugin` popstate         | silent fallback (shared `browser-env/popstate-handler`)             |

The same configuration, the same unmatched URL → three different outcomes depending on how the URL arrived. `defaultRoute` was overloaded: explicit target for `navigateToDefault()` **and** implicit auto-fallback on popstate. The silent fallback hid errors from logs, analytics, and the `onTransitionError` hook.

### Solution

Unified contract: `allowNotFound: false` means "unknown route is an error, reported, everywhere". `start()` already implemented it — the three plugins now match.

1. Added `PluginApi.emitTransitionError(error)` — a standard point-of-entry for plugins to emit `$$error` without synthesising a navigation. Delegates to `ctx.emitTransitionError` on `RouterInternals`, which calls `eventBus.sendFailSafe(undefined, state.get(), error)` (safe at any FSM state — direct emit when not READY).
2. `shared/browser-env/popstate-handler.ts`: strict-mode else-branch emits `ROUTE_NOT_FOUND` via `api.emitTransitionError` and calls `rollbackUrlToCurrentState()` (replaces URL with the current router state's path) — no more silent `navigateToDefault`.
3. `navigation-plugin/navigate-handler.ts`: strict-mode branch emits the same error and throws inside an `async` `event.intercept()` handler — Navigation API auto-rolls back the URL via intercept rejection.
4. `hash-plugin`: inherits the fix via `browser-env` symlink.

### Incidental fix bundled in

The popstate-handler catch was extended: `RouterError` from `deps.router.navigate()` (e.g., `CANNOT_DEACTIVATE` from a blocking guard) now also rolls the URL back. Previously, guard-rejected popstate left the browser URL on the new location while state stayed on the old — an inconsistent observable state.

Teardown-safe: the rollback is wrapped in try/catch because `router.buildUrl` may have been removed by plugin teardown while a popstate event was still queued.

### Userland migration

Users who relied on the silent fallback subscribe explicitly:

```ts
router.usePlugin(() => ({
  onTransitionError(_toState, _fromState, err) {
    if (err.code === "ROUTE_NOT_FOUND") {
      void router.navigateToDefault({ replace: true });
    }
  },
}));
```

### Why this matters

- Closes #471 case 3 from the opposite direction — `{ allowNotFound: false, defaultRoute: "" }` is no longer a dead-end configuration.
- Single purpose for `defaultRoute`: only the explicit `router.navigateToDefault()` target.
- All error surfaces go through one channel (`onTransitionError`) — uniform observability for logs, analytics, and recovery UIs.

## Scroll Restoration as Utility, Not Plugin

**Problem.** SPA navigation typically loses scroll position — users expect back/forward to restore where they left off (browser default for MPAs, universally emulated by modern SPA routers: Angular `withInMemoryScrolling`, React Router `<ScrollRestoration>`, Vue `scrollBehavior`). Real-router shipped no such feature, putting us behind parity.

**Solution.** Added `shared/dom-utils/scroll-restore.ts` exposing `createScrollRestoration(router, options?)` — a function-shaped utility with the same contract as `createRouteAnnouncer`. Each framework adapter wires it to a `scrollRestoration?: ScrollRestorationOptions` prop on `RouterProvider` (Angular: options bag on `provideRealRouter`). Lifecycle tied to provider mount/unmount.

**Why not a `@real-router/scroll-plugin`.** `window.scrollY` is a DOM concern; router-core is DOM-agnostic (`state.name` / `params` / `context` only). A plugin would be a layering leak — the same mistake as Angular's `TitleStrategy` inside router-core. The routing-layer inputs the utility needs (direction, navigationType) are already published by `@real-router/navigation-plugin` via `state.context.navigation`. A plugin would duplicate an existing channel without adding value.

### Key-Synthesis Decision: Composite Route Identity, Not Per-Entry UUID

**Problem.** The issue specification (#497) called for keying saved positions by `history.state.key`. Investigation showed:

- `@real-router/browser-plugin.history.state` contains `{ name, params, path }` only — no key.
- `@real-router/navigation-plugin` exposes entry `.key` internally (Navigation API) but does **not** publish it on `state.context`.

Pulling a per-entry UUID into the public contract would require coordinated changes in `browser-plugin` (write UUID on every entry) and a new context namespace — a larger RFC.

**Solution.** The utility synthesizes the key as `${state.name}:${canonicalJson(state.params)}`. Two history entries that resolve to the same `(name, params)` pair collapse to one bucket; the latest save wins. This key-shape satisfies ~99% of real-world scroll-restoration UX (list → item → back) with zero plugin coupling.

**Why acceptable.** The alternative — emit `canonical-json(path)` or write UUIDs into `history.state` from `browser-plugin` — adds cross-package coordination for a case (same-name+same-params entries appearing multiple times in history) that is rare and self-correcting (subsequent saves overwrite).

### Capture Strategy: Subscribe + pagehide, Not Throttled Scroll Listener

**Problem.** Common scroll-restoration implementations attach a throttled `scroll` listener to continuously persist `window.scrollY`. This adds complexity (throttle timer, flush-on-transition, debouncing) and produces hundreds of sessionStorage writes per page.

**Solution.** Use two discrete event sources:

1. `router.subscribe(({ route, previousRoute }) => ...)` — fires on transition success. Synchronously from the FSM's `$$success` event, **before** the framework re-renders the new route. At that instant `window.scrollY` still reflects the old DOM, so we capture it keyed by `previousRoute`.
2. `pagehide` — single listener that saves the current route's position on reload / tab close.

No throttling, no timers, no scroll listener. Precision guaranteed because capture runs at the exact navigation boundary rather than "within 100ms of the last scroll."

### Why Default Mode = `"restore"`

The utility is **opt-in** (`undefined` = off), so users who don't want restoration pay nothing. But when they opt in, `"restore"` matches expected UX (what they'd get in an MPA by default, and what every competitor ships). Users wanting different semantics pass `mode: "top"` or `mode: "manual"` explicitly.

### Why Not Expose `ScrollRestorationOptions` from Adapter Roots

`RouteAnnouncerOptions` is already not re-exported from any adapter's public entry (`RouterProvider` prop-type inference covers consumer needs). `ScrollRestorationOptions` follows the same convention. If users ask, we promote in a later minor.

## safeParseUrl — scheme-agnostic parser (#496)

### Problem

Before [issue #496](https://github.com/greydragon888/real-router/issues/496), `shared/browser-env/url-parsing.ts` contained:

```ts
export function safeParseUrl(url: string, context: string): URL | null {
  try {
    const parsed = new URL(url, globalThis.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      console.warn(`[${context}] Invalid URL protocol in ${url}`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[${context}] Could not parse url ${url}`, err);
    return null;
  }
}
```

Two failure modes in desktop WebViews:

1. **`TypeError` on `file://`.** In Electron windows loaded via `win.loadFile(...)`, `globalThis.location.origin` returns the string `"null"` (not `null` — the literal four characters). `new URL("/users", "null")` throws `TypeError: Invalid base URL`. Both `browser-plugin` and `navigation-plugin` became unusable in Electron `file://` windows without a custom protocol.
2. **Whitelist rejected non-HTTP schemes.** Protocols `app://` (Electron custom scheme), `tauri://` (Tauri macOS/iOS), `asset://`, and any other desktop runtime URL failed the `["http:", "https:"].includes(parsed.protocol)` check. The function returned `null` with a console warning, the plugin treated the URL as invalid, and navigation silently failed.

Both issues blocked real-world desktop usage without downstream patches.

### Solution

Rewrote `safeParseUrl` as a **manual, scheme-agnostic parser** that produces `{ pathname, search, hash }` directly:

```ts
export interface ParsedUrl {
  pathname: string;
  search: string;
  hash: string;
}

export function safeParseUrl(url: string): ParsedUrl {
  // Manual parse — works for any scheme: tauri://, app://, file://, https://, path-only, opaque.
  // ... implementation details ...
}
```

Contract changes:

- Returns `ParsedUrl` (a plain struct), not `URL | null`.
- Total — never throws, never returns `null` for any input (empty string yields `{ pathname: "", search: "", hash: "" }`).
- `context` parameter removed — no warnings, no protocol whitelist.

Consumers — `browser-plugin`, `hash-plugin`, `navigation-plugin` — pass `url`, extract the field they need, and drop their null-case branches. `urlToPath(url, base, context)` in `shared/browser-env/url-utils.ts` also lost its `context` parameter.

### Why

1. **Routing doesn't need origin or protocol.** The router cares about `pathname`, `search`, and `hash`. The origin-check and protocol-check were false security: real desktop runtimes emit non-HTTP origins for legitimate content, and the matcher is already the source of truth for "is this URL valid for this app."
2. **Real-Router is the only router with explicit desktop support.** Users picking our router for Electron / Tauri come for this. Silently auto-downgrading or falling back to `memory-plugin` would hide the value — instead we document the compatibility matrix (see [Desktop Integration Guide](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) in the wiki).
3. **Performance bonus.** The manual parser runs 4–6× faster than `new URL(url, origin)` on the URL-roundtrip fixtures used by `navigation-plugin`'s `hasVisited` / `getVisitedRoutes` hot path (both iterate every session-history entry). On short flat histories the win is invisible; on 100+ entries with frequent `peekBack` / `getVisitedRoutes` calls it matters.

### Before / After

```diff
-export function safeParseUrl(url: string, context: string): URL | null {
-  try {
-    const parsed = new URL(url, globalThis.location.origin);
-    if (!["http:", "https:"].includes(parsed.protocol)) {
-      console.warn(`[${context}] Invalid URL protocol`);
-      return null;
-    }
-    return parsed;
-  } catch {
-    return null;
-  }
-}
+export interface ParsedUrl { pathname: string; search: string; hash: string }
+export function safeParseUrl(url: string): ParsedUrl {
+  // ... manual scheme-agnostic parse ...
+}
```

### Consumers — code simplification

- `urlToPath(url, base, context)` → `urlToPath(url, base)`. The function is total and always returns a `string` starting with `/`.
- `entryToState` in `navigation-plugin` — removed `if (path === null) return undefined` branch.
- `matchUrl` in `browser-plugin` / `hash-plugin` — removed null-check, the expression collapsed to a single `return` without an intermediate variable.

See commit `06ccab93` for the full diff.

### Trade-offs

- **Breaking: callers receive `ParsedUrl`, not `URL`.** `safeParseUrl` is not a public export of any plugin — it lives in `shared/browser-env/`, consumed only by the three URL plugins in the monorepo. External consumers are not affected.
- **No scheme validation.** If `javascript:alert(1)` reaches the router, its "pathname" is extracted. The router still rejects it — it won't match any route → `navigateToDefault` / `navigateToNotFound`. Validation moved from the parser layer (where it was a false check) to the matcher layer (where it has always lived).
- **No warnings for debugging.** Previously a warning fired on every non-HTTP scheme, which was noise — the protocol was the expected behavior in Electron / Tauri. Debugging specific URLs is done with a targeted `console.log` in the plugin's call site, not a blanket parser warning.

### Test coverage

- Property tests on parser invariants — `packages/browser-env/tests/property/browserEnv.properties.ts`: valid HTTP paths, any scheme (desktop environments), `pathname` not polluted by `search` / `hash`.
- Property tests in consumer plugins — `packages/browser-plugin/tests/property/browserPlugin.properties.ts`, `packages/hash-plugin/tests/property/hashPlugin.properties.ts`, `packages/navigation-plugin/tests/property/{url-roundtrip,history-model,pure-functions}.properties.ts`: URL-roundtrip invariants preserved after the refactor.
- Functional tests across all three plugins updated — null-case branches removed, scheme-agnostic assertions added.
- 5 desktop examples (`examples/desktop/electron/{react,react-hash,react-navigation}` + `examples/desktop/tauri/{react,react-navigation}`) with 32 Playwright e2e specs including deep-link reload at three nested levels across `app://`, `file://`, and `tauri://` schemes.

### Related

- A short micro-benchmark lived in `benchmarks/core/url-parsing-compare.ts` during the refactor and was removed after validation — the new parser ran 4–6× faster than `new URL()` on 6 fixtures (shortHttp / longHttp / withQueryHash / hashRouting / customScheme / fileUrl) and ~3.87× faster on a history-iteration scenario of 100 entries. Results are captured in the #496 commit message (`06ccab93`); the bench itself wasn't kept because it was a one-shot validation.
- `navigation-plugin` hot path — `getVisitedRoutes` / `hasVisited` iterate every entry in the Navigation API's session history; the scheme-agnostic parser is measurable there.
- Public surface documented in [Desktop Integration Guide](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) (wiki).

## navigation-plugin: Syncing Flag Owned by `NavigationBrowser`, Not the Plugin (#527)

### Problem

`packages/navigation-plugin/src/plugin-utils.ts` reimplemented `createStartInterceptor` and `createReplaceHistoryState` already living in `shared/browser-env/plugin-utils.ts` (used by `browser-plugin` and `hash-plugin`). The fork existed because of one extra invariant: `NavigationBrowser.replaceState` is implemented via `nav.navigate({history:"replace"})`, which fires a `navigate` event synchronously — and the same is true for `nav.navigate(...)`/`nav.updateCurrentEntry(...)`/`nav.traverseTo(...)`. The plugin had to gate the handler with `#isSyncingFromRouter = true` around every router-driven mutation, otherwise it would treat its own write as a user navigation. `history.replaceState` does NOT fire popstate, so the History API plugins didn't need the gate.

The pre-refactor design encoded the gate as 5+ manual `try/finally` blocks across `plugin.ts:onTransitionSuccess`, `navigate-handler.ts:recoverFromNavigateError`, `navigate-handler.ts:syncUrlToRouterState`, and the local `plugin-utils.ts`. A `setSyncing` callback threaded the flag through `createNavigateHandler` and `createReplaceHistoryState`. The result: the syncing invariant lived in N call-sites instead of one, and any new mutation method had to remember to wrap.

### Solution

Move ownership of the syncing flag into a per-instance plugin field. A new helper `wrapNavigationBrowserWithSyncing(browser, syncing)` produces a `NavigationBrowser` that raises a `SyncingFlag` (`{ current: boolean }`) before each router-driven mutation and lowers it after, including the throw path. `NavigationPlugin` creates its own `#syncing` cell in the constructor and applies the wrap to whatever browser the factory hands it — built-in `createNavigationBrowser(base)`, SSR fallback, or a user-supplied mock (e.g. `createMockNavigationBrowser` in tests). All consumers inherit the invariant for free, and two `NavigationPlugin` instances using the same factory output get **independent** syncing cells (no cross-router spillover).

Once the wrap was in place, the local `plugin-utils.ts` had no reason to exist:

- `createStartInterceptor` widened to accept a structural `LocationSource = { getLocation: () => string }` — both `Browser` and `NavigationBrowser` are assignable.
- `createReplaceHistoryState` widened to accept a structural `ReplaceStateBrowser = { replaceState; getHash }` — likewise.
- The buffer-reuse optimization (`createUpdateBrowserState`) was inlined into `createReplaceHistoryState` so its 5th argument shrinks to `preserveHash: boolean = true` (no extra parameters needed for navigation-plugin).

`NavigationPlugin.#syncing: SyncingFlag` is the single place the plugin holds the flag; `isSyncingFromRouter: () => this.#syncing.current` is the only path the navigate handler reads.

### Why not extend the shared utility with a `wrapWrite` callback?

The original RFC proposed adding `wrapWrite?: (write: () => void) => void` to `createReplaceHistoryState` as a hook navigation-plugin would use to inject `setSyncing`. Rejected because:

- Public shared signature would expand for a single consumer; `browser-plugin`/`hash-plugin` would always pass `undefined`.
- The hook only covered `replaceState` — but the syncing invariant applies to all 4 router-driven mutations (`navigate`, `replaceState`, `updateCurrentEntry`, `traverseTo`). 5+ manual `try/finally` blocks elsewhere would have remained.
- `setSyncing` is a re-entrancy detail of the `NavigationBrowser` wrapper (it knows its `replaceState` is implemented through `nav.navigate({history:"replace"})`), not of the shared utility. The right boundary is the browser wrapper, applied where the plugin instance owns it.

### Trade-offs

- The refactor shrinks navigation-plugin LOC and removes one source file, but adds the `wrapNavigationBrowserWithSyncing` helper (~25 LOC). Net is still negative; the architectural win is single ownership inside the plugin instance.
- User-supplied `NavigationBrowser` mocks no longer need to manage the flag themselves — the plugin wraps them in its constructor. This is a *contract change* for any external test code that previously wrapped manually, but no such consumer exists outside the monorepo (the `browser?` factory parameter has only ever been documented as "for testing").
- `factory.ts` and `types.ts` did not change as part of this refactor — `SyncingFlag` lives in `navigation-browser.ts` next to the wrapper, and the plugin constructor signature stays at 6 parameters. The flag never leaks to public types.

### Test coverage

- `wrapNavigationBrowserWithSyncing` invariants — `packages/navigation-plugin/tests/functional/navigation-browser.test.ts`: 4 mutations × happy path, 4 mutations × throw path (flag clears in `finally`), non-mutation methods bypass the wrap, `currentEntry` getter stays live (not snapshotted).
- All pre-existing functional + stress tests pass unchanged — observable behavior is identical (222 navigation-plugin, 129 browser-plugin, 84 hash-plugin).


## `getPluginApi(router).navigateToState(state, opts)` — plugin-only bypass for `buildNavigateState` (#525)

### Problem

URL plugins (`browser-plugin`, `hash-plugin`, `navigation-plugin`) handle every browser-initiated navigation by:

1. `api.matchPath(url)` — produces a fully-resolved `State` (includes `forwardState`, decoders, source-URL trailing-slash via `matchSourceTrailingSlash`).
2. `router.navigate(matchedState.name, matchedState.params, opts)` — re-runs `buildNavigateState` (`RouterWiringBuilder.ts:135-156`), which calls `ctx.forwardState` *and* `ctx.buildPath` again inside the navigation pipeline.

The second pass had two costs documented in #525:

- **Perf (Q3)**: 0.4–1.4 µs per browser navigation (1.20×–1.51× factor depending on fixture). Round-trip benchmark in `packages/core/tests/benchmarks/navigation/popstate-roundtrip.bench.ts`.
- **Correctness (Q2)**: `buildNavigateState` rebuilds `state.path` *without* the source URL, so `trailingSlash:"preserve"` lost the trailing slash on every back/forward / link click. `matchedState.path === "/users/"` but committed `state.path === "/users"`. Confirmed by `packages/core/tests/functional/trailingSlashPreserve.test.ts`.

### Solution

Add `getPluginApi(router).navigateToState(state, opts?)` — a **plugin-only** navigation primitive on `PluginApi` that takes a fully-resolved `State` and skips `buildNavigateState`. NOT exposed on the public `Router` or `Navigator` interfaces — userland navigates via `router.navigate(name, params, opts)` as before, with the full interceptor pipeline. The bypass is reserved for plugins that already hold a `State` from `api.matchPath(url)` and would otherwise pay the round-trip cost on every browser event.

Architecturally:

- `NavigationNamespace.navigate` was refactored to extract the post-`buildNavigateState` pipeline into `#executeNavigation`. Both `navigate(name, params)` and `navigateToState(state)` delegate to it; the only difference is whether `buildNavigateState` runs first.
- `Router` constructor registers the entry point on the `RouterInternals` WeakMap (alongside `start`, also there) — not on the `Router` class facade. `getPluginApi.navigateToState` calls through `ctx.navigateToState`, which preserves the same `lastSyncResolved`/`lastSyncRejected` bookkeeping and unhandled-rejection suppression that `Router.navigate` uses, so plugin call-sites can fire-and-forget the returned promise (popstate handlers do).
- `getPluginApi` is now WeakMap-cached per router (mirrors `getNavigator`). Avoids re-allocating the closure-bag on each call AND gives `vi.spyOn(getPluginApi(router), "navigateToState")` a stable identity to attach to — used by the recovery tests in browser-plugin / hash-plugin / navigation-plugin.

All four URL-driven flows migrated to use the same primitive — `URL → matchPath → navigateToState`:

- `packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts` — `router.start(path)` now commits `matchPath(path)` via `deps.navigateToState(matched, REPLACE_OPTS)` instead of deconstructing back to `(name, params)` and calling `deps.navigate`. Closes the asymmetry that made `await router.start("/users/")` canonicalize the trailing slash while a subsequent popstate-back to the same URL would preserve it.
- `packages/navigation-plugin/src/navigate-handler.ts` — the `event.intercept(...)` handler now calls `api.navigateToState(matchedState, …)`.
- `shared/browser-env/popstate-handler.ts` (consumed by `browser-plugin` and `hash-plugin`) — popstate path uses `api.navigateToState(state, …)`. `getRouteFromEvent` now returns `State | undefined` (synthesizes via `api.makeState` when `evt.state` is structurally valid; falls back to `api.matchPath(getLocation())` otherwise).

This makes `navigateToState` the canonical primitive for **every** URL-driven entry point (initial start + browser back/forward + Navigation API events). Programmatic `router.navigate(name, params)` is reserved for intent-driven calls (Link clicks, declarative API consumers) where the full interceptor pipeline is the right semantics.

### Why bypassing `forwardState`/`buildPath` interceptors is correct, not a hack

`matchPath` already runs `forwardState` (`RoutesNamespace.ts:261`, intercepted) once. Re-running it inside `buildNavigateState` is a no-op when forwarding is idempotent (the common case) and *unsafe* when it isn't — a dynamic `forwardFn` reading mutable global state could send the user to a different route than what the URL bar shows. Skipping the second pass is the correctness-preserving choice.

`buildPath` interceptors (`persistent-params-plugin`) do NOT run on this path. For browser-initiated navigation the URL the user actually saw and clicked is the source of truth; transforming it would silently rewrite the URL bar after every back/forward. Programmatic callers (`router.navigate(name, params)`) still see all interceptors — that's the documented asymmetry, and the reason `navigateToState` lives on `PluginApi` rather than on `Router`.

### Trade-offs

- Adds a second navigation entry point. Future invariants on `navigate` must be replicated on `navigateToState`. Mitigated by sharing the post-`buildNavigateState` pipeline (both feed into `#executeNavigation` → `executeGuardPipeline` → `completeTransition`).
- Plugins relying ONLY on `buildPath` interception (no matching `forwardState` interceptor) would lose effect on browser-initiated navigation. None exist in the monorepo today; `persistent-params-plugin` registers both interceptors with idempotent merge logic, so it is symmetric.
- `matchPath` returns deeply-frozen states (`freezeStateInPlace`). `completeTransition` mutates `state.transition`, so `navigateToState` clones the input into a writable shell (`{ name, params, path, context: {...} }`) before handing it to the pipeline. One extra allocation per call; still net-negative vs the `buildNavigateState` cost it replaces.
- `getPluginApi` caching changes object identity from "fresh per call" to "shared per router". Verified there are no tests asserting fresh-per-call identity beyond the one in `getPluginApi.test.ts`, which was inverted to assert caching (and a sibling test pins per-router uniqueness).

### Measurement

Delta from `popstate-roundtrip.bench.ts` on Apple silicon / Node 24:

| Fixture | matchPath only | `+ navigate` (old) | `+ navigateToState` (new) | new vs old |
| --- | --- | --- | --- | --- |
| flat | 2.02 µs | 2.69 µs | 2.44 µs | **−0.25 µs (−9%)** |
| nested-4 | 2.39 µs | 3.54 µs | 2.90 µs | **−0.64 µs (−18%)** |
| search-params | 2.90 µs | 4.17 µs | 3.34 µs | **−0.83 µs (−20%)** |
| forwardTo | 2.06 µs | 2.48 µs | 2.19 µs | **−0.29 µs (−12%)** |
| defaultParams | 2.55 µs | 3.73 µs | 3.00 µs | **−0.73 µs (−20%)** |
| trailingSlash:"preserve" | 2.06 µs | 2.66 µs | 2.53 µs | **−0.13 µs (−5%)** |

The biggest wins are on the heavy-params fixtures (search-params, defaultParams) where the redundant `forwardState`/`buildPath` allocations dominate. trailing-slash fixture sees the smallest perf delta but fixes a correctness bug that the slow path could not.

### Test coverage

- `packages/core/tests/functional/navigation/navigateToState.test.ts` — 11 functional tests (happy path with/without options, ROUTER_NOT_STARTED / ROUTE_NOT_FOUND / SAME_STATES / guard rejections, UNKNOWN_ROUTE shape, validator-absent fallback).
- `packages/core/tests/functional/trailingSlashPreserve.test.ts` — 3 pinned contracts: matchPath preserves slash, `api.navigateToState` propagates it end-to-end, programmatic `router.navigate(name, params)` canonicalizes (documented asymmetry).
- `packages/core/tests/functional/matchPathInterceptors.test.ts` — Q1 audit pinning the interceptor-application contract.
- `packages/core/tests/functional/api/getPluginApi/getPluginApi.test.ts` — caching contract (`getPluginApi(router) === getPluginApi(router)`, distinct per router instance).
- `packages/validation-plugin/tests/functional/navigation.validation.test.ts` — `validateNavigateToStateArgs` (null/string/wrong-field-type rejections, valid state acceptance, options validation).
- 3 plugin functional + stress test suites updated to spy on `getPluginApi(router).navigateToState` instead of `router.navigate` in browser-initiated paths.

### Public-API impact

- `getPluginApi(router).navigateToState(state, opts?)`: new method on `PluginApi` (plugin-internal surface, declared in `@real-router/types/api`).
- `Router` and `Navigator` interfaces: **unchanged**. No new userland methods.
- `RouterValidator.navigation.validateNavigateToStateArgs`: new namespaced validator (state shape).
- `getPluginApi(router)`: same return type, now WeakMap-cached per router.

`@real-router/core` and `@real-router/types` bumped `minor` (PluginApi extension); `@real-router/validation-plugin` `minor` (matches the typed surface). The three URL plugins are `patch` (internal call-site migration; no API change).

## URL Fragment ("hash") Support — Plugin-Layer Design (#532)

### Problem

Pre-#532, URL fragments lived in three workarounds:

1. `shouldPreserveHash = !fromState || fromState.path === toState.path` in navigation-plugin & browser-plugin's `onTransitionSuccess` — hash dropped on cross-path navigation, no way to set/clear explicitly.
2. `urlToPath()` in `shared/browser-env/url-utils.ts` stripped hash before matching → handler never saw the fragment from `event.destination.url`.
3. Same-path hash-click was swallowed by core's `SAME_STATES` rejection (`navigate-handler.ts` swallowed the error silently) → URL bar updated but `router.subscribe` listeners never fired.

### Solution

Hash treated as **URL-layer** state, owned by URL plugins (browser/navigation), not by core. Symmetric to #497 (scroll restoration utility): viewport-concerns in dom-utils, URL-concerns in plugins, routing-concerns in core.

Three coordinated additions:

- **`state.context.url`** — shared namespace claimed by both URL plugins. Type `{ hash: string; hashChanged: boolean }`. Hash storage form: decoded, no leading `#` (symmetric to params, no leading `?`).
- **`NavigationOptions.hash` augmentation** — tri-state in plugins' `index.ts`: `undefined` preserves current browser hash, `""` clears, non-empty sets. Plugins read in `onTransitionSuccess`.
- **`NavigationOptions.hashChange` (@internal)** — flag set by URL plugins on browser-driven hash-only nav (`event.hashChange === true` in navigation-plugin; popstate hashChange detection in browser-plugin). Combined with `force: true` to bypass SAME_STATES; subscribers disambiguate via `state.context.url.hashChanged`, not via the overloaded `force` flag.

### Why not in core

Hash is a URL-layer concept. Memory-plugin / NativeScript / SSR runtimes have no URL → no hash. Adding `hash` to core State would force every non-URL runtime to carry an empty `hash: ""` field and reason about identity it doesn't own. Same line that scroll restoration drew (#497).

### Hash-aware active state & state stabilization

Two follow-ups in `@real-router/sources`:

- `ActiveRouteSourceOptions.hash` — when defined, source is active iff route matches AND `state.context.url.hash` equals requested hash. Cache key includes hash; subscribe path detects hash flip via `state.context.url.hashChanged`. Hash-plugin runtime (no `url` namespace) returns `false` for any non-undefined `hash` — consistent with documented limitation.
- `stabilizeState` compares `state.context.url.hash` in addition to `path`, so `useRoute()` consumers re-render on same-path-different-hash navigation (tab-style UIs).

### `<Link hash>` API surface

6 adapters get a `hash?: string` prop on `<Link>` / `[realLink]` directive.

- Default `activeClassName="active"` is hash-aware: only the matching variant lights up — tab-style UIs work without manual workaround.
- Click handler routes through `navigateWithHash` (`shared/dom-utils/link-utils.ts`). When `hash` differs from `state.context.url.hash` on the same route+params, helper auto-adds `force: true, hashChange: true` → bypasses SAME_STATES.
- Solid's fast-path `routeSelector` is bypassed when `hash` is set (selector is hash-agnostic, slow path through `createActiveRouteSource` is required).

### Encoding contract

- Decoded form in `state.context.url.hash` (no `%` escapes, no leading `#`).
- Encoded at URL build time via `encodeURI(s).replace(/#/g, "%23")`: preserves RFC-3986 fragment sub-delims (`&`, `=`, `?`, `:`, `@`, etc.) while escaping `%` and `#`. `encodeURIComponent` was rejected — it over-encodes sub-delims.
- Decoded via `decodeURIComponent` with try/catch fallback to raw input for malformed `%XX` sequences.

### F5 / cold-load: hash is read lazily, not primed

Hash handling is **separate** from navigation-plugin's existing `navigationType` priming (which uses `browser.getActivationType()` to recover the cross-document `navigation.activation.navigationType` so the very first transition reports `reload`/`push`/`traverse`/`replace` correctly — see #531). That priming is Navigation-API-only and does not touch the URL fragment.

For hash, both URL plugins use a **lazy read** in `onTransitionSuccess`: on the first transition (`!fromState`), `getDecodedHash(browser)` is called to obtain the previous hash. By the time `onTransitionSuccess` fires, `location.hash` already reflects the destination URL — F5 on `/page#section`, fresh URL bar entry, and cross-document back/forward all read the correct value. An earlier draft captured the hash in the plugin constructor; this failed in tests where the mock URL is set after plugin construction, and offered no benefit over the lazy read.

### Hash-plugin limitation

`#` is the route delimiter in hash-plugin → URL fragments are structurally incompatible. `pluginBuildUrl` accepts `hash` option for typing parity (TS interface merge needs identical signatures across all 3 URL plugins) but ignores it at runtime + emits one-time `console.warn`. Inline `let warned = false` pattern — existing `createWarnOnce` from `shared/browser-env/ssr-fallback.ts` has SSR-specific signature `(context) => (method) => void` and didn't fit.

## `invalidate(router, namespace)` — CSR revalidation channel for SSR loader plugins (#605)

### Problem

Both `ssr-data-plugin` and `rsc-server-plugin` are deliberately **SSR-only by design** — they intercept only `start()`, never `navigate()`. The boot path is the only place fresh data is computed; `state.context.<ns>` is populated once and never refreshed without a full router re-boot. Application code that needed to refresh `state.context.data` after a mutation had only one escape hatch:

```ts
await router.navigate(state.name, state.params, { reload: true });
```

This works for the application-layer subscribe-based fetcher (the RSC example fetches `/__rsc?route=…` on every `TRANSITION_SUCCESS`), but it does **not** re-run the plugin's loader — and it has three distinct downsides for the user:

1. Fires a fake transition: `onTransitionStart` / `onTransitionSuccess` plugins observe a navigation that didn't really happen.
2. Pollutes `logger-plugin` history with "navigation" entries that were really cache-busts.
3. No granularity for multi-namespace routes — a same-route reload is the **only** cache-bust available, and it forces *every* SSR plugin to re-run on this transition (or stay stale, since neither runs).

The parity gap with Nuxt `useAsyncData(...).refresh()` and SolidStart `redirect("/path", { revalidate })` was the most-cited DX delta in the SSR competitive analysis.

### Solution

A `void` (fire-and-forget) helper exported from each plugin:

```ts
import { invalidate } from "@real-router/ssr-data-plugin";

invalidate(router, "data"); // mark stale, do not block

// Composes with the existing core API for an explicit synchronous round-trip:
invalidate(router, "data");
await router.navigate(state.name, state.params, { reload: true });
```

Mechanics:

1. `markStale(router, namespace)` flips a per-router `Set<string>` flag stored in a module-level `WeakMap<Router, Set<string>>` (`shared/ssr/staleRegistry.ts`). Idempotent — `Set.add` deduplicates. Per-router isolation comes for free from the WeakMap key.
2. The plugin's `subscribeLeave` listener — registered once at `usePlugin()` time — peeks the flag (`isStale`) in the awaited LEAVE_APPROVE phase of every navigation. Cheap when no flag is set: a `WeakMap.get` + `Set.has` early-return.
3. **Peek-then-clear-after-write**. The flag is cleared (`clearStale`) only after the loader successfully resolves AND `signal.aborted` is false. Until that point the flag is preserved, so:
   - **No-entry navigation** (route not in the loaders map) — listener no-ops, flag stays.
   - **Client-only / mode-only entry** — mode marker written, no loader call, flag stays.
   - **Cancelled navigation** (newer `navigate()` aborts the older controller) — late-resolving loader sees `signal.aborted`, skips the write, flag stays for the new navigation to consume.
4. Mutations land on `nextRoute.context` directly. Both `state.context` namespaces remain shallowly mutable per the existing claim-write contract — `Object.freeze(toState)` in `completeTransition` is shallow and intentionally leaves `context` extensible.
5. Activation guards run, `completeTransition` fires `TRANSITION_SUCCESS`, subscribers see fresh data.

### Why deferred-to-next, not inject-into-current

If the user calls `invalidate()` from inside a plugin lifecycle hook (`onTransitionStart`) of a navigation already in flight, the cleanest semantics are: "the in-flight transition completes unchanged; the **following** navigation re-runs the loader." This preserves the invariant **one transition = one `state.context` snapshot**, which `logger-plugin` and `validation-plugin` already rely on. Inject-into-current would require those plugins to know about and tolerate mid-transition writes — a large API-surface concession for a small DX gain.

`subscribeLeave` is the right hook because:

- It is the **only** awaited hook in the navigation pipeline (deactivation guards → leave-approve → activation guards → complete). Loader can run async; activation does not start until it resolves.
- It fires **after** the same-state check (`isSameNavigation`) — so `navigate({ reload: true })` to the same path does cross the listener.
- It receives `nextRoute` in the payload — exactly the state we need to mutate before completion.

### Why a free function, not a method on the plugin

Plugin instances are created by `usePlugin(factory)` and managed internally; the application code holds the router, not the plugin. A free `invalidate(router, namespace)` matches the shape of every other escape hatch (`router.navigate`, `cloneRouter`, `getStaticPaths`) and avoids requiring callers to thread a plugin reference through their app.

The `namespace` argument is typed as a literal (`"data"` for ssr-data-plugin, `"rsc"` for rsc-server-plugin) at each plugin's export site, so typos surface at compile time. The literal also serves as in-source documentation at call sites: `invalidate(router, "data")` reads as "refresh the data namespace" without an import jump.

### Trade-offs

- **`subscribeLeave` always registered** — adds one leave listener per loader plugin even when `invalidate()` is never called. Forces `navigate()` onto the "with leave listeners" async path (~5 µs / nav with one no-op listener; see `core` Performance Notes). Acceptable: no-op early-return covers the steady state; lazy-registration would couple the registry to the plugin's lifecycle for a savings most apps will never measure.
- **AbortSignal plumbed into the loader (#605, follow-up)** — `SsrLoaderFn<T>` now accepts an optional second argument `context?: { signal: AbortSignal }`. The leave handler passes the navigation's controller signal so cancellation-aware loaders can abort their in-flight work (fetch, DB query, …). Non-breaking via TypeScript contravariance — existing `(params) => ...` loaders ignore the second arg and still benefit from the post-await `signal.aborted` write-skip. Important pattern: a signal aborted *before* `addEventListener("abort", …)` does NOT auto-fire the listener, so cancellation-aware loaders must check `signal.aborted` upfront (see dogfooding `home` loader in each `ssr-mixed/` example for the canonical shape). The start interceptor does NOT pass a signal — SSR boot path apps that need request-scoped cancellation use the existing `getDep("abortSignal")` pattern from `createRequestScope` (#603) + `withTimeout({ upstreamSignal })` (#598).
- **Cross-namespace not transactional** — calling `invalidate(router, "data")` and `invalidate(router, "rsc")` separately marks both flags, but they are consumed by their respective plugins' independent listeners on the same navigation. There is no "atomic group" — if one loader rejects, the other has already started. Acceptable for the small N of namespaces in practice (data + rsc + at most 1-2 application namespaces); a transactional group would warrant a separate API.
- **Loader rejection leaves flag set** — if `entry.loader(...)` throws, the navigation rejects with that error and the flag is *not* cleared (clearStale runs after `await`). User retries → loader runs again. Matches the existing start-interceptor behavior (no caching of failures).
- **Stale flag survives plugin teardown until the router is GC'd** — the per-router stale registry lives in a module-level `WeakMap<Router, Set<string>>`. `unsubscribe()` removes the **consumer** (the `subscribeLeave` listener) but **not the producer's mark** — a flag set by `invalidate(router, "data")` before `unsub()` remains in the WeakMap entry. Concretely: `invalidate(router, "data"); unsub(); router.usePlugin(ssrDataPluginFactory(loaders)); await router.navigate(...);` — the re-registered listener picks up the pre-existing flag and re-runs the loader. **Intentional for hot-swap scenarios** on long-lived router instances (plugin replacement without re-architecting cache busts). The flag becomes unreachable only when the router itself is GC'd; `cloneRouter()` clones get a fresh registry entry via WeakMap key isolation, so per-request SSR scopes are unaffected. To drop the flag without disposing the router, navigate once to a route with a registered loader and let the listener consume it, OR re-architect to avoid the hot-swap (typical apps don't need this). Documented as a gotcha in both plugins' `CLAUDE.md`.

### Test coverage

13 functional scenarios per plugin (86 tests in ssr-data, 76 in rsc-server with the existing baseline), covering: cross-route re-run, same-route reload, idempotency, no-entry **flag preservation**, client-only mode (mode marker written, flag preserved), no-loader entry (mode marker, flag preserved), function-form `ssr` resolver re-evaluation, loader rejection propagation, single-consumption on success, teardown removes the listener, **cancellation safety** (abort during in-flight loader preserves flag), **namespace isolation** (`markStale` on a foreign namespace ignored by the plugin), **signal propagation** (start interceptor calls loader without context, leave handler passes `{ signal }`), **mid-flight signal abort** (`capturedSignal.aborted` flips synchronously when nav is cancelled), **cancellation-aware loader contract** (loader can `addEventListener("abort", …) → reject(AbortError)` to stop its in-flight work).

### Public-API impact

Non-breaking on the namespace contract. New named export (`invalidate`) on each of two plugins. No changes to `@real-router/types`. No changes to `@real-router/core`. Module augmentation untouched.

**Behavioural change (#605, sources):** `stabilizeState` in `@real-router/sources` now returns `next` whenever `next.transition.reload === true`, even when path and `state.context.url.hash` match `prev`. Without this change, `useRoute()` consumers and any source built atop `createRouteSource` / `createRouteNodeSource` saw a stable snapshot ref on `navigate({ reload: true })` to the same path — so a reload that refreshed `state.context.data` via the plugin's `subscribeLeave` handler did NOT trigger a re-render. Reload is the user's explicit non-idempotent signal; bypassing dedupe matches that semantic.

Two consequences for adapters and examples:
- `useRoute()`, `useRouteNode()`, `useRouterTransition()`, and the Solid/Vue/Svelte/Angular signal/store equivalents now re-emit on every `{ reload: true }` navigation.
- Sources tests previously asserting "second reload preserves snapshot ref" were updated to assert "every reload produces a fresh ref" (`createRouteStore.test.ts`, `createRouteNodeStore.test.ts`, `stabilizeState.test.ts` + parallel adapter tests). Two now-defensive guards (`createRouteNodeSource.ts`, `createTransitionSource.ts`) carry `/* v8 ignore */` annotations — their false branches became structurally unreachable but remain as guards for future stabilizer changes.

### Dogfooding

`mutation → invalidate → reload` is demonstrated end-to-end in **all six** `ssr-mixed/` examples (React, Preact, Solid, Vue, Svelte, Angular). The Home page exposes a `[data-testid="refresh-btn"]` button that calls `invalidate(router, "data") + router.navigate(state.name, state.params, { reload: true })`. The home loader carries a `fetchedAt: Date.now()` field with a 25 ms delay so the e2e cancel-safety scenario reliably crosses leave handlers.

Two e2e scenarios per adapter (12 new tests total + 2 in `ssr-rsc/`):

- **Happy path** — single click → fresh `fetchedAt > initial`. Verifies the loader re-runs and the new value lands on `state.context.data`.
- **In-flight defer** — `page.evaluate(() => { btn.click(); btn.click(); })` fires two synchronous clicks. The second `navigate()` aborts the first via `#abortPreviousNavigation`; with cancel-safety, the first nav's late-resolving loader sees `signal.aborted` and skips the write, the flag stays set, the second nav's leave handler consumes it. End state has fresh `fetchedAt`.

`ssr-rsc/` adds a parallel "Scenario 3b" exercising the same in-flight defer pattern through the `/__rsc` Flight refetch path, with `RevalidateButton` updated to call `invalidate(router, "rsc")` for API symmetry (no-op on the client router in this RSC architecture — server's per-request `cloneRouter` already creates a fresh router each Flight request).

## `shared/ssr/` — third consumer category for the symlink pattern (#437 extension)

### Problem

After `ssr-data-plugin` (#594, plain JSON loader payloads) and `rsc-server-plugin` (#566, `ReactNode` Flight payloads) both shipped, the duplicated surface area between them was significant: identical `start()` interceptor mechanics, identical validation rules (`createLoadersValidator`), identical claim/teardown lifecycle, identical `subscribeLeave` listener for `invalidate()` (#605), identical `SsrMode` resolution, identical typed-error classes (`LoaderRedirect`/`LoaderNotFound`/`LoaderTimeout`), identical `withTimeout` deadline composer, identical `defer({ critical, deferred })` API, identical `__rrDefer__` settle wire format. The only meaningful differences were the namespace string (`"data"` vs `"rsc"`), the loader return type (`unknown` vs `ReactNode`), and the per-route mode subset (`rsc-server-plugin` rejects `"data-only"` because RSC has no "data without component" concept).

Pre-`shared/ssr/`: every shared file would have lived twice — once in `packages/ssr-data-plugin/src/`, once in `packages/rsc-server-plugin/src/`. Drift between the two would have been near-guaranteed; the `rsc-server-plugin` audit (2026-05-10) had already caught two bugs that landed identically in both copies and required parallel fixes.

### Solution

Extend the #437 `shared/` symlink pattern with a third category, `shared/ssr/`. Both plugins consume it via `src/shared-ssr` symlinks (parity with `src/dom-utils` and `src/browser-env`). The barrel exports a **generic factory** `createSsrLoaderPlugin<T, D>` parameterised on the payload type and the dependency map; each plugin instantiates it once:

```typescript
// packages/ssr-data-plugin/src/factory.ts
export const ssrDataPluginFactory = (loaders: SsrLoaderFactoryMap<unknown>) =>
  createSsrLoaderPlugin<unknown>({
    namespace: "data",
    modeNamespace: "ssrDataMode",
    allowedModes: ["full", "data-only", "client-only"],
    validate: createLoadersValidator(ERROR_PREFIX_SSR_DATA),
    loaders,
  });

// packages/rsc-server-plugin/src/factory.ts
export const rscServerPluginFactory = (loaders: RscLoaderFactoryMap) =>
  createSsrLoaderPlugin<ReactNode>({
    namespace: "rsc",
    modeNamespace: "ssrRscMode",
    allowedModes: ["full", "client-only"], // no "data-only"
    validate: createLoadersValidator(ERROR_PREFIX_RSC_SERVER),
    loaders,
  });
```

Symlink layout (parallels #437):

```
packages/ssr-data-plugin/src/shared-ssr   → ../../../shared/ssr           (symlink, git-tracked)
packages/rsc-server-plugin/src/shared-ssr → ../../../shared/ssr           (symlink, git-tracked)
```

`shared/ssr/` contents (8 files):

```
shared/ssr/
├── createSsrLoaderPlugin.ts  # generic factory: compile loop + start interceptor + subscribeLeave + 4-claim teardown
├── createLoadersValidator.ts # generic shape validator (rejects unknown keys, allowed-mode strings only)
├── defer.ts                  # defer({ critical, deferred }) API + DEFER_BRAND symbol + shallow-clone freeze
├── deferRegistry.ts          # __rrDeferRegistry__ global Map + escapeForScript + formatSettleScript + getDeferBootstrapScript
├── errors.ts                 # LoaderRedirect / LoaderNotFound / LoaderTimeout + withTimeout (AbortSignal.any composer)
├── staleRegistry.ts          # markStale / isStale / clearStale — WeakMap<Router, Set<namespace>> for invalidate()
├── types.ts                  # SsrLoaderFn<T> with optional { signal }, SsrLoaderFnFactory<T,D>, SsrMode, SsrLoaderPluginConfig
└── index.ts                  # barrel
```

### Why this is correct as a #437 extension, not a separate mechanism

The shape, tooling concerns, and trade-offs are **identical** to #437:

- Same git-tracked symlink pattern, same Windows requirement (`git config --global core.symlinks true`)
- Same minimal `shared/package.json` (one workspace entry covers all three sibling directories)
- Same coverage trade-off (shared code excluded from per-package 100% — tests live in the consumer that exercises them)
- Same propagation rule: an edit in `shared/ssr/createSsrLoaderPlugin.ts` reflects instantly in both plugins via their symlinks; `pnpm build` verifies both packages
- Same `knip.json` / `.jscpd.json` ignores extended to `shared/ssr/**`

The only #437 carry-over that does NOT apply: `shared/ssr/` consumers don't need `type-guards` resolution (no inlined workspace deps) — the existing `shared/package.json` workspace devDep on `@real-router/core` is sufficient.

### Why a generic factory, not class inheritance or two copies

- **Two-copy approach** rejected: drift is near-guaranteed at this surface area (12+ shared concerns each with non-trivial semantics — see `subscribeLeave` peek-then-clear-after-write logic in `createSsrLoaderPlugin.ts:303-335`, which has 5 distinct bail-out branches)
- **Class inheritance** rejected: plugin factories return `PluginFactory<Deps>` functions, not classes. A `BaseLoaderPlugin` class would invert the natural API shape
- **Generic factory** chosen: zero runtime cost, zero allocation per consumer (the factory closure is created once at module load), full type inference for both `T = unknown` and `T = ReactNode` via TypeScript generics. Both plugins are now ~10-line adapters that validate + delegate

### Audit confirmation

`rsc-server-plugin` audit (2026-05-10 + 2026-05-16) verified composition: both plugins coexist on the same router without cross-namespace mutation, teardown of one does not affect the other, and `invalidate("data")` re-runs only the ssr-data-plugin loader while `state.context.rsc` stays cached. Invariants 14-15 in `packages/rsc-server-plugin/INVARIANTS.md` formalise this contract.

## Subpath isolation for SSR/RSC concerns: `/ssr` entry-point split × 6 adapters (#574 + #609 + #610 + #611)

### Problem

Once SSR primitives (`<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `useDeferred`, `<HttpStatusCode>` + `<HttpStatusProvider>` + `createHttpStatusSink`) started shipping in framework adapters, three concerns surfaced:

1. **Type pollution in client components.** A React component file authored for client-only use would get autocompletion for `<HttpStatusCode>` from `@real-router/react` even though the component does nothing meaningful on the client (it writes to a server-side sink that doesn't exist). Tree-shaking removes the dead code from the runtime bundle but TypeScript still suggests the symbol, producing genuine developer confusion ("why is this `<HttpStatusCode>` rendering as `null` in my SPA?").

2. **RSC `react-server` export-condition composition.** React's RSC tooling uses a `react-server` Node export condition to swap the React runtime (different `react/jsx-runtime`, no `useState`/`useEffect`). Adapter packages that ship server-rendered components must either (a) split their entry-points by export condition or (b) pretend the components are isomorphic and break at runtime. Industry alignment: TanStack Router PR #7183 (April 2026) and `react-router@7.x` both adopted the `react-server` condition + thin server-only re-export. Mirroring this puts Real-Router on the same ground.

3. **ESLint enforcement readiness.** Code review caught two cases of `import { HttpStatusCode } from "@real-router/react"` in client components during the `<HttpStatusCode>` Stage 3 rollout. With everything in one entry-point, there is no mechanical rule that catches this — only humans noticing.

### Solution

Every adapter (`react`, `preact`, `solid`, `vue`, `svelte`, `angular`) ships a distinct `@real-router/{adapter}/ssr` subpath alongside the main entry-point. SSR-only components and helpers live exclusively in `/ssr`; the main entry never re-exports them; the `/ssr` entry never depends on history-/navigation-plugin runtime.

```jsonc
// packages/react/package.json (excerpt)
{
  "exports": {
    ".": { /* main: hooks, RouterProvider, Link, RouteView */ },
    "./ssr": {
      "@real-router/internal-source": "./src/ssr/index.ts",
      "react-server": "./src/ssr/index.react-server.ts", // type-only re-export
      "types": "./dist/ssr/index.d.ts",
      "import": "./dist/esm/ssr/index.mjs",
      "require": "./dist/cjs/ssr/index.cjs"
    },
    "./legacy": { /* React 18 fallback, no <Await> */ }
  }
}
```

Symmetric 8-export surface for React/Preact/Vue/Solid/Svelte: `<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `useDeferred`, `<HttpStatusCode>`, `<HttpStatusProvider>`, `createHttpStatusSink`. Angular is asymmetric by language: `ClientOnly`, `ServerOnly`, `injectDeferred` (no `<Await>` — Angular has no `<Suspense>`/`use(promise)`), `<http-status-code>` component, `provideHttpStatusSink` env-providers, `HTTP_STATUS_SINK` injection token, `createHttpStatusSink`. Angular's `/ssr` is built as an ng-packagr **secondary entry-point** (`packages/angular/ssr/` with its own `ng-package.json`) because ng-packagr cannot emit a secondary bundle from a `src/ssr/` subdirectory of the primary entry-point.

`@real-router/react/legacy` is preserved alongside `/ssr` for React 18 consumers: no `<Await>` (depends on React 19 `use()`), and the `react-server` condition on the main entry resolves into a type-only re-export so server components can `import type { Navigator, LinkProps }` without dragging client-only runtime in.

### Why per-adapter subpath, not a centralised `@real-router/ssr` package

- **Adapter-native idioms.** `<ClientOnly>` in React uses `useState(false) + useEffect`; in Vue it's `ref(false) + onMounted`; in Solid it's `createSignal(false) + onMount + <Show>`; in Svelte 5 it's `$state(false) + $effect`; in Angular it's `signal(false) + afterNextRender`. Each implementation reaches into framework internals that cannot be abstracted without losing the no-mismatch hydration contract. A central package would have to either (a) wrap all 6 implementations with adapter dispatch (huge surface, single point of failure) or (b) re-export from adapter subpaths anyway (no gain over a direct subpath).
- **Bundle granularity.** Consumers using only the main entry never pay for SSR primitives; `/ssr` imports never pollute the SPA bundle. With a central package this would require careful tree-shaking that bundlers do not guarantee for cross-package boundaries.
- **`react-server` export condition is per-package.** The condition resolves at the package boundary; centralising would force the condition into one package while half the consumers wouldn't use it.

### Trade-offs

- **Six packages, six `package.json` updates per new SSR primitive.** New SSR-side component additions now require coordinated updates across React, Preact, Vue, Solid, Svelte, Angular `package.json` `exports` maps, plus 6 `src/ssr/` directories, plus 6 tsdown/svelte-package/ng-packagr configurations. Mitigated by: (a) symmetric API surface enforced by parallel tests across adapters, (b) the audit cadence already catches drift, (c) common implementation logic lives in `shared/ssr/` (see preceding section).
- **TypeScript `customConditions`.** The internal `@real-router/internal-source` export condition (see `Custom @real-router/internal-source Export Condition` section above) had to be added to every `/ssr` subpath as well, otherwise monorepo `tsc` would resolve `@real-router/react/ssr` to `dist/` artifacts during type-check — slower, and breaks the structural fix from #431.
- **ESLint rule not yet authored.** The rule "no `*/ssr` import in client component file" is mechanically possible but not yet shipped. Tracked separately; the subpath structure makes it implementable as a 10-line `no-restricted-imports` config.

### Composition with `<HttpStatusProvider>` client mount (Vue/Solid asymmetry)

Render-scoped HTTP status sink requires that the client tree match the server tree structurally during hydration. React/Preact/Svelte tolerate `{#if}`-branch asymmetry; Vue (fragment markers `<!--[-->`/`<!--]-->`) and Solid (`data-hk` per-component DOM markers) do not — the client must mount a throwaway `<HttpStatusProvider>` to preserve structural symmetry. Documented in each `/ssr` adapter README; e2e-verified across all six adapters' `ssr/` examples.

## `createRequestScope(req | request, baseRouter, deps?)` — correct-by-construction request-scoped DI (#603)

### Problem

The naive SSR pattern requires four steps per request, each easy to forget:

```typescript
app.use(async (req, res) => {
  const controller = new AbortController(); //                ↓ 1. allocate controller
  req.on("close", () => controller.abort()); //               ↓ 2. wire client-disconnect
  const router = cloneRouter(baseRouter, { //                 ↓ 3. clone with request DI
    abortSignal: controller.signal,
    currentUser: parseCookies(req).user,
  });
  try {
    const state = await router.start(req.url);
    res.send(renderHtml(state));
  } finally {
    await router.dispose(); //                                ↓ 4. teardown
  }
});
```

Each example app re-implemented this. The four hazards are:

1. **Forgetting `req.on("close")`** — long-running loaders continue after the client disconnects, wasting DB connections, upstream API quotas, and event-loop time. Production bug class: a streaming SSR pipeline that never aborts mid-flight `fetch` calls when the user closes their tab.
2. **Forgetting `await router.dispose()`** — accumulating un-disposed routers per request leaks `WeakRef` entries, lifecycle subscriptions, and plugin claims. Detectable only via heap snapshots after thousands of requests.
3. **Order-dependent allocation** — if `cloneRouter` happens before `req.on("close")`, an abort during the clone window leaks the half-initialised router. If `dispose` is not in `finally`, an exception in `start(url)` leaks the router.
4. **Web `Request` vs Node `IncomingMessage` shape divergence** — Edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy, Bun) expose Web `Request` with built-in `request.signal`; Node `http.IncomingMessage` does not have `.signal` and requires `.on("close")` + `.removeListener`. Hand-rolling both shapes per app is repetitive and error-prone.

### Solution

One helper from `@real-router/core/utils`:

```typescript
import { createRequestScope } from "@real-router/core/utils";

app.use(async (req, res) => {
  await using scope = createRequestScope(req, baseRouter, {
    currentUser: parseCookies(req).user,
  });
  const state = await scope.router.start(req.url);
  res.send(renderHtml(state));
});
```

Under the hood the helper performs:

1. **`AbortController` allocation** + binding to client-disconnect via `"signal" in req` type-guard: Web `Request` gets `request.signal` chained into the new controller (`AbortSignal.any([request.signal, controller.signal])` — Node 20.3+); Node `IncomingMessage` gets `req.on("close", ...)` plus a `req.removeListener` cleanup hook to satisfy lint and prevent listener leaks on long-running connections.
2. **`cloneRouter(base, { ...deps, abortSignal: controller.signal })`** — the `abortSignal` is auto-injected under the fixed key `"abortSignal"`, so loaders read it via `getDep("abortSignal")` without per-app wiring.
3. **Returns `{ router, dispose }`** plus `Symbol.asyncDispose` so callers on Node 24+ / Bun 1.0.23+ / Deno 1.37+ can use `await using`; on Node 22 LTS the same pattern works via explicit `try/finally + await scope.dispose()`.
4. **Idempotent `dispose`** — calling twice is safe; subsequent calls no-op. Required because `await using` triggers `[Symbol.asyncDispose]` AND the explicit `dispose()` path may be exercised by tests.

### Why a helper, not constructor sugar on `createRouter`

- **`createRouter` is platform-agnostic.** It knows nothing about `req`/`Request`/`AbortController`/`req.on("close")`. Pushing per-request lifecycle into the constructor would force every consumer (Ink, React Native, NativeScript, custom runtimes) to either implement the per-request shape or branch around it.
- **`cloneRouter` already exists** (#287). The natural decomposition is: `cloneRouter` for DI/isolation (used in SSG build scripts, tests, and the helper internals), `createRequestScope` for the request lifecycle wrapper. Keeps each primitive doing one thing.
- **Tests already need the lower-level path.** Unit tests call `cloneRouter(base, deps)` directly with a synthetic `AbortController` — no `req` object exists. Folding everything into one helper would have forced tests to fake a `req` shape.

### Why dual Node `IncomingMessage` / Web `Request` shape

Real-Router targets all current serverless/edge runtimes simultaneously: Vercel Edge, Cloudflare Workers, Deno Deploy, Bun, AWS Lambda, plus traditional Node servers (Express, Fastify, Hono on Node). Forcing app authors to pick one shape would create a fork in example code; supporting both at the helper level keeps the SSR examples uniform across `ssr/`, `ssr-streaming/`, `ssr-mixed/`, `ssg/`, and `ssr-rsc/` directories.

The `"signal" in req` discriminator was chosen over `instanceof Request` because (a) `Request` is not available in Node before v18, (b) testing harnesses inject mocked request objects that don't pass `instanceof`, (c) duck-typing is the canonical JavaScript pattern for cross-runtime shape detection.

### Trade-offs

- **Helper still SSR-only.** On CSR Real-Router uses one `createRouter(deps)` per app session — per-request scope has no meaning when navigation is not a new request. Tests still use `cloneRouter(base, deps)` directly because they don't have a `req`. `createRequestScope` lives in `@real-router/core/utils` (server-side import boundary), not in `@real-router/core/api`.
- **`Symbol.asyncDispose` requires modern runtimes.** Examples document the `try/finally + dispose()` fallback for Node 22 LTS compatibility. Once Node 24 ships LTS (October 2027), the explicit fallback can be removed from example code; the helper continues to support both shapes.
- **Helper does not own response shape.** Whether `start(url)` rejection maps to HTTP 404 / 504 / 302 is the application's concern — see the `LoaderRedirect` / `LoaderNotFound` / `LoaderTimeout` → HTTP mapping in `examples/web/{adapter}/ssr-examples/ssr/server.ts`. The helper composes naturally with these typed errors (via `withTimeout({ upstreamSignal: scope.router.getDep("abortSignal") })`) but doesn't enforce HTTP semantics.

### Dogfooding

Every `entry-server.{ts,tsx}` in `examples/web/{react,preact,vue,solid,svelte,angular}/ssr-examples/{ssr,ssr-streaming,ssr-mixed}/` uses `createRequestScope`. Per-request isolation is verified end-to-end via Playwright scenarios that issue 10 concurrent requests to `/users/:id` with different cookies and assert that each response carries its own `currentUser` — no cross-request leakage. Example anchors: `ssr/` × 10 concurrent (React), `ssr-streaming/` × 9 concurrent, `ssr-rsc/` Scenario 5 × 10 concurrent.

## `defer({ critical, deferred })` formal API + `__rrDefer__` inline-script settle wire (#610)

### Problem

Streaming SSR consumers across the industry need a way to split a loader's payload into two halves: data that **must** be present in the initial HTML (page title, above-the-fold content, anything that affects layout shift or SEO) and data that **can** arrive asynchronously after the shell is delivered (below-the-fold lists, comments, recommendations). Three competing wire formats existed when this was specced:

1. **Remix / React Router 7 framework mode** — `__remixContext.streamController.enqueue(...)` chunks emitted via React's `renderToReadableStream` integration; tightly coupled to RR7's stream renderer.
2. **TanStack Start** — `defer(promise)` + `<Await>` consumer, server pushes serialised promise resolutions through a per-request buffer; tied to TanStack Start's RSC bundler.
3. **Custom in-house wire formats** — each app rolls its own `<script>` tag convention, parser, registry.

Real-Router needed a wire format that (a) is standalone (no framework-mode coupling), (b) survives `react-server-dom-*` bundler swaps, (c) works identically in React, Preact, Vue, Solid, and Svelte adapters (Angular asymmetric via `Signal<T | undefined>`), (d) does not require a client-side parser bundle that runs before the React/Vue/Solid/Svelte hydration entry-point.

### Solution

A formal `defer()` API and an inline-script settle wire that all stream consumers share.

**API surface** (`@real-router/ssr-data-plugin`, also re-exported from `@real-router/rsc-server-plugin`):

```typescript
import { defer } from "@real-router/ssr-data-plugin";

const loader = async (params, { signal }) => {
  const product = await fetchProduct(params.id, { signal }); // critical
  return defer({
    critical: { product },
    deferred: {
      reviews: fetchReviews(params.id, { signal }),     // resolves later
      related: fetchRelated(product.categoryId, { signal }), // resolves later
    },
  });
};
```

The plugin:
- Writes `critical` to `state.context.data` via the existing claim contract — same as a non-deferred loader return.
- Writes the live `deferred` promise record to `state.context.ssrDataDeferred`.
- Writes the keys array to `state.context.ssrDataDeferredKeys` for post-hydration registry reconstruction (so the client can pre-create awaiter slots before the inline scripts arrive).
- Total of **four claims** per loader plugin: `data`, `ssrDataMode`, `ssrDataDeferred`, `ssrDataDeferredKeys` — all released atomically on teardown.

**Wire format** (`shared/ssr/deferRegistry.ts` + `@real-router/ssr-data-plugin/server`):

```html
<!-- Server emits one inline script per deferred key, in resolution order -->
<script>__rrDefer__("reviews", [{"id":1,"text":"…"}])</script>
<script>__rrDefer__("related", [{"id":42,"name":"…"}])</script>
```

The `__rrDefer__` global is installed by `getDeferBootstrapScript()` before the deferred consumer hooks run; it looks up the promise stored in `__rrDeferRegistry__` (a global `Map<string, { promise, resolve, reject }>` populated lazily by `ensureRegistryPromise(key)`) and resolves it.

Errors use a parallel `__rrDeferError__("key", "AbortError: …")` script that rejects the promise; the consumer's error boundary catches it.

**Consumers** — `<Await name>`, `<Streamed fallback>`, `useDeferred()` from `@real-router/{react,preact,solid,vue,svelte}/ssr`. Each adapter implements its idiomatic awaiter: React via `use(promise)` inside `<Suspense>`, Vue via `<Suspense>` + `async setup()`, Solid via `createResource`, Svelte via `{#await}`. Angular asymmetric: `injectDeferred(key)` returns `Signal<T | undefined>` (no native `<Suspense>` / `use(promise)` in Angular's reactivity model).

### Why inline `<script>__rrDefer__(...)</script>`, not Server-Sent Events / WebSocket / fetch streams

- **Zero client parser.** Browsers execute inline `<script>` tags as they're parsed; the registry is populated **before** the client bundle's first instruction. No race between "script loaded enough to register awaiter" and "stream chunk arrived".
- **Industry-aligned format.** Inline-script settle is the de facto standard adopted by Remix, RR7, TanStack Start, and Astro. Bytes on the wire are readable by tools (`curl https://app/page | grep __rrDefer__` shows resolution order).
- **TransformStream-friendly.** `injectDeferredScripts(htmlStream, deferred, options?)` from `@real-router/ssr-data-plugin/server` wraps the framework's HTML stream and emits settle scripts as their promises resolve. Buffering only what `TextEncoder.encode` produces; no per-promise queue, no manual ordering buffer.
- **CSP-aware.** Apps with strict CSP can either (a) use nonce-injected `<script>` (the `bootstrap` option in `InjectDeferredScriptsOptions` supports custom prelude), or (b) replace the entire bootstrap with a static `<script src="/rrDefer.js">` reference. The wire format remains stable.

### Why a formal API in the plugin, not "just await promises in your loader"

Before #610 the supported pattern was "loaders that return objects with `Promise` properties" — the plugin would JSON-serialise the wrapper, which throws because `JSON.stringify(Promise)` is `"{}"`. Each app had to know which keys were promises and route them through a custom serialiser. The formal `defer({ critical, deferred })` API:

- **Brand-tags the return** with `Symbol.for("@real-router/defer")` so the plugin can detect deferred returns without instanceof checks across module boundaries (`Symbol.for` is cross-realm safe — required for tests running in vitest workers, RSC bundler sub-processes, and the SSG build script's separate Node process).
- **Freezes the wrapper shallowly** (`Object.freeze({ critical, deferred, [DEFER_BRAND]: true })`) — a security invariant: `defer()` returns are passed through user code (lifecycle hooks, logger plugin) before the plugin sees them; freezing prevents accidental mutation that would invalidate `state.context.data` shape mid-transition.
- **Rejects reserved keys** at runtime: `"__proto__"`, `"constructor"`, `"prototype"` in `deferred` would corrupt the `__rrDeferRegistry__` Map; rejected with `LoaderRedirect`-style typed error. Validated via PBT (`numRuns: 500`, security-critical).
- **Attaches defensive `.catch(() => {})`** to each deferred promise inside `defer()` itself, before user code sees the wrapper. This prevents `unhandledRejection` from killing the Node process when a deferred promise rejects before its consumer (`<Await>`) attaches a handler. The rejection is still propagated to the consumer via `__rrDeferError__` settle script.

### Trade-offs

- **Wrappable but not transparent.** Loaders that return `defer({ critical, deferred })` cannot also return `null` for "no data" — the plugin treats `defer(...)` as opaque payload. App code that needs conditional defer wraps it as `defer({ critical: { value: null }, deferred: {} })`. Acceptable; conditional defer is rare.
- **Registry is monotonic.** `__rrDeferRegistry__` (global `Map`) grows unbounded over the page's lifetime — each settled key stays in the map. **Leak-by-design**: there is no `releaseKey()` API. The Map is bounded by the number of distinct deferred keys ever resolved in this page session (typically <50 for a content site, <500 for a heavy dashboard). Single-page apps that navigate thousands of times do not see growth from `defer()` — the Map grows only on new keys, and key names are typically a small finite set. Documented in `packages/ssr-data-plugin/CLAUDE.md` gotcha and asserted in stress test `defer-registry-growth.stress.ts` (1000 unique keys → Map.size === 1000, absent `releaseKey` API asserted).
- **`__rrDefer__` is a global.** Conflicts with any other library claiming the same name. Resolved by namespace prefix (`__rr`) and treated as a documented public API surface — renaming would be a breaking change.
- **No retry semantics.** If a deferred promise rejects, the consumer sees the error; there is no plugin-level retry. App-level retry happens at the loader, not the wire. Aligns with the "loader = pure resolution; transport = stream layer" separation.

### Audit confirmation

`ssr-data-plugin` audit (2026-05-16) verified the security invariants: shallow-clone freeze (PBT, `numRuns: 500`), reserved-keys rejection (PBT), HTML-safety of `formatSettleScript` and `getDeferBootstrapScript` (`numRuns: 500`, `escapeForScript` chain), `__rrDefer__("key", isError=true)` routing to `__rrDeferError__`. Stress: 500 concurrent streams with random upstream HTML errors, `seenUnhandled === []` assertion across 2000 streams × 1 key; 100 parallel `withTimeout` late-rejections with sibling-handler `seenUnhandled === []`. See `packages/ssr-data-plugin/.claude/review-2026-05-16.md` sections 6 (PBT) and 7 (stress) for the full coverage matrix.

## `<HttpStatusCode>` Stage 3 — render-time HTTP status as a component (#610 + #611)

### Problem

The existing loader-driven HTTP path covers cases where the server side knows the status before rendering: `throw new LoaderRedirect("/login", 302)` → 302, `throw new LoaderNotFound("user:42")` → 404, `throw new LoaderTimeout(name, ms)` → 504. But two real cases fall outside this:

1. **Component-level NotFound.** A glob `*` catchall route resolves successfully (route matched, loader returned an empty result) — yet the rendered component decides "this URL doesn't represent a real resource". Forcing the loader to throw retroactively requires duplicating route-knowledge in the loader; using `LoaderNotFound` from inside a loader for `*` defeats the catchall purpose (you'd need to throw from every `*`-handler, including default routes that intentionally render a NotFound page).
2. **Per-render status drift.** A blog post page resolves loader data successfully but the content was soft-deleted (`post.status === "removed"`). The component decides "render the removed-content placeholder + return HTTP 410 Gone". The status is a property of the **rendered output**, not the resolved data.

Pre-Stage 3: applications worked around this by re-throwing `LoaderNotFound` from within layout components (caught by `<RouterErrorBoundary>`) or by manually inspecting state after `renderToString` and rewriting the response. Both leaked rendering concerns into framework-specific places and broke under streaming (where status is needed in headers **before** body content emits).

### Solution

A render-scoped sink + a component that writes to it:

```typescript
// Server entry:
import { createHttpStatusSink, HttpStatusProvider } from "@real-router/react/ssr";

const sink = createHttpStatusSink();
const html = renderToString(
  <HttpStatusProvider sink={sink}>
    <App />
  </HttpStatusProvider>,
);

res.status(sink.code ?? 200).send(html);
```

```tsx
// Component:
import { HttpStatusCode } from "@real-router/react/ssr";

function NotFoundPage() {
  return (
    <>
      <HttpStatusCode code={404} />
      <h1>Not found</h1>
    </>
  );
}
```

`createHttpStatusSink()` returns `{ code: number | undefined }` — a mutable holder. `<HttpStatusCode code={N}/>` writes through the provider on mount. After `renderToString*` completes, `entry-server` reads `sink.code ?? 200` and applies to the response. For streaming SSR pipelines, the status is captured during the synchronous render phase (which produces the shell, including the `<head>`) — the streaming body cannot retroactively change status, and `<Suspense>` boundaries that resolve later cannot change it either (status is locked when the first byte is flushed).

On the client, the same `<HttpStatusCode code={N}/>` rendered without a provider is a silent no-op — same component tree hydrates without mismatch warnings.

### Cross-adapter symmetry × 6

Implementation is per-adapter idiomatic but contract-identical:

- **React/Preact** — `useContext(HttpStatusContext)?.code = props.code` in a `useInsertionEffect` (writes before paint, no double-write under StrictMode)
- **Vue** — `inject(HttpStatusKey)?.code = props.code` in `onMounted`
- **Solid** — `useContext(HttpStatusContext)?.code = props.code` in `onMount`
- **Svelte 5** — `getContext<HttpStatusSink>(HTTP_STATUS_KEY).code = code` in `$effect`
- **Angular** — environment-providers shape: `provideHttpStatusSink()` registers `HTTP_STATUS_SINK` injection token; `<http-status-code [code]="404">` component reads via `inject(HTTP_STATUS_SINK, { optional: true })?.set(code)` in `afterNextRender`

All six adapters expose the same three names: `<HttpStatusCode>`, `<HttpStatusProvider>` (or Angular's `provideHttpStatusSink` + `HTTP_STATUS_SINK`), `createHttpStatusSink()`.

### Why a mutable sink, not a thrown signal

- **Streaming-compatible.** `throw` interrupts rendering — incompatible with `<Suspense>` and any streaming pipeline that needs to deliver the shell while the deferred section is still rendering. The mutable sink captures status **synchronously during the shell render**, doesn't disrupt the React/Vue/Solid/Svelte render phase, and the status is read by the server **after** `renderToString*` returns.
- **Last write wins, by design.** If two `<HttpStatusCode>` instances render in the same tree (e.g., layout sets `200`, inner page sets `404`), the last assignment wins — matches the component-composition mental model where inner content overrides outer defaults.
- **No provider → silent no-op.** Client hydration runs the same component tree; on the client `<HttpStatusProvider>` is absent (status only matters server-side), so the write target is `undefined?.code = …` — TypeScript-safe via optional chaining, runtime no-op. **Zero hydration mismatches.**

### Vue/Solid client-mount asymmetry

Vue (fragment markers `<!--[-->`/`<!--]-->`) and Solid (`data-hk` per-component DOM markers) emit hydration anchors for **every** Suspense/component boundary, including `<HttpStatusProvider>`. If the server tree contains a provider but the client doesn't, hydration sees structural divergence and falls back to client re-render — defeats the SSR benefit.

The fix is mechanical: `entry-client.{ts,tsx}` mounts a throwaway `<HttpStatusProvider sink={createHttpStatusSink()}>` wrapper around `<App />` to preserve structural symmetry. The throwaway sink is never read (client doesn't apply HTTP status); the provider exists purely to match server-side markers.

Svelte 5 hydration is `{#if}`-branch-tolerant — the client provider mount is **not** needed. React/Preact tolerate the missing provider because `useContext` returns `undefined` and the component no-ops without DOM emission.

Documented in each `/ssr` adapter README; e2e-verified by the `Stage 3 / <HttpStatusCode>` scenario across all six `ssr/` examples (1 scenario per adapter, asserts `response.status === 404` for catchall route + `response.text()` contains the NotFound markup).

### Trade-offs

- **Status is captured during shell render, not during deferred resolution.** A `<Suspense>` fallback that renders `<HttpStatusCode code={500}/>` after a deferred section rejects — the status is **not** written to the response (headers already flushed). Apps that need per-section status emit it through loader-driven path (`LoaderRedirect`/`LoaderTimeout`) before the deferred wire starts.
- **Mutable sink is not React-strict-mode-safe by default.** React's StrictMode renders components twice; without `useInsertionEffect` (which runs once per commit, not once per render) two writes would race. The implementation uses `useInsertionEffect`; tested under StrictMode in `packages/react/tests/functional/HttpStatusCode.test.tsx`.
- **Angular requires explicit env-providers registration.** Angular DI does not support "optional global default sink that no-ops if not provided" without an `InjectionToken` + factory. Apps must call `provideHttpStatusSink()` at bootstrap; forgetting it → silent no-op on server (the intended fallback), but discoverable via `inject(HTTP_STATUS_SINK, { optional: true })` warning in dev mode.

## Post-hydration loader skip via hydration scratchpad (#596)

### Problem

In the classic SSR flow without coordination, the client re-fetches loader data immediately after hydration:

1. Server: `router.start("/users/42")` → loader runs → `state.context.data = { user: ... }` → HTML rendered with data.
2. Server: `serializeRouterState(state)` → JSON in `<script>window.__SSR_STATE__=...</script>`.
3. Client: `router.start("/users/42")` → loader runs **again** → same data fetched **again** → React/Vue/Solid/Svelte re-renders with the new data.

Step 3 wastes one full RTT per hydration. Worse, it creates a visible flicker if the loader takes >16ms (one frame): the hydrated UI shows server-rendered data, then briefly shows a stale state, then shows the re-fetched data. The competitive analysis showed this is the #1 SSR-correctness defect in standalone routers — `react-router` data mode solves it via `serverLoader` + `clientLoader` split (forces convention), TanStack via SWR cache (forces TTL config); standalone Vue/Solid/Svelte/Preact roughers leave it to the app.

### Solution

A one-shot **hydration scratchpad** at the core level. Before `router.start(state.path)` the client deserialises the server state and parks it in a per-router `RouterInternals.hydrationState` slot. The `ssr-data-plugin` `start()` interceptor reads the scratchpad and short-circuits — instead of calling the loader, it writes the server's `state.context.data` straight to the new state via `claim.write()`.

```typescript
// Client entry:
import { hydrateRouter } from "@real-router/core/utils";

const ssrJson = JSON.parse(document.getElementById("__SSR_STATE__")!.textContent!);
const router = createRouter(routes, { /* deps */ });
router.usePlugin(ssrDataPluginFactory(loaders), browserPluginFactory());

await hydrateRouter(router, ssrJson); // parks ssrJson in scratchpad, calls router.start(ssrJson.path)
// state.context.data === ssrJson.context.data — no loader call, no fetch
```

Mechanics:

1. `hydrateRouter(router, ssrState)` parses `ssrState` (or accepts pre-parsed), writes `parsed` to `RouterInternals.hydrationState`, calls `router.start(parsed.path)`.
2. `ssr-data-plugin`'s start interceptor checks `RouterInternals.hydrationState` synchronously inside `wrappedStart`. If the path matches and `"data" in scratchpad.context` (presence-wins, see below), it writes the scratchpad value via `claim.write()` instead of calling `entry.loader(...)`.
3. After write, the scratchpad is **cleared** (`RouterInternals.hydrationState = null`). The next navigation runs the loader normally — scratchpad is **one-shot by design**, only the initial hydration benefits.

Per-namespace: each loader plugin (ssr-data-plugin, rsc-server-plugin) reads its own namespace from the scratchpad independently. Side-by-side composition still works — both `"data"` and `"rsc"` skip their loaders on the same hydration.

### Why `in` check, not `!== undefined`

The scratchpad check is `namespace in scratchpad.context`, not `scratchpad.context[namespace] !== undefined`. The distinction matters for **explicit `null`** loader returns: a server-side loader that returns `null` for "user not found, render empty profile" must hydrate with `data === null`, not re-run the loader. With `!== undefined`, an explicit `null` would slip past and trigger a re-fetch. The `in` check matches the JavaScript truth "the server published this namespace; the value (whatever it is) is the authoritative result".

The presence-wins contract is frozen by an anchor test in `packages/ssr-data-plugin/tests/functional/data-loader.test.ts:549-566` that asserts `data: undefined` in the scratchpad is treated as "missing" (loader runs) while `data: null` is treated as "present" (loader skipped). The contract is documented in `packages/ssr-data-plugin/CLAUDE.md` gotcha #5.

### Why a scratchpad, not a state-merging API

- **Synchronous read.** The start interceptor runs inside `wrappedStart`, before any `await`. A synchronous slot access on a `WeakMap<Router, ScratchpadShape>` is O(1) with zero allocation. A state-merging API ("start with this state as initial") would require deserialising into a `State` shape before `start()`, then merging — duplicating the FSM transitions for one edge case.
- **One-shot, no cleanup.** The scratchpad clears itself on read. No reference retained, no opportunity for stale state to bleed into later navigations.
- **Plugin-extensible.** `claimContextNamespace()` consumers naturally read their own namespace from the scratchpad. The mechanism scales to any number of loader plugins without core changes.

### Angular asymmetry — TransferState bridge

Angular's SSR pipeline (`@angular/ssr`) does not expose a way to inject a custom `<script>window.__SSR_STATE__=...</script>` block. Instead, Angular ships its own `TransferState` API + `<script id="ng-state" type="application/json">…</script>` convention. `provideRealRouterFactory` adapts to this:

1. **Server side:** after `await router.start(path)`, write `serializeRouterState(state)` into `TransferState` under the internal key `@real-router/angular:ssrState`. Angular SSR pipeline emits the `ng-state` script automatically.
2. **Client side:** `provideAppInitializer` callback reads the seed from `TransferState`, calls `hydrateRouter(router, ssrJson)` (instead of `router.start(path)`). Scratchpad is populated; ssr-data-plugin and rsc-server-plugin skip their loaders on first paint.

Symmetry with the other five adapters is preserved at the **contract level** (post-hydration loader skip works the same way) while using Angular's idiomatic transport. Documented in `packages/angular/CLAUDE.md` and verified by 4 e2e scenarios (one per pipeline: `ssr/`, `ssr-streaming/`, `ssg/`, `ssr-mixed/`).

### Trade-offs

- **Scratchpad is internal API.** `RouterInternals.hydrationState` is exposed only to the loader plugin via `getPluginApi(router)`. Apps cannot pre-populate the scratchpad to bypass loaders for non-hydration navigations — that would defeat the "scratchpad is hydration-specific" contract. Apps that need to inject pre-fetched data on regular navigation use `state.context.data` directly via a custom plugin.
- **Path mismatch falls through to loader.** If the hydration `ssrState.path` does not match the URL the router resolves (mid-navigation redirect on the server, URL rewrite), the scratchpad is **not consumed** and the loader runs normally on the client. The mismatched scratchpad is then discarded on the next clear. Documented as a non-issue: server-side `LoaderRedirect` causes the server to render the *destination* page, so `ssrState.path` already reflects the post-redirect URL.
- **No retry on failure.** If the scratchpad write fails (claim was released, namespace re-claimed by a different plugin), the path falls through to the loader — degraded but not broken. The mismatched-claim case is structurally impossible if `usePlugin` registration order is identical between server and client (documented invariant).

### Dogfooding

Verified end-to-end across all six adapters via `post-hydration loader skip` Playwright scenario in each `ssr/`, `ssr-streaming/`, `ssr-rsc/`, and `ssr-mixed/` example. The test asserts that after hydration:

- Zero `/__bench/loader-call` increments are observed (server-side counter exposed by the test fixture for each loader)
- Browser network panel shows zero loader-driven `fetch` requests on first paint
- DOM content matches the SSR HTML byte-for-byte (no flicker between hydrated and re-fetched states)

Angular `provideRealRouterFactory` extends this to all 4 of its pipelines including `ssr-mixed/` "full" mode (shell modes naturally skip Angular bootstrap, so the bridge is structurally inactive for them).

## Per-route SSR mode + function form: `(state) => SsrMode` (#581)

### Problem

Mixed-rendering applications need per-route control: marketing pages SSR'd for SEO, dashboards client-rendered to reduce server cost, document detail pages SSR'd when the format is HTML but client-rendered when the format is PDF (no point pre-rendering binary content). The competitive landscape offers three shapes:

1. **Static path-based** (Angular `ServerRoute { renderMode: "Server" | "Client" | "Prerender" }`) — decision is part of the route configuration. Cannot vary by query string or resolved data.
2. **Boolean app-wide** (`react-router` framework mode `ssr: true|false`) — single global toggle.
3. **None** (`@solidjs/router` standalone, `vue-router` stable, `preact-iso`, `svelte-spa-router`) — all routes go through one SSR pipeline; opt-out requires application-level workaround.

None of these support data-driven per-navigation decisions like "render `/docs/intro` as HTML for `?format=html`, ship empty shell for `?format=pdf`" without forking the route into two definitions.

### Solution

`ssr-data-plugin`'s per-route entry accepts a discriminated union:

```typescript
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

router.usePlugin(
  ssrDataPluginFactory({
    home: () => async () => ({ /* ... */ }),                       // short form → "full"
    "admin.dashboard": { ssr: false },                              // false → "client-only"
    "marketing.landing": { ssr: "data-only", loader: () => /* ... */ }, // JSON only, shell rendered client-side
    "docs.detail": {
      ssr: (state) => state.params.format === "pdf" ? "client-only" : "full",
      loader: () => async (params) => fetchDoc(params.id),
    },
  }),
);
```

The discriminated union: `SsrMode = "full" | "data-only" | "client-only"`, boolean aliases `true`/`false`, or function form `(state) => SsrMode` evaluated on every navigation.

Semantics:

- **`"full"`** — loader runs on server and client; SSR shell + JSON + post-hydration skip (#596).
- **`"data-only"`** — loader runs on server; SSR emits empty shell (`<div id="app"></div>` + `<script>__SSR_STATE__</script>`); client picks up data from scratchpad on hydration. **No server-side render of the component tree.**
- **`"client-only"`** — loader skipped on server **and client**; the route's `state.context.data` stays `undefined`; the application is expected to handle the client-side fetch (React Query, Suspense, `useEffect`).
- **Boolean `true`** ≡ `"full"`; boolean `false` ≡ `"client-only"`.
- **Function form** — invoked with the **already-resolved state** (after route matching, params/path/name available; before mode is written). Returns one of the three string modes. Re-evaluated per navigation.

Mode resolution writes to `state.context.ssrDataMode`; read via public helper `getSsrDataMode(state)`. The `entry-server` reads it after `await router.start(url)` and branches between `renderToString(<App/>)` and HTML shell:

```typescript
const state = await scope.router.start(req.url);
const mode = getSsrDataMode(state); // "full" | "data-only" | "client-only"
const html = mode === "full" ? renderToString(<App router={scope.router}/>) : SHELL;
res.send(htmlDoc(html, serializeRouterState(state)));
```

### Why function form receives resolved state

Function-form `(state) => SsrMode` receives the **already-routed** state (params, path, name populated) but **before** mode is written to `state.context.ssrDataMode`. This is deliberate:

- **Path/params/query are available** — apps can branch on `state.params.format === "pdf"`, `state.path.startsWith("/admin")`, or any combination of routed concerns.
- **Mode is not yet readable** — function resolver must compute mode from inputs, not read it. Prevents recursive resolution (`mode -> mode` feedback loop).
- **State is otherwise immutable from the resolver's perspective** — the function is pure data → mode; it cannot mutate state, register guards, or trigger navigation. Side-effects belong in lifecycle plugins, not in SSR mode resolution.

The execution order is: route match → state freeze (shallow on `context`) → `ssr-data-plugin` start interceptor calls function resolver → mode written to `state.context.ssrDataMode` → loader either runs or skips → activation guards.

### Why three modes, not two

`"full"` vs `"client-only"` is the obvious boolean split. `"data-only"` is the non-obvious third mode and was a recurring competitive ask:

- **App shell architecture.** Mobile-first apps that want fast TTFB (HTML shell + JSON in `<script>` tag = ~5 KB transferred before client bundle loads) ship `"data-only"` for everything except the landing page. The hydration entry mounts the app from JSON without server-side rendering of every component.
- **Avoiding double-render cost.** Client-heavy apps where SSR adds latency (component tree with thousands of nodes) but apps still want SSR-loaded data on first paint use `"data-only"` to skip the rendering cost while preserving the no-fetch-after-hydration benefit (#596).
- **Symmetric with TanStack Start.** TanStack Start ships `ssr: true | false | 'data-only'` (only in Start framework, not standalone). Mirroring the three-mode contract avoids competitive divergence for apps migrating to/from Start.

`rsc-server-plugin` ships a **subset** of these modes: `"full" | "client-only"`. RSC has no semantically meaningful "data without component" — a Server Component is rendered as a ReactNode, so "data-only RSC" would mean "render ReactNode but don't include it in the Flight stream", which has no use case. Rejected at factory time with a typed error: `mode "data-only" is not allowed for route "X". Allowed: full, client-only`.

### Trade-offs

- **Function resolver runs every navigation.** Including SSR boot and CSR navigation. Cost is O(1) per call; the function body should be a synchronous read of state fields. Async resolvers are not supported (function returns the mode synchronously; the plugin awaits the resolver only via `Promise.resolve(fn(state))` for type compatibility, not for async). Apps that need async decisions (e.g., feature-flag lookup) should pre-bake the flag into `state.context.<ns>` via a different plugin and read it synchronously.
- **Per-navigation mode is published, not memoised.** `state.context.ssrDataMode` is written on every navigation, even if the mode hasn't changed. Subscribers that care about mode transitions debounce themselves (`route.context.ssrDataMode !== previousRoute?.context.ssrDataMode`).
- **`"client-only"` mode is symmetric.** Loader is skipped on both server and client — application code must read `getSsrDataMode(state) === "client-only"` to know it must fetch data itself. Documented in each `ssr-mixed/` example README.
- **Mode marker takes priority over hydration scratchpad.** `"client-only"` skips loader unconditionally even if the scratchpad has data — preserves the "client-only means client handles fetching" contract. The scratchpad is wasted in this edge case (server published data, mode says ignore it); apps that mix `"client-only"` with pre-populated scratchpad data should re-think the architecture.

### Dogfooding

Six `ssr-mixed/` examples (React, Preact, Vue, Solid, Svelte, Angular) — each serves four routes × four configuration forms (short form, `{ ssr: false }`, `{ ssr: "data-only", loader }`, `{ ssr: (state) => …, loader }`). Per-adapter Playwright suite of 4 scenarios verifies:

1. **`"full"` mode** — server emits rendered HTML + JSON; client hydrates without re-fetch.
2. **`"data-only"` mode** — server emits empty shell + JSON; client mounts and reads `state.context.data` without fetch.
3. **`"client-only"` mode** — server emits empty shell, no JSON for this route; client fetches via app-level code.
4. **Function form** — same route with `?format=html` ↔ `?format=pdf` toggles the mode; assertion via `response.text()` body length and presence of `<script>__SSR_STATE__</script>`.

Angular `ssr-mixed/` is uniquely structured: `AngularNodeAppEngine` takes control of the request immediately after invocation, so per-route mode branching happens in **Express middleware before Angular** (`server.ts` performs `cloneRouter` + `ssrDataPluginFactory` + `await router.start(url)` BEFORE `angularApp.handle(req)`, reads `getSsrDataMode(state)`, branches: `next()` → AngularNodeAppEngine for `"full"` mode, or `res.send(shell)` for shell modes). The TransferState bridge applies automatically only in the `"full"` mode path; the shell modes use `<script>__SSR_STATE__</script>` directly (no Angular bootstrap, so no `TransferState` involvement). Documented in `packages/angular/CLAUDE.md` SSR section.

## Preact 11 forward-compat & peer-dep floor bump (#592)

### Problem

Preact 11 (currently in beta) restructures the `JSX` namespace: only `JSX.Element` and `JSX.IntrinsicElements` remain inside it; everything else (`HTMLAttributes`, `TargetedMouseEvent`, …) moves to the top-level `preact` namespace. Our `@real-router/preact` adapter referenced `JSX.HTMLAttributes` and `JSX.TargetedMouseEvent` in two source files (`src/types.ts`, `src/components/Link.tsx`), so the bundle would not type-check against v11. Peer dep `>=10.0.0` also had no way to opt into Preact 11 betas.

### Solution

- Source imports switched to the top-level form: `import type { HTMLAttributes, TargetedMouseEvent } from "preact"`. This compiles against Preact 10.28+ AND Preact 11 — Preact 10.28 introduced `src/dom.d.ts` and re-exported these types from the package root while keeping the legacy `JSXInternal` namespace as a backward-compat shim; Preact 11 retains the top-level exports and drops the namespace shim.
- `peerDependencies.preact` widened to `">=10.28.0 || ^11.0.0-0"`. The `-0` suffix lets `npm`/`pnpm` accept Preact 11 pre-release tags during the beta window. The floor moves from 10.0 → 10.28 because the new import path does not exist in earlier 10.x typings.
- `syncpack.config.mjs` adds an "Ignore preact peer dependency range" version group. The `sameRange` consistency policy panics on compound `||` ranges, and this peer dep is structurally a one-off.
- `packages/preact/devDependencies.preact` bumped from `10.25.4` → `10.29.2` so the adapter's own type-check exercises the new import path.

### Why this bumps the floor

We deliberately do **not** keep `JSX.HTMLAttributes` in the source even though it still works on Preact 10.28+. The whole point of the migration is to write code that compiles on Preact 11 without conditional types — keeping the namespace import would defer the change and leave a v11 footgun. The 10.0–10.27 user is a year+ behind on patches; the cost of asking them to bump is lower than carrying a back-compat shim through every adapter source.

### Stress-test regression — `combined-spa.stress.tsx` 8.2

Bumping the dev floor surfaced a latent stress-test issue: Preact 10.28 backported the v11 cascading-render fix (preactjs/preact#4966 + #4967), which now correctly coalesces same-microtask `setState` pairs whose final value equals the previous one. The transition stress test relied on **un**-batched rendering: it counted `useRouterTransition` renders across 100 fully-synchronous navigations, and because `IDLE_SNAPSHOT` is a frozen singleton, the polyfill's `Object.is(prev, next)` bail-out now collapses `IDLE → transitioning → IDLE` round trips to zero renders.

Fix: split each navigation into two `act` blocks using manually-resolved `addActivateGuard` promises so `TRANSITION_START` commits before `TRANSITION_SUCCESS` is fired. This mirrors how real apps interleave a microtask (guards, lazy loads, fetches) between start and end, which is what makes the transitioning state observable. The 100-render lower bound stays — the test is back to exercising both edges of the transition lifecycle, not whatever Preact's batcher chose to drop on that particular release.

### Forward direction

- `@testing-library/preact@3.2.4` (current pin) does not yet ship a Preact 11 compatible release. Matrix-testing the adapter against Preact 11 is blocked on the testing library — the issue carries the `upstream` label for this reason.
- Once `@testing-library/preact` ships an 11-compatible version, run the unit suite against both majors (manual matrix or pnpm-overrides per CI job) before publishing the 1.0 of the adapter.

## Replace Flag Propagation in `TransitionMeta` (#XXX)

### Problem

Three of the four "primary" `NavigationOptions` fields — `reload`, `redirected`, and (until now) `replace` — were treated asymmetrically by the transition pipeline. `reload` and `redirected` were lifted into `state.transition.{reload, redirected}` in `completeTransition.ts`, so subscribers could portably discriminate them across any URL plugin (browser, hash, navigation, memory, none). `replace` was not: a subscriber that wanted to know "was this transition a replace?" had to read `state.context.navigation.navigationType === "replace"`, which is set **only** by `@real-router/navigation-plugin`. Under `@real-router/browser-plugin`, `@real-router/hash-plugin`, or no URL plugin at all, the signal was simply unavailable.

The visible damage was in `shared/dom-utils/scroll-restore.ts`. Under navigation-plugin the utility correctly skipped scroll capture on a replace (OAuth callback, params canonicalization, `navigateToNotFound`, auto-force-from-`UNKNOWN_ROUTE`). Under browser-plugin the `state.context.navigation` namespace was undefined, the `!nav` early-return fired, and **every** transition — replace or not — snapped the viewport via `scrollToHashOrTop`. The same asymmetry blocked any subscriber-level "skip programmatic replaces" idiom from being written portably (analytics, view-transitions, route-announcer — none could rely on a plugin-specific namespace).

Internally `replace` is a **core-level decision**: it originates in `router.navigate(name, params, { replace })` and is auto-forced by `forceReplaceFromUnknown()` and `navigateToNotFound()` (Invariants 7 and 12 in `packages/core/INVARIANTS.md`). Subscribers were the one audience that could not see it.

### Solution

`TransitionMeta` gains an optional `replace?: boolean` field, written in three places (symmetric with `reload`):

- `completeTransition.ts` — `if (opts.replace !== undefined) meta.replace = opts.replace;` lifts user-supplied and auto-forced opts (including the result of `forceReplaceFromUnknown`).
- `NavigationNamespace.navigateToNotFound()` — inline meta gets `replace: true` directly, mirroring the `FROZEN_REPLACE_OPTS = { replace: true }` that plugins already see via `onTransitionSuccess`'s 3rd argument.
- `DEFAULT_TRANSITION` — unchanged (pre-navigation fallback, no opts to lift).

`shared/dom-utils/scroll-restore.ts` is refactored to consume the portable flag. Under any URL plugin the disambiguation now reads:

- `route.transition.replace || nav?.navigationType === "replace"` → skip restore.
- `route.transition.reload || nav?.navigationType === "reload"` → restore from `sessionStorage`.
- `nav?.direction === "back" || nav?.navigationType === "traverse"` → restore.
- otherwise → `scrollToHashOrTop`.

Both arms in the `replace` and `reload` checks are intentional. The plugin arm preserves F5/cross-document scroll restoration under navigation-plugin (`getActivationType()` #531 priming sets `nav.navigationType === "reload"` while leaving `opts.reload` undefined on the initial transition). Dropping the plugin arm would silently regress F5 under navigation-plugin.

### Why

**Symmetry with the existing precedent.** `reload` and `redirected` proved the pattern; `replace` was the last hold-out. The added field is additive, optional, and zero API-breaking on the core type level.

**Closes a real gap, not a theoretical one.** The verified consumer is `scroll-restore.ts`. Under browser-plugin every replace transition (e.g. an OAuth callback `router.navigate("dashboard", {}, { replace: true })`) used to snap the viewport. Now it preserves position. The same change unblocks `scroll-spy` (#575) under browser-plugin and lets analytics / loaders use a `if (route.transition.replace) return` idiom portably.

**Subscriber/plugin visibility parity.** Plugins received `opts.replace` via `onTransitionSuccess(toState, fromState, opts)` since forever. After this change subscribers see it via `state.transition.replace` — closes the asymmetry between the two audiences that Invariant 7 had documented but not exposed.

### Before / After — scroll-restore behaviour under `browser-plugin` (`scrollRestoration={{ mode: "restore" }}`)

| Transition type                                                                                | Before                                              | After                                                          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Forward push (`<Link>` without `replace`)                                                      | `scrollToHashOrTop` (snap to top / anchor)          | `scrollToHashOrTop` (unchanged)                                |
| Replace (`navigate(..., { replace: true })`, OAuth callback, params canonicalization)          | `scrollToHashOrTop` (undesired snap)                | **skip** (preserve scroll position)                            |
| Programmatic reload (`navigate(..., { reload: true })`)                                        | `scrollToHashOrTop` (snap, lose pre-reload position) | **restore** from `sessionStorage` (via `subscribe`'s `previousRoute` capture; `pagehide` does not fire on same-document programmatic nav) |
| F5 cross-document (browser-driven reload)                                                      | `scrollToHashOrTop`                                 | `scrollToHashOrTop` (**unchanged** — `opts.reload` is undefined on the initial transition and browser-plugin has no Navigation API `getActivationType` analogue; closing this requires a core-level F5 priming, out of scope) |
| Browser back/forward (popstate)                                                                | `scrollToHashOrTop` (snap)                          | `scrollToHashOrTop` (unchanged — `direction`/`traverse` disambiguation requires navigation-plugin) |
| `navigateToNotFound()`                                                                         | `scrollToHashOrTop`                                 | **skip** (driven by inline `transition.replace = true`)        |

Opt-out for users who relied on the legacy snap-on-every-transition behaviour: `scrollRestoration={{ mode: "top" }}`.

Under `@real-router/navigation-plugin` there is **no behaviour change** — every existing branch (`replace` / `reload` / `traverse` / `direction === "back"`) remains active. The new `transition.replace` / `transition.reload` checks short-circuit the same paths slightly earlier with identical observable results.

### Tests

- `packages/core/tests/functional/navigation/navigate/navigation-options.test.ts` — the "transition meta flags" suite gains six new cases covering `replace: true`, `replace: false`, default `undefined`, `navigateToNotFound`, `forceReplaceFromUnknown` auto-force, and the override of an explicit `replace: false` from `UNKNOWN_ROUTE` (the `!opts.replace` condition matches both `undefined` and `false`), plus a timing-parity case mirroring the existing reload guard test.
- `packages/dom-utils/tests/functional/scroll-restore.test.ts` — a new describe block adds six cases under a browser-plugin-like environment (no `state.context.navigation`) plus a regression test that simulates navigation-plugin's #531 priming (`nav.navigationType === "reload"` with `transition.reload === undefined`) and verifies that the F5 restore path still fires.
- `packages/angular/src/dom-utils/scroll-restore.ts` is regenerated from `shared/dom-utils/scroll-restore.ts` by the existing `prebundle` script (`pnpm -F @real-router/angular bundle`) — ng-packagr cannot follow the symlinks the other adapters use, so the file is git-tracked and must be kept in sync.
