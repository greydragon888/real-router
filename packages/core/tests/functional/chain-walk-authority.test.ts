import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every place core walks the PROTOTYPE CHAIN of an object it did not build.
 *
 * ⚑ The project's supported-input rule is **own enumerable properties only** — a
 * caller's inherited or non-enumerable properties are not input. Two syntactic
 * shapes reach past it:
 *
 * - **`for…in`** enumerates inherited enumerable keys. Guarded by an
 *   `Object.hasOwn` at the head of the body it is exactly `Object.keys`; without
 *   one it admits what the rule excludes.
 * - **`key in obj`** on a value the function received as a PARAMETER — the same
 *   walk, used as a predicate. Paired with an own-only writer (`hasOwn`, a
 *   spread, `Object.keys`) the two disagree precisely on inherited keys, which is
 *   how `areStatesEqual` came to report two states with disjoint own `params` as
 *   equal.
 *
 * ⚠ **Neither shape is wrong by itself**, and this table does not pretend
 * otherwise. Walking the chain is CORRECT on an `Error` (`"cause" in thrown`), on
 * the router instance (methods live on the prototype), and on any bag core built
 * a line earlier. Every entry therefore carries a verdict and a reason, and the
 * assertion is on the whole set: a new site must be classified, not merely added.
 *
 * ⚠ **Addressed by file + the matched text, never by line number** — the sites
 * this file exists to watch are edited often, and a `:NNN` citation rots on the
 * first reformat.
 *
 * Sibling authorities: `tree-mutator-guard-authority-1751`, `type-mirror-authority`,
 * `read-count-authority`.
 */
describe("where core walks a chain it does not own", () => {
  const SRC = path.resolve(__dirname, "../../src");

  interface Site {
    readonly file: string;
    readonly shape: "for-in" | "in-on-param";
    readonly code: string;
  }

  function scan(): Site[] {
    const found: Site[] = [];

    for (const file of globSync(`${SRC}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        // `true`: the `in`-on-a-parameter test walks up to the enclosing
        // function. Without parent pointers that walk silently finds nothing and
        // the whole C half reports zero — which it did, on the first run.
        /* setParentNodes */ true,
        ts.ScriptKind.TS,
      );
      const relativePath = path.relative(SRC, file);
      const head = (node: ts.Node): string =>
        node.getText(source).split("\n", 1)[0].trim().slice(0, 60);

      /** An own-only check in the first two statements of a `for…in` body. */
      const guardsOwn = (body: ts.Statement, subject: string): boolean => {
        const statements = ts.isBlock(body) ? body.statements : [body];

        return statements.slice(0, 2).some((statement) => {
          const text = statement.getText(source);

          return (
            (text.includes("Object.hasOwn(") ||
              text.includes("getOwnPropertyDescriptor(")) &&
            text.includes(subject)
          );
        });
      };

      const walk = (node: ts.Node): void => {
        if (
          ts.isForInStatement(node) &&
          !guardsOwn(node.statement, node.expression.getText(source))
        ) {
          found.push({ file: relativePath, shape: "for-in", code: head(node) });
        }

        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword
        ) {
          const subject = node.right.getText(source);
          let scope: ts.Node | undefined = node;
          let onParameter = false;

          while (scope) {
            if (
              ts.isFunctionLike(scope) &&
              scope.parameters.some(
                (parameter) => parameter.name.getText(source) === subject,
              )
            ) {
              onParameter = true;

              break;
            }

            scope = scope.parent;
          }

          if (onParameter) {
            found.push({
              file: relativePath,
              shape: "in-on-param",
              code: head(node),
            });
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }

    return found;
  }

  it("every chain walk in src is classified", () => {
    const verdicts = Object.fromEntries(
      scan().map((site) => [`${site.file} · ${site.code}`, site.shape]),
    );

    expect(verdicts).toStrictEqual({
      // ── DEFECTS, each with an owner ──────────────────────────────────────

      // #1799 — the guard enumerates through the chain but tests own-only, so an
      // inherited getter passes and is then invoked by the copy loop below it.
      "guards.ts · for (const key in deps as Record<string, unknown>) {":
        "for-in",
      // #1799 — the copy loop, on both doors.
      "namespaces/DependenciesNamespace/dependenciesStore.ts · for (const key in initialDependencies) {":
        "for-in",
      "api/getDependenciesApi.ts · for (const key in deps) {": "for-in",
      // §8 — `recordsShallowEqual` counts OWN keys and then tests membership with
      // `in`, so two states with disjoint own `params` compare EQUAL. Publicly
      // reachable through `areStatesEqual(a, b, false)`.
      "namespaces/StateNamespace/StateNamespace.ts · key in right":
        "in-on-param",
      // #1798, fixed on the `1798-minimal` branch and still live here: a route
      // declaring `?toString` reads the native method off an EMPTY bag. When that
      // branch lands, this row must go — which is the point of an authority table.
      "engine/path-matcher/SegmentMatcher.ts · name in params": "in-on-param",

      // ── EXEMPT, with the reason ──────────────────────────────────────────

      // Core's OWN bags, built a few lines earlier by the query parser and the
      // trie walk. Nothing the caller can reach through their prototype.
      "engine/path-matcher/SegmentMatcher.ts · for (const key in search) {":
        "for-in",
      "engine/path-matcher/SegmentMatcher.ts · for (const key in params) {":
        "for-in",
      // `paramsMatch`'s `source` LOOKS like the caller's bag and is not: every
      // `isActiveRoute` arc normalises before this runs. Verified by outcome —
      // an inherited `{ id: "X" }` against a committed `id: "7"` answers `true`,
      // which is the empty-bag answer, not the compared-and-equal one.
      "namespaces/RoutesNamespace/helpers.ts · for (const key in source) {":
        "for-in",
      // An `Error`'s `cause` lives on the prototype for a subclass; own-only would
      // be the bug here.
      'namespaces/NavigationNamespace/transition/errorHandling.ts · "cause" in thrown':
        "in-on-param",
      // `extendRouter`'s conflict check MUST see inherited members — the router's
      // methods are on its prototype, and that is exactly what it guards against.
      "api/getPluginApi.ts · key in router": "in-on-param",
      // A structural discriminator on a `State` core produced.
      'namespaces/RoutesNamespace/RoutesNamespace.ts · "name" in toState':
        "in-on-param",
    });
  });

  it("CONTROL — the scanner finds both shapes, and finds them in src", () => {
    // ⚑ Non-vacuity with teeth: an empty result would satisfy `toStrictEqual({})`
    // if the table above were ever emptied in the same edit, and a scanner that
    // silently stopped parsing would report zero. Both shapes must be present,
    // and the file list must be non-trivial.
    const sites = scan();

    expect(sites.filter((s) => s.shape === "for-in").length).toBeGreaterThan(2);
    expect(
      sites.filter((s) => s.shape === "in-on-param").length,
    ).toBeGreaterThan(2);
    expect(new Set(sites.map((s) => s.file)).size).toBeGreaterThan(4);
  });
});
