#!/usr/bin/env node

import {
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT_DIR, "packages");
const CACHE_DIR = join(ROOT_DIR, ".bundle-cache");

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// Find all packages
const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

const bundleSizes = [];

// Helper function to format bytes
const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Helper function to format percentage change
const formatChange = (current, previous) => {
  if (!previous || previous === 0) return "";
  const change = ((current - previous) / previous) * 100;
  const rounded = change.toFixed(1);
  if (rounded === "0.0" || rounded === "-0.0") return "";
  const sign = change > 0 ? "+" : "";
  return ` [${sign}${rounded}%]`;
};

// Helper function to calculate sizes from metafile
const calculateSizes = (metaData, formatDir) => {
  let bundleSize = 0;
  let mainOutputPath = null;

  // Find main bundle file path from metafile
  for (const [path, output] of Object.entries(metaData.outputs || {})) {
    // Only consider the main bundle file (not .map, not .d.ts)
    if (
      !path.endsWith(".map") &&
      (path.endsWith(".mjs") || path.endsWith(".js"))
    ) {
      mainOutputPath = join(formatDir, basename(path));
      break; // Found the main bundle, stop searching
    }
  }

  // Read actual file size from disk (important for Terser minification!)
  // metafile.outputs[].bytes contains size BEFORE Terser runs
  let gzipSize = 0;
  if (mainOutputPath && existsSync(mainOutputPath)) {
    const stats = statSync(mainOutputPath);
    bundleSize = stats.size;

    // Calculate gzip size
    const fileContent = readFileSync(mainOutputPath);
    const gzipped = gzipSync(fileContent, { level: 9 });
    gzipSize = gzipped.length;
  }

  return { bundleSize, gzipSize };
};

// Process each package
for (const pkg of packages) {
  const pkgDir = join(PACKAGES_DIR, pkg);
  const distDir = join(pkgDir, "dist");

  if (!existsSync(distDir)) {
    console.log(`⊘ ${pkg}: No dist directory, skipping`);
    continue;
  }

  const formats = ["esm", "cjs"];
  let pkgHasMetafiles = false;

  for (const format of formats) {
    const formatDir = join(distDir, format);

    if (!existsSync(formatDir)) {
      continue;
    }

    // Find current metafile
    const files = readdirSync(formatDir);
    const metafile = files.find(
      (f) =>
        f.startsWith("metafile-") &&
        f.endsWith(".json") &&
        !f.endsWith(".prev.json"),
    );

    if (!metafile) {
      continue;
    }

    const metafilePath = join(formatDir, metafile);
    // Store previous sizes in cache directory (outside dist to survive clean builds)
    const prevSizesPath = join(CACHE_DIR, `${pkg}-${format}-sizes.json`);

    try {
      // Read current metafile
      const metafileContent = readFileSync(metafilePath, "utf8");
      const metaData = JSON.parse(metafileContent);

      // Calculate current sizes
      const { bundleSize, gzipSize } = calculateSizes(metaData, formatDir);

      // Try to read previous sizes
      let prevBundleSize = null;
      let prevGzipSize = null;
      if (existsSync(prevSizesPath)) {
        try {
          const prevSizesContent = readFileSync(prevSizesPath, "utf8");
          const prevSizes = JSON.parse(prevSizesContent);
          prevBundleSize = prevSizes.bundleSize;
          prevGzipSize = prevSizes.gzipSize;
        } catch (error) {
          // Ignore errors reading previous sizes
        }
      }

      // Store bundle size info with comparison
      bundleSizes.push({
        package: pkg,
        format: format.toUpperCase(),
        size: bundleSize,
        gzipSize: gzipSize,
        prevSize: prevBundleSize,
        prevGzipSize: prevGzipSize,
      });

      // Save current sizes as previous for next run
      const sizesToSave = JSON.stringify({ bundleSize, gzipSize }, null, 2);
      writeFileSync(prevSizesPath, sizesToSave, "utf8");

      pkgHasMetafiles = true;
    } catch (error) {
      console.error(`✗ ${pkg} [${format.toUpperCase()}]: ${error.message}`);
    }
  }

  if (!pkgHasMetafiles) {
    console.log(`⊘ ${pkg}: No metafiles found`);
  }
}

