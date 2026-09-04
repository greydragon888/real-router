import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * NOTHING registers on a `buildPath` interception point, because there is none
 * (#1938, #2090).
 *
 * This began as a census — the enumeration that let the retirement be cut into
 * steps with their own greens. The steps shipped, the set went empty, and what
 * is left is the tripwire: a `addInterceptor("buildPath", …)` written anywhere
 * in `packages/*` or `benchmarks/` reds here, in code no test has to run.
 *
 * ⚑ It is not the only guard, and it is the earlier one. `addInterceptor`
 * THROWS on a name outside `SEAM` (#2088), so a live registration fails at
 * `usePlugin` — but only where something calls it. This walk reads the source.
 *
 * ⚠ **An empty result is also what a broken scanner returns.** The CONTROL cell
 * is what separates the two, and it probes THIS predicate rather than a
 * restatement of it.
 *
 * ⚠ Structure, not text: what the predicate reads is a member call with the
 * receiver present and both names LITERAL in the source. Hide either behind a
 * binding or a computed value and the site is ABSENT rather than reported —
 * the CONTROL asserts that boundary in both polarities.
 */

const PACKAGES = path.resolve(__dirname, "../../..");
const REPO = path.resolve(PACKAGES, "..");
const BENCHMARKS = path.resolve(REPO, "benchmarks");

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
 * The census predicate. One copy, because the CONTROL cell probes THIS function
 * rather than a restatement of it that could drift from it.
 */
const registersBuildPath = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  calledMember(node.expression) === "addInterceptor" &&
  node.arguments.length > 0 &&
  ts.isStringLiteralLike(node.arguments[0]) &&
  node.arguments[0].text === "buildPath";

/** The nearest enclosing `it` / `test` / `describe` title, or module scope. */
const enclosing = (node: ts.Node): string => {
  let n: ts.Node | undefined = node;

  while (n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      ["it", "test", "describe"].includes(n.expression.text) &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      return n.arguments[0].text;
    }

    n = n.parent;
  }

  return "(module scope)";
};

const sourceFiles = (): string[] =>
  [
    ...globSync(`${PACKAGES}/*/src/**/*.{ts,tsx,mts}`),
    ...globSync(`${PACKAGES}/*/tests/**/*.{ts,tsx,mts}`),
    ...globSync(`${BENCHMARKS}/**/*.{ts,tsx,mts,mjs}`),
  ].filter(
    (f) =>
      !/node_modules|[/\\](dist|coverage)[/\\]/.test(f) &&
      // ⚠ Audit probes are DATED snapshots of what was measured on a day, not
      // live code — no task runs them and rewriting one would falsify the
      // record it exists to be. They are outside the tripwire deliberately.
      !f.includes(`${path.sep}audit-probes${path.sep}`),
  );

/** Arm A, and the seeds arm B needs. */
const namingSites = (): { keys: string[]; seeds: Set<string> } => {
  const keys = new Set<string>();
  const seeds = new Set<string>();

  for (const file of sourceFiles()) {
    const code = readFileSync(file, "utf8");

    if (!code.includes("addInterceptor")) {
      continue;
    }

    const label = repoPath(file);

    const visit = (node: ts.Node): void => {
      if (registersBuildPath(node)) {
        keys.add(`${label}::${enclosing(node)}`);

        const owner = /^packages\/([^/]+)\/src\//.exec(label);

        if (owner) {
          seeds.add(owner[1]);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceOf(file, code));
  }

  return { keys: [...keys].toSorted((a, b) => a.localeCompare(b)), seeds };
};

/**
 * `usePlugin(factory(...))`, `usePlugin(a, factory(...))` and `usePlugin(f)` all
 * reduce to the identifier the call hangs off.
 */
const calleeRoot = (node: ts.Expression): string => {
  if (ts.isCallExpression(node)) {
    return calleeRoot(node.expression);
  }

  if (ts.isIdentifier(node)) {
    return node.text;
  }

  return "";
};

/** Names imported from a seam-registering package, by name or by relative path. */
const seedBindings = (
  source: ts.SourceFile,
  seeds: ReadonlySet<string>,
  local: boolean,
): Set<string> => {
  const bindings = new Set<string>();

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    const spec = statement.moduleSpecifier.getText(source);

    const byPackageName = [...seeds].some((seed) => spec.includes(seed));
    const byRelativePath = local && spec.startsWith('"..');

    if (!byPackageName && !byRelativePath) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      bindings.add(element.name.text);
    }
  }

  return bindings;
};

/** Arm B — files that install one of the seeded packages. */
const transitiveFiles = (seeds: ReadonlySet<string>): string[] => {
  const files = new Set<string>();

  for (const file of sourceFiles()) {
    const label = repoPath(file);
    const code = readFileSync(file, "utf8");
    const owner = /^packages\/([^/]+)\//.exec(label)?.[1];
    const byName = [...seeds].some((s) => code.includes(`@real-router/${s}`));
    const byPath = owner !== undefined && seeds.has(owner);

    if (!byName && !byPath) {
      continue;
    }
    if (/^packages\/[^/]+\/src\//.test(label)) {
      continue;
    }

    const source = sourceOf(file, code);
    const bindings = seedBindings(source, seeds, byPath);

    if (bindings.size === 0) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "usePlugin" &&
        node.arguments.some((a) => bindings.has(calleeRoot(a)))
      ) {
        files.add(label);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return [...files].toSorted((a, b) => a.localeCompare(b));
};

describe("nothing registers on a buildPath interception point (#2090)", () => {
  it("the TRIPWIRE — no site in packages/* or benchmarks/ names the seam", () => {
    const { keys, seeds } = namingSites();

    expect(keys).toStrictEqual([]);
    expect([...seeds]).toStrictEqual([]);
    expect(transitiveFiles(seeds)).toStrictEqual([]);
  });

  it("CONTROL — the predicate is structural, and it does find a site", () => {
    const hits = (code: string): number => {
      let n = 0;
      const visit = (node: ts.Node): void => {
        if (registersBuildPath(node)) {
          n += 1;
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceOf("probe.ts", code));

      return n;
    };

    const before = `api.addInterceptor("buildPath", (next, route, params) => next(route, params));`;
    const after = `api.addInterceptor("buildPath", (onward, name, bag) => onward(name, bag));`;

    // POSITIVE control first: without it the emptiness above is two zeros
    // agreeing, and a local rename must not move a site either.
    expect(hits(before)).toBe(1);
    expect(hits(after)).toBe(hits(before));

    // Reach, in both polarities. Either spelling of the member call counts.
    expect(hits(`api["addInterceptor"]("buildPath", fn);`)).toBe(1);
    expect(hits(`api.addInterceptor("forwardState", fn);`)).toBe(0);

    // ⚠ The boundary, pinned rather than left to a reader: a name that is not
    // literal at the call makes the site ABSENT rather than reported. Two
    // instances, so the cell shows the rule and not one case.
    expect(
      hits(`const { addInterceptor } = api; addInterceptor("buildPath", fn);`),
    ).toBe(0);
    expect(hits(`api[NAME]("buildPath", fn);`)).toBe(0);
  });

  it("CONTROL — the transitive walk still answers, given a seed", () => {
    // The seeds are DERIVED from the naming arm, so an empty transitive answer
    // is only meaningful while a non-empty seed produces a non-empty one. Both
    // spellings the walk was built for are covered: `plugin.test.ts` imports by
    // RELATIVE path, the cross-router app hands the factory to `usePlugin` as a
    // NON-FIRST argument.
    const reached = transitiveFiles(new Set(["persistent-params-plugin"]));

    expect(reached).toContain(
      "packages/persistent-params-plugin/tests/functional/plugin.test.ts",
    );
    expect(reached).toContain(
      "benchmarks/cross-router/apps/react/real-router-full/src/main.tsx",
    );
  });
});
