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

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * The only files allowed to write the committed-state cells, and why.
 *
 * - `routerFSM.ts` — the table itself. Every navigation commit, the system
 *   commit, `stop()` and `dispose()` land here as edge `update`s.
 * - `StateNamespace.ts` — the state SERVICE. It owns the shift primitive that
 *   `clear()` still needs; every other caller of it died when the writes moved
 *   onto the edges.
 */
const ALLOWED_WRITERS = new Set([
  path.join(SRC_DIR, "routerFSM.ts"),
  path.join(SRC_DIR, "namespaces/StateNamespace/StateNamespace.ts"),
]);

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
 */
function cellWrites(file: string): number[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: number[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isPropertyAccessExpression(node.left) &&
      (node.left.name.text === "current" || node.left.name.text === "previous")
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

  it("the state service is reachable for writing from exactly one caller", () => {
    // `clear()` is the last non-table writer, and it is legal only on a stopped
    // router (#1612), i.e. only when there is no committed state to lose. Any
    // SECOND caller appearing here is a new commit path.
    const callers = tsFiles(SRC_DIR)
      .filter((file) => !ALLOWED_WRITERS.has(file))
      .filter((file) => readFileSync(file, "utf8").includes(".clearCommitted("))
      .map((file) => path.relative(SRC_DIR, file));

    expect(callers).toStrictEqual(["Router.ts"]);
  });
});
