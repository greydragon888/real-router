#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";

const packages = [
  "core",
  "browser-plugin",
  "helpers",
  "logger",
  "logger-plugin",
  "persistent-params-plugin",
  "react",
  // Приватные пакеты тоже нужны для локальной разработки
  "type-guards",
  "route-tree",
  "search-params",
  "core-types",
];

for (const pkg of packages) {
  const pkgDir = join("packages", pkg);
  const srcEntry = join(pkgDir, "src/index.ts");

  if (!existsSync(srcEntry)) {
    console.log(`⏭️  Skipping ${pkg} (no src/index.ts)`);
    continue;
  }

  console.log(`📦 Generating .d.ts for ${pkg}...`);

  // Generate bundled .d.ts
  const cjsDir = join(pkgDir, "dist/cjs");
  const esmDir = join(pkgDir, "dist/esm");

  mkdirSync(cjsDir, { recursive: true });
  mkdirSync(esmDir, { recursive: true });

  const cjsOutput = join(cjsDir, "index.d.ts");

  execSync(
    `npx dts-bundle-generator --no-check -o ${cjsOutput} ${srcEntry}`,
    { stdio: "inherit", cwd: process.cwd() }
  );

  // Copy to ESM with .d.mts extension
  copyFileSync(cjsOutput, join(esmDir, "index.d.mts"));

  console.log(`✓ ${pkg}: dist/cjs/index.d.ts, dist/esm/index.d.mts`);
}

console.log("\n✅ All .d.ts files generated!");
