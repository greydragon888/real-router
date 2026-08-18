// A hand-written enumeration that mirrors a TYPE must equal it — checked here for
// every such pair in core, not one.
//
// This is the generalisation of `route-key-authority-1738.test.ts`, and the reason
// it exists is a measured pattern rather than a hunch. Four defects filed in one
// week share one shape: a list of member names written by hand, a type it is
// supposed to mirror, and nothing binding the two — so a later wave added a member
// to the type and the list stayed as it was. `STANDARD_ROUTE_KEYS` missed
// `defaultSearch` for 33 releases (#1738); `@real-router/validation-plugin`'s
// field lists still miss it in six cells (#1787). Each was introduced by a
// STRUCTURAL wave (a package extraction, a channel split, a modularisation): the
// wave's review checked that the new site worked, not that it had inherited every
// rule the old site knew.
//
// ⚑ Every relation below is EQUAL today. That is the point: this file does not fix
// anything, it removes the way the next wave would break them silently. A relation
// that is deliberately a subset rather than an equality does not belong here — say
// so in the table and pin it where the asymmetry is explained.
//
// ⚠ The extractors THROW on a shape they do not recognise and on a missing anchor,
// instead of returning a shorter list. That is the #1738 lesson: a walk keyed on a
// narrow node shape silently returned 3 members out of 5, and no non-vacuity
// threshold catches a PARTIAL list. Same reason every derived list is asserted
// non-empty before it is compared, and the table's own length is asserted outside
// `it.each` — `it.each([])` registers zero cells in silence.
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");

function parse(file: string): ts.SourceFile {
  const full = path.join(SRC, file);

  return ts.createSourceFile(
    full,
    readFileSync(full, "utf8"),
    ts.ScriptTarget.Latest,
    // `false`: nothing here reads a position or `.parent`.
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );
}

/** Fails by NAME, so a rename or a move says which anchor moved. */
function anchor(found: boolean, what: string, file: string): void {
  if (!found) {
    throw new Error(`${what} not found in src/${file} — an anchor moved`);
  }
}

function propertyName(member: ts.TypeElement, owner: string): string {
  const name = member.name;

  if (
    name !== undefined &&
    (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
  ) {
    return name.text;
  }

  throw new Error(
    `${owner}: a ${ts.SyntaxKind[member.kind]} member this walk cannot classify — ` +
      `decide whether it is a declared field before trusting this guard`,
  );
}

/** The members an interface DECLARES lexically, index signatures aside. */
function interfaceMembers(file: string, name: string): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      found = true;

      for (const member of node.members) {
        if (!ts.isIndexSignatureDeclaration(member)) {
          names.push(propertyName(member, name));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `interface ${name}`, file);

  return names;
}

/** The string literals of a `Pick<…, "a" | "b">` alias. */
function pickLiterals(file: string, alias: string): string[] {
  const keys: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === alias) {
      found = true;

      const literals = (n: ts.Node): void => {
        if (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal)) {
          keys.push(n.literal.text);
        }

        ts.forEachChild(n, literals);
      };

      literals(node.type);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `type ${alias}`, file);

  return keys;
}

/** The members of an inline object type on a named function's Nth parameter. */
function parameterMembers(file: string, fn: string, index: number): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      const type = node.parameters[index]?.type;

      if (type !== undefined && ts.isTypeLiteralNode(type)) {
        found = true;

        for (const member of type.members) {
          names.push(propertyName(member, `${fn} parameter ${String(index)}`));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `${fn}'s object-typed parameter ${String(index)}`, file);

  return names;
}

/** The names bound by the first object destructuring inside a named function. */
function destructuredNames(file: string, fn: string): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      const walk = (n: ts.Node): void => {
        if (
          !found &&
          ts.isVariableDeclaration(n) &&
          ts.isObjectBindingPattern(n.name)
        ) {
          found = true;

          for (const element of n.name.elements) {
            const source = element.propertyName ?? element.name;

            if (!ts.isIdentifier(source)) {
              throw new Error(
                `${fn}: a binding element this walk cannot classify`,
              );
            }

            names.push(source.text);
          }
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `an object destructuring inside ${fn}`, file);

  return names;
}

