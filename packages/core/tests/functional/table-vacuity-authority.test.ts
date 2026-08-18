import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every table-driven cell set that can silently register ZERO cells.
 *
 * ⚑ `it.each([])` and `describe.each([])` register **no cells, in silence** — the
 * file exits 0 and reads as green. A table that shrinks to nothing therefore
 * looks exactly like a table that passes, and the only thing that discriminates
 * is a COUNT asserted outside the `each`.
 *
 * The convention exists and is written down in several files. It is also, as of
 * this table, honoured in **2 of 34** places — which is why it is now mechanical
 * rather than remembered. It bit twice in one afternoon: a list restructured into
 * an `it.each` lost its four standalone cells, and two lists added to a file
 * whose own CONTROL cell exists to prevent exactly that arrived without one.
 *
 * A set is vacuity-capable when its `each` argument is either:
 *
 * - an **inline array literal**, which nothing outside the call can reference,
 *   let alone count; or
 * - a **named identifier with no length assertion in the same file** — countable,
 *   uncounted.
 *
 * ⚑ **This is a RATCHET, and the exact set is what makes it one.** A new
 * vacuity-capable table reds it: the author must either add a count or record
 * the row. Removing one reds it too, and that is deliberate — a
 * `toBeLessThanOrEqual(32)` would develop slack with the first fix, and slack of
 * exactly one row is the defect that let a relation be deleted in silence from
 * `type-mirror-authority` earlier the same day.
 *
 * ⚠ The list below is a BACKLOG, not an approval. Fixing an entry means hoisting
 * the literal to a named const and asserting its length outside the `each` — then
 * deleting the row here.
 *
 * Sibling authorities: `chain-walk-authority`, `read-count-authority`,
 * `type-mirror-authority`, `tree-mutator-guard-authority-1751`.
 */
/** Byte order — `localeCompare` would reorder the frozen list per locale. */
function byteOrder(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

describe("table-driven cell sets that can register zero cells", () => {
  const TESTS = path.resolve(__dirname, "..");

  function scan(): string[] {
    const found: string[] = [];

    for (const file of globSync(`${TESTS}/**/*.ts`)) {
      const text = readFileSync(file, "utf8");
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TS,
      );
      const relativePath = path.relative(TESTS, file);

      /** A length assertion on `name`, anywhere in the same file. */
      const isCounted = (name: string): boolean =>
        new RegExp(
          String.raw`expect\(\s*${name}[\s\S]{0,80}?(toHaveLength|\.length)`,
        ).test(text) ||
        new RegExp(
          String.raw`expect\(\s*Object\.(keys|values|entries)\(\s*${name}`,
        ).test(text);

      const walk = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "each" &&
          ["it", "describe", "test"].includes(
            node.expression.expression.getText(source),
          )
        ) {
          const table = node.arguments[0];

          if (table && ts.isArrayLiteralExpression(table)) {
            found.push(`${relativePath} · <inline>`);
          } else if (
            table &&
            ts.isIdentifier(table) &&
            !isCounted(table.text)
          ) {
            found.push(`${relativePath} · ${table.text}`);
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }

    // Byte order, so the frozen list below reads the same on any locale.
    return found.toSorted(byteOrder);
  }

  it("the backlog is exactly this, and it only shrinks", () => {
    expect(scan()).toStrictEqual([
      "engine/property/gate-backstop-parity.properties.ts · SCANS",
      "engine/unit/path-matcher/SegmentMatcher.test.ts · <inline>",
      "engine/unit/path-matcher/buildParamMeta.test.ts · <inline>",
      "engine/unit/path-matcher/buildParamMeta.test.ts · <inline>",
      "functional/api/getRoutesApi/guard-factory-records-1801.test.ts · <inline>",
      "functional/api/getRoutesApi/guard-factory-records-1801.test.ts · <inline>",
      "functional/api/getRoutesApi/guard-factory-records-1801.test.ts · <inline>",
      "functional/api/getRoutesApi/guard-factory-records-1801.test.ts · <inline>",
      "functional/api/getRoutesApi/guard-factory-records-1801.test.ts · <inline>",
      "functional/api/getRoutesApi/guard-factory-records-1801.test.ts · <inline>",
      "functional/api/getRoutesApi/mutator-diagnostics-1756.test.ts · CELLS",
      "functional/events/reentrant-crud-ban.test.ts · REENTRANT_OPS",
      "functional/fsm-edge-reachability.test.ts · ARCS",
      "functional/navigation/born-dead-navigation-1648.test.ts · SOURCES",
      "functional/navigation/bridge-implies-suspendable-1705.test.ts · CELLS",
      "functional/navigation/cancellability-scope-1716.test.ts · ARCS",
      "functional/navigation/cancellation-stops-the-guard-walk-1687.test.ts · POINTS",
      "functional/navigation/controller-ownership-1684.test.ts · ARCS",
      "functional/navigation/entry-abort-boundary.test.ts · <inline>",
      "functional/navigation/external-signal-bridge-1684.test.ts · CELLS",
      "functional/navigation/external-signal-bridge-1684.test.ts · ENTRY_POINTS",
      "functional/navigation/navigateToNotFound.test.ts · <inline>",
      "functional/navigation/pre-commit-refusal-1644.test.ts · <inline>",
      "functional/navigation/pre-start-window-1610.test.ts · cases",
      "functional/routerLifecycle/start/boundary-gaps.test.ts · <inline>",
      "functional/routerLifecycle/start/boundary-gaps.test.ts · <inline>",
      "functional/routes/matchPath.test.ts · <inline>",
      "functional/state/producer-agreement-phase2.test.ts · <inline>",
      "functional/transitionPath.test.ts · <inline>",
      "functional/utils/fsm/fsm.test.ts · <inline>",
      "functional/utils/fsm/fsm.test.ts · <inline>",
      "property/cancellation.properties.ts · CELLS",
    ]);
  });

  it("CONTROL — the scanner reaches the tree and recognises a counted table", () => {
    // ⚑ The instrument failing open is the one outcome this file cannot afford:
    // a scanner that stopped walking reports an empty list, and an empty list
    // would be indistinguishable from "the backlog is cleared". So the walk must
    // demonstrably reach files, and the `isCounted` half must demonstrably
    // EXCLUDE something — otherwise every named table would be reported and the
    // backlog above would be a different, larger list that nobody notices is
    // wrong.
    const files = globSync(`${TESTS}/**/*.ts`);

    expect(files.length).toBeGreaterThan(200);

    // This file's own tables are counted, and so is `hostile-bags-battery`'s —
    // proof the exclusion works rather than the regexes never matching.
    expect(scan()).not.toContain(
      "functional/hostile-bags-battery.test.ts · CONTAINER_SHAPES",
    );
  });
});
