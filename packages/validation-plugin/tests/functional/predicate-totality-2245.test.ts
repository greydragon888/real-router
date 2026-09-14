import { readFileSync } from "node:fs";
import path from "node:path";

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Params, Route, Router } from "@real-router/core";

/**
 * Core documents two predicates as TOTAL, and installing this plugin makes both
 * of them throw (#2245).
 *
 * `canNavigateTo` #5 and `isActiveRoute` #9 both read "Total — no input makes it
 * throw", and bare core upholds them. This plugin's argument validators run at
 * the top of each door, OUTSIDE the `try`/`catch` that makes the predicate total
 * — so the same input that answers `false` in production throws in development.
 *
 * ⚑ **The throw is deliberate and stays.** `validators/routes.ts` records it:
 * naming the offending key is the whole product of the value walk, and moving the
 * walk inside the guarded region would convert it to `false` plus a
 * `logger.warn` that a render swallows — the condition #1577 exists to avoid.
 * What #2245 corrected is the INVARIANTS rows, which stated totality as a
 * property of the DOOR while it is a property of BARE CORE. This file is the
 * other half: the qualification is prose, and prose is what put the unqualified
 * claim there.
 *
 * ⚠ **The divergence is PARTIAL, and that is the reason for a table rather than
 * a rule.** `canNavigateTo` runs the value walk and throws on three of the four
 * inputs below; `isActiveRoute` checks shape only and throws on one. A cell
 * asserting "the plugin throws" would be false for half the table and would go
 * stale in whichever direction moved.
 *
 * ⚑ **The door list is DERIVED from core's INVARIANTS, never listed here.** A
 * third row claiming totality reds this file until someone measures it, which is
 * the half a hand-written pair cannot hold: the rows and the doors that honour
 * them are edited by different people at different times.
 *
 * ⚑ It lives HERE and not in core for the reason `bare-core-message-parity`
 * states: core devDepends only on `@real-router/ssr-utils`, so the two layers can
 * only be compared from this side.
 */

const INVARIANTS = path.resolve(__dirname, "../../../core/INVARIANTS.md");

/** Every door whose INVARIANTS table claims totality, by section heading. */
const totalDoors = (): string[] => {
  const doors: string[] = [];
  let section: string | undefined;

  for (const line of readFileSync(INVARIANTS, "utf8").split("\n")) {
    const heading = /^## (?<name>\S+)\s*$/u.exec(line);

    if (heading?.groups?.name !== undefined) {
      section = heading.groups.name;
    }

    if (/^\|\s*\d+\w?\s*\|\s*Total — no input makes it throw/u.test(line)) {
      if (section === undefined) {
        throw new Error(
          `a totality row appears before any "## <door>" heading in ${INVARIANTS} — ` +
            "the walk cannot say which door it belongs to",
        );
      }

      doors.push(section);
    }
  }

  if (doors.length === 0) {
    throw new Error(
      `no totality row found in ${INVARIANTS} — this file binds rows that no ` +
        "longer exist, so it cannot say whether core and this plugin still agree",
    );
  }

  return doors;
};

const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id" },
];

/**
 * ⚠ Built through `String.fromCodePoint`, not a literal: a raw control character
 * in a source file is invisible in review and in most diffs.
 */
const CONTROL_CHAR = `a${String.fromCodePoint(1)}b`;

const INPUTS: Readonly<Record<string, unknown>> = {
  "a symbol value": { id: Symbol("x") },
  "a non-object bag": "not-an-object",
  "a control character": { id: CONTROL_CHAR },
  "a valid bag": { id: "ok" },
};

interface Cell {
  readonly door: string;
  readonly input: string;
  /** What the door does once `validationPlugin()` is installed. */
  readonly withPlugin: "answers" | "throws";
}

/**
 * Measured on `master`. Bare core ANSWERS every cell — that half is the
 * invariant and is asserted for all of them, so it is not repeated per row.
 */
