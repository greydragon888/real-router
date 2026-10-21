import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

/**
 * One construction of a `RouterError` in source, in either of its two arrival
 * forms: `new RouterError(code, bag)` or a raiser tag, `at.code(code, bag)`.
 */
export interface RefusalSite {
  /** Relative to the walked root. */
  readonly file: string;
  readonly form: "new" | "tag";
  readonly node: ts.NewExpression | ts.CallExpression;
  readonly code: ts.Expression | undefined;
  readonly bag: ts.Expression | undefined;
  readonly source: ts.SourceFile;
}

const isRaiserTag = (
  node: ts.Node,
): node is ts.CallExpression & { expression: ts.PropertyAccessExpression } =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === "code" &&
  ts.isTaggedTemplateExpression(node.parent) &&
  node.parent.tag === node;

/**
 * Every refusal under `root`, found by SHAPE in one walk (#2538).
 *
 * ⚠ Both forms, because each reader of this population asks about both: a walk
 * over `new RouterError` alone is blind to every site the raiser converted to a
 * tag, and reports that blindness as a clean result.
 */
export function refusalSites(root: string): RefusalSite[] {
  const found: RefusalSite[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );
    const relative = path.relative(root, file);

    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "RouterError"
      ) {
        found.push({
          file: relative,
          form: "new",
          node,
          code: node.arguments?.[0],
          bag: node.arguments?.[1],
          source,
        });
      } else if (isRaiserTag(node)) {
        found.push({
          file: relative,
          form: "tag",
          node,
          code: node.arguments[0],
          bag: node.arguments[1],
          source,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

/**
 * Inside a suite that does not run as written: a `describe` with any modifier
 * but `.each` — `.skip`, `.todo`, `.skipIf(…)`, `.only` among them.
 */
function inDisabledSuite(node: ts.Node): boolean {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (!ts.isCallExpression(at)) {
      continue;
    }

    const callee = ts.isCallExpression(at.expression)
      ? at.expression.expression
      : at.expression;

    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      (callee.expression.text === "describe" ||
        callee.expression.text === "suite") &&
      callee.name.text !== "each"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * The titles of the cells a test file RUNS: `it`, `test` and their `.each`.
 * A `.skip`, `.todo` or `.only` cell holds nothing for a census that names
 * cells, and nor does a cell of a suite that does not run as written.
 */
export function cellTitlesOf(text: string, tsx: boolean): Set<string> {
  const titles = new Set<string>();
  const source = ts.createSourceFile(
    tsx ? "cells.tsx" : "cells.ts",
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isCallExpression(node.expression)
        ? node.expression.expression
        : node.expression;
      const base = ts.isPropertyAccessExpression(callee)
        ? callee.expression
        : callee;
      const runs =
        !ts.isPropertyAccessExpression(callee) || callee.name.text === "each";
      const [title] = node.arguments;

      if (
        ts.isIdentifier(base) &&
        (base.text === "it" || base.text === "test") &&
        runs &&
        title !== undefined &&
        ts.isStringLiteralLike(title) &&
        !inDisabledSuite(node)
      ) {
        titles.add(title.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return titles;
}
