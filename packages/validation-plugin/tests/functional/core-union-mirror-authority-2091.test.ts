import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every list in this package that mirrors a core string-union, bound to the
 * union it mirrors (#2091).
 *
 * This plugin validates values core only expresses as TYPES. Core publishes no
 * runtime set for any of them, so #2088's shape — delete the mirror and let
 * core refuse — is not available here: there is nothing to delegate to. The
 * mirror has to exist, which leaves binding it as the only alternative to
 * letting it drift.
 *
 * ⚠ **The pairs are DECLARED, never discovered by name, and that is the whole
 * correctness of this file.** Core carries three different `trailingSlash`
 * unions at three layers, with three different member sets on purpose —
 * `types/router.ts` (router options, includes `preserve`),
 * `engine/path-matcher/types.ts` (build options, includes `default`) and
 * `RoutesNamespace.ts` (a node's own, three members). A walk that matched on
 * the property NAME would bind this package to whichever it happened to reach
 * and red on a difference the layers are entitled to.
 *
 * ⚠ **A failure here is a QUESTION, not a verdict.** Core widening a union is a
 * feature this package must learn; core narrowing one is a value this package
 * would still admit. The cell says the two disagree — which side moved, and
 * which should, is for the reader.
 */

const CORE_SRC = path.resolve(__dirname, "../../../core/src");
const PLUGIN_SRC = path.resolve(__dirname, "../../src");

const parse = (absolute: string): ts.SourceFile =>
  ts.createSourceFile(
    absolute,
    readFileSync(absolute, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

/**
 * Anchors every walk below: a name that stops resolving must red as loudly as a
 * set that stops matching, or a rename turns this file green by emptying it.
 */
const anchor = (found: boolean, what: string, where: string): void => {
  if (!found) {
    throw new Error(
      `${what} not found in ${where} — this file binds a set that no longer ` +
        "exists, so the walk cannot say whether the two still agree",
    );
  }
};

/** The string-literal members of a union, wherever the union is spelled. */
const unionMembers = (node: ts.TypeNode | undefined): string[] | undefined => {
  if (node === undefined) {
    return undefined;
  }

  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    return [node.literal.text];
  }

  if (!ts.isUnionTypeNode(node)) {
    return undefined;
  }

  const out: string[] = [];

  for (const member of node.types) {
    // `undefined` in an optional slot is absence, not a value this package
    // could be asked to admit.
    if (member.kind === ts.SyntaxKind.UndefinedKeyword) {
      continue;
    }

    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
      return undefined;
    }

    out.push(member.literal.text);
  }

  return out;
};

/** The members of `type <alias> = "a" | "b"` in one core file. */
const aliasMembers = (file: string, alias: string): string[] => {
  let members: string[] | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === alias) {
      members = unionMembers(node.type);
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(path.join(CORE_SRC, file)));
  anchor(members !== undefined, `a string union \`${alias}\``, `core/${file}`);

  return members ?? [];
};

/** The members of one property's inline union on a named interface. */
const propertyMembers = (
  file: string,
  iface: string,
  property: string,
): string[] => {
  let members: string[] | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === iface) {
      for (const member of node.members) {
        if (
          ts.isPropertySignature(member) &&
          ts.isIdentifier(member.name) &&
          member.name.text === property
        ) {
          members = unionMembers(member.type);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(path.join(CORE_SRC, file)));
  anchor(
    members !== undefined,
    `a string union on \`${iface}.${property}\``,
    `core/${file}`,
  );

  return members ?? [];
};

/** Every property name declared on a named interface, in either package. */
const interfaceKeys = (
  file: string,
  iface: string,
  root: string = CORE_SRC,
): string[] => {
  const keys: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === iface) {
      found = true;

      for (const member of node.members) {
        if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
          keys.push(member.name.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(path.join(root, file)));
  anchor(found, `interface \`${iface}\``, file);

  return keys;
};

/**
 * The literals of `<object>.<key>` where the object is a `const` initialised
 * with an object literal of `as const` arrays — the shape both mirrors use.
 */
const mirrorArray = (file: string, object: string, key: string): string[] => {
  let members: string[] | undefined;

  const literals = (node: ts.Node): string[] | undefined => {
    const array = ts.isAsExpression(node) ? node.expression : node;

    if (!ts.isArrayLiteralExpression(array)) {
      return undefined;
    }

    const out: string[] = [];

    for (const element of array.elements) {
      if (!ts.isStringLiteral(element)) {
        return undefined;
      }

      out.push(element.text);
    }

    return out;
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === object &&
      node.initializer !== undefined
    ) {
      const init = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;

      if (ts.isObjectLiteralExpression(init)) {
        for (const property of init.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === key
          ) {
            members = literals(property.initializer);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(path.join(PLUGIN_SRC, file)));
  anchor(
    members !== undefined,
    `a literal array \`${object}.${key}\``,
    `validation-plugin/${file}`,
  );

  return members ?? [];
};

/** The literals of a `const <name>: T[] = [...]` array. */
const literalArray = (file: string, name: string): string[] => {
  const out: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      found = true;

      for (const element of node.initializer.elements) {
        if (ts.isStringLiteral(element)) {
          out.push(element.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parse(path.join(PLUGIN_SRC, file)));
  anchor(found, `array \`${name}\``, `validation-plugin/${file}`);

  return out;
};

const sorted = (values: readonly string[]): string[] =>
  [...values].toSorted((a, b) => a.localeCompare(b));

interface Pair {
  readonly what: string;
  readonly mirror: () => string[];
  readonly owner: () => string[];
}

const PAIRS: readonly Pair[] = [
  {
    what: "trailingSlash — the ROUTER's option, not the build option",
    mirror: () =>
      mirrorArray(
        "validators/options.ts",
        "VALID_OPTION_VALUES",
        "trailingSlash",
      ),
    owner: () => propertyMembers("types/router.ts", "Options", "trailingSlash"),
  },
  {
    what: "queryParamsMode",
    mirror: () =>
      mirrorArray(
        "validators/options.ts",
        "VALID_OPTION_VALUES",
        "queryParamsMode",
      ),
    owner: () => aliasMembers("types/route-node-types.ts", "QueryParamsMode"),
  },
  {
    what: "urlParamsEncoding",
    mirror: () =>
      mirrorArray(
        "validators/options.ts",
        "VALID_OPTION_VALUES",
        "urlParamsEncoding",
      ),
    owner: () =>
      aliasMembers("engine/path-matcher/types.ts", "URLParamsEncodingType"),
  },
  {
    what: "arrayFormat",
    mirror: () =>
      mirrorArray("validators/options.ts", "VALID_QUERY_PARAMS", "arrayFormat"),
    owner: () => aliasMembers("engine/search-params/types.ts", "ArrayFormat"),
  },
  {
    what: "booleanFormat",
    mirror: () =>
      mirrorArray(
        "validators/options.ts",
        "VALID_QUERY_PARAMS",
        "booleanFormat",
      ),
    owner: () => aliasMembers("engine/search-params/types.ts", "BooleanFormat"),
  },
  {
    what: "nullFormat",
    mirror: () =>
      mirrorArray("validators/options.ts", "VALID_QUERY_PARAMS", "nullFormat"),
    owner: () => aliasMembers("engine/search-params/types.ts", "NullFormat"),
  },
  {
    what: "numberFormat",
    mirror: () =>
      mirrorArray(
        "validators/options.ts",
        "VALID_QUERY_PARAMS",
        "numberFormat",
      ),
    owner: () => aliasMembers("engine/search-params/types.ts", "NumberFormat"),
  },
  {
    what: "the route-config STORE slots — an interface mirror, not a union",
    mirror: () =>
      interfaceKeys(
        "validators/retrospective.ts",
        "LocalRouteConfig",
        PLUGIN_SRC,
      ),
    owner: () =>
      interfaceKeys("namespaces/RoutesNamespace/types.ts", "RouteConfig"),
  },
  {
    what: "the limit KEYS — a two-level mirror the type system watches only half of",
    mirror: () =>
      literalArray("validators/retrospective.ts", "expectedLimitKeys"),
    owner: () => interfaceKeys("types/limits.ts", "LimitsConfig"),
  },
];

describe("every core union this package mirrors is bound to it (#2091)", () => {
  it.each(PAIRS.map((pair) => [pair.what, pair] as const))(
    "%s",
    (_what, pair) => {
      expect(sorted(pair.mirror())).toStrictEqual(sorted(pair.owner()));
    },
  );

  it("CONTROL — the walks read real sets, so agreement is not emptiness", () => {
    // ⚑ Two independent non-vacuity checks. `toStrictEqual` between two empty
    // arrays passes, so a walk that silently stopped resolving would turn every
    // cell above green while binding nothing — the failure mode a table of
    // equalities cannot see from the inside.
    for (const pair of PAIRS) {
      expect(pair.mirror().length).toBeGreaterThan(1);
      expect(pair.owner().length).toBeGreaterThan(1);
    }

    // …and the sets are not all the same set, which a single shared constant
    // read twice would also satisfy.
    expect(new Set(PAIRS.map((pair) => pair.owner().join("|"))).size).toBe(
      PAIRS.length,
    );
  });

  it("CONTROL — the same-name trap the declared pairing exists to avoid", () => {
    // Core spells `trailingSlash` three times, deliberately differently. If the
    // pairing were discovered by NAME rather than declared, this package could
    // be bound to either of the other two and red on a difference the layers
    // are entitled to. Pinning the divergence keeps that reasoning checkable.
    const routerOption = propertyMembers(
      "types/router.ts",
      "Options",
      "trailingSlash",
    );
    const buildOption = propertyMembers(
      "engine/path-matcher/types.ts",
      "BuildPathOptions",
      "trailingSlash",
    );

    expect(sorted(routerOption)).not.toStrictEqual(sorted(buildOption));
    expect(routerOption).toContain("preserve");
    expect(buildOption).toContain("default");
  });
});