// Print bundle sizes summary
if (bundleSizes.length === 0) {
  console.error('⚠️  No bundles found to analyze. Run "pnpm build" first.');
  process.exit(1);
}

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📦 Bundle Sizes`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Group by package
const packageGroups = {};
for (const item of bundleSizes) {
  if (!packageGroups[item.package]) {
    packageGroups[item.package] = {};
  }
  packageGroups[item.package][item.format] = {
    size: item.size,
    gzipSize: item.gzipSize,
    prevSize: item.prevSize,
    prevGzipSize: item.prevGzipSize,
  };
}

// Find max package name length for alignment
const maxNameLength = Math.max(
  ...Object.keys(packageGroups).map((n) => n.length),
);

// Print table header
console.log(
  `${"Package".padEnd(maxNameLength)}  ${"ESM".padStart(16)}  ${"ESM gzip".padStart(16)}  ${"CJS".padStart(16)}  ${"CJS gzip".padStart(16)}`,
);
console.log("-".repeat(maxNameLength + 72));

// Print table rows
for (const [pkg, formats] of Object.entries(packageGroups)) {
  const esmSize = formats.ESM?.size || 0;
  const esmGzip = formats.ESM?.gzipSize || 0;
  const cjsSize = formats.CJS?.size || 0;
  const cjsGzip = formats.CJS?.gzipSize || 0;

  const esmChange = formatChange(esmSize, formats.ESM?.prevSize);
  const esmGzipChange = formatChange(esmGzip, formats.ESM?.prevGzipSize);
  const cjsChange = formatChange(cjsSize, formats.CJS?.prevSize);
  const cjsGzipChange = formatChange(cjsGzip, formats.CJS?.prevGzipSize);

  const paddedName = pkg.padEnd(maxNameLength);

  console.log(
    `${paddedName}  ${(formatBytes(esmSize) + esmChange).padStart(16)}  ${(formatBytes(esmGzip) + esmGzipChange).padStart(16)}  ${(formatBytes(cjsSize) + cjsChange).padStart(16)}  ${(formatBytes(cjsGzip) + cjsGzipChange).padStart(16)}`,
  );
}

// Calculate totals - only include packages that have previous data for fair comparison
const packagesWithPrev = bundleSizes.filter((b) => b.prevSize !== null);
const allPackagesHavePrev = packagesWithPrev.length === bundleSizes.length;

const totalESM = bundleSizes
  .filter((b) => b.format === "ESM")
  .reduce((sum, b) => sum + b.size, 0);
const totalESMGzip = bundleSizes
  .filter((b) => b.format === "ESM")
  .reduce((sum, b) => sum + b.gzipSize, 0);
const totalCJS = bundleSizes
  .filter((b) => b.format === "CJS")
  .reduce((sum, b) => sum + b.size, 0);
const totalCJSGzip = bundleSizes
  .filter((b) => b.format === "CJS")
  .reduce((sum, b) => sum + b.gzipSize, 0);

// Calculate previous totals - only if ALL packages have previous data
const prevTotalESM = allPackagesHavePrev
  ? bundleSizes
      .filter((b) => b.format === "ESM")
      .reduce((sum, b) => sum + (b.prevSize || 0), 0)
  : null;
const prevTotalESMGzip = allPackagesHavePrev
  ? bundleSizes
      .filter((b) => b.format === "ESM")
      .reduce((sum, b) => sum + (b.prevGzipSize || 0), 0)
  : null;
const prevTotalCJS = allPackagesHavePrev
  ? bundleSizes
      .filter((b) => b.format === "CJS")
      .reduce((sum, b) => sum + (b.prevSize || 0), 0)
  : null;
const prevTotalCJSGzip = allPackagesHavePrev
  ? bundleSizes
      .filter((b) => b.format === "CJS")
      .reduce((sum, b) => sum + (b.prevGzipSize || 0), 0)
  : null;

console.log("-".repeat(maxNameLength + 72));

const esmChange = formatChange(totalESM, prevTotalESM);
const esmGzipChange = formatChange(totalESMGzip, prevTotalESMGzip);
const cjsChange = formatChange(totalCJS, prevTotalCJS);
const cjsGzipChange = formatChange(totalCJSGzip, prevTotalCJSGzip);

console.log(
  `${"Total".padEnd(maxNameLength)}  ${(formatBytes(totalESM) + esmChange).padStart(16)}  ${(formatBytes(totalESMGzip) + esmGzipChange).padStart(16)}  ${(formatBytes(totalCJS) + cjsChange).padStart(16)}  ${(formatBytes(totalCJSGzip) + cjsGzipChange).padStart(16)}`,
);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
