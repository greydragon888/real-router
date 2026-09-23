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
