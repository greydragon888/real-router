// The navigation plan is born in its final shape — every field of its type is
// in the literal, including the optional ones.
//
// This is a PERFORMANCE invariant with no functional symptom, which is why it
// needs a test at all: `plan.controller = c` and `plan.detachExternalBridge =
// undefined` behave identically whether or not the field was declared, so
// nothing in the functional suite can tell the two apart. What differs is the
// object's hidden class. A write to an absent property transitions it, the plan
// is allocated per navigation, and every reader downstream — `planPhases`,
// `completeImmediate`, `completeTransition`, `buildTransitionMeta` — then sees
// two maps instead of one.
//
// The cost was measured on the CodSpeed runner with one variable (#1693):
// omitting the two optional fields cost 10–27% on every `navigate/*` benchmark
// and 42% on `navigate/sync-baseline`, while `matchPath/*`, `buildPath/*` and
// `state/*` — which never touch a plan — did not move at all.
//
// ⚠ The assertion is CLOSED-SET over the TYPE, not a check for the two names
// that happen to be optional today. A third optional field added to
// `NavigationContext` and assigned after construction would re-open exactly the
// same hole, silently; keying on the interface is what makes this test notice.
//
// The scan keys on the type ANNOTATION at an object literal (`: NavigationPlan
// = {…}`), the same discipline as `state-freeze-authority.test.ts`: property
// names alone would match reads and spreads that build no plan.

import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const NS_DIR = path.resolve(
  __dirname,
  "../../src/namespaces/NavigationNamespace",
);
const TYPES_FILE = path.join(NS_DIR, "types.ts");
const EXECUTE_FILE = path.join(NS_DIR, "transition/executeNavigation.ts");

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** Property names declared by `interface <name>` in `types.ts`. */
function interfaceProperties(source: ts.SourceFile, name: string): string[] {
  const names: string[] = [];

  source.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== name) {
      return;
    }

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
        names.push(member.name.text);
      }
    }
  });

  return names;
}

/** Property names of every object literal annotated `: NavigationPlan`. */
function planLiterals(source: ts.SourceFile): string[][] {
  const literals: string[][] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.type !== undefined &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === "NavigationPlan" &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      literals.push(
        node.initializer.properties.flatMap((property) =>
          property.name !== undefined && ts.isIdentifier(property.name)
            ? [property.name.text]
            : [],
        ),
      );
    }

    node.forEachChild(visit);
  };

  visit(source);

  return literals;
}

describe("the navigation plan is born in its final shape (#1693)", () => {
  const types = parse(TYPES_FILE);
  const declared = [
    ...interfaceProperties(types, "NavigationContext"),
    ...interfaceProperties(types, "NavigationPlan"),
  ];

  it("the scan finds the type and the literal it is about", () => {
    // Positive control: every assertion below is vacuously true if either half
    // of the scan silently matches nothing, which is what a rename would do.
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toContain("controller");
    expect(declared).toContain("detachExternalBridge");
    expect(planLiterals(parse(EXECUTE_FILE))).toHaveLength(1);
  });

  it("declares every field of its type, optional ones included", () => {
    const [literal] = planLiterals(parse(EXECUTE_FILE));

    // Sorted so the failure message names the MISSING field rather than
    // reporting a set difference the reader has to compute.
    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect(literal.toSorted(byName)).toStrictEqual(declared.toSorted(byName));
  });
});
