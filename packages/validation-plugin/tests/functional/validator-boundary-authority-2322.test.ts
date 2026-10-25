import {
  existsSync,
  globSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createRouter } from "@real-router/core";
import {
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * Where core consults this plugin, and what reds when it stops acting (#2322).
 *
 * `packages/core/CLAUDE.md` › _Who refuses — core or the analyser_ states the
 * rule. This file is the half a rule cannot carry: the SET of places it applies
 * to, derived from core's source.
 *
 * ⚑ **The set is DERIVED and the owner is DECLARED.** {@link OWNER} is
 * hand-written, and it is safe to keep by hand only because the keys come from
 * the checker: a consultation it resolves to the interface and nobody
 * classifies reds this file on the commit that adds it. The same division the
 * door census uses.
 *
 * ⚑ **Every row was established by MUTATION, not by reading a file's title.**
 * Each consultation was replaced with a no-op and this package's whole suite
 * run against it; the row names one file that went red. It is not the only one
 * — several consultations red four or five — it is the most subject-specific of
 * them, so the row points a reader at the nearest authority rather than at a
 * list that churns whenever a neighbouring test is added.
 *
 * ⚠ **A no-op that reds NOTHING has two causes, and they are not the same.**
 * Either the effect is genuinely unheld, or core refuses the same input first
 * with the same wording, so the copy can never be observed — the shape #2307
 * found for the four `queryParams` format lists and deleted. A row of the first
 * kind is {@link SELF}, held by a cell in the third describe below; a row of the
 * second is {@link MIRRORED}.
 *
 * ⚠ **A row names a file that reds on BEHAVIOUR.**
 * `prefix-reachability-authority-2457` reads core's source for the doors a
 * message can name, so it can red when a consultation leaves the source, and it
 * stays green when the plugin's method stops acting. A row only it reds is
 * {@link SELF}.
 *
 * ⚠ **Silence is not redundancy.** `validateParamsShape` produces the same
 * message as a sibling at every door, measured. What the sibling cannot
 * reproduce is WHEN: the shape half runs before `adoptChannel` asks the caller's
 * bag for its own keys, so removing it adds an `ownKeys` trap on application
 * code ahead of the refusal. The cell below pins the trap sequence rather than
 * the message, which is the only form that can tell the two apart.
 *
 * ⚠ **A parity test cannot own a mirrored consultation, by construction.**
 * `bare-core-message-parity` compares the two tiers' MESSAGES, so it passes
 * whichever tier produced one — which is why no-oping `validateListenerArgs`
 * leaves it green although it does exercise that door. The mirroring is a
 * recorded decision (#1047 for the reserved prefix, #1888 / #2088 for the
 * listener arguments), not a gap to report as one.
 */

const CORE_SRC = path.resolve(__dirname, "../../../core/src");
const CORE_TSCONFIG = path.resolve(
  __dirname,
  "../../../core/tsconfig.src.json",
);
const HERE = __dirname;

/**
 * Core refuses the same input with the same wording, so no cell can tell the
 * tiers apart — the copy is a deliberate mirror, not a gap.
 *
 * ⚠ Unobservable is not unheld. The two WORDINGS are held against each other by
 * `bare-core-message-parity`, which calls this plugin's copy directly rather
 * than driving the door; what no cell can catch is the copy being REMOVED,
 * because core then prints the same string.
 */
const MIRRORED = "mirrored — core refuses first, same wording";

/** Held by the third describe in THIS file, because nothing else held it. */
const SELF = "validator-boundary-authority-2322.test.ts";

/**
 * One file that reds when the consultation is replaced with a no-op, or
 * {@link MIRRORED} when nothing can.
 */
const OWNER: Record<string, string> = {
  "dependencies.validateCloneArgs": "dependencies.validation.test.ts",
  "dependencies.validateDependenciesObject": "plain-bag-mirror-2282.test.ts",
  "dependencies.validateDependencyCount": "limits.test.ts",
  "dependencies.validateDependencyExists": "dependencies.validation.test.ts",
  "dependencies.validateDependencyName": "dependencies.validation.test.ts",
  "dependencies.validateSetDependencyArgs": "dependencies.validation.test.ts",
  "dependencies.warnBatchOverwrite": SELF,
  "dependencies.warnOverwrite": "dependencies-reentrancy-1859.test.ts",
  "dependencies.warnRemoveNonExistent": "dependencies.validation.test.ts",
  "eventBus.validateCountThresholds": "limits.test.ts",
  "eventBus.validateListenerArgs": MIRRORED,
  "lifecycle.validateCountThresholds": SELF,
  "lifecycle.validateHandlerLimit": "limits.test.ts",
  "lifecycle.warnAsyncGuardSync": "lifecycle.validation.test.ts",
  "lifecycle.warnNonBooleanGuard": "guard-answer-diagnostic-2823.test.ts",
  "lifecycle.warnNonBooleanGuardSync": "guard-answer-diagnostic-2823.test.ts",
  "lifecycle.warnOverwrite": "lifecycle.validation.test.ts",
  "navigation.validateNavigateToDefaultArgs": "defaults-mutation-2148.test.ts",
  "navigation.validateNavigateToStateArgs": "navigation.validation.test.ts",
  "navigation.validateNavigationOptions": "navigation.validation.test.ts",
  "navigation.validateParamsShape": SELF,
  "navigation.validateSearch": "both-channels-authority-1972.test.ts",
  "navigation.validateStartArgs": "router-methods.validation.test.ts",
  "options.validateResolvedDefaultRoute":
    "integration/retrospective-integration.test.ts",
  "plugins.validateCountThresholds": SELF,
  "plugins.validateNoDuplicatePlugins": "integration/plugin-lifecycle.test.ts",
  "plugins.validatePluginKeys": "plugin-api.validation.test.ts",
  "plugins.validatePluginLimit": "limits.test.ts",
  "plugins.warnBatchDuplicates": "plugin-api.validation.test.ts",
  "plugins.warnPluginMethodType": "plugin-api.validation.test.ts",
  "routes.validateBuildPathArgs": "router-methods.validation.test.ts",
  "routes.validateIsActiveRouteArgs": "predicate-totality-2245.test.ts",
  "routes.validateMatchPathArgs": SELF,
  "routes.validateRouteName": "route-name-doors.test.ts",
  "routes.validateSetRootPathArgs": "routes.validation.test.ts",
  "routes.validateShouldUpdateNodeArgs": "router-methods.validation.test.ts",
  "routes.validateStateBuilderArgs": "plugin-api.validation.test.ts",
  "state.reportDroppedQueryKey": "dropped-query-key.test.ts",
  "state.reportUndeclaredParamKey": "undeclared-param-key.test.ts",
  "state.validateAreStatesEqualArgs": "plugin-api.validation.test.ts",
  "state.validateMakeStateArgs": "plugin-api.validation.test.ts",
};

interface Census {
  /**
   * Every call whose callee is a property access the checker resolves to a
   * `RouterValidator` member, keyed `namespace.member` — by each member it can
   * reach, sorted and joined, for a receiver typed as a union of namespaces.
   */
  readonly sites: readonly { readonly key: string; readonly file: string }[];
  /**
   * Every other reference in a value position the checker resolves to a
   * member — an alias, a destructuring declaration, an element access. The
   * walk cannot say what such a reference consults, so it lists it rather
   * than skipping it.
   */
  readonly unread: readonly {
    readonly key: string;
    readonly file: string;
    readonly line: number;
  }[];
  /**
   * What the compiler reports on the tree. A name it cannot resolve leaves a
   * receiver without a type, and a call on that receiver resolves to nothing.
   */
  readonly diagnostics: readonly string[];
}

/**
 * A program over `root` compiled as core compiles: with the options of core's
 * `tsconfig.src.json`, and so its lib and its `types`. A receiver typed through
 * `Readonly<…>` or `NonNullable<…>` resolves only with the lib.
 */
function programOf(root: string): ts.Program {
  const config = ts.getParsedCommandLineOfConfigFile(
    CORE_TSCONFIG,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );

  if (config === undefined) {
    throw new Error(`${CORE_TSCONFIG} did not parse`);
  }

  return ts.createProgram(
    globSync(`${root}/**/*.ts`),
    config.options,
    ts.createCompilerHost(config.options),
  );
}

/**
 * Each member of the `RouterValidator` interface, by its declaration.
 *
 * ⚠ Refused, not dropped: a tree the walk would read in part — no interface,
 * two, a namespace its body does not list, a namespace or a member of another
 * shape — agrees with a table that is missing the rest.
 */
function membersOf(program: ts.Program): ReadonlyMap<ts.Node, string> {
  const declared = program
    .getSourceFiles()
    .flatMap((source) =>
      source.statements.filter(
        (statement): statement is ts.InterfaceDeclaration =>
          ts.isInterfaceDeclaration(statement) &&
          statement.name.text === "RouterValidator",
      ),
    );

  if (declared.length !== 1) {
    throw new Error(
      `Expected one RouterValidator interface, found ${declared.length}`,
    );
  }

  const members = new Map<ts.Node, string>();
  const listed = new Set<string>();

  for (const namespace of declared[0].members) {
    if (
      !ts.isPropertySignature(namespace) ||
      !ts.isIdentifier(namespace.name) ||
      namespace.type === undefined ||
      !ts.isTypeLiteralNode(namespace.type)
    ) {
      throw new Error(`A namespace of another shape: ${namespace.getText()}`);
    }

    listed.add(namespace.name.text);

    for (const member of namespace.type.members) {
      if (member.name === undefined || !ts.isIdentifier(member.name)) {
        throw new Error(`A member of another shape: ${member.getText()}`);
      }

      members.set(member, `${namespace.name.text}.${member.name.text}`);
    }
  }

  const unlisted = program
    .getTypeChecker()
    .getTypeAtLocation(declared[0].name)
    .getProperties()
    .map((property) => property.name)
    .filter((name) => !listed.has(name));

  if (unlisted.length > 0) {
    throw new Error(
      `RouterValidator has a namespace its body does not list: ${unlisted.join(", ")}`,
    );
  }

  return members;
}

/**
 * The receiver and the name of a reference that names its member by a value:
 * an element access, or a destructuring by a computed or quoted name.
 */
function namedByValue(
  node: ts.Node,
): { readonly receiver: ts.Node; readonly name: ts.Node } | undefined {
  if (ts.isElementAccessExpression(node)) {
    return { receiver: node.expression, name: node.argumentExpression };
  }

  if (
    ts.isBindingElement(node) &&
    node.propertyName !== undefined &&
    !ts.isIdentifier(node.propertyName)
  ) {
    return {
      receiver: node.parent,
      name: ts.isComputedPropertyName(node.propertyName)
        ? node.propertyName.expression
        : node.propertyName,
    };
  }

  return undefined;
}

/**
 * Every call the checker RESOLVES to a `RouterValidator` member, found by that
 * member rather than by how its receiver is spelled: `ctx.validator?.`, a
 * `getValidator()` result and a narrowed local reach the same declaration.
 */
function consultations(root: string = CORE_SRC): Census {
  const program = programOf(root);
  const checker = program.getTypeChecker();
  const members = membersOf(program);
  const names = new Set(
    [...members.values()].map((key) => key.split(".", 2)[1]),
  );
  const sites: { key: string; file: string }[] = [];
  const unread: { key: string; file: string; line: number }[] = [];

  // A symbol of a union or an intersection carries the declarations of every
  // constituent, in an order the walk does not choose; only the interface's
  // own map to a member, and their keys are sorted.
  const memberOf = (symbol: ts.Symbol | undefined): string | undefined => {
    const keys = new Set(
      symbol?.declarations?.flatMap(
        (declaration) => members.get(declaration) ?? [],
      ),
    );

    return keys.size === 0
      ? undefined
      : [...keys].toSorted((a, b) => a.localeCompare(b)).join(" | ");
  };

  // The constituents of a type, each read through its apparent type, since a
  // generic one among them can stand for a union of its own.
  const constituentsOf = (type: ts.Type): ts.Type[] => {
    const value = checker.getApparentType(type);

    return value.isUnion()
      ? value.types.flatMap((constituent) => constituentsOf(constituent))
      : [value];
  };

  // The namespaces the members of a value of this type belong to, sorted. A
  // union is read constituent by constituent: its members need not overlap.
  const namespacesOf = (type: ts.Type): string[] =>
    [
      ...new Set(
        constituentsOf(type)
          .flatMap((constituent) => checker.getPropertiesOfType(constituent))
          .flatMap((property) => property.declarations ?? [])
          .flatMap(
            (declaration) => members.get(declaration)?.split(".", 2)[0] ?? [],
          ),
      ),
    ].toSorted((a, b) => a.localeCompare(b));

  for (const source of program.getSourceFiles()) {
    const file = path.relative(root, source.fileName);
    const lineOf = (node: ts.Node): number =>
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

    const visit = (node: ts.Node): void => {
      // Only an identifier spelled like a member can resolve to one, so the
      // spelling decides which identifiers the checker is asked about.
      if (
        ts.isIdentifier(node) &&
        names.has(node.text) &&
        !members.has(node.parent)
      ) {
        const key = memberOf(checker.getSymbolAtLocation(node));
        const access = node.parent;

        if (key === undefined) {
          // A namesake, or the local a shorthand destructuring binds.
        } else if (
          ts.isCallExpression(access.parent) &&
          access.parent.expression === access
        ) {
          sites.push({ key, file });
        } else {
          unread.push({ key, file, line: lineOf(node) });
        }
      }

      // A shorthand destructuring names the member through the local it binds.
      if (
        ts.isBindingElement(node) &&
        node.propertyName === undefined &&
        ts.isIdentifier(node.name)
      ) {
        const key = memberOf(
          checker.getTypeAtLocation(node.parent).getProperty(node.name.text),
        );

        if (key !== undefined) {
          unread.push({ key, file, line: lineOf(node) });
        }
      }

      // A member named by a value is listed under each namespace its
      // receiver's members belong to.
      const named = namedByValue(node);

      if (named !== undefined) {
        const namespaces = namespacesOf(
          checker.getTypeAtLocation(named.receiver),
        );

        if (namespaces.length > 0) {
          unread.push({
            key: `${namespaces.join(" | ")}.${named.name.getText(source)}`,
            file,
            line: lineOf(node),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return {
    sites,
    unread,
    diagnostics: ts
      .getPreEmitDiagnostics(program)
      .map(({ messageText }) =>
        ts.flattenDiagnosticMessageText(messageText, " "),
      ),
  };
}

/** The census of a synthetic tree, each file given as its lines. */
function censusOf(files: Readonly<Record<string, readonly string[]>>): Census {
  const directory = mkdtempSync(path.join(tmpdir(), "boundary-2322-"));

  try {
    // NodeNext takes a file's module format from the nearest `package.json`,
    // so the tree declares its own rather than inherit the one above it.
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ type: "commonjs" }),
    );

    for (const [name, lines] of Object.entries(files)) {
      writeFileSync(path.join(directory, name), [...lines, ""].join("\n"));
    }

    return consultations(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The message `censusOf` refuses a synthetic tree with, or `"NO REFUSAL"`. */
function refusalOf(files: Readonly<Record<string, readonly string[]>>): string {
  try {
    censusOf(files);

    return "NO REFUSAL";
  } catch (error) {
    return (error as Error).message;
  }
}

const sorted = (names: Iterable<string>): string[] =>
  [...names].toSorted((left, right) => left.localeCompare(right));

describe("each consultation the walk derives from core is classified (#2322)", () => {
  const census = consultations();
  const sites = census.sites;
  const derived = new Set(sites.map(({ key }) => key));

  it("every reference to a member the walk finds in core is a call", () => {
    // A reference the walk lists is a consultation it cannot key, so it reds
    // here until the walk learns the form.
    expect(census.unread).toStrictEqual([]);
  });

  it("the compiler types every receiver in core's tree", () => {
    // A call on a receiver without a type resolves to nothing, and the walk
    // reads it as a namesake's, so the tree is held to compile.
    expect(census.diagnostics).toStrictEqual([]);
  });

  // Each synthetic tree below is compiled ONCE, here at collection, right above
  // the cell that reads it. A typed program built inside a cell runs under
  // `testTimeout`, which a cell building several can miss under coverage on a
  // loaded CI runner (#2818, #2839).

  // ⚑ The walk resolves calls through the checker, so each spelling of the
  // receiver here reaches the member — a property, a call's result, a narrowed
  // local, the namespace held apart, a type the lib builds, an intersection —
  // and a namesake on another object does not. A union of namespaces is keyed
  // by both members in sorted order, though the checker meets `plugins`
  // first, and an overloaded member once. A member handed on rather than
  // called is listed, and so is a renamed destructuring, once, whatever its
  // local is named. Here a member named by a value — an element access, a
  // computed or quoted destructuring — is listed under each namespace its
  // receiver reaches: a union read constituent by constituent, a generic
  // constituent through its apparent type.
  const spellings = censusOf({
    "RouterValidator.ts": [
      "export interface RouterValidator {",
      "  lifecycle: {",
      "    viewed: () => void;",
      "    property: () => void;",
      "    result: () => void;",
      "    narrowed: () => void;",
      "    apart: () => void;",
      "    unwrapped: () => void;",
      "    crossed: () => void;",
      "    shared: () => void;",
      "    destructured: () => void;",
      "    aliased: () => void;",
      "    indexed: () => void;",
      "    renamed: () => void;",
      "    passed: () => void;",
      "    bound: () => void;",
      "    overloaded(value: string): void;",
      "    overloaded(value: number): void;",
      "  };",
      "  plugins: {",
      "    shared: () => void;",
      "  };",
      "}",
    ],
    "consumer.ts": [
      'import type { RouterValidator } from "./RouterValidator";',
      "",
      "declare const ctx: { validator: RouterValidator | null };",
      "declare function getValidator(): RouterValidator | null;",
      "declare function consume(value: unknown): void;",
      "declare const present: NonNullable<typeof ctx.validator>;",
      "declare const crossing: { lifecycle: { crossed: () => void } } & RouterValidator;",
      'declare const either: RouterValidator["lifecycle"] | RouterValidator["plugins"];',
      "declare const timer: NodeJS.Timeout;",
      'declare const disjoint: Pick<RouterValidator["lifecycle"], "apart"> | RouterValidator["plugins"];',
      'declare const key: "renamed";',
      'declare const both: Pick<RouterValidator["lifecycle"], "shared"> & RouterValidator["plugins"];',
      "",
      "export function early(): void {",
      "  getValidator()?.plugins.shared();",
      "}",
      "",
      'export function view(lifecycle: Readonly<RouterValidator["lifecycle"]>): void {',
      "  lifecycle.viewed();",
      "}",
      "",
      "export function consult(): void {",
      "  ctx.validator?.lifecycle.property();",
      "  getValidator()?.lifecycle.result();",
      "  const validator = getValidator();",
      "  if (validator) {",
      "    validator.lifecycle.narrowed();",
      "  }",
      "  const lifecycle = getValidator()?.lifecycle;",
      "  lifecycle?.apart();",
      "  present.lifecycle.unwrapped();",
      "  crossing.lifecycle.crossed();",
      "  either.shared();",
      '  validator!.lifecycle.overloaded("x");',
      "  const {",
      "    destructured =",
      "      undefined,",
      "  } = validator!.lifecycle;",
      "  const aliased = validator?.lifecycle.aliased;",
      "  const indexed = lifecycle?.[",
      '    "indexed"',
      "  ];",
      '  const merged = both["shared"];',
      "  const {",
      "    [key]: byKey,",
      "  } = validator!.lifecycle;",
      '  const { "aliased": quoted } = validator!.lifecycle;',
      "  const { renamed: result } = validator!.lifecycle;",
      "  consume(validator?.lifecycle.passed);",
      "  consume(validator?.lifecycle.bound.bind(null));",
      "  const other = { lifecycle: { property: (): void => {} } };",
      "  other.lifecycle.property();",
      "  void destructured; void aliased; void indexed; void result; void timer;",
      "  void merged; void byKey; void quoted;",
      "}",
      "",
      'export function generic<T extends typeof disjoint, U extends RouterValidator["plugins"]>(',
      "  value: T | U,",
      "  name: keyof T & keyof U,",
      "): void {",
      "  void value[name];",
      "}",
      "",
      'export function joined<T extends typeof disjoint, U extends RouterValidator["plugins"]>(',
      "  value: (T & U) | undefined,",
      "  name: keyof (T & U),",
      "): void {",
      "  void value?.[name];",
      "}",
    ],
  });

  it("CONTROL — the walk keys each spelling of the receiver, and lists what it cannot key", () => {
    expect(spellings.sites).toStrictEqual([
      { key: "plugins.shared", file: "consumer.ts" },
      { key: "lifecycle.viewed", file: "consumer.ts" },
      { key: "lifecycle.property", file: "consumer.ts" },
      { key: "lifecycle.result", file: "consumer.ts" },
      { key: "lifecycle.narrowed", file: "consumer.ts" },
      { key: "lifecycle.apart", file: "consumer.ts" },
      { key: "lifecycle.unwrapped", file: "consumer.ts" },
      { key: "lifecycle.crossed", file: "consumer.ts" },
      { key: "lifecycle.shared | plugins.shared", file: "consumer.ts" },
      { key: "lifecycle.overloaded", file: "consumer.ts" },
    ]);
    expect(spellings.unread).toStrictEqual([
      { key: "lifecycle.destructured", file: "consumer.ts", line: 36 },
      { key: "lifecycle.aliased", file: "consumer.ts", line: 39 },
      { key: 'lifecycle."indexed"', file: "consumer.ts", line: 40 },
      { key: 'lifecycle | plugins."shared"', file: "consumer.ts", line: 43 },
      { key: "lifecycle.key", file: "consumer.ts", line: 45 },
      { key: 'lifecycle."aliased"', file: "consumer.ts", line: 47 },
      { key: "lifecycle.renamed", file: "consumer.ts", line: 48 },
      { key: "lifecycle.passed", file: "consumer.ts", line: 49 },
      { key: "lifecycle.bound", file: "consumer.ts", line: 50 },
      { key: "lifecycle | plugins.name", file: "consumer.ts", line: 61 },
      { key: "lifecycle | plugins.name", file: "consumer.ts", line: 68 },
    ]);
    // The tree compiles under core's own options — its `types` declare
    // `NodeJS.Timeout` — so what the walk misses in it is the walk's.
    expect(spellings.diagnostics).toStrictEqual([]);
  });

  const broken = censusOf({
    "RouterValidator.ts": [
      "export interface RouterValidator {",
      "  lifecycle: {",
      "    member: () => void;",
      "  };",
      "}",
    ],
    "broken.ts": ["export const broken = ;"],
    "consumer.ts": [
      'import type { RouterValidator } from "./RouterValidator";',
      "",
      "declare const untyped: Missing<RouterValidator>;",
      "untyped.lifecycle.member();",
    ],
  });

  it("CONTROL — a syntax error and an unresolved name are reported, and a receiver the compiler cannot type is not keyed", () => {
    expect(broken.sites).toStrictEqual([]);
    expect(broken.unread).toStrictEqual([]);
    expect(broken.diagnostics).toStrictEqual([
      "Expression expected.",
      "Cannot find name 'Missing'.",
    ]);
  });

  const declaration = [
    "export interface RouterValidator {",
    "  lifecycle: {",
    "    member: () => void;",
    "  };",
    "}",
  ];
  const refused = {
    noInterface: refusalOf({ "consumer.ts": ["export {};"] }),
    twoInterfaces: refusalOf({
      "first.ts": declaration,
      "second.ts": declaration,
    }),
    inheritedNamespaces: refusalOf({
      "RouterValidator.ts": [
        "export interface RouterValidator extends Base {",
        "  lifecycle: {",
        "    member: () => void;",
        "  };",
        "}",
        "interface Base {",
        "  plugins: {",
        "    member: () => void;",
        "  };",
        "  routes: {",
        "    member: () => void;",
        "  };",
        "}",
      ],
    }),
    namedNamespace: refusalOf({
      "RouterValidator.ts": [
        "export interface RouterValidator {",
        "  lifecycle: Lifecycle;",
        "}",
        "interface Lifecycle {",
        "  member: () => void;",
        "}",
      ],
    }),
    quotedMember: refusalOf({
      "RouterValidator.ts": [
        "export interface RouterValidator {",
        "  lifecycle: {",
        '    "quoted": () => void;',
        "  };",
        "}",
      ],
    }),
  };

  it("CONTROL — a tree the walk cannot read is refused, not read as empty", () => {
    expect(refused.noInterface).toContain(
      "Expected one RouterValidator interface, found 0",
    );
    expect(refused.twoInterfaces).toContain(
      "Expected one RouterValidator interface, found 2",
    );
    expect(refused.inheritedNamespaces).toContain(
      "RouterValidator has a namespace its body does not list: plugins, routes",
    );
    expect(refused.namedNamespace).toContain("A namespace of another shape");
    expect(refused.quotedMember).toContain("A member of another shape");
  });

  it("the declared table covers the derived set, in both directions", () => {
    // ⚑ This is the ratchet. A member core starts consulting reds here until
    // someone runs it against this package's suite and records what held it,
    // and a member core stops consulting reds here until its row goes.
    expect(sorted(Object.keys(OWNER))).toStrictEqual(sorted(derived));
  });

  it("every authority a row cites exists", () => {
    const cited = sorted(
      new Set(Object.values(OWNER).filter((owner) => owner !== MIRRORED)),
    );

    expect(cited.length).toBeGreaterThan(0);

    expect(
      cited.filter((file) => !existsSync(path.join(HERE, file))),
    ).toStrictEqual([]);
  });

  it("the copies nothing can observe are exactly these", () => {
    // ⚠ EXACT, not a floor. A row leaving this set is someone deciding the copy
    // became observable — or that it should go, the way #2307 retired four
    // lists once measurement showed core refusing first.
    expect(
      sorted(
        Object.entries(OWNER)
          .filter(([, owner]) => owner === MIRRORED)
          .map(([key]) => key),
      ),
    ).toStrictEqual(["eventBus.validateListenerArgs"]);
  });

  it("CONTROL — the walk reaches core and sees a consultation made twice", () => {
    // A walk that silently matched nothing would agree with an empty table, and
    // one that collapsed every site into one key would hide the file spread.
    expect(derived).toContain("routes.validateBuildPathArgs");
    expect(sites.length).toBeGreaterThan(derived.size);
  });
});

describe("the analyser's reach decides which side refuses (#2322)", () => {
  const router = createRouter([{ name: "a", path: "/a" }], {
    logger: { level: "warn-error" },
    queryParams: { arrayFormat: "none" },
  });
  const stored: object = getPluginApi(router).getOptions();

  it("what the retrospective pass reads is what the plugin can judge", () => {
    // Anti-vacuum: an empty bag would make the absence below meaningless.
    expect(Object.keys(stored).length).toBeGreaterThan(0);

    expect("queryParams" in stored).toBe(true);
  });

  it("logger is stripped before the pass runs, so core refuses there instead", () => {
    // ⚑ The rule's second clause, as a measurement rather than a sentence: this
    // is the one closed sub-bag the analyser cannot see, and the only one whose
    // unknown KEY bare core refuses.
    expect("logger" in stored).toBe(false);

    expect(() =>
      createRouter([{ name: "a", path: "/a" }], {
        logger: { bogus: 1 } as never,
      }),
    ).toThrow('Unknown logger config property: "bogus"');
  });

  it("CONTROL — an unknown key in a bag the pass DOES read is not core's to refuse", () => {
    expect(() =>
      createRouter([{ name: "a", path: "/a" }], {
        queryParams: { bogus: 1 } as never,
      }),
    ).not.toThrow();
  });
});

describe("what nothing else held (#2322)", () => {
  // ⚑ Each cell asserts BOTH arms. Asserting only the plugin's would pass for a
  // consultation core already covers, which is exactly what the sweep had to
  // separate out — and it is what makes no-oping the method red this file.
  //
  // `throwIfInternalRouteInArray` and `validateParentOption` reach core through
  // `addCheck` rather than a member, so the walk above does not key them.
  const ROUTES = [
    { name: "a", path: "/a/:id" },
    { name: "b", path: "/b" },
  ];

  const make = (withPlugin: boolean): Router => {
    const router = createRouter([...ROUTES], { allowNotFound: true });

    if (withPlugin) {
      router.usePlugin(validationPlugin());
    }

    return router;
  };

  const refusalOf = (run: (router: Router) => unknown, withPlugin: boolean) => {
    try {
      run(make(withPlugin));

      return "NO THROW";
    } catch (error) {
      return (error as Error).message;
    }
  };

  it("warnBatchOverwrite — setDependencies says which keys it replaced", () => {
    const router = make(true);
    const warn = vi
      .spyOn(getInternals(router).logger, "warn")
      .mockImplementation(() => undefined);

    getDependenciesApi(router).setAll({ x: 1 });
    getDependenciesApi(router).setAll({ x: 2 });

    expect(warn.mock.calls.map((call) => call.join(" "))).toStrictEqual([
      "router.setDependencies Overwritten: x",
    ]);

    const bareRouter = make(false);
    const bareWarn = vi
      .spyOn(getInternals(bareRouter).logger, "warn")
      .mockImplementation(() => undefined);

    getDependenciesApi(bareRouter).setAll({ x: 1 });
    getDependenciesApi(bareRouter).setAll({ x: 2 });

    expect(bareWarn.mock.calls).toStrictEqual([]);
  });

  /**
   * What the router warns while `register` runs, one message a call; the
   * channel is not the subject here.
   */
  const warningsOf = (router: Router, register: () => void): unknown[] => {
    const warn = vi
      .spyOn(getInternals(router).logger, "warn")
      .mockImplementation(() => undefined);

    register();

    return warn.mock.calls.map(([, message]) => message);
  };

  it("lifecycle.validateCountThresholds — a growing guard registry is named as it grows", () => {
    // `maxLifecycleHandlers: 10` puts the warning at the second guard.
    const run = (withPlugin: boolean): unknown[] => {
      const router = createRouter([...ROUTES], {
        limits: { maxLifecycleHandlers: 10 },
      });

      if (withPlugin) {
        router.usePlugin(validationPlugin());
      }

      return warningsOf(router, () => {
        getLifecycleApi(router).addActivateGuard("a", () => () => true);
        getLifecycleApi(router).addActivateGuard("b", () => () => true);
      });
    };

    expect(run(true)).toStrictEqual([
      "2 lifecycle handlers registered. Consider consolidating logic.",
    ]);
    expect(run(false)).toStrictEqual([]);
  });

  it("plugins.validateCountThresholds — a growing plugin list is named as it grows", () => {
    // `maxPlugins: 10` puts the warning at the second plugin, this one counted.
    const run = (withPlugin: boolean): unknown[] => {
      const router = createRouter([...ROUTES], { limits: { maxPlugins: 10 } });

      if (withPlugin) {
        router.usePlugin(validationPlugin());
      }

      return warningsOf(router, () => {
        router.usePlugin(() => ({}));
        router.usePlugin(() => ({}));
      });
    };

    expect(run(true)).toStrictEqual([
      "2 plugins registered. Consider if all are necessary.",
      "3 plugins registered. Consider if all are necessary.",
    ]);
    expect(run(false)).toStrictEqual([]);
  });

  it("validateParamsShape — the refusal lands BEFORE the caller's bag is walked", () => {
    // ⚑ The subject is the TRAP SEQUENCE, not the message: every door produces
    // the same wording either way, because `isParams` re-applies the shape rules
    // to core's copy one call later. What only this consultation can do is
    // refuse before `adoptChannel` asks the bag for its own keys — application
    // code that a wrong-shape argument should never have reached.
    const reads: string[] = [];

    // A class INSTANCE, because a wrong shape is what the consultation refuses;
    // the accessor is on the prototype, which is what makes it the wrong shape.
    const instance = Object.create({
      get id(): string {
        return "7";
      },
    }) as object;

    const watched = new Proxy(instance, {
      get(target, key, receiver) {
        if (typeof key === "string") {
          reads.push(`get:${key}`);
        }

        return Reflect.get(target, key, receiver) as unknown;
      },
      ownKeys(target) {
        reads.push("ownKeys");

        return Reflect.ownKeys(target);
      },
    });

    expect(() => make(true).buildPath("a", watched as never)).toThrow(
      "params must be a plain object",
    );

    expect(reads).toStrictEqual(["get:constructor"]);
  });

  it("throwIfInternalRouteInArray — replaceRoutes names the door the caller called", () => {
    // ⚑ The only site of the four where this is not a mirror. Core's own refusal
    // lives inside the add path, so bare it reports `addRoute` for a call the
    // application made to `replace` — the plugin's copy is what keeps the door
    // name true. At `addRoute` itself the two are identical, which is why a
    // cell built on that door alone would pass with the copy removed.
    const run = (router: Router): unknown => {
      getRoutesApi(router).replace([{ name: "@@x", path: "/x" }]);

      return undefined;
    };

    expect(refusalOf(run, true)).toMatch(/^\[router\.replaceRoutes\]/u);

    expect(refusalOf(run, false)).toMatch(/^\[router\.addRoute\]/u);
  });

  it("validateMatchPathArgs — a non-string path is named, not a crash inside", () => {
    const run = (router: Router): unknown =>
      getPluginApi(router).matchPath(123 as never);

    expect(refusalOf(run, true)).toBe(
      "[router.matchPath] path must be a string, got number",
    );

    expect(refusalOf(run, false)).toBe("path.codePointAt is not a function");
  });

  it("validateParentOption — a non-string parent is refused by TYPE", () => {
    // ⚠ Bare core answers too, and differently: it reads the value as a name and
    // reports the route as missing. The divergence is the message, which is the
    // whole product of this consultation.
    const run = (router: Router): unknown => {
      getRoutesApi(router).add(
        { name: "k", path: "/k" },
        { parent: 42 as never },
      );

      return undefined;
    };

    expect(refusalOf(run, true)).toBe(
      "[router.addRoute] parent option must be a non-empty string, got number",
    );

    expect(refusalOf(run, false)).toBe(
      '[router.addRoute] Parent route "42" does not exist',
    );
  });
});
