// The committed state can only change through the transition TABLE.
//
// This is the sibling of `fsm-state-authority.test.ts` one layer up: that one
// locks "the FSM's own state moves only through `send()`", this one locks the
// same thing for the state the ROUTER publishes. It became writable only after
// the two non-navigation commits (`navigateToNotFound`, `replace()`'s
// revalidation) stopped writing and announcing themselves — before that it
// would have been red by construction, which is why the plan puts it here and
// not earlier (`fsm-as-state-owner-2026-07-31.md` §12.1).
//
// It is a CLOSED-SET assertion, not an absence one. "Nobody writes the cells"
// is false and always will be — updates on the table's edges write them, and
// `clear()` still resets the pair on a stopped router. What must stay true is
// that the set of writers is exactly the declared one, so a future commit path
// cannot quietly appear beside them.
//
// Discriminating power (checked, not assumed): re-introducing any direct
// `ctx.current = …` / `state.set(…)` outside the allowed files reds this.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const SRC_DIR = path.resolve(__dirname, "../../src");
const FSM_FILE = path.join(SRC_DIR, "routerFSM.ts");

/**
 * The only file allowed to write the committed-state cells.
 *
 * - `routerFSM.ts` — the table itself. Every navigation commit, the system
 *   commit, `stop()` and `dispose()` land here as edge `update`s.
 *
 * ⚑ `StateNamespace.ts` was the second entry until #1749. It held the shift
 * primitive `clear()` used, and that primitive was reachable from the PUBLISHED
 * `./validation` subpath through `getInternals(router).clearState()` with no
 * precondition in front of it — the guard #1612 wrote lives in `clear()`, not
 * in the cells. The table is the sole writer now.
 */
const ALLOWED_WRITERS = new Set([path.join(SRC_DIR, "routerFSM.ts")]);

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }

  return out;
}

/**
 * 1-based lines of any assignment to a `.current` / `.previous` property.
 *
 * ⚠ **Every assignment operator, not just `=` (#1683).** This is an AUTHORITY
 * check, so a write the scan does not match is a false NEGATIVE — the offender
 * passes. It matched `EqualsToken` alone until the sibling defect in
 * `dispatch-depth-balance.test.ts` was fixed and the same shape was looked for
 * here; measured on a probe class outside `ALLOWED_WRITERS`, all three writing
 * the cell identically: `ctx.current = x` was caught, `ctx.current ??= x` and
 * `ctx.current ||= x` were not.
 *
 * The range covers the whole assignment family — 16 operators, including the
 * logical ones — and excludes every comparison, so a future operator is in
 * scope by construction rather than by enumeration.
 *
 * ⚠ **And every ACCESS FORM, which is a second axis (#1749).** The operator
 * range says nothing about how the cell is named. Measured on the same probe
 * class, with the `readonly` type guard measured beside it:
 *
 * | write                                  | `readonly` | this scan |
 * | -------------------------------------- | ---------- | --------- |
 * | `ctx.current = x`                      | `TS2540`   | caught    |
 * | `ctx["previous"] = x`                  | `TS2540`   | ADDED     |
 * | `Object.assign(ctx, { current: x })`   | **passes** | ADDED     |
 *
 * The third row is why both mechanisms are here: `readonly` does not survive
 * `Object.assign`'s typing, and the issue that introduced the type guard
 * predicted this scan would already cover it — measured, it did not. Neither
 * caught it until this pass. An unrelated `Object.assign` is NOT flagged (the
 * literal must name a cell), which is the control that keeps the widening from
 * being a blanket match.
 */
/** The cell a write targets, for either access form — `.current` or `["current"]`. */
function cellName(
  left: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): "current" | "previous" | undefined {
  let text: string | undefined;

  if (ts.isPropertyAccessExpression(left)) {
    text = left.name.text;
  } else if (ts.isStringLiteralLike(left.argumentExpression)) {
    text = left.argumentExpression.text;
  }

  return text === "current" || text === "previous" ? text : undefined;
}

