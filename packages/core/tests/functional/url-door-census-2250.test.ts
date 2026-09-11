import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Which door does a URL producer outside core ask (#2250)?
 *
 * `router.buildPath` is the LITERAL form: it answers about the route it was
 * NAMED and resolves no `forwardTo`. That is a capability, not a defect — core
 * INVARIANTS `makeState` row 8 records its beneficiary, "a plugin can build a
 * state for an alias without being teleported off it". The defect is asking it
 * for a URL a user will follow, because a click resolves the chain and the
 * literal answer does not.
 *
 * ⚑ **This is a classification table, not a ban.** Both answers are legitimate
 * and the table says which site gives which, so a new call site has to be
 * placed by hand rather than inherited. A threshold would let one migrate
 * between the columns silently.
 *
 * ⚠ **Two doors resolve, and the table counts both.** `buildNavigationState`
 * and `forwardState` each resolve the whole `forwardTo` chain; they differ in
 * that the first also opts into `reportUndeclaredParamKey`, which is advice
 * about a state you are about to COMMIT. A render door takes the second
 * (#2248). Recognising only one of them would have read this file's own fix as
 * a migration into the literal column.
 *
 * ⚠ **The rule is CO-OCCURRENCE in the enclosing function, not the shape of the
 * expression.** `shared/dom-utils/link-utils.ts` assigns the resolved path to a
 * local inside a `try` and reaches `??` two statements later, so a predicate
 * reading only the `??` operands calls it standalone. The CONTROL pins that
 * boundary in both polarities.
 *
 * ⚠ **`packages/core/src` is out of scope**, because core IS the literal door —
 * every call there is its implementation rather than a consumer of it.
 */

const PACKAGES = path.resolve(__dirname, "../../..");
const REPO = path.resolve(PACKAGES, "..");

const repoPath = (file: string): string =>
  path.relative(REPO, file).split(path.sep).join("/");

const sourceOf = (file: string, code: string): ts.SourceFile =>
  ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true);

/** The called member's name, however the call spells it. */
const calledMember = (callee: ts.Expression): string | undefined => {
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }

  if (
    ts.isElementAccessExpression(callee) &&
    ts.isStringLiteralLike(callee.argumentExpression)
  ) {
    return callee.argumentExpression.text;
  }

  return undefined;
};

/**
 * The census predicate. One copy, because the CONTROL probes THIS function
 * rather than a restatement of it that could drift from it.
 */
const callsMember = (node: ts.Node, member: string): boolean =>
  ts.isCallExpression(node) && calledMember(node.expression) === member;

/** The doors that resolve the `forwardTo` chain before a path is printed. */
const RESOLVING_DOORS = ["buildNavigationState", "forwardState"];

/** Does anything under `node` ask a resolving door? */
const reachesResolvingDoor = (node: ts.Node): boolean => {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) {
      return;
    }

    if (RESOLVING_DOORS.some((door) => callsMember(n, door))) {
      found = true;

      return;
    }

    ts.forEachChild(n, visit);
  };

  visit(node);

  return found;
};

/** The nearest enclosing function-ish node, or the source file. */
const enclosingScope = (node: ts.Node): ts.Node => {
  let n: ts.Node | undefined = node.parent;

  while (n) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isConstructorDeclaration(n)
    ) {
      return n;
    }

    n = n.parent;
  }

  return node.getSourceFile();
};

/** A readable name for that scope. */
const scopeName = (scope: ts.Node): string => {
  if (ts.isSourceFile(scope)) {
    return "(module scope)";
  }

  const named = scope as ts.NamedDeclaration;

  if (named.name && ts.isIdentifier(named.name)) {
    return named.name.text;
  }

  let n: ts.Node | undefined = scope.parent;

  while (n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      return n.name.text;
    }

    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name)) {
      return n.name.text;
    }

    n = n.parent;
  }

  return "(anonymous)";
};

const sourceFiles = (): string[] =>
  [
    ...globSync(`${PACKAGES}/*/src/**/*.{ts,tsx,mts}`),
    ...globSync(`${REPO}/shared/**/*.{ts,mts}`),
  ].filter(
    (f) =>
      !/node_modules|[/\\](dist|coverage)[/\\]/.test(f) &&
      !repoPath(f).startsWith("packages/core/src/"),
  );

interface Census {
  fallback: string[];
  standalone: string[];
  filesRead: number;
}

