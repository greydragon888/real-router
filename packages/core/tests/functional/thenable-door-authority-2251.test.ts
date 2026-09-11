import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Where core tests for a promise by IDENTITY, and whether that value is its own
 * (#2251).
 *
 * ⚑ **A classification table, not a ban.** `instanceof Promise` is correct on a
 * value core minted and wrong on one an application returned: it compares
 * against the CURRENT realm's `Promise.prototype`, so a thenable from a `vm`
 * context, an iframe, a worker bridge or a federated module is not a match. The
 * table says which site is which, so a new one has to be placed by hand.
 *
 * ⚠ **The register's `thenable-returns` family is the other half and is not
 * scanned here.** Its three doors — `GuardFn`, `subscribeLeave`'s `LeaveFn`, the
 * `start` interceptor — all take a value the APPLICATION returned, and all three
 * now duck-type: the guard walk since #2251, `LeaveFn` through
 * `Promise.allSettled` (which duck-types by specification), and `start` through
 * an explicit `typeof …then === "function"`.
 */
const CORE_SRC = path.resolve(__dirname, "../../src");

/**
 * Labels are relative to core's OWN `src`, deliberately: the scan reads nothing
 * outside this workspace, so it is keyed by turbo on the files it actually
 * reads and needs no entry in `scripts/repo-wide-scans.json` (#2241). Resolving
 * a repository root here would make it reach out on paper and be replayed from
 * cache in practice.
 */
const sourcePath = (file: string): string =>
  path.relative(CORE_SRC, file).split(path.sep).join("/");

/**
 * The census predicate. One copy, because the CONTROL probes THIS function
 * rather than a restatement of it that could drift from it.
 */
const isPromiseIdentityTest = (node: ts.Node): boolean =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
  ts.isIdentifier(node.right) &&
  node.right.text === "Promise";

/** The nearest enclosing function-ish node's name, or module scope. */
const enclosingName = (node: ts.Node): string => {
  let n: ts.Node | undefined = node.parent;

  while (n) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n)
    ) {
      const named = n as ts.NamedDeclaration;

      if (named.name) {
        return named.name.getText();
      }
    }

    n = n.parent;
  }

  return "(module scope)";
};

const sites = (): { entries: string[]; filesRead: number } => {
  const files = globSync(`${CORE_SRC}/**/*.ts`).filter(
    (f) => !/node_modules|[/\\]dist[/\\]/.test(f),
  );
  const entries = new Set<string>();

  for (const file of files) {
    const code = readFileSync(file, "utf8");

    if (!code.includes("instanceof Promise")) {
      continue;
    }

    const source = ts.createSourceFile(
      file,
      code,
      ts.ScriptTarget.ESNext,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (isPromiseIdentityTest(node)) {
        entries.add(`${sourcePath(file)}::${enclosingName(node)}`);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return {
    entries: [...entries].toSorted((a, b) => a.localeCompare(b)),
    filesRead: files.length,
  };
};

describe("identity tests for a promise are on core's OWN values (#2251)", () => {
  it("the sweep reached the tree it claims to sweep", () => {
    // POSITIVE control: an empty list is also what a broken glob returns.
    expect(sites().filesRead).toBeGreaterThan(100);
  });

  it("every `instanceof Promise` in core sits on a value core produced", () => {
    // Both take `State | Promise<State>` straight out of `NavigationNamespace`,
    // and `navigate` is not interceptable — `InterceptableMethodMap` declares
    // exactly `start` and `forwardState`, so no application value reaches them.
    // A site on an APPLICATION's return belongs in the duck-typed set instead;
    // the guard walk is the one that was here and moved (#2251).
    expect(sites().entries).toStrictEqual([
      "namespaces/NavigationNamespace/NavigationNamespace.ts::#settle",
      "Router.ts::#asPromise",
    ]);
  });

  it("CONTROL — the predicate is structural, and it does find a site", () => {
    const hits = (code: string): number => {
      let n = 0;
      const source = ts.createSourceFile(
        "probe.ts",
        code,
        ts.ScriptTarget.ESNext,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (isPromiseIdentityTest(node)) {
          n += 1;
        }

        ts.forEachChild(node, visit);
      };

      visit(source);

      return n;
    };

    // POSITIVE control first, then reach in both polarities.
    expect(hits("if (x instanceof Promise) {}")).toBe(1);
    expect(hits("const y = a instanceof Promise ? a : b;")).toBe(1);
    expect(hits("if (x instanceof Error) {}")).toBe(0);
    // ⚠ The boundary: the duck-typed form is what the fixed door uses, and it
    // must NOT be reported — otherwise the table would grow every time a door is
    // fixed, which is backwards.
    expect(hits('if (typeof x.then === "function") {}')).toBe(0);
  });
});