function cellWrites(file: string): number[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: number[] = [];

  /** `Object.assign(target, { current, previous })` — the third write shape. */
  const isCellAssign = (node: ts.Node): boolean =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Object" &&
    node.expression.name.text === "assign" &&
    node.arguments.some(
      (argument) =>
        ts.isObjectLiteralExpression(argument) &&
        argument.properties.some(
          (property) =>
            property.name !== undefined &&
            ts.isIdentifier(property.name) &&
            (property.name.text === "current" ||
              property.name.text === "previous"),
        ),
    );

  const visit = (node: ts.Node): void => {
    if (isCellAssign(node)) {
      hits.push(
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      );
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      (ts.isPropertyAccessExpression(node.left) ||
        ts.isElementAccessExpression(node.left)) &&
      cellName(node.left) !== undefined
    ) {
      hits.push(
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

describe("Committed-state authority — no commit outside the machine", () => {
  it("only the table and the state service write the cells", () => {
    const offenders = tsFiles(SRC_DIR)
      .filter((file) => !ALLOWED_WRITERS.has(file))
      .map((file) => ({
        file: path.relative(SRC_DIR, file),
        at: cellWrites(file),
      }))
      .filter((entry) => entry.at.length > 0);

    expect(offenders).toStrictEqual([]);
  });

  it("the table is where the commits live — every one of them", () => {
    const table = readFileSync(path.join(SRC_DIR, "routerFSM.ts"), "utf8");

    // Each of the four write shapes the machine performs, by the update that
    // performs it. Losing any one of them means a commit path drifted back out
    // of the table without this file noticing.
    for (const update of [
      "commitNavigation", // COMPLETE — the navigation commit
      "commitSystemState", // SYSTEM_COMMIT — 404 bypass + replace() revalidation
      "clearCurrent", // STOP — shifts the pair
      "resetState", // DISPOSE — zeroes both, no shift
    ]) {
      expect(table).toContain(`update: ${update}`);
    }
  });

  it("the cells refuse a foreign write at COMPILE time, not on the next tier run", () => {
    // ⚑ The scan above is a text pass over `src`; this is the same rule as a
    // TYPE (#1749). `readonly` on the two cells makes a write from any module
    // that holds a `RouterFSMContext` a `TS2540` at the moment of the edit —
    // including the shapes the scan structurally cannot see, `ctx["current"]`
    // among them (verified: a planted write in `StateNamespace` fails
    // `type-check` on BOTH the dot and the element form).
    //
    // Asserted on the AST rather than by importing the type: a functional test
    // may not reach into `src/*`, and `RouterFSMContext` has no public surface
    // to reach it through.
    const source = ts.createSourceFile(
      FSM_FILE,
      readFileSync(FSM_FILE, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const cells = new Map<string, boolean>();

    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertySignature(node) &&
        ts.isIdentifier(node.name) &&
        (node.name.text === "current" || node.name.text === "previous") &&
        ts.isInterfaceDeclaration(node.parent) &&
        node.parent.name.text === "RouterFSMContext"
      ) {
        cells.set(
          node.name.text,
          node.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword,
          ) === true,
        );
      }

      ts.forEachChild(node, visit);
    };

    visit(source);

    // `size` first: it is what makes the two lookups below non-vacuous — a
    // renamed interface or a moved declaration would otherwise leave both
    // `undefined` and the assertions would have nothing to compare.
    expect(cells.size).toBe(2);
    expect(cells.get("current")).toBe(true);
    expect(cells.get("previous")).toBe(true);

    // The other half of the mechanism: the table's own `update`s take the
    // module-private mutable view, which is what keeps `readonly` compiling
    // here while forbidding it everywhere else. Widening them back to
    // `RouterFSMContext` would make the modifier unenforceable from inside.
    const text = readFileSync(FSM_FILE, "utf8");

    for (const update of ["commitState", "clearCurrent", "resetState"]) {
      expect(text).toContain(`const ${update} = (ctx: MutableRouterFSMContext`);
    }
  });

  it("the PUBLISHED internals surface carries no way to drop the pair", async () => {
    // ⚑ The layers above scan `src`, so an EXTERNAL caller is outside their
    // reach by construction — which is exactly how #1749 stood: `getInternals`
    // is re-exported from the published `./validation` subpath, and its
    // `clearState` member reached the write primitive with no precondition.
    // Calling it on a live router dropped the committed state with no event of
    // any kind: `router.subscribe` consumers kept rendering a discarded route,
    // `isActive()` stayed `true` with `getState()` `undefined`, and the #1172
    // guard then answered `ROUTER_NOT_STARTED` on a started router.
    //
    // Asserted at RUNTIME rather than on the type, because the type is what an
    // external caller can cast away — the member simply must not be there.
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    await router.start("/a");
    await router.navigate("b");

    const bag = getInternals(router) as unknown as Record<string, unknown>;

    expect(Object.keys(bag)).not.toContain("clearState");

    // CONTROL — the bag is the real one, and it still carries the members it
    // is supposed to, so the assertion above pins an absence rather than a
    // mistyped lookup on an empty object.
    expect(Object.keys(bag)).toContain("systemCommit");
    expect(router.getState()?.name).toBe("b");

    router.dispose();
  });
});
