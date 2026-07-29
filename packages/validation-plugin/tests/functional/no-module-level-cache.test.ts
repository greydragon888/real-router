import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * Pkg-level lifetime guard (#1583): this plugin is instantiated ONCE PER ROUTER,
 * so any state it accumulates at runtime belongs to the router — never to the
 * module.
 *
 * The two diagnostic de-dup caches (`reportDroppedQueryKey` #1575,
 * `reportUndeclaredParamKey` #1579) were module-level `Set`s, i.e. one per
 * PROCESS. The first router to report a `route + key` silenced every router
 * after it, so under SSR / SSG the diagnostic fired for request #1 and stayed
 * quiet for the life of the process — exactly backwards for a dev-time signal.
 * They also survived `teardown()` and grew without bound.
 *
 * The shape RECURRED before it was caught: #1579 copied #1575's module-level
 * `Set` verbatim a release later. That recurrence is why this is a scan rather
 * than two fixed call sites — the next diagnostic would copy it again.
 *
 * ⚠ The rule is about ACCUMULATING state, not about module scope as such. A
 * frozen lookup table (`new Set(["a", "b"])`, never mutated) is fine and common
 * here; so is a `WeakMap` keyed by an object, which evicts with its key. The
 * scan therefore flags a module-level `Set` / `Map` only when the same file
 * mutates it at runtime.
 *
 * Not repo-wide on purpose: core's `nameToIDsCache` is a legitimate
 * module-global — its value is a pure function of its key, so it is
 * router-independent, and clearing it on one router's `dispose()` would evict
 * entries other routers rely on. The distinction is per-OBSERVER state ("have I
 * already told this developer about this?") versus a pure derivation.
 */
const DECLARATION = /^(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*new (Set|Map)\b/;

function collectTsFiles(root: string): string[] {
  const out: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);

      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith(".ts")) {
        out.push(full);
      }
    }
  }

  walk(root);

  return out;
}

/** `file:line  Set \`name\`` for every module-level cache the file mutates. */
function findAccumulatingCaches(root: string): string[] {
  const offenders: string[] = [];

  for (const file of collectTsFiles(root)) {
    const source = readFileSync(file, "utf8");

    source.split("\n").forEach((line, index) => {
      const match = DECLARATION.exec(line);

      if (!match) {
        return;
      }

      const [, name, kind] = match;
      const mutated = new RegExp(
        String.raw`\b${name}\.(?:add|set|delete)\s*\(`,
      ).test(source);

      if (mutated) {
        offenders.push(
          `${path.relative(root, file)}:${index + 1}  ${kind} \`${name}\``,
        );
      }
    });
  }

  return offenders;
}

describe("validation-plugin — no module-level accumulating cache (#1583)", () => {
  const SRC = path.resolve(__dirname, "../../src");

  it("keeps every runtime cache on the router, not on the module", () => {
    expect(findAccumulatingCaches(SRC)).toStrictEqual([]);
  });

  it("detects the shape it is meant to catch", () => {
    // Positive control, and it is not ceremony: the first version of this scan
    // silently matched nothing because its regex disallowed the space before
    // `=`. An empty result is only evidence when the scan is known to be able
    // to produce a non-empty one.
    const fixture = path.resolve(
      __dirname,
      "../fixtures/module-level-cache-sample",
    );

    expect(findAccumulatingCaches(fixture)).toStrictEqual([
      "offender.ts:1  Set `reported`",
    ]);
  });
});
