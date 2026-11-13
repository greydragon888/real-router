import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `RouterValidator` only shrinks (#2388).
 *
 * New validation goes onto a check position or a diagnostic kind
 * (`packages/core/CLAUDE.md` › _Adding New Methods_), and every slice of the
 * conversion removes members. `MEMBERS` is the interface as it stands: a member
 * the walk finds outside it reds the first cell, and a row naming a member the
 * interface no longer declares reds the second, so a slice deletes its rows in
 * the same change. The file goes together with the interface.
 *
 * ⚠ The walk refuses a shape it cannot read rather than reading it as empty: no
 * declaration or a second one, a heritage clause, a namespace that is not a type
 * literal, a member without a name.
 */
const MEMBERS = [
  "routes.validateBuildPathArgs",
  "routes.validateMatchPathArgs",
  "routes.validateIsActiveRouteArgs",
  "routes.validateShouldUpdateNodeArgs",
  "routes.validateStateBuilderArgs",
  "routes.validateRouteName",
  "routes.validateSetRootPathArgs",

  "options.validateOptions",
  "options.validateResolvedDefaultRoute",

  "dependencies.validateDependencyName",
  "dependencies.validateSetDependencyArgs",
  "dependencies.validateDependenciesObject",
  "dependencies.validateDependencyExists",
  "dependencies.validateDependencyCount",
  "dependencies.validateCloneArgs",
  "dependencies.warnOverwrite",
  "dependencies.warnBatchOverwrite",
  "dependencies.warnRemoveNonExistent",

  "plugins.validatePluginLimit",
  "plugins.validateNoDuplicatePlugins",
  "plugins.validatePluginKeys",
  "plugins.validateCountThresholds",
  "plugins.warnBatchDuplicates",
  "plugins.warnPluginMethodType",

  "lifecycle.validateHandlerLimit",
  "lifecycle.validateCountThresholds",
  "lifecycle.warnOverwrite",
  "lifecycle.warnAsyncGuardSync",
  "lifecycle.warnNonBooleanGuardSync",
  "lifecycle.warnNonBooleanGuard",

  "navigation.validateNavigateToDefaultArgs",
  "navigation.validateNavigateToStateArgs",
  "navigation.validateNavigationOptions",
  "navigation.validateParamsShape",
  "navigation.validateSearch",
  "navigation.validateStartArgs",

  "state.validateMakeStateArgs",
  "state.validateAreStatesEqualArgs",
  "state.reportDroppedQueryKey",
  "state.reportUndeclaredParamKey",
  "state.reportCodecRoundTrip",

  "eventBus.validateListenerArgs",
  "eventBus.validateCountThresholds",
];

const FILE = path.resolve(__dirname, "../../src/types/RouterValidator.ts");

function nameOf(name: ts.PropertyName, source: ts.SourceFile): string {
  return ts.isIdentifier(name) ? name.text : name.getText(source);
}

/** Every member of `RouterValidator`, as `namespace.member`. */
function membersOf(text: string): string[] {
  const source = ts.createSourceFile(
    "RouterValidator.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = source.statements.filter(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === "RouterValidator",
  );

  if (declarations.length !== 1) {
    throw new Error(
      `Expected one RouterValidator interface, found ${declarations.length}`,
    );
  }

  const [declaration] = declarations;

  if (declaration.heritageClauses !== undefined) {
    throw new Error(
      "RouterValidator has a heritage clause, whose members the walk cannot see",
    );
  }

  const members: string[] = [];

  for (const namespace of declaration.members) {
    const label =
      namespace.name === undefined ? "?" : nameOf(namespace.name, source);

    if (
      !ts.isPropertySignature(namespace) ||
      namespace.type === undefined ||
      !ts.isTypeLiteralNode(namespace.type)
    ) {
      throw new Error(
        `RouterValidator.${label} is not a namespace written as a type literal`,
      );
    }

    for (const member of namespace.type.members) {
      if (member.name === undefined) {
        throw new Error(`RouterValidator.${label} has a member without a name`);
      }

      members.push(`${label}.${nameOf(member.name, source)}`);
    }
  }

  return members;
}

function refusalOf(text: string): string {
  try {
    membersOf(text);
  } catch (error) {
    return (error as Error).message;
  }

  return "no refusal";
}

describe("RouterValidator only shrinks (#2388)", () => {
  const declared = membersOf(readFileSync(FILE, "utf8"));
  const listed = new Set(MEMBERS);

  it("declares no member beyond the list", () => {
    expect(
      declared.filter((member) => !listed.has(member)),
      "new validation goes onto a check position or a diagnostic kind — packages/core/CLAUDE.md › Adding New Methods",
    ).toStrictEqual([]);
  });

  it("lists no member the interface no longer declares", () => {
    expect(
      MEMBERS.filter((member) => !declared.includes(member)),
      "a member that leaves RouterValidator leaves this list in the same change",
    ).toStrictEqual([]);
  });

  it("CONTROL — the walk reads a property, an optional property and a method", () => {
    expect(
      membersOf(`
        export interface RouterValidator {
          first: {
            property: (value: unknown) => void;
            optional?: () => void;
            method(value: unknown): void;
          };
          second: {};
        }
      `),
    ).toStrictEqual(["first.property", "first.optional", "first.method"]);
  });

  it("CONTROL — a shape the walk cannot read is refused, not read as empty", () => {
    expect(refusalOf("export interface Other { a: {} }")).toBe(
      "Expected one RouterValidator interface, found 0",
    );
    expect(
      refusalOf(
        "interface RouterValidator { a: {} }\ninterface RouterValidator { b: {} }",
      ),
    ).toBe("Expected one RouterValidator interface, found 2");
    expect(refusalOf("interface RouterValidator extends Base { a: {} }")).toBe(
      "RouterValidator has a heritage clause, whose members the walk cannot see",
    );
    expect(refusalOf("interface RouterValidator { a: Namespace }")).toBe(
      "RouterValidator.a is not a namespace written as a type literal",
    );
    expect(
      refusalOf("interface RouterValidator { validate(value: unknown): void }"),
    ).toBe(
      "RouterValidator.validate is not a namespace written as a type literal",
    );
    expect(
      refusalOf(
        "interface RouterValidator { a: { [name: string]: () => void } }",
      ),
    ).toBe("RouterValidator.a has a member without a name");
  });
});
