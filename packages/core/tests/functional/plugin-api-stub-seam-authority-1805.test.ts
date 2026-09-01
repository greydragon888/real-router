// packages/core/tests/functional/plugin-api-stub-seam-authority-1805.test.ts

import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

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

const ROUTES = [{ name: "a", path: "/a" }];
const STUB = "STUB" as never;

type Spyable = Record<string, (...args: never[]) => unknown>;

/** A bare `ctx.<name>` read that is not a call — the alias shape. */
function aliasesInternalsMember(node: ts.Node, name: string): boolean {
  let found = false;

  const walk = (current: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(current) &&
      current.expression.getText() === "ctx" &&
      current.name.text === name
    ) {
      found = true;
    }

    ts.forEachChild(current, walk);
  };

  walk(node);

  return found;
}

/** A real `ctx.<name>(…)` call inside this property — AST, never text. */
function callsInternalsMember(node: ts.Node, name: string): boolean {
  let found = false;

  const walk = (current: ts.Node): void => {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.expression.getText() === "ctx" &&
      current.expression.name.text === name
    ) {
      found = true;
    }

    ts.forEachChild(current, walk);
  };

  walk(node);

  return found;
}

function delegatingMembers(
  file: string,
  variable: string,
): {
  all: string[];
  delegating: string[];
  aliased: string[];
} {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const delegating: string[] = [];
  const aliased: string[] = [];

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
        // not the mere existence of that name on the interface, and not its
        // appearance in the text. Both weaker forms were measured: name
        // existence passed a member rewired to call a DIFFERENT internals
        // method, and a text match counted a mention inside a COMMENT.
        if (callsInternalsMember(property, name)) {
          delegating.push(name);
        } else if (aliasesInternalsMember(property, name)) {
          aliased.push(name);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return { all: found, delegating, aliased };
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
  const {
    all: members,
    delegating,
    aliased,
  } = delegatingMembers(path.join(SRC, "api/getPluginApi.ts"), "api");
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

  it("the three classes are exactly these", () => {
    const composedLocally = members
      .filter(
        (member) => !delegating.includes(member) && !aliased.includes(member),
      )
      .toSorted(byteOrder);

    // CALLS `ctx.<name>()` — a spy one layer down intercepts, whenever it is
    // installed. This is the class the migration advice is about.
    expect(delegating.toSorted(byteOrder)).toStrictEqual([
      "addEventListener",
      "emitTransitionError",
      "forwardState",
      "makeState",
      "matchPath",
      "navigateToState",
      "setRootPath",
    ]);

    // ALIASES `ctx.<name>` — the reference is captured when the cached surface
    // is BUILT, so a spy installed afterwards is missed. Measured below.
    expect(aliased.toSorted(byteOrder)).toStrictEqual([
      "getOptions",
      "getRootPath",
      "getTree",
    ]);

    // Composes its answer locally — no seam one layer down at all.
    expect(composedLocally).toStrictEqual([
      "addInterceptor",
      "buildNavigationState",
      "claimContextNamespace",
      "extendRouter",
      "getRouteConfig",
    ]);

    expect(
      delegating.length + aliased.length + composedLocally.length,
      "every member is classified",
    ).toBe(members.length);
  });

  it("BEHAVIOUR: a call member is intercepted whenever the spy is installed", () => {
    const router = createRouter(ROUTES);
    const api = getPluginApi(router);

    vi.spyOn(
      getInternals(router) as unknown as Spyable,
      "matchPath",
    ).mockReturnValue(STUB);

    expect(api.matchPath("/a") as unknown).toBe(STUB);

    router.dispose();
  });

  it("BEHAVIOUR: an alias member is missed after the surface is built, caught before", () => {
    // This pair is why the classification is three-way rather than two. The AST
    // cannot say it; only the order can.
    const late = createRouter(ROUTES);
    const lateApi = getPluginApi(late);

    vi.spyOn(
      getInternals(late) as unknown as Spyable,
      "getTree",
    ).mockReturnValue(STUB);

    expect(
      lateApi.getTree() as unknown,
      "captured at build — spy missed",
    ).not.toBe(STUB);

    const early = createRouter(ROUTES);

    vi.spyOn(
      getInternals(early) as unknown as Spyable,
      "getTree",
    ).mockReturnValue(STUB);

    expect(
      getPluginApi(early).getTree() as unknown,
      "spy stood before the build",
    ).toBe(STUB);

    late.dispose();
    early.dispose();
  });
});