const CELLS: readonly Cell[] = [
  { door: "canNavigateTo", input: "a symbol value", withPlugin: "throws" },
  { door: "canNavigateTo", input: "a non-object bag", withPlugin: "throws" },
  { door: "canNavigateTo", input: "a control character", withPlugin: "throws" },
  { door: "canNavigateTo", input: "a valid bag", withPlugin: "answers" },
  { door: "isActiveRoute", input: "a symbol value", withPlugin: "answers" },
  { door: "isActiveRoute", input: "a non-object bag", withPlugin: "throws" },
  {
    door: "isActiveRoute",
    input: "a control character",
    withPlugin: "answers",
  },
  { door: "isActiveRoute", input: "a valid bag", withPlugin: "answers" },
];

const build = (withPlugin: boolean): Router => {
  const router = createRouter([...ROUTES]);

  if (withPlugin) {
    router.usePlugin(validationPlugin());
  }

  return router;
};

const labelled = (cells: readonly Cell[]): (readonly [string, Cell])[] =>
  cells.map((cell) => [`${cell.door} · ${cell.input}`, cell] as const);

/**
 * ⚠ Split ONCE, and read by both the `each` lists and the CONTROL. Filtering
 * twice would let a typo in one predicate empty an `each` — which registers zero
 * cases silently — while the CONTROL's own copy kept answering that the table
 * still discriminates.
 */
const REFUSED = CELLS.filter((cell) => cell.withPlugin === "throws");
const ANSWERED = CELLS.filter((cell) => cell.withPlugin === "answers");

const ask = (router: Router, door: string, params: unknown): unknown =>
  door === "canNavigateTo"
    ? router.canNavigateTo("u", params as Params)
    : router.isActiveRoute("u", params as Params);

describe("core's total predicates against this plugin (#2245)", () => {
  it("covers exactly the doors core's INVARIANTS call total", () => {
    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect(
      [...new Set(CELLS.map((cell) => cell.door))].toSorted(byName),
    ).toStrictEqual(totalDoors().toSorted(byName));
  });

  // Bare core upholds the invariant for EVERY cell — including the ones the
  // plugin refuses, which is the whole content of the divergence. Asserted over
  // the undivided table so the split below cannot quietly drop a row.
  it.each(labelled(CELLS))("bare core answers — %s", (_label, cell) => {
    const bare = build(false);

    expect(typeof ask(bare, cell.door, INPUTS[cell.input])).toBe("boolean");

    bare.stop();
  });

  // ⚠ Two blocks rather than one with a branch inside: `vitest/no-conditional-expect`
  // is right here, and the split is also what lets each half name its own outcome.
  // Either half emptying is caught by the CONTROL below, not by these.
  it.each(labelled(REFUSED))("the plugin REFUSES — %s", (_label, cell) => {
    const guarded = build(true);

    expect(() => ask(guarded, cell.door, INPUTS[cell.input])).toThrow(
      TypeError,
    );

    guarded.stop();
  });

  it.each(labelled(ANSWERED))("the plugin ANSWERS — %s", (_label, cell) => {
    const guarded = build(true);

    expect(typeof ask(guarded, cell.door, INPUTS[cell.input])).toBe("boolean");

    guarded.stop();
  });

  it("CONTROL — the table carries BOTH outcomes, so neither is by construction", () => {
    // Without this, a change that made the plugin refuse (or admit) everything
    // would be recorded row by row and read as a table that still discriminates.
    // It is also the threshold for the two filtered `each` lists above: an empty
    // one registers ZERO cases and the file silently loses a half.
    expect(REFUSED.length).toBeGreaterThan(0);
    expect(ANSWERED.length).toBeGreaterThan(0);
    expect(REFUSED.length + ANSWERED.length).toBe(CELLS.length);
    expect(new Set(CELLS.map((cell) => cell.withPlugin))).toStrictEqual(
      new Set(["answers", "throws"]),
    );
  });
});
