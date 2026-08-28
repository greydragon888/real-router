// Every object-valued export of `src/constants.ts` is frozen — and the set is
// DERIVED, never listed here.
//
// The file is a constants module, so "frozen" ought to be uniform. It was not:
// `errorCodes` carried `Object.freeze` and a docblock saying *"Frozen to prevent
// accidental modifications"*, while `constants`, `events`, `plugins` and
// `DEFAULT_LIMITS` beside it carried neither, with nothing in the file saying why
// the split existed (#1959). Half the module was mutable module state that core
// reads at RUNTIME — `constants.UNKNOWN_ROUTE` at 8 sites, `events.*` at 11 — so
// a write re-wired the router process-wide and survived across routers.
//
// ⚠ TWO LAYERS, because neither alone is enough and they fail differently.
//
// The RUNTIME layer asks the real question — `Object.isFrozen` on what a
// consumer actually holds — but it can only see the three records the package
// exports. It is the layer that would catch a freeze defeated somewhere other
// than the declaration.
//
// The SOURCE layer covers all eight, including `plugins` and `DEFAULT_LIMITS`,
// which no consumer can reach and which the runtime layer is therefore blind
// to. Those two are not a hazard — nothing can mutate what it cannot import —
// but they are what makes the module's rule uniform, and an unpinned freeze is
// one refactor away from being dropped as noise.
//
// ⚠ The names come from the SOURCE TEXT, not from a list in this file. A hand
// list is the exact failure this guard exists to prevent: `constants.ts` grew
// four frozen records and four unfrozen ones without anyone noticing, and a
// list would have been written from the same blind spot. Reading `export const`
// off the file means a NINTH record has to answer the question rather than
// inherit the gap.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../src/constants.ts"),
  "utf8",
);

/**
 * Each `export const NAME = <head>`, with `<head>` long enough to tell an
 * object literal from an `Object.freeze(` call and from everything else
 * (strings, numbers, `new Map`). Anything that is not an object literal is not
 * this guard's business.
 */
const PREFIX = "export const ";

const declarations = [...SOURCE.matchAll(/^export const .+$/gm)]
  .map(([line]) => {
    // Split on the first `=` rather than matching around it: a single pattern
    // spanning the name AND the type annotation makes `\w+` and `[^=]*` overlap,
    // which is genuine backtracking (`sonarjs/super-linear-regex`) for no gain.
    const eq = line.indexOf("=");

    return {
      head: line
        .slice(eq + 1)
        .trim()
        .slice(0, 14),
      name: line.slice(PREFIX.length, eq).split(":", 1)[0].trim(),
    };
  })
  .filter(({ name }) => name.length > 0);

const objectLiterals = declarations.filter(
  ({ head }) => head.startsWith("{") || head.startsWith("Object.freeze("),
);

/** The records a consumer can actually reach, for the runtime layer. */
const EXPORTED_RECORDS: readonly (readonly [string, object])[] = [
  ["constants", constants],
  ["errorCodes", errorCodes],
  ["events", events],
];

describe("constants.ts freeze authority (#1959)", () => {
  it("finds the module's object-literal exports", () => {
    // A positive control on the derivation itself: an empty or one-element set
    // makes every assertion below pass vacuously, and the regex is the one part
    // of this guard that can silently stop matching.
    expect(objectLiterals.length).toBeGreaterThanOrEqual(8);
    expect(objectLiterals.map(({ name }) => name)).toStrictEqual(
      expect.arrayContaining([
        "DEFAULT_LIMITS",
        "constants",
        "errorCodes",
        "events",
        "plugins",
      ]),
    );
  });

  it.each(objectLiterals)(
    "source: $name is declared inside Object.freeze",
    ({ head, name }) => {
      expect(`${name}: ${head}`).toBe(`${name}: Object.freeze(`);
    },
  );

  it("carries every record the package exports", () => {
    // Counted outside the `each` below, per `table-vacuity-authority`: an
    // `it.each` over an empty table registers no cells and still exits green.
    expect(EXPORTED_RECORDS).toHaveLength(3);
  });

  // The three the package actually hands to a consumer, asked the real question.
  it.each(EXPORTED_RECORDS)(
    "runtime: the exported %s is frozen",
    (_name, value) => {
      expect(Object.isFrozen(value)).toBe(true);
    },
  );
});
