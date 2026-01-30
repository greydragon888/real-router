/**
 * Danger JS Configuration
 *
 * Automated code review checks that run on every PR.
 * https://danger.systems/js/
 */

import { danger, warn, message, markdown } from "danger";

// =============================================================================
// Configuration
// =============================================================================

const INFRASTRUCTURE_PATTERNS = [
  /^\.github\//,
  /^\.husky\//,
  /^\.changeset\/config\.json$/,
  /\.config\.(js|mjs|mts|ts)$/,
  /^turbo\.json$/,
  /^tsconfig\.json$/,
  /^\.size-limit\.json$/,
  /^\.jscpd\.json$/,
  /^knip\.json$/,
  /^syncpack\.config\.mjs$/,
  /^sonar-project\.properties$/,
  /^\.npmrc$/,
];

const SOURCE_PATTERNS = [/^packages\/.*\/src\//];

const ARCHITECTURE_PATTERNS = [
  /^packages\/[^/]+\/src\/index\.ts$/,        // Public API exports
  /^packages\/[^/]+\/package\.json$/,         // Package dependencies
  /^packages\/[^/]+\/CLAUDE\.md$/,            // Package documentation
  /^packages\/core\/src\/createRouter\.ts$/,  // Router factory
  /^packages\/core\/src\/types\.ts$/,         // Core types
  /^packages\/core-types\/src\//,             // Shared types
];

const BIG_PR_THRESHOLD = 500;
const VERY_BIG_PR_THRESHOLD = 1000;

// =============================================================================
// Helpers
// =============================================================================

const modifiedFiles = danger.git.modified_files;
const createdFiles = danger.git.created_files;
const deletedFiles = danger.git.deleted_files;
const allChangedFiles = [...modifiedFiles, ...createdFiles, ...deletedFiles];

const matchesPattern = (file: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(file));

const prBody = danger.github?.pr?.body ?? "";
const prTitle = danger.github?.pr?.title ?? "";
const isTrivial =
  prTitle.includes("#trivial") || prBody.includes("#trivial");
const isBot = danger.github?.pr?.user?.type === "Bot";

// =============================================================================
// Checks
// =============================================================================

/**
 * Check 1: IMPLEMENTATION_NOTES.md reminder
 *
 * When infrastructure files are changed, remind to update documentation.
 */
function checkImplementationNotes() {
  if (isTrivial || isBot) return;

  const changedInfraFiles = allChangedFiles.filter((f) =>
    matchesPattern(f, INFRASTRUCTURE_PATTERNS)
  );

  const hasImplNotesChanges = allChangedFiles.includes(
    "IMPLEMENTATION_NOTES.md"
  );

  if (changedInfraFiles.length > 0 && !hasImplNotesChanges) {
    warn(
      `📝 Infrastructure files changed. Consider updating \`IMPLEMENTATION_NOTES.md\`:\n\n` +
        changedInfraFiles.map((f) => `- \`${f}\``).join("\n")
    );
  }
}

/**
 * Check 2: Architectural changes reminder
 *
 * When public API, core types, or package structure changes,
 * remind to update documentation.
 */
function checkArchitecturalChanges() {
  if (isTrivial || isBot) return;

  const changedArchFiles = allChangedFiles.filter((f) =>
    matchesPattern(f, ARCHITECTURE_PATTERNS)
  );

  // Check for new packages
  const newPackages = createdFiles
    .filter((f) => /^packages\/[^/]+\/package\.json$/.test(f))
    .map((f) => f.match(/^packages\/([^/]+)\//)?.[1])
    .filter(Boolean);

  const hasImplNotesChanges = allChangedFiles.includes(
    "IMPLEMENTATION_NOTES.md"
  );
  const hasClaudeMdChanges = allChangedFiles.some((f) =>
    /CLAUDE\.md$/.test(f)
  );

  if (newPackages.length > 0 && !hasImplNotesChanges) {
    warn(
      `🏗️ New package(s) created: ${newPackages.join(", ")}.\n\n` +
        `Consider documenting in \`IMPLEMENTATION_NOTES.md\` or package \`CLAUDE.md\`.`
    );
  }

  if (changedArchFiles.length > 0 && !hasImplNotesChanges && !hasClaudeMdChanges) {
    const apiChanges = changedArchFiles.filter((f) => f.endsWith("index.ts"));
    const typeChanges = changedArchFiles.filter(
      (f) => f.includes("types") || f.includes("core-types")
    );

    const reasons: string[] = [];
    if (apiChanges.length > 0) {
      reasons.push(`Public API changed: ${apiChanges.map((f) => `\`${f}\``).join(", ")}`);
    }
    if (typeChanges.length > 0) {
      reasons.push(`Core types changed: ${typeChanges.map((f) => `\`${f}\``).join(", ")}`);
    }

    if (reasons.length > 0) {
      message(
        `🏛️ Architectural changes detected:\n\n` +
          reasons.map((r) => `- ${r}`).join("\n") +
          `\n\nConsider documenting non-obvious decisions.`
      );
    }
  }
}

/**
 * Check 3: Changeset reminder
 *
 * When source files are changed, remind to add a changeset.
 */
function checkChangeset() {
  if (isTrivial || isBot) return;

  const changedSourceFiles = allChangedFiles.filter((f) =>
    matchesPattern(f, SOURCE_PATTERNS)
  );

  const hasChangeset = allChangedFiles.some((f) =>
    /^\.changeset\/.*\.md$/.test(f) && !f.includes("README.md")
  );

  if (changedSourceFiles.length > 0 && !hasChangeset) {
    warn(
      `📦 Source files changed but no changeset found.\n\n` +
        `Run \`pnpm changeset\` to add a changeset for this change.`
    );
  }
}

/**
 * Check 4: PR size warning
 *
 * Warn about large PRs that are hard to review.
 */
function checkPRSize() {
  if (isTrivial || isBot) return;

  const linesChanged =
    (danger.github?.pr?.additions ?? 0) +
    (danger.github?.pr?.deletions ?? 0);

  if (linesChanged > VERY_BIG_PR_THRESHOLD) {
    warn(
      `🐘 This PR has ${linesChanged} lines changed. ` +
        `Consider breaking it into smaller PRs for easier review.`
    );
  } else if (linesChanged > BIG_PR_THRESHOLD) {
    message(
      `📊 This PR has ${linesChanged} lines changed.`
    );
  }
}

/**
 * Check 5: PR description
 *
 * Remind to add a description for non-trivial PRs.
 */
function checkPRDescription() {
  if (isTrivial || isBot) return;

  const hasDescription = prBody.trim().length > 50;

  if (!hasDescription) {
    warn(
      `📋 Please add a description to your PR explaining what changes were made and why.`
    );
  }
}

/**
 * Check 6: Package.json and lockfile sync
 *
 * Warn if package.json dependencies changed but pnpm-lock.yaml didn't.
 * Only checks actual dependency changes, not scripts/metadata.
 */
async function checkLockfileSync() {
  const changedPackageJsons = modifiedFiles.filter((f) =>
    f.endsWith("package.json")
  );
  const lockfileChanged = allChangedFiles.includes("pnpm-lock.yaml");

  if (changedPackageJsons.length === 0 || lockfileChanged) {
    return;
  }

  // Check if any package.json has dependency changes
  const dependencyFields = [
    '"dependencies"',
    '"devDependencies"',
    '"peerDependencies"',
    '"optionalDependencies"',
  ];

  for (const file of changedPackageJsons) {
    const diff = await danger.git.diffForFile(file);
    if (!diff) continue;

    const hasDependencyChanges = dependencyFields.some(
      (field) => diff.added.includes(field) || diff.removed.includes(field)
    );

    // Also check for version changes in existing dependencies
    const hasVersionChanges =
      diff.added.includes('"^') ||
      diff.added.includes('"~') ||
      diff.added.includes('"workspace:') ||
      diff.removed.includes('"^') ||
      diff.removed.includes('"~') ||
      diff.removed.includes('"workspace:');

    if (hasDependencyChanges || hasVersionChanges) {
      warn(
        `🔒 Dependencies in \`${file}\` were changed but \`pnpm-lock.yaml\` was not.\n\n` +
          `Run \`pnpm install\` to update the lockfile.`
      );
      return; // One warning is enough
    }
  }
}

/**
 * Check 7: Test file coverage
 *
 * Remind to add tests for new source files.
 */
function checkTestCoverage() {
  if (isTrivial || isBot) return;

  const newSourceFiles = createdFiles.filter(
    (f) =>
      matchesPattern(f, SOURCE_PATTERNS) &&
      !f.includes(".test.") &&
      !f.includes(".spec.") &&
      !f.includes("index.ts")
  );

  if (newSourceFiles.length > 0) {
    const filesWithoutTests = newSourceFiles.filter((f) => {
      const testFile = f.replace("/src/", "/tests/").replace(".ts", ".test.ts");
      return !createdFiles.includes(testFile);
    });

    if (filesWithoutTests.length > 0) {
      message(
        `🧪 New source files added. Don't forget to add tests:\n\n` +
          filesWithoutTests.map((f) => `- \`${f}\``).join("\n")
      );
    }
  }
}

/**
 * Check 8: Console statements
 *
 * Warn about console.log in production code (not tests).
 */
async function checkConsoleStatements() {
  if (isTrivial || isBot) return;

  const sourceFiles = modifiedFiles.filter(
    (f) =>
      matchesPattern(f, SOURCE_PATTERNS) &&
      !f.includes(".test.") &&
      !f.includes(".spec.")
  );

  for (const file of sourceFiles) {
    const diff = await danger.git.diffForFile(file);
    if (diff?.added.includes("console.log")) {
      warn(`🔍 \`console.log\` found in \`${file}\`. Is this intentional?`);
    }
  }
}

/**
 * Check 9: Summary statistics
 *
 * Show PR statistics in a nice format.
 */
function showSummary() {
  if (isBot) return;

  const stats = {
    files: allChangedFiles.length,
    additions: danger.github?.pr?.additions ?? 0,
    deletions: danger.github?.pr?.deletions ?? 0,
  };

  markdown(`
### 📊 PR Statistics

| Metric | Count |
|--------|-------|
| Files changed | ${stats.files} |
| Lines added | +${stats.additions} |
| Lines deleted | -${stats.deletions} |
`);
}

// =============================================================================
// Run all checks
// =============================================================================

void (async () => {
  checkImplementationNotes();
  checkArchitecturalChanges();
  checkChangeset();
  checkPRSize();
  checkPRDescription();
  await checkLockfileSync();
  checkTestCoverage();
  await checkConsoleStatements();
  showSummary();
})();
