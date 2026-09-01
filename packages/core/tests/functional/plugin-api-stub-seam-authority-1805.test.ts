// packages/core/tests/functional/plugin-api-stub-seam-authority-1805.test.ts

import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Which `PluginApi` members can be stubbed one layer down (#1805).
 *
 * `getPluginApi(router)` is frozen, so a test that used to replace a member
 * spies on `getInternals(router)` instead. That works for a member which
 * DELEGATES to a same-named member of the internals bag, and not for one which
 * composes its answer locally — and the split is derived here rather than named
 * in a comment, because naming it has now been wrong twice: first as "every
 * member delegates", then as "all but one".
 *
 * ⚠ The assertion is the SET, not a count. A member that stops delegating reds
 * this and has to be reclassified, which a `length` comparison would let
 * through whenever another member moved the other way.
 */
/** Byte order — `localeCompare` would reorder the pinned list per locale. */
function byteOrder(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

const SRC = path.resolve(__dirname, "../../src");

function delegatingMembers(
  file: string,
  variable: string,
): {
  all: string[];
  delegating: string[];
} {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const delegating: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === variable &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        const name = property.name?.getText();

        if (name === undefined) {
          continue;
        }

        found.push(name);

        // The seam is a CALL to the same-named member of the internals bag —
        // not the mere existence of that name on the interface. A member whose
        // body reaches `ctx` some other way is not spy-able through it, and
        // the two predicates part company exactly there.
        if (property.getText().includes(`ctx.${name}`)) {
          delegating.push(name);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return { all: found, delegating };
}

function interfaceMembers(file: string, name: string): Set<string> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      for (const member of node.members) {
        const memberName = member.name?.getText();

        if (memberName !== undefined) {
          found.add(memberName);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

describe("the stub seam below getPluginApi (#1805)", () => {
  const { all: members, delegating } = delegatingMembers(
    path.join(SRC, "api/getPluginApi.ts"),
    "api",
  );
  const internals = interfaceMembers(
    path.join(SRC, "internals.ts"),
    "RouterInternals",
  );

  it("the surface and the bag are both non-empty", () => {
    // Without this, an emptied scan makes every cell below pass by finding
    // nothing on either side.
    expect(members.length).toBeGreaterThan(10);
    expect(internals.size).toBeGreaterThan(10);
    expect(delegating.length).toBeGreaterThan(0);
  });

  it("the members that do NOT delegate to `ctx.<same name>` are exactly these", () => {
    const withoutTwin = members
      .filter((member) => !delegating.includes(member))
      .toSorted(byteOrder);

    // A test that stubbed one of these has nowhere one layer down to go — it
    // has to drive the behaviour instead. Everything else is spy-able through
    // `getInternals(router)`. ⚠ Measured against the weaker predicate this
    // started as: classifying by whether the NAME exists on `RouterInternals`
    // passed a mutant that made a member call a DIFFERENT internals method,
    // which is precisely the case the seam claim gets wrong.
    expect(withoutTwin).toStrictEqual([
      "addInterceptor",
      "buildNavigationState",
      "claimContextNamespace",
      "extendRouter",
      "getRouteConfig",
    ]);
  });

  it("CONTROL: the delegating members are the majority", () => {
    const withTwin = members.filter((member) => delegating.includes(member));

    // The complement, asserted so that "nothing delegates" — the shape a
    // broken scan produces — cannot satisfy the cell above.
    expect(withTwin.length).toBeGreaterThan(members.length / 2);
    expect(withTwin).toContain("navigateToState");
  });
});
