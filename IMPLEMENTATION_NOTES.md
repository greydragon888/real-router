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

**JS bundling:** tsup with `noExternal` option bundles private packages:

```typescript
// packages/core/tsup.config.mts
export default createIsomorphicConfig({
  noExternal: ["type-guards", "route-tree", "search-params"],
});
```

**DTS generation:** tsup with `dts: { resolve: true }` generates type declarations:

```typescript
// tsup.base.mts
dts: {
  resolve: true, // Resolve types from dependencies
},
```

**Results:**
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total .d.ts lines | 12,080 | 3,793 | -69% |
| core .d.ts | 1,807 | 216 | -88% |
| browser-plugin .d.ts | 1,831 | 500 | -73% |
| react .d.ts | 1,813 | 80 | -96% |

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

`.github/workflows/size.yml` compares bundle sizes between PR and base branch:

- Creates/updates PR comment with size diff table
- Shows per-package sizes and total
- Warns if size limit exceeded

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

`.size-limit.json` defines per-package limits:

| Package                        | Limit  |
| ------------------------------ | ------ |
| @real-router/core              | 21 kB  |
| @real-router/react             | 2 kB   |
| @real-router/rx                | 1.5 kB |
| @real-router/browser-plugin    | 4 kB   |
| @real-router/helpers           | 0.5 kB |
| path-matcher                   | 4 kB   |
| route-tree                     | 6.5 kB |
| search-params                  | 1.5 kB |
| type-guards                    | 1.5 kB |
| @real-router/logger            | 0.5 kB |
| @real-router/logger-plugin     | 1.5 kB |
| @real-router/persistent-params | 1.5 kB |

React package ignores `react` and `react-dom` from size calculation.

### knip Configuration

`knip.json` ignores:

- `terser`, `fast-check` (used but not detected)
- `@real-router/persistent-params-plugin` (internal workspace deps)
- `@stryker-mutator/api`, `jsdom` (test infrastructure)

### syncpack Configuration

`syncpack.config.mjs` enforces:

- Workspace packages use `workspace:^` protocol
- Peer dependencies use `>=` ranges
- All other dependencies are pinned (exact versions)
- Consistent versions across all packages

## Turbo Configuration

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

### Dependency License Review

`.github/dependency-review-config.yml` defines allowed licenses for production dependencies. Dependency Review check fails on PRs that introduce packages with licenses outside the allow-list.

**Allowed licenses:** MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, CC-BY-4.0, BlueOak-1.0.0, Python-2.0, MS-PL, LGPL-3.0-only.

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

### knip: Router Benchmarks Entry

Added `packages/router-benchmarks` workspace to `knip.json` with `entry: ["src/**/*.ts"]` to recognize standalone benchmark scripts (like `isolated-anomalies.ts`) that are not imported from `index.ts`.

## FSM Package

### Why a Separate Package?

`@real-router/fsm` is a standalone synchronous finite state machine engine extracted as its own package. It has **zero dependencies** and can be used independently of the router.

### Design Decisions

**Single-class, no validation:** The entire FSM is 107 lines. TypeScript generics enforce correctness at compile time — no runtime validation of config, states, or events. This keeps the hot path allocation-free.

**O(1) transitions:** A `#currentTransitions` cache stores the transition map for the current state, avoiding double lookup (`transitions[state][event]`).

**Null-slot listener pattern:** Same pattern used in `@real-router/core`'s observable. Unsubscribed listeners are set to `null` instead of spliced, preventing array reallocation. New listeners reuse null slots.

**Listener count fast-path:** `#listenerCount` tracks active listeners. When zero, `send()` skips `TransitionInfo` object creation and listener iteration entirely.

**Type-safe payloads via `TPayloadMap`:** A fourth generic parameter maps event names to payload types. Events not in the map accept no payload. Uses conditional rest parameters for zero-overhead at runtime.

### Reentrancy

`send()` inside `onTransition` is allowed and executes synchronously inline (no queue). State is updated before listeners fire, so reentrant `send()` reads the already-updated state. Callers must prevent infinite loops.

### Package Structure

```
packages/fsm/
├── src/
│   ├── fsm.ts    — FSM class (all logic, 107 lines)
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

**Solution:** Migrated to **facade + namespaces** pattern:

```
src/
├── Router.ts (facade, ~900 lines)
└── namespaces/
    ├── RoutesNamespace/
    │   ├── RoutesNamespace.ts
    │   ├── constants.ts
    │   ├── helpers.ts
    │   ├── types.ts
    │   └── stateBuilder.ts
    ├── StateNamespace/
    ├── NavigationNamespace/
    └── ... (11 namespaces total)
