#!/usr/bin/env node

/**
 * Aggregates package changelogs into root CHANGELOG.md
 *
 * Reads the latest version section from each package's CHANGELOG.md
 * and adds them to the root CHANGELOG.md under the [Unreleased] section.
 *
 * Run: node scripts/aggregate-changelog.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT_DIR, "packages");
const ROOT_CHANGELOG = join(ROOT_DIR, "CHANGELOG.md");

/**
 * Check if content has meaningful changes (not just dependency updates)
 */
function hasMeaningfulChanges(content) {
  // Remove headers like "### Patch Changes", "### Minor Changes", etc.
  const withoutHeaders = content.replace(/^###?\s+\w+\s+Changes?\s*$/gm, "");

  // Remove "Updated dependencies" lines and their sub-items
  const withoutDepUpdates = withoutHeaders
    .replace(/^-\s+Updated dependencies.*$/gm, "")
    .replace(/^\s+-\s+@[\w/-]+@[\d.]+\s*$/gm, "");

  // Check if there's any meaningful content left (non-empty lines that aren't just whitespace)
  const meaningfulLines = withoutDepUpdates
    .split("\n")
    .filter((line) => line.trim() !== "");

  return meaningfulLines.length > 0;
}

/**
 * Extract the latest version section from a CHANGELOG.md file
 * Returns { version, content } or null if no version found or no meaningful changes
 */
function extractLatestVersion(changelogPath) {
  if (!existsSync(changelogPath)) {
    return null;
  }

  const content = readFileSync(changelogPath, "utf-8");
  const lines = content.split("\n");

  let version = null;
  let sectionLines = [];
  let inSection = false;

  for (const line of lines) {
    // Match version heading: ## 0.2.1 or ## [0.2.1]
    const versionMatch = line.match(/^## \[?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]?/);

    if (versionMatch) {
      if (inSection) {
        // We've hit the next version, stop
        break;
      }
      version = versionMatch[1];
      inSection = true;
      continue;
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  if (!version) {
    return null;
  }

  // Trim empty lines from start and end
  while (sectionLines.length > 0 && sectionLines[0].trim() === "") {
    sectionLines.shift();
  }
  while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1].trim() === "") {
    sectionLines.pop();
  }

  const sectionContent = sectionLines.join("\n");

  // Skip if no meaningful changes (only dependency updates)
  if (!hasMeaningfulChanges(sectionContent)) {
    return null;
  }

  return {
    version,
    content: sectionContent,
  };
}

/**
 * Get package name from package.json
 */
function getPackageName(packageDir) {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return packageJson.name;
}

/**
 * Check if package is private
 */
function isPrivatePackage(packageDir) {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return true;
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return packageJson.private === true;
}

/**
 * Main function
 */
function main() {
  const today = new Date().toISOString().split("T")[0];

  // Collect changes from all packages
  const packageChanges = [];

  const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => join(PACKAGES_DIR, dirent.name));

  for (const packageDir of packageDirs) {
    // Skip private packages
    if (isPrivatePackage(packageDir)) {
      continue;
    }

    const packageName = getPackageName(packageDir);
    if (!packageName) {
      continue;
    }

    const changelogPath = join(packageDir, "CHANGELOG.md");
    const latest = extractLatestVersion(changelogPath);

    if (latest && latest.content.trim()) {
      packageChanges.push({
        name: packageName,
        version: latest.version,
        content: latest.content,
      });
    }
  }

  if (packageChanges.length === 0) {
    console.log("No package changes to aggregate");
    return;
  }

  // Read current root CHANGELOG
  let rootChangelog = "";
  if (existsSync(ROOT_CHANGELOG)) {
    rootChangelog = readFileSync(ROOT_CHANGELOG, "utf-8");
  }

  // Build new section
  const newSectionLines = [`## [${today}]`, ""];

  for (const pkg of packageChanges) {
    newSectionLines.push(`### ${pkg.name}@${pkg.version}`);
    newSectionLines.push("");
    newSectionLines.push(pkg.content);
    newSectionLines.push("");
  }

  const newSection = newSectionLines.join("\n");

  // Check if this date section already exists
  const datePattern = new RegExp(`^## \\[${today}\\]`, "m");
  if (datePattern.test(rootChangelog)) {
    console.log(`Section [${today}] already exists in root CHANGELOG.md, skipping`);
    return;
  }

  // Find first ## section (version entry) and insert before it
  const firstSectionMatch = rootChangelog.match(/^## \[/m);

  let updatedChangelog;
  if (firstSectionMatch) {
    const insertPoint = rootChangelog.indexOf(firstSectionMatch[0]);
    updatedChangelog =
      rootChangelog.slice(0, insertPoint) + newSection + "\n" + rootChangelog.slice(insertPoint);
  } else {
    // No sections yet, append after header
    const headerEnd = rootChangelog.indexOf("\n\n");
    if (headerEnd > -1) {
      updatedChangelog =
        rootChangelog.slice(0, headerEnd + 2) + newSection + "\n" + rootChangelog.slice(headerEnd + 2);
    } else {
      updatedChangelog = newSection + "\n\n" + rootChangelog;
    }
  }

  writeFileSync(ROOT_CHANGELOG, updatedChangelog);
  console.log(`✅ Aggregated ${packageChanges.length} package changelog(s) to root CHANGELOG.md`);

  for (const pkg of packageChanges) {
    console.log(`   - ${pkg.name}@${pkg.version}`);
  }
}

main();
