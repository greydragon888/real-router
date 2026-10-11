#!/usr/bin/env node
// check-doc-code.mjs — the TypeScript fences of the READMEs compile against the
// packages' `src` (#2706).
//
//   node scripts/check-doc-code.mjs             # README.md and packages/*/README.md
//   node scripts/check-doc-code.mjs <page.md>…  # those pages
//
// `scripts/doc-code.mjs` holds how a page is read. This prints each finding as
// `<page>:<line>` and exits 1 on any.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkDocCode } from "./doc-code.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const readmes = () => [
  join(ROOT, "README.md"),
  ...readdirSync(join(ROOT, "packages"))
    .toSorted((a, b) => a.localeCompare(b))
    .map((pkg) => join(ROOT, "packages", pkg, "README.md"))
    .filter((file) => existsSync(file)),
];

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("usage: check-doc-code.mjs [page.md ...]");
    return 0;
  }
  const missing = args.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    console.error(`check-doc-code: no such page: ${missing.join(", ")}`);
    return 2;
  }

  const { pages } = checkDocCode({
    root: ROOT,
    files: args.length > 0 ? args.map((file) => resolve(file)) : readmes(),
  });
  const count = { clean: 0, skipped: 0, finding: 0 };
  for (const page of pages) {
    for (const block of page.blocks) {
      count[block.status]++;
      if (block.status !== "finding") continue;
      for (const d of block.diagnostics) {
        console.log(
          `${page.rel}:${d.line}  ${d.code ? `TS${d.code}` : "doc-code"}  ${d.message}`,
        );
      }
    }
  }
  console.log(
    `doc-code: ${pages.length} pages, ${count.clean} fences compile, ${count.skipped} skipped by a marker, ${count.finding} with findings`,
  );
  return count.finding > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
