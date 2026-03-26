#!/usr/bin/env node

/**
 * Post-version safety net: prevents major version bumps.
 *
 * All packages are pre-1.0 — major bumps are never intended.
 * This script runs after `changeset version` and downgrades
 * any major bump back to the intended level:
 *   - If the package has an explicit changeset, use that level (minor/patch)
 *   - Otherwise, use patch (peer dep compatibility update)
 *
 * Root cause: `workspace:^` in peerDependencies on 0.x packages
 * resolves to `^0.x.y` which is patch-only in semver. Any minor
 * bump of the peer dep goes out of range and changesets applies
 * a major bump automatically (no config to prevent this).
 *
 * See: https://github.com/changesets/changesets/issues/822
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const BUMP_ORDER = { patch: 0, minor: 1, major: 2 };

/**
 * Parse semver string into { major, minor, patch }
 */
function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Read all pending changeset .md files and extract the max bump level per package.
 * Changesets are already consumed by `changeset version` (deleted from .changeset/),
 * so we read them from git HEAD.
 */
function getExplicitBumpLevels() {
  const levels = new Map();

  // Changesets consumed in this version run were deleted — find them via git diff
  let deletedFiles;
  try {
    deletedFiles = execSync("git diff --name-only --diff-filter=D HEAD -- .changeset/", {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return levels;
  }

  if (!deletedFiles) return levels;

  for (const file of deletedFiles.split("\n")) {
    if (!file.endsWith(".md") || file.endsWith("README.md")) continue;

    let content;
    try {
      content = execSync(`git show HEAD:${file}`, {
        cwd: ROOT_DIR,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      continue;
    }

    // Parse YAML frontmatter: --- \n "pkg": level \n ---
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const lines = frontmatterMatch[1].split("\n");
    for (const line of lines) {
      const entryMatch = line.match(/^"([^"]+)":\s*(patch|minor|major)\s*$/);
      if (!entryMatch) continue;

      const [, pkg, level] = entryMatch;
      const existing = levels.get(pkg);
      if (!existing || BUMP_ORDER[level] > BUMP_ORDER[existing]) {
        levels.set(pkg, level);
      }
    }
  }

  return levels;
}

/**
 * Get the version of a package from git HEAD (before changeset version ran)
 */
function getHeadVersion(packageJsonPath) {
  const relativePath = packageJsonPath
    .slice(ROOT_DIR.length + 1)
    .replace(/\\/g, "/");
  try {
    const content = execSync(`git show HEAD:${relativePath}`, {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(content).version;
  } catch {
    return null;
  }
}

/**
 * Apply a bump level to a version
 */
function applyBump(version, level) {
  const v = parseSemver(version);
  if (!v) return null;

  if (level === "minor") return `${v.major}.${v.minor + 1}.0`;
  if (level === "patch") return `${v.major}.${v.minor}.${v.patch + 1}`;
  return null;
}

/**
 * Fix CHANGELOG.md: replace major version header with the corrected version
 */
function fixChangelog(changelogPath, wrongVersion, correctVersion) {
  if (!existsSync(changelogPath)) return false;

  const content = readFileSync(changelogPath, "utf-8");
  const escaped = wrongVersion.replace(/\./g, "\\.");
  const pattern = new RegExp(`^(## )${escaped}`, "m");

  if (!pattern.test(content)) return false;

  const updated = content.replace(pattern, `$1${correctVersion}`);
  writeFileSync(changelogPath, updated);
  return true;
}

function main() {
  const explicitLevels = getExplicitBumpLevels();

  const packageDirs = execSync("ls -d packages/*/", {
    cwd: ROOT_DIR,
    encoding: "utf-8",
  })
    .trim()
    .split("\n")
    .map((dir) => join(ROOT_DIR, dir.replace(/\/$/, "")));

  let fixed = 0;

  for (const packageDir of packageDirs) {
    const packageJsonPath = join(packageDir, "package.json");
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const currentVersion = packageJson.version;
    const current = parseSemver(currentVersion);
    if (!current) continue;

    const headVersion = getHeadVersion(packageJsonPath);
    if (!headVersion) continue;

    const head = parseSemver(headVersion);
    if (!head) continue;

    // Detect major bump: major component increased
    if (current.major > head.major) {
      // Use explicit changeset level, or fall back to patch
      const level = explicitLevels.get(packageJson.name) || "patch";
      const correctVersion = applyBump(headVersion, level);
      if (!correctVersion) continue;

      packageJson.version = correctVersion;
      writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2) + "\n",
      );

      const changelogPath = join(packageDir, "CHANGELOG.md");
      fixChangelog(changelogPath, currentVersion, correctVersion);

      console.log(
        `⛔ Blocked major bump: ${packageJson.name} ${headVersion} → ${currentVersion}, corrected to ${correctVersion} (${level})`,
      );
      fixed++;
    }
  }

  if (fixed > 0) {
    console.log(`\n✅ Capped ${fixed} major bump(s)`);
  } else {
    console.log("✅ No major bumps detected");
  }
}

main();
