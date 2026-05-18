import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * Pkg-level guard: the Angular adapter is intentionally signal-first and must
 * not depend on `rxjs` or `@angular/core/rxjs-interop` (see CLAUDE.md "No
 * RxJS"). A regression here would silently bloat the bundle and break the
 * "zero rxjs" promise advertised in package docs.
 *
 * The test scans every `.ts` file under `packages/angular/src/` and
 * `packages/angular/ssr/` for static `import ... from "rxjs"` and
 * `from "@angular/core/rxjs-interop"`. Tooling alternatives (knip / eslint
 * `no-restricted-imports`) were considered, but a plain test keeps the
 * constraint co-located with the package and visible in CI failure output.
 */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']rxjs["']/,
  /from\s+["']rxjs\/[^"']+["']/,
  /from\s+["']@angular\/core\/rxjs-interop["']/,
  /require\(["']rxjs["']\)/,
  /import\(["']rxjs["']\)/,
];

const SCAN_ROOTS = ["src", "ssr"] as const;

function collectTsFiles(root: string): string[] {
  const out: string[] = [];

  function walk(directory: string): void {
    const entries = readdirSync(directory);

    for (const entry of entries) {
      const full = path.join(directory, entry);
      const stats = statSync(full);

      if (stats.isDirectory()) {
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

describe("Angular adapter — no rxjs imports", () => {
  it.each(SCAN_ROOTS)(
    "packages/angular/%s/ contains no rxjs or rxjs-interop imports",
    (root) => {
      const absRoot = path.join(__dirname, "..", "..", root);
      const files = collectTsFiles(absRoot);

      expect(files.length).toBeGreaterThan(0);

      const offenders: { file: string; line: number; text: string }[] = [];

      for (const file of files) {
        const lines = readFileSync(file, "utf8").split("\n");

        for (const [i, line] of lines.entries()) {
          for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.test(line)) {
              offenders.push({
                file: file.slice(absRoot.length + 1),
                line: i + 1,
                text: line.trim(),
              });

              break;
            }
          }
        }
      }

      expect(offenders).toStrictEqual([]);
    },
  );
});