const census = (): Census => {
  const fallback = new Set<string>();
  const standalone = new Set<string>();
  const files = sourceFiles();

  for (const file of files) {
    const code = readFileSync(file, "utf8");

    if (!code.includes("buildPath")) {
      continue;
    }

    const label = repoPath(file);

    const visit = (node: ts.Node): void => {
      if (callsMember(node, "buildPath")) {
        const scope = enclosingScope(node);
        const entry = `${label}::${scopeName(scope)}`;

        (reachesResolvingDoor(scope) ? fallback : standalone).add(entry);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceOf(file, code));
  }

  const sorted = (s: Set<string>): string[] =>
    [...s].toSorted((a, b) => a.localeCompare(b));

  return {
    fallback: sorted(fallback),
    standalone: sorted(standalone),
    filesRead: files.length,
  };
};

describe("which door a URL producer outside core asks (#2250)", () => {
  it("the sweep reached the tree it claims to sweep", () => {
    // POSITIVE control for the table below: two empty lists are also what a
    // broken glob returns.
    expect(census().filesRead).toBeGreaterThan(200);
  });

  it("every URL a user follows is built by the RESOLVING door", () => {
    // Four sites, and the two `link-utils` rows are one source: `packages/
    // angular/src/dom-utils` is a git-tracked COPY of `shared/dom-utils`, so it
    // ships the same code and is counted as the separate artefact it is.
    expect(census().fallback).toStrictEqual([
      "packages/angular/src/dom-utils/link-utils.ts::buildHref",
      "packages/hash-plugin/src/plugin.ts::pluginBuildUrl",
      "shared/browser-env/plugin-utils.ts::(anonymous)",
      "shared/dom-utils/link-utils.ts::buildHref",
    ]);
  });

  it("the LITERAL door is asked in one file, and that is an open decision", () => {
    // ⚠ Not a defect by default: `getStaticPaths` is an explicit, leaf-only
    // enumerator — #608 closed the auto-discovery class as NOT_PLANNED, so a
    // manifest that resolved `forwardTo` would infer a page the author did not
    // enumerate. What it costs is filed as #2256: an href built by the doors
    // above can name a URL this manifest never produced.
    expect(census().standalone).toStrictEqual([
      "packages/ssr-utils/src/getStaticPaths.ts::getStaticPaths",
      "packages/ssr-utils/src/getStaticPaths.ts::pathForEntry",
    ]);
  });

  it("CONTROL — the predicate classifies, and it does find a site", () => {
    const run = (code: string): { fallback: number; standalone: number } => {
      let fb = 0;
      let sa = 0;
      const source = sourceOf("probe.ts", code);
      const visit = (node: ts.Node): void => {
        if (callsMember(node, "buildPath")) {
          if (reachesResolvingDoor(enclosingScope(node))) {
            fb += 1;
          } else {
            sa += 1;
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(source);

      return { fallback: fb, standalone: sa };
    };

    // POSITIVE control first: without it the table above is lists agreeing
    // with a scanner that finds nothing.
    expect(run(`function f(r) { return r.buildPath("a"); }`)).toStrictEqual({
      fallback: 0,
      standalone: 1,
    });

    // The boundary the docblock names: the resolving call is TWO statements
    // away and behind a `try`, which is the real shape in `link-utils`.
    expect(
      run(`function f(r) {
        let v;
        try { v = api(r).buildNavigationState("a")?.path; } catch { v = undefined; }
        return v ?? r.buildPath("a");
      }`),
    ).toStrictEqual({ fallback: 1, standalone: 0 });

    // ...and the SAME shape without the resolving call is standalone, so the
    // classifier reads co-occurrence rather than the `??`.
    expect(
      run(`function f(r) {
        let v;
        try { v = undefined; } catch { v = undefined; }
        return v ?? r.buildPath("a");
      }`),
    ).toStrictEqual({ fallback: 0, standalone: 1 });

    // The SECOND resolving door, pinned in both polarities so the widening that
    // admitted it is tested rather than assumed (#2248). This is the shape the
    // render doors ship.
    expect(
      run(`function f(r) {
        const fwd = api(r).forwardState("a", p, s);
        return r.buildPath(fwd.name, fwd.params, fwd.search);
      }`),
    ).toStrictEqual({ fallback: 1, standalone: 0 });

    // ⚠ And the negative polarity the widening could have destroyed: a NEARBY
    // name that merely looks like the door does not count. Without this the
    // predicate could match anything and the table would still read green.
    expect(
      run(`function f(r) {
        const fwd = api(r).forwardedState("a");
        return r.buildPath(fwd.name);
      }`),
    ).toStrictEqual({ fallback: 0, standalone: 1 });

    // Reach, in both polarities. Either spelling of the member call counts.
    expect(run(`function f(r) { return r["buildPath"]("a"); }`)).toStrictEqual({
      fallback: 0,
      standalone: 1,
    });
    expect(run(`function f(r) { return r.buildUrl("a"); }`)).toStrictEqual({
      fallback: 0,
      standalone: 0,
    });

    // ⚠ The boundary, pinned rather than left to a reader: a name that is not a
    // member at the call makes the site ABSENT rather than reported.
    expect(
      run(`function f(r) { const { buildPath } = r; return buildPath("a"); }`),
    ).toStrictEqual({ fallback: 0, standalone: 0 });

    // Scope is the NEAREST function, so a sibling function's resolving call
    // does not launder this one.
    expect(
      run(`function a(r) { return api(r).buildNavigationState("x"); }
           function b(r) { return r.buildPath("a"); }`),
    ).toStrictEqual({ fallback: 0, standalone: 1 });
  });
});
