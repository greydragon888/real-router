// checks.mjs — the one list of the checks the git hooks and CI's Repo Lints run.
//
// Data only. `scripts/verify.mjs --stage <stage>` runs the checks of a stage in
// the order of this list, and every place that runs checks — `.husky/pre-commit`,
// `.husky/pre-push`, the `repo-lints` job of `ci.yml` — calls it instead of
// keeping a list of its own. The order is "cheap first": static checks, then
// turbo, then the heavy linters and the external tools. One order serves every
// stage, so a stage differs from another only in WHICH checks it runs.
//
// `scripts/tests/checks-registry.test.mjs` holds the rest of the repository to
// this list: every root `lint*`/`test*` script and every check line of a
// workflow is a check here, or is named there as none; the hooks and Repo Lints
// call `verify` and run nothing else.

/** @typedef {"pre-commit" | "pre-push" | "ci"} Stage */

/**
 * The CI contexts a check can be skipped in, named by `verify --context`:
 * `dependabot-pr` — a PR Dependabot opened; `no-source` — a diff that carries no
 * source; `dependabot-actor-with-dedupe-fixer` — a run Dependabot started while
 * the lockfile fixer can push (`dependabot-dedupe.yml`); `release-pr` — the
 * release PR: its head is `changeset-release/master` from this repository, and
 * its diff carries no source.
 *
 * @typedef {"dependabot-pr" | "no-source" | "dependabot-actor-with-dedupe-fixer" | "release-pr"} CiSkip
 */

/**
 * @typedef {object} Check
 * @property {string} id              the npm script, or a synthetic id for a command
 *                                    that is none ("turbo:test+lint")
 * @property {string[]} run           the command; runs without a shell
 * @property {Stage[]} stages         where `verify` runs it
 * @property {string} why             what it catches
 * @property {(string | string[])[]} [tools] external binaries it needs; an array
 *                                    element is alternatives, any one of which will do
 * @property {CiSkip[]} [ciSkip]      the CI contexts it is skipped in
 * @property {string[]} [ciBy]        where CI runs it outside `verify`, as
 *                                    "<workflow>#<job>"
 * @property {string} [prePushExempt] why pre-push does not run it although
 *                                    pre-commit or CI does
 */

