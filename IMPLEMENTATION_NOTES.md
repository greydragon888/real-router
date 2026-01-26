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

| Package                          | Limit |
| -------------------------------- | ----- |
| @real-router/core                | 25 kB |
| @real-router/react               | 10 kB |
| @real-router/browser-plugin      | 5 kB  |
| @real-router/helpers             | 3 kB  |
| route-tree                       | 15 kB |
| search-params                    | 5 kB  |
| @real-router/types, type-guards  | 2 kB  |
| logger-plugin, persistent-params | 3 kB  |

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