/** Property names assigned on `<target>.<key> = …` inside a named function. */
function assignedProperties(
  file: string,
  fn: string,
  target: string,
): string[] {
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      found = true;

      const walk = (n: ts.Node): void => {
        if (
          ts.isBinaryExpression(n) &&
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(n.left) &&
          ts.isIdentifier(n.left.expression) &&
          n.left.expression.text === target
        ) {
          names.push(n.left.name.text);
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `function ${fn}`, file);

  return names;
}

/**
 * The `config.<map>` maps a named function touches, however it touches them —
 * `config.decoders[name]` on the read side, `clearConfigEntries(config.decoders, …)`
 * on the purge side. Keyed on the ACCESS, not on the call shape, so a third way of
 * touching a map is in scope by construction rather than by enumeration.
 */
function configMapsTouched(file: string, fn: string): string[] {
  const names = new Set<string>();
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      found = true;

      const walk = (n: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "config"
        ) {
          names.add(n.name.text);
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `function ${fn}`, file);

  return [...names];
}

/**
 * The keys a named function's RETURNED object literal produces, including the
 * ones contributed by a conditional spread — `...(x !== undefined && { k: v })`,
 * the shape `exactOptionalPropertyTypes` forces on an optional-field copy.
 *
 * ⚠ Throws on any other element shape rather than skipping it. A spread of a
 * variable, a computed key or a nested call each mean the copy is no longer a
 * flat enumeration this walk can read, and returning the shorter list would
 * report agreement with the type while missing exactly the member that broke it
 * — the #1738 failure this file exists to remove.
 */
function returnedLiteralKeys(
  file: string,
  fn: string,
  allowedBareReturns: readonly string[] = [],
): string[] {
  const names: string[] = [];
  let found = false;
  let literalReturns = 0;

  const fail = (why: string): never => {
    throw new Error(
      `${fn} in src/${file}: ${why} — the copy is no longer a flat enumeration ` +
        "this walk can read, and comparing a shorter list would report agreement " +
        "with the type while missing exactly the member that broke it",
    );
  };

  const collect = (literal: ts.ObjectLiteralExpression): void => {
    for (const element of literal.properties) {
      if (
        ts.isPropertyAssignment(element) ||
        ts.isShorthandPropertyAssignment(element)
      ) {
        names.push(propertyName(element as unknown as ts.TypeElement, fn));
        continue;
      }

      if (
        ts.isSpreadAssignment(element) &&
        ts.isParenthesizedExpression(element.expression) &&
        ts.isBinaryExpression(element.expression.expression) &&
        element.expression.expression.operatorToken.kind ===
          ts.SyntaxKind.AmpersandAmpersandToken &&
        ts.isObjectLiteralExpression(element.expression.expression.right)
      ) {
        collect(element.expression.expression.right);
        continue;
      }

      fail("a returned element this walk cannot read");
    }
  };

  /** The literal a return hands back, seeing through `Object.freeze(...)`. */
  const literalOf = (
    expression: ts.Expression,
  ): ts.ObjectLiteralExpression | undefined => {
    if (ts.isObjectLiteralExpression(expression)) {
      return expression;
    }

    if (
      ts.isCallExpression(expression) &&
      expression.arguments.length === 1 &&
      ts.isObjectLiteralExpression(expression.arguments[0])
    ) {
      return expression.arguments[0];
    }

    return undefined;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === fn) {
      found = true;

      const walk = (n: ts.Node): void => {
        // ⚠ Do NOT descend into a nested function: its `return` would be
        // collected as if it were this function's, so a helper's literal could
        // satisfy the relation for a caller that discards it.
        if (n !== node && ts.isFunctionLike(n)) {
          return;
        }

        if (ts.isReturnStatement(n)) {
          const expression = n.expression;

          if (expression === undefined) {
            return fail("a bare `return`");
          }

          const literal = literalOf(expression);

          if (literal === undefined) {
            // A named constant is the one other readable form — the absence
            // case. It must be declared as allowed, by name, at the call site.
            if (
              !ts.isIdentifier(expression) ||
              !allowedBareReturns.includes(expression.text)
            ) {
              return fail(
                "a `return` that is neither an object literal nor an allowed constant",
              );
            }

            return;
          }

          literalReturns += 1;

          if (literalReturns > 1) {
            // ⚑ The union across returns is what let a snapshot that dropped two
            // fields on EVERY path report the full key set: one branch named
            // them, another shipped. One literal return, or this walk cannot say
            // which one the caller gets.
            return fail("more than one object-literal `return`");
          }

          collect(literal);
        }

        ts.forEachChild(n, walk);
      };

      walk(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(file));
  anchor(found, `function ${fn}`, file);

  if (literalReturns === 0) {
    fail("no object-literal `return` at all");
  }

  return names;
}

interface Relation {
  readonly label: string;
  readonly why: string;
  readonly type: () => string[];
  readonly code: () => string[];
}

const ROUTES_STORE = "namespaces/RoutesNamespace/routesStore.ts";
const ROUTES_API = "api/getRoutesApi.ts";

const RELATIONS: Relation[] = [
  {
    label: "search-params Options ↔ snapshotQueryParams' copy",
    why: "a format field the snapshot does not name is dropped from what the matcher resolves, so the router silently falls back to that format's default — and the caller's own getOptions() still echoes the value they set, so the two disagree with nothing said",
    type: () => interfaceMembers("engine/search-params/types.ts", "Options"),
    code: () =>
      returnedLiteralKeys("Router.ts", "snapshotQueryParams", [
        "EMPTY_QUERY_PARAMS",
      ]),
  },
  {
    label: "RouteConfigUpdate ↔ commitRouteUpdate's destructure",
    why: "a patchable field the destructure does not name is silently ignored by update()",
    type: () => interfaceMembers("types/router.ts", "RouteConfigUpdate"),
    code: () => destructuredNames(ROUTES_STORE, "commitRouteUpdate"),
  },
  {
    label: "TreeStructuralPatch ↔ buildStructuralPatch's branches",
    why: "a structural field without a branch never reaches TREE_CHANGED, so subscribeChanges consumers never revalidate on it — the exact half INVARIANTS Route-Management #4 named four of five of",
    type: () => pickLiterals("types/tree-changed.ts", "TreeStructuralPatch"),
    code: () => assignedProperties(ROUTES_API, "buildStructuralPatch", "patch"),
  },
  {
    label: "RouteConfig ↔ the maps get()'s reconstruction reads",
    why: "a config map assignRouteConfig does not read is invisible to getRoutesApi(router).get(name), so the route it returns cannot round-trip through add()/replace()",
    type: () =>
      interfaceMembers("namespaces/RoutesNamespace/types.ts", "RouteConfig"),
    code: () => configMapsTouched(ROUTES_API, "assignRouteConfig"),
  },
  {
    label: "RouteConfig ↔ the maps remove() purges",
    why: "a config map clearRouteConfigurations does not purge keeps the removed route's entry, and a later add() of the same name inherits it",
    type: () =>
      interfaceMembers("namespaces/RoutesNamespace/types.ts", "RouteConfig"),
    code: () => configMapsTouched(ROUTES_API, "clearRouteConfigurations"),
  },
  {
    label: "RouteConfigUpdate ↔ the three commit paths that write it",
    why: "a destructured field that no commit path writes is dropped after being read — the scalars go through commitScalarConfig, forwardTo through prepareForwardTo's plan, the two guards through commitGuardUpdate",
    type: () => interfaceMembers("types/router.ts", "RouteConfigUpdate"),
    code: () => [
      ...parameterMembers(ROUTES_STORE, "commitScalarConfig", 2),
      "forwardTo",
      "canActivate",
      "canDeactivate",
    ],
  },
];

describe("Type-mirror authority — a hand-written enumeration equals its type", () => {
  it("the relation table is non-empty", () => {
    // Non-vacuity for the table itself: `it.each([])` registers zero cells and the
    // file passes on nothing. Measured on the #1738 guard — emptying its name list
    // took it from 22 tests to 1, green.
    // ⚠ Bump this WITH the table. It was written tight at 5 rows, so losing any
    // one relation reds; a sixth row added without bumping it let an OLD relation
    // be deleted in silence (measured: 6 passed, fully green).
    expect(RELATIONS.length).toBeGreaterThan(5);
  });

  it.each(RELATIONS.map((relation) => [relation.label, relation] as const))(
    "%s",
    (_label, relation) => {
      const type = relation.type();
      const code = relation.code();

      // Non-vacuity per relation, before any comparison: two empty lists are
      // "equal" and prove nothing.
      expect(type.length).toBeGreaterThan(0);
      expect(code.length).toBeGreaterThan(0);

      // Both directions, and each failure names the offending member rather than
      // printing two lists to diff by eye.
      expect(code.filter((name) => !type.includes(name))).toStrictEqual([]);
      expect(type.filter((name) => !code.includes(name))).toStrictEqual([]);
    },
  );
});
