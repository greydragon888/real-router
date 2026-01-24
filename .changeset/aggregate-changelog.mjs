#!/usr/bin/env node

/**
 * Aggregates package changelogs into root CHANGELOG.md
 *
 * Reads ALL version sections from each package's CHANGELOG.md
 * and adds new ones to the root CHANGELOG.md under today's date section.
 *
 * Run: node .changeset/aggregate-changelog.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT_DIR, "packages");
const ROOT_CHANGELOG = join(ROOT_DIR, "CHANGELOG.md");

/**
 * Check if content has meaningful changes (not just dependency updates or initial release boilerplate)
 */
function hasMeaningfulChanges(content) {
  // Remove headers like "### Patch Changes", "### Minor Changes", etc.
  const withoutHeaders = content.replace(/^###?\s+\w+\s+Changes?\s*$/gm, "");

  // Remove "Updated dependencies" lines and their sub-items (both @scoped and unscoped packages)
  const withoutDepUpdates = withoutHeaders
    .replace(/^-\s+Updated dependencies.*$/gm, "")
    .replace(/^\s+-\s+@?[\w/-]+@[\d.]+\s*$/gm, "");

  // Remove initial release boilerplate
  const withoutBoilerplate = withoutDepUpdates
    .replace(/^-\s+Initial public release.*$/gm, "");

  // Check if there's any meaningful content left (non-empty lines that aren't just whitespace)
  const meaningfulLines = withoutBoilerplate
    .split("\n")
    .filter((line) => line.trim() !== "");

  return meaningfulLines.length > 0;
}

/**
 * Extract ALL version sections from a CHANGELOG.md file
 * Returns array of { version, content } objects
 */
function extractAllVersions(changelogPath) {
  if (!existsSync(changelogPath)) {
    return [];
  }

  const content = readFileSync(changelogPath, "utf-8");
  const lines = content.split("\n");

  const versions = [];
  let currentVersion = null;
  let sectionLines = [];

  for (const line of lines) {
    // Match version heading: ## 0.2.1 or ## [0.2.1]
    const versionMatch = line.match(/^## \[?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]?/);

    if (versionMatch) {
      // Save previous version if exists
      if (currentVersion !== null) {
        const sectionContent = trimSection(sectionLines);
        if (hasMeaningfulChanges(sectionContent)) {
          versions.push({
            version: currentVersion,
            content: sectionContent,
          });
        }
      }

      currentVersion = versionMatch[1];
      sectionLines = [];
      continue;
    }

    if (currentVersion !== null) {
      sectionLines.push(line);
    }
  }

  // Don't forget the last version
  if (currentVersion !== null) {
    const sectionContent = trimSection(sectionLines);
    if (hasMeaningfulChanges(sectionContent)) {
      versions.push({
        version: currentVersion,
        content: sectionContent,
      });
    }
  }

  return versions;
}

/**
 * Trim empty lines from start and end of section
 */
function trimSection(lines) {
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

/**
 * Extract existing package@version entries from root CHANGELOG.md
 */
function getExistingEntries(rootChangelog) {
  const entries = new Set();
  // Match ### @real-router/core@0.2.0 or ### package-name@1.0.0
  const regex = /^### (@[\w/-]+@[\d.]+(?:-[a-zA-Z0-9.]+)?|[\w-]+@[\d.]+(?:-[a-zA-Z0-9.]+)?)/gm;
  let match;
  while ((match = regex.exec(rootChangelog)) !== null) {
    entries.add(match[1]);
  }
  return entries;
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

  // Read current root CHANGELOG
  let rootChangelog = "";
  if (existsSync(ROOT_CHANGELOG)) {
    rootChangelog = readFileSync(ROOT_CHANGELOG, "utf-8");
  }

  // Get existing entries to avoid duplicates
  const existingEntries = getExistingEntries(rootChangelog);

  // Collect NEW changes from all packages
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
    const allVersions = extractAllVersions(changelogPath);

    for (const { version, content } of allVersions) {
      const entryKey = `${packageName}@${version}`;

      // Skip if already in root changelog
      if (existingEntries.has(entryKey)) {
        continue;
      }

      if (content.trim()) {
        packageChanges.push({
          name: packageName,
          version,
          content,
        });
      }
    }
  }

  if (packageChanges.length === 0) {
    console.log("No new package changes to aggregate");
    return;
  }

  // Sort by package name, then by version (descending)
  packageChanges.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    // Compare versions: higher versions first
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });

  // Build new section
  const newSectionLines = [`## [${today}]`, ""];

  for (const pkg of packageChanges) {
    newSectionLines.push(`### ${pkg.name}@${pkg.version}`);
    newSectionLines.push("");
    newSectionLines.push(pkg.content);
    newSectionLines.push("");
  }

  const newSection = newSectionLines.join("\n");

  // Check if today's date section already exists
  const datePattern = new RegExp(`^## \\[${today}\\]`, "m");
  let updatedChangelog;

  if (datePattern.test(rootChangelog)) {
    // Insert new entries into existing date section
    const dateMatch = rootChangelog.match(datePattern);
    const insertPoint = rootChangelog.indexOf(dateMatch[0]) + dateMatch[0].length;

    // Find content to insert (without the date header)
    const contentToInsert = newSectionLines.slice(2).join("\n");

    updatedChangelog =
      rootChangelog.slice(0, insertPoint) + "\n\n" + contentToInsert + rootChangelog.slice(insertPoint);
  } else {
    // Find first ## section and insert before it
    const firstSectionMatch = rootChangelog.match(/^## \[/m);

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
  }

  writeFileSync(ROOT_CHANGELOG, updatedChangelog);
  console.log(`✅ Aggregated ${packageChanges.length} package changelog(s) to root CHANGELOG.md`);

  for (const pkg of packageChanges) {
    console.log(`   - ${pkg.name}@${pkg.version}`);
  }
}

main();
