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
2. `.changeset/sync-version.mjs` — syncs root package.json version from core
3. `.changeset/aggregate-changelog.mjs` — aggregates package changelogs to root CHANGELOG.md

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

**Flow:**

1. Developer runs `pnpm changeset` → creates `.changeset/*.md`
2. Push to master triggers workflow
3. If changesets exist → creates/updates "Version Packages" PR
4. Maintainer merges Release PR
5. Next push to master → publishes to npm + creates GitHub Release

**OIDC Trusted Publishing:**

- Uses npm's native OIDC (no NPM_TOKEN secret needed)
- Requires Node.js 24+ (npm >= 11.5.1)
- First publish must be manual (`npm publish`) - can't configure Trusted Publisher before package exists
- Trusted Publisher configured with workflow: `changesets.yml` (NOT `release.yml`)

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

Packages are published in dependency order:

1. `@real-router/logger` (no @real-router deps)
2. `@real-router/types` (no deps)
3. `@real-router/core` (depends on types, logger)
4. All other packages

**Important:** The `publish_package` function must return `0` even when package is already published:

```bash
# ✅ CORRECT - skip is not an error
echo "⏭️ $name@$local_version already published"
return 0

# ❌ WRONG - causes script to fail
return 1
```

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
Per-package releases — each published package gets its own GitHub release:

- Tag format: `{package-name}@{version}` (e.g., `@real-router/core@0.2.0`)
- Release notes extracted from each package's `CHANGELOG.md`
- Skips if release already exists (idempotent)

### SonarCloud Version

`.github/workflows/sonarcloud.yml` gets version dynamically:

```yaml
VERSION=$(node -p "require('./packages/core/package.json').version")
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

`.husky/pre-commit` runs:

- `pnpm test` (includes type-check and lint via turbo pipeline)
- `pnpm lint:unused` (knip - dead code detection)
- `pnpm lint:duplicates` (jscpd - copy-paste detection)
- `pnpm lint:e2e` (verifies example e2e directories have spec files)

### Pre-push

`.husky/pre-push` runs everything from pre-commit PLUS:

- `pnpm lint:dedupe` (duplicate dependencies)
- `pnpm build` (final build)
- `pnpm lint:types` (arethetypeswrong - validate .d.ts files)
- `pnpm lint:package` (publint - validate package.json exports)

**Rationale:** Pre-commit is fast (uses turbo cache). Pre-push is thorough (validates artifacts).

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

### Matrix Testing

`.github/workflows/ci.yml` tests on Node 20, 22, 24:

```yaml
matrix:
  node: [20, 22, 24]
