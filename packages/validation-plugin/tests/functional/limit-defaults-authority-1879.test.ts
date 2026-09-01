import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { CORE_LIMIT_DEFAULTS } from "../../src/helpers";

/**
 * The plugin's copy of core's limit defaults agrees with core (#1879).
 *
 * The values are core-internal and stay that way (owner decision, #1879), so the
 * plugin carries a copy. This file is what makes a drift a red test.
 *
 * ⚑ It reads what core **enforces** — the resolved bag on a router built with no
 * `limits` — rather than core's source text. So it is indifferent to where core
 * keeps the table, what it is called, and whether the value reaching a router
 * passed through anything on the way.
 *
 * ⚑ The scan below is the other half. Equality pins the ONE copy; the scan pins
 * that there is only one, so a literal re-inlined at a call site cannot drift
 * behind a green mirror.
 */

const SRC = path.resolve(__dirname, "../../src");

/** The one module allowed to spell a limit default. */
const OWNER = path.join(SRC, "helpers.ts");

interface Hit {
  readonly file: string;
  readonly text: string;
  readonly value: number;
}

/**
 * The two shapes a limit default was written in: `x ?? 50` and a parameter
 * default `max: number = 50`. Deliberately NOT "any numeric literal" — the
 * range table in `validators/options.ts` legitimately carries `10_000` and
 * `1000` as bounds, and neither shape can express that.
 */
function collectNumericDefaults(sourceText: string, fileName: string): Hit[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const hits: Hit[] = [];

  const record = (node: ts.Node, literal: ts.NumericLiteral): void => {
    hits.push({
      file: fileName,
      text: node.getText(sourceFile),
      value: Number(literal.text.replaceAll("_", "")),
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isNumericLiteral(node.right)
    ) {
      record(node, node.right);
    }

    if (
      ts.isParameter(node) &&
      node.initializer !== undefined &&
      ts.isNumericLiteral(node.initializer)
    ) {
      record(node, node.initializer);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return hits;
}

function coreEnforcedLimits(): Readonly<Record<string, number>> {
  const router = createRouter([{ name: "home", path: "/" }]);

  return getInternals(router).getCloneState().limits;
}

describe("limit defaults — the plugin mirrors core (#1879)", () => {
  it("holds the values core enforces", () => {
    const core = coreEnforcedLimits();

    // CONTROL: the core side is a real bag of numbers, so the comparison cannot
    // pass by both sides degenerating together.
    expect(Object.keys(core).length).toBeGreaterThanOrEqual(5);
    expect(
      Object.entries(core)
        .filter(([, value]) => !Number.isFinite(value))
        .map(([key]) => key),
    ).toStrictEqual([]);

    expect(CORE_LIMIT_DEFAULTS).toStrictEqual(core);
  });

  it("mirrors core's key set, not only its values", () => {
    const core = coreEnforcedLimits();

    expect(
      Object.keys(CORE_LIMIT_DEFAULTS).toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual(Object.keys(core).toSorted((a, b) => a.localeCompare(b)));
  });

  it("is the only copy — no other module spells a default", () => {
    const files = globSync(path.join(SRC, "**/*.ts"));

    // CONTROL: the glob reached the package. A zero-file scan finds no strays
    // for the same reason a clean one does.
    expect(files.length).toBeGreaterThanOrEqual(10);

    const defaults = new Set<number>(Object.values(CORE_LIMIT_DEFAULTS));

    expect(Object.keys(CORE_LIMIT_DEFAULTS).length).toBeGreaterThanOrEqual(5);
    expect(defaults.size).toBeGreaterThan(0);

    const strays = files
      .filter((file) => path.resolve(file) !== OWNER)
      .flatMap((file) =>
        collectNumericDefaults(
          readFileSync(file, "utf8"),
          path.relative(SRC, file),
        ),
      )
      .filter((hit) => defaults.has(hit.value));

    expect(strays).toStrictEqual([]);
  });

  it("scans for both shapes a default is written in", () => {
    const control = [
      "const a = opts.maxPlugins ?? 50;",
      "function f(maxListeners: number = 10_000) { return maxListeners; }",
      "const bounds = { maxListeners: { min: 0, max: 10_000 } };",
    ].join("\n");

    const hits = collectNumericDefaults(control, "control.ts");

    // The third line is the shape the scan must NOT claim: a bounds table.
    expect(
      hits.map((hit) => hit.value).toSorted((a, b) => a - b),
    ).toStrictEqual([50, 10_000]);
  });
});