```

**Benefits:**

- Clear separation of concerns
- Each namespace is independently testable
- No circular dependencies
- Router.ts is thin facade (validation + delegation)
- Namespace internals are encapsulated

**Migration:** Completed January 2026. Legacy `src/core/` folder deleted after full test coverage verification.

### Validation Pattern

**Decision:** All input validation happens in Router.ts facade via **static methods** on namespace classes.

```typescript
// Router.ts (facade)
buildPath(route: string, params?: Params): string {
  // 1. Validate via static method (throws on invalid input)
  RoutesNamespace.validateBuildPathArgs(route);

  // 2. Delegate to namespace instance (input guaranteed valid)
  return this.#routes.buildPath(route, params, this.#options.get());
}

// RoutesNamespace.ts
class RoutesNamespace {
  // Static: validation only, no instance access
  static validateBuildPathArgs(route: unknown): asserts route is string {
    if (!isString(route) || route === "") {
      throw new TypeError(`buildPath: route must be non-empty string`);
    }
  }

  // Instance: business logic, assumes valid input
  buildPath(route: string, params?: Params, options?: Options): string {
    // No validation here - route is guaranteed valid
    return this.#tree.buildPath(route, params, options);
  }
}
```

**Why static methods?**

1. **No instance needed** — validation doesn't require state
2. **Clear contract** — `static` signals "pure validation, no side effects"
3. **Testable independently** — can test validation without Router instance
4. **Type narrowing** — `asserts` keyword narrows types for TypeScript

**Why validate in facade, not namespace?**

1. **Single entry point** — all public API goes through facade
2. **Consistent error messages** — facade knows method names for errors
3. **Namespace trusts facade** — cleaner internal code without defensive checks

### Plugin Interception Pattern

**Problem discovered:** After moving `buildState` logic into `RoutesNamespace`, tests for `@real-router/persistent-params-plugin` failed.

**Root cause:** Plugin intercepts `router.forwardState()` to merge persistent params:

```typescript
// persistent-params-plugin
const originalForwardState = router.forwardState;
router.forwardState = (name, params) => {
  const result = originalForwardState(name, params);
  return { ...result, params: withPersistentParams(result.params) };
};
```

Original code in Router.ts:

```typescript
buildState(routeName, routeParams) {
  const { name, params } = this.forwardState(routeName, routeParams); // ✅ Interceptable
  return createRouteState(segments, params);
}
```

After moving to namespace:

```typescript
// RoutesNamespace.ts
buildState(routeName, routeParams) {
  const { name, params } = this.forwardState(routeName, routeParams); // ❌ NOT interceptable!
  return createRouteState(segments, params);
}
```

The namespace calls its own `forwardState`, bypassing plugin interception on `router.forwardState`.

**Solution:** Keep interception points at facade level:

```typescript
// Router.ts (facade)
buildState(routeName, routeParams) {
  // Call forwardState at FACADE level (interceptable by plugins)
  const { name, params } = this.forwardState(routeName, routeParams);

  // Delegate to namespace with already-resolved values
  return this.#routes.buildStateResolved(name, params);
}

// RoutesNamespace.ts
buildStateResolved(resolvedName, resolvedParams) {
  // No forwardState call - values already resolved
  const segments = getSegmentsByName(this.#tree, resolvedName);
  return createRouteState({ segments, params: resolvedParams }, resolvedName);
}
```

**Rule:** Methods that plugins may intercept must be called at facade level, not inside namespaces.

**Affected methods:**

- `forwardState` — intercepted by persistent-params-plugin
- `navigate` — could be intercepted for analytics
- `buildPath` — could be intercepted for URL rewriting

### FSM Migration (R4): dispose() and TransitionMeta

**R4 additions** built on top of R1 (RouterFSM), R3 (lifecycle cleanup):

#### dispose() — Terminal State

Router now supports permanent disposal via `router.dispose()`. The RouterFSM transitions to a terminal `DISPOSED` state. All mutating methods throw `ROUTER_DISPOSED` after disposal.

**Cleanup order:** plugins → middleware → observable → routes+lifecycle → state → deps → currentToState → markDisposed

**Idempotency:** Second call is a no-op (FSM state check prevents double-cleanup).

#### Enhanced State Object (TransitionMeta)

After each navigation, `state.transition` contains `TransitionMeta` with:

- `phase` — last pipeline phase reached (`"deactivating"` | `"activating"` | `"middleware"`)
- `duration` — elapsed ms (`performance.now()` delta)
- `from` — previous route name (undefined on first navigation)
- `reason` — always `"success"` for resolved navigations
- `segments` — `{ deactivated, activated, intersection }` (all deeply frozen arrays)

`TransitionMeta` is built by `NavigationNamespace` after each successful navigation and attached to the state object before freezing.

#### Bundle Size Delta (R4)

| Package           | Before R4 | After R4 | Delta |
| ----------------- | --------- | -------- | ----- |
| @real-router/core | ~22.00 kB | 22.06 kB | +60 B |

Size limit updated from `22 kB` → `22.1 kB` in `.size-limit.json` to accommodate R4 additions. The TransitionMeta building code added only ~60 B gzipped (well within the expected +1-2 kB estimate).

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