```

### Turbo Affected

CI uses `--affected` flag for incremental builds:

```yaml
pnpm turbo run lint type-check --affected
pnpm turbo run test --affected
pnpm turbo run build --affected
```

Only runs tasks for changed packages.

### Concurrency

All workflows use concurrency control:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Cancels in-progress runs when new commit pushed.

### pnpm/action-setup v5

All CI workflows migrated from `pnpm/action-setup@v4` to `pnpm/action-setup@v5` (`ci.yml`, `changesets.yml`, `danger.yml`). v5 auto-detects pnpm version from `packageManager` field in root `package.json` — no explicit `version` input needed.

### Additional Workflows

| Workflow             | File                       | Purpose                              |
| -------------------- | -------------------------- | ------------------------------------ |
| CI                   | `ci.yml`                   | Lint, type-check, test, build        |
| Changesets           | `changesets.yml`           | Versioning and npm publish           |
| SonarCloud           | `sonarcloud.yml`           | Code quality analysis                |
| Coverage             | `coverage.yml`             | Upload coverage to Codecov           |
| Bundle Size          | `size.yml`                 | PR comment with size diff            |
| CodeQL               | `codeql.yml`               | Security scanning + dependency audit |
| Dependabot Automerge | `dependabot-automerge.yml` | Auto-merge patch/minor updates       |
| Danger               | `danger.yml`               | Automated PR review checks           |

**Removed:** `build.yml` (replaced by `ci.yml`)

### Bundle Size Reporting

`.github/workflows/size.yml` (part of `ci.yml`) compares bundle sizes between PR and base branch:

- Creates/updates PR comment with size diff table
- Shows per-package sizes and total
- Warns if size limit exceeded

**Optimization:** PR sizes use dist artifacts downloaded from the prepare job (no rebuild). Base branch uses `build:dist-only` task (skips tests/lint). The PR's `turbo.json` is saved before checking out base and restored after — ensures `build:dist-only` task definition is available even on older base branches.

### Security Scanning

`.github/workflows/codeql.yml`:

- Runs CodeQL analysis on push/PR to master
- Weekly scheduled scan (cron: `0 3 * * 1`)
- Includes `security-extended` and `security-and-quality` queries
- Dependency review on PRs (fails on moderate+ severity, denies GPL-3.0/AGPL-3.0)

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
| Changeset reminder      | Source files changed, no changeset | Warn           |
| PR size                 | >500 lines changed                 | Message/Warn   |
| PR description          | Empty or short description         | Warn           |
| Lockfile sync           | package.json changed, no lockfile  | Warn           |
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

| Tool             | Purpose                           | Command                |
| ---------------- | --------------------------------- | ---------------------- |
| syncpack         | Dependency version consistency    | `pnpm lint:deps`       |
| knip             | Dead code detection               | `pnpm lint:unused`     |
| jscpd            | Copy-paste detection              | `pnpm lint:duplicates` |
| size-limit       | Bundle size tracking              | `pnpm size`            |
| arethetypeswrong | TypeScript declaration validation | `pnpm lint:types`      |
| publint          | Package.json exports validation   | `pnpm lint:package`    |
| SonarCloud       | Code quality & security           | `pnpm sonar:local`     |
| CodeQL           | Security vulnerabilities          | GitHub Actions         |
| Codecov          | Coverage reporting                | GitHub Actions         |
| Danger           | Automated PR review               | `pnpm danger:local`    |

### jscpd Configuration

`.jscpd.json`:

```json
{
  "threshold": 2,
  "minLines": 5,
  "minTokens": 50,
  "skipComments": true
}
```

Ignores: `*.d.ts`, `*.test.ts`, `*.bench.ts`, `*.spec.ts`

### size-limit Configuration

`.size-limit.js` defines per-package limits.

React package ignores `react`, `react-dom`, `@real-router/core`, `@real-router/route-utils`, and `@real-router/sources` from size calculation.

### knip Configuration

Uses knip v6+ (migrated from v5). Schema URL updated to `https://unpkg.com/knip@6/schema.json`.

`knip.json` ignores:

- `fast-check` (used but not detected by knip)
- `@real-router/browser-plugin`, `@real-router/logger` (internal workspace deps)
- `@stryker-mutator/api`, `jsdom` (test infrastructure)

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

Uses turbo v2.8.20+.

**v2.8.11 migration:** Removed `"daemon": false` from `turbo.json` — daemon was removed from `turbo run` in v2.8.11 (option deprecated, daemon only used for `turbo watch`).

### Concurrency Limit

`turbo.json`:

```json
{
  "concurrency": "4"
}
```

**Why:** Without a limit, turbo runs all 34 tasks in parallel on uncached runs. Property-based tests (fast-check) are memory-intensive — running 5+ property test suites + builds simultaneously causes OOM kills (exit code 137). With cache, most tasks are hits and memory stays low. The limit prevents OOM on cold runs (cleared cache, new CI runner, fresh clone).

### Environment Variables

`turbo.json`:

```json
{
  "globalPassThroughEnv": ["CI", "GITHUB_ACTIONS"]
}
```

`CI` and `GITHUB_ACTIONS` are passed through globally. Test task uses `passThroughEnv` for `CI`.

### Task Renames

- `publint` → `lint:package`
- Added `lint:types` for arethetypeswrong

### Build Dependency Chain

```
build → depends on ^build (upstream packages) + test
test → depends on lint + type-check
```

Build only runs after tests pass.

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

