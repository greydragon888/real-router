import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// =============================================================================
// Package-policy assertion: the plugin is bundler-agnostic by contract.
//
// CLAUDE.md / README.md both promise that this package does NOT depend on any
// `react-server-dom-*` bundler. The contract holds today because nothing in
// `src/` imports those packages — but documentation alone won't survive a
// refactor that quietly wires one in (e.g. a future "convenience helper" that
// inlines `renderToReadableStream`). Encoding the rule as a test makes the
// regression loud.
//
// The check is intentionally syntactic — we walk every `.ts` file under
// `src/` and grep for `react-server-dom`. We don't try to parse imports
// properly because the rule is "the substring must not appear in source",
// which is stricter than "no import statements match". JSDoc mentions are
// allowed: the assertion strips block comments before matching so the
// `factory.ts` JSDoc example listing the supported renderers does not trip
// the rule.
// =============================================================================

const FORBIDDEN_SUBSTRING = "react-server-dom";

const SRC_DIR = path.resolve(__dirname, "..", "..", "src");

function collectTsFiles(directory: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      collectTsFiles(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      acc.push(full);
    }
  }

  return acc;
}

function stripBlockComments(source: string): string {
  // /* ... */ — non-greedy across lines. Line comments stay because import
  // statements never start with `//`, but a `// react-server-dom-webpack`
  // would still flag the source — that's intentional, we don't want even
  // dormant referenced symbols.
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

describe("@real-router/rsc-server-plugin — bundler-agnostic policy", () => {
  it("does not import any react-server-dom-* symbol from src/", () => {
    const files = collectTsFiles(SRC_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      const stripped = stripBlockComments(readFileSync(file, "utf8"));

      if (stripped.includes(FORBIDDEN_SUBSTRING)) {
        offenders.push(file);
      }
    }

    // Soft sanity check: we should be scanning a non-empty set; if SRC_DIR
    // moved or the test was misconfigured the whole assertion would pass
    // vacuously. Fail loud in that case rather than silently accepting an
    // empty walk.
    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toStrictEqual([]);
  });
});