/** @type {Check[]} */
export const CHECKS = [
  // ── Static checks ──────────────────────────────────────────────────────────
  {
    id: "lint:changeset",
    run: ["pnpm", "lint:changeset"],
    stages: ["pre-push"],
    why: "pending changesets follow .changeset/README.md; a no-op without changesets",
  },
  {
    id: "lint:deps",
    run: ["pnpm", "lint:deps"],
    stages: ["pre-commit", "pre-push", "ci"],
    why: "dependency versions agree across the workspace (syncpack)",
  },
  {
    id: "lint:coverage-scope",
    run: ["pnpm", "lint:coverage-scope"],
    stages: ["pre-commit", "pre-push", "ci"],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "the Sonar, size-limit and turbo scopes match the package tree",
  },
  {
    // pre-push runs it too: git runs no pre-commit for a tree `git merge` or
    // `git rebase` produced, nor for a `--no-verify` commit.
    id: "lint:membership",
    run: ["pnpm", "lint:membership"],
    stages: ["pre-commit", "pre-push", "ci"],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "a record counted with Object.keys and tested with hasOwnProperty or in",
  },
  {
    // A scan of the whole tree cannot sit behind a per-package cache key: a
    // change in a sibling would replay a pass.
    id: "lint:repo-scans",
    run: ["pnpm", "lint:repo-scans"],
    stages: ["pre-commit", "pre-push", "ci"],
    why: "every repository-wide scan, listed in scripts/repo-wide-scans.json",
  },
  {
    id: "lint:e2e",
    run: ["pnpm", "lint:e2e"],
    stages: ["pre-commit", "pre-push", "ci"],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "every e2e directory has specs",
  },
  {
    // The check twin of the `pnpm dedupe` that pre-commit runs when a lockfile
    // is staged: a rebased or merged lockfile never passes through that step.
    // Skipped for a run Dependabot starts while `dependabot-dedupe.yml` can
    // push its fix: the two workflows race on one event, and CI would read the
    // lockfile before the fix lands. The fix's push reruns CI as another
    // author, where the check runs hard; without the token nothing fixes the
    // lockfile, and the check stays hard.
    id: "lint:dedupe",
    run: ["pnpm", "lint:dedupe"],
    stages: ["pre-push", "ci"],
    ciSkip: ["dependabot-actor-with-dedupe-fixer"],
    why: "the three lockfiles are deduplicated",
  },
  {
    id: "lint:doc-dup",
    run: ["pnpm", "lint:doc-dup"],
    stages: ["pre-push", "ci"],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "a docblock sentence that restates the package's own docs",
  },
  {
    id: "lint:duplicates",
    run: ["pnpm", "lint:duplicates"],
    stages: ["pre-push", "ci"],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "copy-paste above the jscpd threshold",
  },
  {
    // Node expands the pattern itself: the command runs without a shell.
    id: "node:scripts-tests",
    run: ["node", "--test", "--test-reporter=dot", "scripts/tests/*.test.mjs"],
    stages: ["pre-push", "ci"],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "the repository's own tooling tests",
  },
  {
    // Read by the whole task graph, so a diff of manifests alone or a bump of
    // ESLint can move what it answers: skipped in no CI context.
    id: "lint:reach",
    run: ["pnpm", "lint:reach"],
    stages: ["pre-push", "ci"],
    ciSkip: [],
    why: "every workspace package is linted, and every tracked code file by its own config",
  },

  // ── Turbo ──────────────────────────────────────────────────────────────────
  {
    // `lint` is named: it is a sibling task of `test`, not its dependency
    // (IMPLEMENTATION_NOTES, the entry on `lint` as a sibling of `test`).
    id: "turbo:test+lint",
    run: ["pnpm", "turbo", "run", "test", "lint"],
    stages: ["pre-commit"],
    ciBy: [
      "ci.yml#pipeline-leaf",
      "ci.yml#pipeline-sharded",
      "ci.yml#base-lint",
    ],
    prePushExempt:
      "pre-push runs the same tasks through build, whose dependsOn in turbo.json names test and lint",
    why: "the tests and the lint of the affected tasks",
  },
  {
    id: "turbo:build+lint:package+lint:types",
    run: ["pnpm", "turbo", "run", "build", "lint:package", "lint:types"],
    stages: ["pre-push"],
    ciBy: [
      "ci.yml#pipeline-leaf",
      "ci.yml#base-bundle",
      "ci.yml#pipeline-sharded",
    ],
    why: "the packages build, and their artifacts pass publint and arethetypeswrong",
  },
  {
    id: "turbo:lint:bench",
    run: ["pnpm", "turbo", "run", "lint:bench", "--filter=router-benchmarks"],
    stages: ["pre-push"],
    ciBy: ["ci.yml#benchmarks-lint"],
    why: "tsc and ESLint over benchmarks/, the CodSpeed suites",
  },

  // ── Heavy linters and external tools ───────────────────────────────────────
  {
    id: "lint:cross-router",
    run: ["pnpm", "lint:cross-router"],
    stages: ["pre-push"],
    ciBy: ["ci.yml#cross-router-lint"],
    why: "installs cross-router-bench/, a workspace of its own, then ESLint over it and the census of what its config reaches",
  },
  {
    // CI and post-merge exclude it by design: heap thresholds flake under a
    // concurrent build.
    id: "test:stress",
    run: ["pnpm", "test:stress"],
    stages: ["pre-push"],
    why: "heap and timing stress suites at --concurrency=1, their only gate",
  },
  {
    id: "lint:unused",
    run: ["pnpm", "lint:unused"],
    stages: ["pre-push", "ci"],
    why: "unused files, exports and dependencies (knip)",
  },
  {
    // An advisory window reddens it on any pull request, and the release would
    // stall on an advisory the release PR did not bring.
    id: "lint:audit",
    run: ["pnpm", "lint:audit"],
    stages: ["pre-push", "ci"],
    tools: ["osv-scanner"],
    ciSkip: ["release-pr"],
    why: "known vulnerabilities in every lockfile (osv-scanner)",
  },
  {
    // Without a semgrep binary, check-semgrep.sh runs it through uvx.
    id: "lint:security",
    run: ["pnpm", "lint:security"],
    stages: ["pre-push", "ci"],
    tools: [["semgrep", "uvx"]],
    ciSkip: ["dependabot-pr", "no-source"],
    why: "new SAST findings on the branch against .semgrep/rules.yml and p/javascript",
  },
  {
    // CI lints workflows in `ci.yml#actionlint`, on pull requests only; a push
    // straight to master meets actionlint here. That job runs a pinned image,
    // not a `pnpm` line, so `ciBy` cannot name it. Without shellcheck on PATH
    // actionlint drops its shell checks silently, hence the second tool.
    id: "lint:workflows",
    run: ["pnpm", "lint:workflows"],
    stages: ["pre-push"],
    tools: ["actionlint", "shellcheck"],
    why: "workflow errors: expressions, always-true `if:`, untrusted input in `run:`, shell bugs (actionlint)",
  },
  {
    id: "lint:prose",
    run: ["pnpm", "lint:prose"],
    stages: ["pre-push"],
    ciBy: ["ci.yml#prose-lint"],
    tools: ["vale"],
    why: "historiography in the Markdown corpus (Vale)",
  },
];