### `build:dist-only` Task

**Problem:** CI bundle size comparison ran `pnpm build` on the base branch, which triggers the full pipeline (type-check → lint → test → build) due to `build`'s `dependsOn`. This wasted CI time since only `dist/` output is needed for size comparison.

**Solution:** New `build:dist-only` task that only depends on `^build:dist-only` (upstream packages), skipping tests and linting. Used exclusively in the CI size comparison workflow.

```json
"build:dist-only": {
  "dependsOn": ["^build:dist-only"],
  "outputs": ["dist/**"],
   "inputs": ["src/**/*.{ts,tsx,vue,svelte}", "tsdown.config.*", "tsconfig.json", "package.json"]
}
```

### `test:e2e` Task

New turbo task for Playwright e2e tests in example applications:

```json
"test:e2e": {
  "dependsOn": ["^build"],
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

Depends on `^build` to ensure packages are compiled before examples run e2e tests.

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

All third-party GitHub Actions are pinned to commit SHAs instead of mutable tags (`v1`, `v2`):

```yaml
# ❌ BEFORE - mutable tag, can be hijacked
uses: changesets/action@v1

# ✅ AFTER - immutable commit SHA
uses: changesets/action@c48e67d110a68bc90ccf1098e9646092baacaa87 # v1.6.0
```

**Pinned actions:**

| Action                              | SHA        | Tag    |
| ----------------------------------- | ---------- | ------ |
| `changesets/action`                 | `c48e67d1` | v1.6.0 |
| `codecov/codecov-action`            | `671740ac` | v5     |
| `SonarSource/sonarqube-scan-action` | `a31c9398` | v7     |
| `dependabot/fetch-metadata`         | `21025c70` | v2     |
| `softprops/action-gh-release`       | `a06a81a0` | v2     |

**Why:** Mutable tags can be force-pushed by a compromised maintainer. SHA pins are immutable — even if the tag is moved, the pinned commit stays the same.

### Minimum Release Age

`.npmrc`:

```ini
minimum-release-age=1440
```

Blocks installation of npm packages published less than 24 hours ago. Protects against compromised packages being installed before the community detects them.

**Temporary exclusions:** When updating to a package released within the last 24 hours, add version-pinned entries to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` with a `TODO: remove after` comment. Include transitive dependencies (e.g., platform binaries for `turbo`). Glob patterns with version unions are not supported — list each package explicitly.

### Security Overrides

`pnpm.overrides` in root `package.json` pins transitive dependencies to patched versions:

```json
"flatted": ">=3.4.2"
```

`flatted` override addresses a prototype pollution vulnerability in older versions. Override ensures all transitive consumers use the patched version.

### Dependency License Review

`.github/dependency-review-config.yml` defines allowed licenses for production dependencies. Dependency Review check fails on PRs that introduce packages with licenses outside the allow-list.

**Allowed licenses:** MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, CC-BY-4.0, BlueOak-1.0.0, Python-2.0, MS-PL, LGPL-3.0-only.

**Allowed packages:** Express 5 transitive dependencies (`unpipe`, `toidentifier`, `escape-html`, `ee-first`, `depd`, `cookie-signature`) are allowlisted via `allow-packages` — they have low OpenSSF Scorecard (< 3) but are well-established Express ecosystem utilities. Used only in `examples/react/ssr` (private).

## ESLint 10 Migration

### Overview

