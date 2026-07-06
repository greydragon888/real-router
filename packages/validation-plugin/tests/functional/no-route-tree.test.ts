import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * Pkg-level boundary guard (#1301): the validation plugin must reach the routing
 * engine ONLY through `@real-router/core` (its public / plugin-facing API), never
 * by importing the foundation package `route-tree` directly. Core is the sole
 * consumer of the engine; a plugin importing `route-tree` violates the
 * "integrations use only core's public plugin-api" boundary (see CLAUDE.md
 * "no private API"). The `validateRoute` value comes from `@real-router/core/validation`,
 * segment lookup + existence from the matcher (`getSegmentsByName` / `hasRoute`),
 * and the `RouteTree` type from `@real-router/core`.
 *
 * The test scans every `.ts` file under `packages/validation-plugin/src/` for a
 * static / dynamic `route-tree` import. A regression re-couples the plugin to a
 * foundation package and would re-add the `route-tree` devDependency.
 */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']route-tree["']/,
  /from\s+["']@real-router\/route-tree["']/,
  /require\(["']route-tree["']\)/,
  /import\(["']route-tree["']\)/,
];

function collectTsFiles(root: string): string[] {
  const out: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);

      if (statSync(full).isDirectory()) {
        walk(full);

        continue;
      }

      if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  }

  walk(root);

  return out;
}

describe("validation-plugin — no direct route-tree import (#1301)", () => {
  it("packages/validation-plugin/src/ imports the engine only via @real-router/core", () => {
    const absRoot = path.join(__dirname, "..", "..", "src");
    const files = collectTsFiles(absRoot);

    expect(files.length).toBeGreaterThan(0);

    const offenders: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");

      for (const [i, line] of lines.entries()) {
        if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(line))) {
          offenders.push({
            file: file.slice(absRoot.length + 1),
            line: i + 1,
            text: line.trim(),
          });
        }
      }
    }

    expect(offenders).toStrictEqual([]);
  });
});
