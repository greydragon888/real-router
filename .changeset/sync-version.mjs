#!/usr/bin/env node

/**
 * Syncs root package.json version from @real-router/core
 *
 * Run: node scripts/sync-version.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

const corePackageJson = JSON.parse(
  readFileSync(join(ROOT_DIR, "packages/core/package.json"), "utf-8")
);

const rootPackageJson = JSON.parse(
  readFileSync(join(ROOT_DIR, "package.json"), "utf-8")
);

if (rootPackageJson.version !== corePackageJson.version) {
  rootPackageJson.version = corePackageJson.version;
  writeFileSync(
    join(ROOT_DIR, "package.json"),
    JSON.stringify(rootPackageJson, null, 2) + "\n"
  );
  console.log(`✅ Synced root package.json version to ${corePackageJson.version}`);
} else {
  console.log(`ℹ️ Root package.json version already at ${corePackageJson.version}`);
}
