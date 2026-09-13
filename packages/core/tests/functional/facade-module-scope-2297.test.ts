import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `Router.ts` holds the facade and what the facade itself uses — nothing else
 * at module scope (#2297).
 *
 * The Options adoption grew at the bottom of this file one helper per fix, each
 * placed beside the constructor line that called it. It lives with the options
 * record in `namespaces/OptionsNamespace/`, and this pin makes the next
 * module-level function a decision rather than a drift: extend the list only
 * for a function the class itself uses and no subsystem owns.
 */

const ROUTER = path.resolve(__dirname, "../../src/Router.ts");

const source = ts.createSourceFile(
  ROUTER,
  readFileSync(ROUTER, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

const isFunctionValue = (node: ts.Expression): boolean =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** Functions declared at module scope — declarations and function-valued `const`s alike. */
function moduleFunctions(): string[] {
  const names: string[] = [];

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      names.push(statement.name.text);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          declaration.initializer !== undefined &&
          isFunctionValue(declaration.initializer) &&
          ts.isIdentifier(declaration.name)
        ) {
          names.push(declaration.name.text);
        }
      }
    }
  }

  return names.toSorted((left, right) => left.localeCompare(right));
}

/** Every identifier the `Router` class refers to, anywhere in its body. */
function classReferences(): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      found.add(node.text);
    }

    ts.forEachChild(node, visit);
  };

  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name?.text === "Router") {
      visit(statement);
    }
  }

  return found;
}

describe("Router.ts keeps no module-level logic of its own (#2297)", () => {
  const functions = moduleFunctions();

  it("its module-level functions are the two the class uses", () => {
    expect(functions).toStrictEqual(["snapshotForwarded", "throwDisposed"]);
  });

  it("CONTROL — the class refers to each of them, so the pin names live code", () => {
    const references = classReferences();

    expect(references.size).toBeGreaterThan(0);
    expect(functions.filter((name) => !references.has(name))).toStrictEqual([]);
  });
});