Migrated from ESLint 9.39 to ESLint 10.1. Tracking issue: [#237](https://github.com/greydragon888/real-router/issues/237).

### Package Changes

| Package                         | Before | After       | Notes                         |
| ------------------------------- | ------ | ----------- | ----------------------------- |
| `eslint`                        | 9.39.2 | 10.1.0      | Major upgrade                 |
| `@eslint/js`                    | 9.39.2 | 10.0.1      | Major upgrade                 |
| `@eslint-react/eslint-plugin`   | 2.13.0 | 3.0.0       | Absorbs react-hooks           |
| `typescript-eslint`             | 8.53.1 | 8.57.2      | Patch                         |
| `@stylistic/eslint-plugin`      | 5.7.1  | 5.10.0      | Minor                         |
| `eslint-plugin-import-x`        | 4.16.1 | 4.16.2      | Patch                         |
| `eslint-plugin-unicorn`         | 62.0.0 | 64.0.0      | 2 major versions, 5 new rules |
| `eslint-plugin-sonarjs`         | 3.0.5  | 4.0.2       | Major — ESLint 10 support     |
| `eslint-plugin-jsdoc`           | 62.4.1 | 62.8.1      | Minor                         |
| `eslint-plugin-testing-library` | 7.15.4 | 7.16.2      | Patch                         |
| `@vitest/eslint-plugin`         | 1.6.12 | 1.6.13      | Patch                         |
| `eslint-plugin-promise`         | 7.2.1  | **Removed** | Covered by typescript-eslint  |
| `eslint-plugin-react-hooks`     | 7.0.1  | **Removed** | Absorbed by @eslint-react v3  |

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

### typescript-eslint pinned to 8.57.1 (not 8.57.2)

`typescript-eslint@8.57.2` introduced a fixer crash in `no-unnecessary-type-arguments`. The rule's `fix()` function accesses `typeArguments.params[-1]` → `undefined` → crash on `.range`. Occurs on both ESLint 9 and 10, even without `--fix`.

**Bisected:** 8.57.1 OK → 8.57.2 CRASH. Pinned to 8.57.1 until a fix ships.

**Override required:** `typescript-eslint@8.57.1` pulls `@typescript-eslint/eslint-plugin@8.57.2` and `@typescript-eslint/parser@8.57.1` as transitive deps, causing an unmet peer dep error (`eslint-plugin 8.57.2` expects `parser@^8.57.2`). Added pnpm overrides to pin both `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to 8.57.1.

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

### ESLint React Plugin Migration (historical)

_Previous migration from eslint-plugin-react v7 to @eslint-react v2. Now superseded by v3 migration above._

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

typescript-eslint, tsconfck (via vite-tsconfig-paths), and svelte2tsx declare `typescript <6.0.0` or `^5.0.0` as peer deps. All work correctly with TS 6.0, but pnpm's strict peer checking fails on install.

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

**TODO:** Remove after these packages update their peer dep ranges to include TS 6.

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
| Vue     | `branches: 95, functions: 95` | `defineComponent` internal type guards                  |
| Svelte  | `branches: 96, functions: 93` | Svelte compiler `$derived`/`$props` transforms          |
| React   | None                          | tsdown preserves original code                          |
| Preact  | None                          | tsdown preserves original code                          |

## dom-utils: Private Shared DOM Package

### Problem

All 5 framework adapters (React, Preact, Solid, Vue, Svelte) duplicated identical DOM utilities: `shouldNavigate` (modifier key check), `buildHref` (buildUrl/buildPath fallback), `buildActiveClassName` (CSS class concatenation), `applyLinkA11y` (role/tabindex on non-interactive elements). ~180 lines of copy-paste.

Additionally, a11y route announcements (#337) required a `createRouteAnnouncer` function consumed by all adapters.

### Solution

Private `dom-utils` package (`"private": true`) — not published to npm, inlined into each adapter's bundle at build time. No duplication since users import only one adapter.

### Why

- **Not `@real-router/core/utils`** — `buildHref` uses `router.buildUrl()` which is injected by `browser-plugin` via `extendRouter()`. Core doesn't know about this method. DOM dependency also disqualifies core.
- **Not per-adapter duplication** — 5 copies of identical code is a maintenance burden. A shared source of truth eliminates drift.
- **Private, not published** — only one adapter is used at a time, so the code is inlined (no extra npm dependency for users).

## Module Resolution: `customConditions` + `development` Export Condition

### Problem

Root `tsconfig.json` used manual `paths` mappings to resolve workspace packages to source files for IDE navigation:

```json
"paths": {
  "@real-router/core": ["packages/core/src/index.ts"],
  // ... 13 more mappings
}
```

Issues: manual sync required, already out-of-sync (`@real-router/rx` and `path-matcher` missing), duplicates info from `exports`.

### Solution

TypeScript 5.0+ `customConditions` with `"development"` export condition:

**Root tsconfig.json:**

```json
{ "customConditions": ["development"] }
```

**Each package.json exports:**

```json
"exports": {
  ".": {
    "development": "./src/index.ts",
    "types": { ... },
    "import": "./dist/esm/index.mjs",
    "require": "./dist/cjs/index.js"
  }
}
```

`"development"` must be **first** in `exports` — TypeScript picks the first matching condition. In production (Node.js, bundlers), `"development"` is unknown and ignored — resolution falls through to `"types"` / `"import"` / `"require"`.

### Self-Import Fix

Packages that imported themselves by published name (e.g., `@real-router/core` importing from `"@real-router/core"`) worked with `paths` (TypeScript resolved to source), but broke with `customConditions` during build — esbuild doesn't know `customConditions` and tried resolving via `exports`, pointing to `./dist/esm/index.mjs` which doesn't exist mid-build.

**Fixed in:** `@real-router/core` (2 files), `@real-router/react` (3 files) — replaced self-imports with relative imports.

**Also fixed:** `import("logger")` → `import("@real-router/logger")` in core test files (bare `logger` alias no longer exists without `paths`).

### Production Safety

`"development"` is a custom condition name. Node.js, esbuild, webpack, rollup, and tsdown do **not** recognize it by default. Verified with `pnpm build && pnpm lint:types` (attw --pack).

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

Removed `"./dist/*": "./dist/*"` wildcard export from `packages/core/package.json`. This was used by `router-benchmarks` to load compiled dist directly. Replaced with direct require of `@real-router/core/dist/cjs/index.js`.

### Vitest: Removed `clearMocks`

Removed `clearMocks: true` from `vitest.config.common.mts`. `restoreMocks: true` + `mockReset: true` already cover all cleanup. `clearMocks` was redundant (subset of `mockReset`).

### Workspace Cleanup

`pnpm-workspace.yaml`: removed `tools/*` glob and `minimumReleaseAgeExclude` entries for legacy `router6`/`router6-types` packages.

### Examples Workspace

70 example applications across 5 framework adapters (React, Preact, Solid, Vue, Svelte) plus standalone SSR/SSG examples. Organized by framework:

```
examples/
├── preact/{app-name}/
├── react/{app-name}/
├── solid/{app-name}/
├── svelte/{app-name}/
├── vue/{app-name}/
└── react/
    ├── ...               # 14 SPA examples
    ├── ssr/              # Server-side rendering with Express + Vite
    └── ssg/              # Static site generation with Vite
```

`pnpm-workspace.yaml` includes both `examples/*` and `examples/*/*` as workspace globs. Examples are private packages (`"private": true`) that use workspace packages via `workspace:^`.

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

Added `packages/router-benchmarks` workspace to `knip.json` with `entry: ["src/**/*.ts"]` to recognize standalone benchmark scripts (like `isolated-anomalies.ts`) that are not imported from `index.ts`.

## FSM Package

### Why a Separate Package?

`@real-router/fsm` is a standalone synchronous finite state machine engine extracted as its own package. It has **zero dependencies** and can be used independently of the router.

### Design Decisions

**Single-class, no validation:** The entire FSM is ~137 lines. TypeScript generics enforce correctness at compile time — no runtime validation of config, states, or events. This keeps the hot path allocation-free.

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
├── Router.ts (facade, ~640 lines)
├── internals.ts              — WeakMap<Router, RouterInternals> registry
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
├── wiring/
│   ├── RouterWiringBuilder.ts — Builder: namespace dependency wiring (10 methods)
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
    └── ... (9 namespaces total)
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
navigate() → fsm.forceState(TRANSITIONING) + emitTransitionStart()
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

Size limit updated from `22.1 kB` → `25 kB` in `.size-limit.js` to accommodate FSM integration. Current: 83.6 KB raw / 22.81 KB gzip.

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
