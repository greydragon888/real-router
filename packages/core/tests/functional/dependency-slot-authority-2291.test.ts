// #2291 — the dependency store's `dependencies` slot has ONE writer.
//
// `clearDependencies` empties the store by replacing that slot, and
// `storeDependency`'s plain assignment is safe only because the replacement is
// `Object.create(null)`. A second site assigning the slot would have to remember
// the prototype on its own, and nothing else in the suite looks at the shape of
// the record it installs — so the set of writers is DERIVED from the source tree
// here rather than trusted.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `computed-key-write-authority-1852.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }

  return out;
}

/** `x.dependencies` or `x["dependencies"]` on the left of an assignment. */
function isSlot(target: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(target)) {
    return target.name.text === "dependencies";
  }

  return (
    ts.isElementAccessExpression(target) &&
    ts.isStringLiteralLike(target.argumentExpression) &&
    target.argumentExpression.text === "dependencies"
  );
}

const isAssignment = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/** The name of the function a node sits in, for a readable site key. */
function enclosingName(node: ts.Node): string {
  for (let at = node.parent as ts.Node | undefined; at; at = at.parent) {
    if (
      (ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at)) &&
      at.name
    ) {
      return at.name.getText();
    }

    if (ts.isVariableDeclaration(at) || ts.isPropertyAssignment(at)) {
      return at.name.getText();
    }
  }

  return "<module>";
}

/** Every assignment to the slot in one source, keyed `file · function`. */
function slotWrites(file: string, text: string): string[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const sites: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      isAssignment(node.operatorToken.kind) &&
      isSlot(node.left)
    ) {
      sites.push(`${path.relative(SRC_DIR, file)} · ${enclosingName(node)}`);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return sites;
}

describe("the dependency store's slot has one writer (#2291)", () => {
  it("only `clearDependencies` assigns `dependencies`", () => {
    const sites = tsFiles(SRC_DIR).flatMap((file) =>
      slotWrites(file, readFileSync(file, "utf8")),
    );

    expect(sites).toStrictEqual(["dependenciesStore.ts · clearDependencies"]);
  });

  it("CONTROL — the scan reports every assignment form it claims to", () => {
    const planted = slotWrites(
      path.join(SRC_DIR, "planted.ts"),
      [
        "function dotted(s) { s.dependencies = {}; }",
        'function keyed(s) { s["dependencies"] = {}; }',
        "function compound(s) { s.dependencies ??= {}; }",
        "function unrelated(s) { s.limits = {}; }",
        "function literal() { return { dependencies: {} }; }",
      ].join("\n"),
    );

    expect(planted).toStrictEqual([
      "planted.ts · dotted",
      "planted.ts · keyed",
      "planted.ts · compound",
    ]);
  });
});
