import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `RouterError.routeName` names a ROUTE, or is absent (#1785).
 *
 * The field is not declared — `RouterError`'s constructor takes
 * `{ message?, segment?, path?, [key: string]: unknown }` and `routeName`
 * arrives through the rest bag — so a sentence in that slot compiles, and three
 * sites put one there. A consumer branching on the code and reading the field
 * (`if (e.code === "ROUTE_NOT_FOUND") retry(e.routeName)`) is then handed prose
 * to navigate to.
 *
 * ⚑ **Derived, not listed.** The sites are found by walking `src` for
 * `new RouterError(errorCodes.ROUTE_NOT_FOUND, …)`, so a new producer that
 * spells prose into the slot reds this file without anyone remembering to add a
 * row. A hand-written list would have been written against the two sites an
 * earlier inventory named, and the walk finds three.
 *
 * ⚠ **This half cannot see the OTHER half of the defect**, and saying so is what
 * keeps the pair honest: a producer that omits `routeName` entirely passes here
 * by construction, which is correct for a call that named no route and wrong for
 * one that did. The cached singleton is exactly that shape. The behavioural
 * table in `navigation/navigate/error-context.test.ts` owns that side.
 */
const SRC = path.resolve(__dirname, "../../src");

interface Site {
  readonly file: string;
  readonly line: number;
  readonly prose: string;
}

/** Unwrap `as` / `satisfies` so a cast cannot hide a literal. */
const unwrap = (node: ts.Expression): ts.Expression => {
  let inner = node;

  while (ts.isAsExpression(inner) || ts.isSatisfiesExpression(inner)) {
    inner = inner.expression;
  }

  return inner;
};

/**
 * The `routeName` initialiser, when it is a literal.
 *
 * ⚑ A route name is an EXPRESSION — `name`, `toState.name`. A literal in this
 * slot is prose: core does not know an application's route names at authoring
 * time. That is also why a TYPE cannot hold this rule — prose is a `string`
 * exactly as a route name is, and only a walk can tell the two apart.
 *
 * ⚠ **One name IS core's own, and the predicate would misjudge it spelled out.**
 * `UNKNOWN_ROUTE` is a core constant, so a site writing
 * `routeName: "@@router/UNKNOWN_ROUTE"` would be flagged though it names a real
 * route. No site does — every one reaches the sentinel through
 * `constants.UNKNOWN_ROUTE`, an expression — so the carve-out is left OUT rather
 * than written: an exemption nothing exercises is a branch nothing tests. A
 * future site that wants the literal should use the constant, which is the
 * spelling the rest of core already uses.
 */
const proseInitialiser = (
  options: ts.Expression | undefined,
  source: ts.SourceFile,
): ts.Expression | undefined => {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return undefined;
  }

  for (const property of options.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      property.name.getText(source) !== "routeName"
    ) {
      continue;
    }

    const value = unwrap(property.initializer);

    if (
      ts.isStringLiteral(value) ||
      ts.isNoSubstitutionTemplateLiteral(value) ||
      ts.isTemplateExpression(value)
    ) {
      return value;
    }
  }

  return undefined;
};

/** Every `new RouterError(errorCodes.ROUTE_NOT_FOUND, …)` under `root`, visited once. */
function eachProducer(
  root: string,
  visit: (
    node: ts.NewExpression,
    source: ts.SourceFile,
    relativePath: string,
  ) => void,
): void {
  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );
    const relativePath = path.relative(root, file);

    const walk = (node: ts.Node): void => {
      const code = ts.isNewExpression(node) ? node.arguments?.[0] : undefined;

      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "RouterError" &&
        code !== undefined &&
        ts.isPropertyAccessExpression(code) &&
        code.name.text === "ROUTE_NOT_FOUND"
      ) {
        visit(node, source, relativePath);
      }

      ts.forEachChild(node, walk);
    };

    walk(source);
  }
}

function proseSites(root: string = SRC): Site[] {
  const found: Site[] = [];

  eachProducer(root, (node, source, relativePath) => {
    const prose = proseInitialiser(node.arguments?.[1], source);

    if (prose !== undefined) {
      found.push({
        file: relativePath,
        line:
          source.getLineAndCharacterOfPosition(prose.getStart(source)).line + 1,
        prose: prose.getText(source),
      });
    }
  });

  return found;
}

describe("routeName names a route, or nothing (#1785)", () => {
  it("no ROUTE_NOT_FOUND producer spells a sentence into routeName", () => {
    expect(proseSites()).toStrictEqual([]);
  });

  it("CONTROL — the walk finds producers at all, so an empty result means clean", () => {
    // Without this, a rename of `RouterError` or of the `errorCodes` member
    // empties the walk and the assertion above passes on files it never read.
    let producers = 0;

    eachProducer(SRC, () => {
      producers++;
    });

    expect(producers).toBeGreaterThan(3);
  });

  it("CONTROL — the predicate reads THROUGH a cast, in both directions", () => {
    // ⚑ `unwrap` is load-bearing and nothing else exercises it: measured by
    // mutation, a literal written `"prose" as string` walks straight past the
    // predicate with `unwrap` removed. `as const satisfies` hid a literal from a
    // sibling walk in this repository once already (#2091), so the evasion is
    // not hypothetical here.
    //
    // ⚠ BOTH polarities, because a predicate that flags everything would pass
    // the first half alone: an expression behind the same cast must stay clean.
    const directory = mkdtempSync(path.join(tmpdir(), "route-name-"));

    try {
      writeFileSync(
        path.join(directory, "cast.ts"),
        'new RouterError(errorCodes.ROUTE_NOT_FOUND, { routeName: "prose" as string });\n',
      );
      writeFileSync(
        path.join(directory, "expression.ts"),
        "new RouterError(errorCodes.ROUTE_NOT_FOUND, { routeName: name as string });\n",
      );
      writeFileSync(
        path.join(directory, "template.ts"),
        "new RouterError(errorCodes.ROUTE_NOT_FOUND, { routeName: `resolved to ${kind}` });\n",
      );

      expect(
        proseSites(directory)
          .map((site) => site.file)
          .toSorted((a, b) => a.localeCompare(b)),
      ).toStrictEqual(["cast.ts", "template.ts"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
