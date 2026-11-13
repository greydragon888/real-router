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
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { LoggerConfig, Router } from "@real-router/core";

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
 * ⚑ **The plugin's registrations are a second table, owned the same way.** Core
 * reaches a check or a diagnostic through a channel rather than a member, so
 * {@link OWNER} never meets one. {@link REGISTRATION_OWNER} keys each call a
 * registration's callback makes as a statement, `<position> › <callee>`, and
 * each row names a file that went red with that one call removed.
 *
 * ⚠ **A no-op that reds NOTHING has two causes, and they are not the same.**
 * Either the effect is genuinely unheld, or core refuses the same input with
 * the same wording, so the copy can never be observed — the shape #2307 found
 * for the four `queryParams` format lists and deleted. A row of the first kind
 * is {@link SELF}, held by a cell in the describe "what nothing else held"
 * below; a row of the second is {@link MIRRORED}.
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
const PLUGIN_SRC = path.resolve(__dirname, "../../src");
const PLUGIN_TSCONFIG = path.resolve(__dirname, "../../tsconfig.src.json");

/**
 * Core refuses the same input with the same wording, so no cell can tell the
 * tiers apart — the copy is a deliberate mirror, not a gap.
 *
 * ⚠ Unobservable is not unheld. The two WORDINGS are held against each other by
 * `bare-core-message-parity`, which calls this plugin's copy directly rather
 * than driving the door; what no cell can catch is the copy being REMOVED,
 * because core then prints the same string.
 */
const MIRRORED = "mirrored — core refuses the same input, same wording";

/**
 * Held by the describe "what nothing else held" in THIS file, because nothing
 * else held it.
 */
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
  "state.reportCodecRoundTrip": "codec-round-trip.test.ts",
  "state.reportDroppedQueryKey": "dropped-query-key.test.ts",
  "state.reportUndeclaredParamKey": "undeclared-param-key.test.ts",
  "state.validateAreStatesEqualArgs": "plugin-api.validation.test.ts",
  "state.validateMakeStateArgs": "plugin-api.validation.test.ts",
};

/**
 * One file that reds when that call is removed from its registration's
 * callback, or {@link MIRRORED} when nothing can. Keyed `<position> › <callee>`
 * by {@link registrations}.
 */
const REGISTRATION_OWNER: Record<string, string> = {
  "PLUGIN_AFTER_START › warnPluginAfterStart": "plugin-api.validation.test.ts",
  "addActivateGuard:entry › validateHandler": "lifecycle.validation.test.ts",
  "addActivateGuard:entry › validateRouteName": "lifecycle.validation.test.ts",
  "addDeactivateGuard:entry › validateHandler": SELF,
  "addDeactivateGuard:entry › validateRouteName":
    "lifecycle.validation.test.ts",
  "addRoute:batch › checkRouteBatch": "routes.validation.test.ts",
  "buildNavigationState:state › validateSearch":
    "both-channels-authority-1972.test.ts",
  "buildNavigationState:state › validateStateBuilderArgs":
    "plugin-api.validation.test.ts",
  "buildPath:params › validateNavigateParams":
    "check-channel-consumer-2388.test.ts",
  "buildPathResolved:params › validateNavigateParams":
    "check-channel-consumer-2388.test.ts",
  "canNavigateTo:entry › validateNavigateParamsShape": SELF,
  "canNavigateTo:entry › validateRouteName": "route-name-doors.test.ts",
  "canNavigateTo:entry › validateSearch":
    "both-channels-authority-1972.test.ts",
  "canNavigateTo:params › validateNavigateParams":
    "predicate-totality-2245.test.ts",
  "forwardState:entry › validateSearch": "both-channels-authority-1972.test.ts",
  "forwardState:entry › validateStateBuilderArgs":
    "plugin-api.validation.test.ts",
  "getRoute:entry › validateRouteName": "routes.validation.test.ts",
  "hasRoute:entry › validateRouteName": "routes.validation.test.ts",
  "navigate:entry › validateNavigateArgs": "navigation.validation.test.ts",
  "navigate:entry › validateNavigateParamsShape": SELF,
  "navigate:entry › validateNavigationOptions": "navigation.validation.test.ts",
  "navigate:entry › validateSearch": "both-channels-authority-1972.test.ts",
  "navigate:params › validateNavigateParams": "navigation.validation.test.ts",
  "removeActivateGuard:entry › validateRouteName":
    "check-channel-consumer-2388.test.ts",
  "removeDeactivateGuard:entry › validateRouteName":
    "check-channel-consumer-2388.test.ts",
  "removeRoute:entry › throwIfInternalRoute": MIRRORED,
  "removeRoute:entry › validateRemoveRouteArgs":
    "route-door-prefix-2399.test.ts",
  "replaceRoutes:batch › checkRouteBatch": "replace-whole-table-2562.test.ts",
  "updateRoute:entry › throwIfInternalRoute": MIRRORED,
  "updateRoute:entry › validateUpdateRoute": "routes.validation.test.ts",
  "updateRoute:entry › validateUpdateRouteBasicArgs":
    "route-door-prefix-2399.test.ts",
  "updateRoute:entry › validateUpdateRoutePropertyTypes":
    "routes.validation.test.ts",
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
 * A program over `root` compiled as a package compiles — core unless `tsconfig`
 * names another: with the options of its `tsconfig.src.json`, and so its lib
 * and its `types`. A receiver typed through `Readonly<…>` or `NonNullable<…>`
 * resolves only with the lib.
 */
function programOf(root: string, tsconfig: string = CORE_TSCONFIG): ts.Program {
  const config = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
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
    throw new Error(`${tsconfig} did not parse`);
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

/** The members a plugin registers a check or a diagnostic through. */
const CHANNELS: ReadonlySet<string> = new Set([
  "addCheck",
  "subscribeDiagnostic",
]);

interface Registrations {
  /**
   * Each call a registration's callback makes as a statement, keyed
   * `<position> › <callee>`, in source order. A registration is a call whose
   * signature the checker resolves to a channel's declaration.
   */
  readonly leaves: readonly string[];
  /**
   * Every other reference to a channel — handed on, applied through `.call`,
   * destructured. The walk cannot say what such a reference registers, so it
   * lists it rather than skipping it.
   */
  readonly unread: readonly {
    readonly name: string;
    readonly file: string;
    readonly line: number;
  }[];
  /** What the compiler reports on the tree, as for {@link Census}. */
  readonly diagnostics: readonly string[];
}

/**
 * The signature each channel is declared with in the tree's own sources: a
 * method signature, or the function type of a property signature.
 *
 * ⚠ Refused, not dropped: a channel declared nowhere, or in another shape,
 * leaves its calls resolving to nothing — which reads as a plugin that
 * registers nothing.
 *
 * ⚠ A namesake declared as a signature reads as a channel. Its calls then
 * key rows the table lacks, so it reds rather than hides.
 */
function channelsOf(program: ts.Program): ReadonlyMap<ts.Node, string> {
  const channels = new Map<ts.Node, string>();

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (
        (ts.isPropertySignature(node) || ts.isMethodSignature(node)) &&
        ts.isIdentifier(node.name) &&
        CHANNELS.has(node.name.text)
      ) {
        const signature = ts.isPropertySignature(node) ? node.type : node;

        if (
          signature === undefined ||
          !(ts.isFunctionTypeNode(signature) || ts.isMethodSignature(signature))
        ) {
          throw new Error(
            `A channel of another shape: ${node.getText(source)}`,
          );
        }

        channels.set(signature, node.name.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  const declared = new Set(channels.values());
  const missing = [...CHANNELS].filter((name) => !declared.has(name));

  if (missing.length > 0) {
    throw new Error(`No declaration of ${missing.join(", ")}`);
  }

  return channels;
}

/** Whether `node` holds a call, a `new` or a tagged template. */
const callsAnything = (node: ts.Node): boolean =>
  ts.isCallExpression(node) ||
  ts.isNewExpression(node) ||
  ts.isTaggedTemplateExpression(node) ||
  (ts.forEachChild(node, callsAnything) ?? false);

/**
 * The calls a registration's callback makes as statements, each keyed by the
 * registration's position or kind.
 *
 * ⚠ A binding that calls nothing is skipped, because it judges nothing. Every
 * other statement is refused: a branch or a binding that calls would hide a
 * call the table must own.
 */
function leavesOf(
  registration: ts.CallExpression,
  source: ts.SourceFile,
): string[] {
  // ⚠ Indexed access is typed as present and IS undefined for a call with
  // fewer arguments, so the cast is a guard rather than noise.
  const [key, callback] = registration.arguments as readonly (
    ts.Expression | undefined
  )[];
  // ⚠ Not `file:line`: `line-anchor-authority` reads that shape as a citation
  // of our code, and the controls below pin this text.
  const at = `line ${
    source.getLineAndCharacterOfPosition(registration.getStart(source)).line + 1
  } of ${path.basename(source.fileName)}`;

  if (key === undefined || !ts.isStringLiteralLike(key)) {
    throw new Error(`A registration whose key is not a literal, at ${at}`);
  }

  if (
    callback === undefined ||
    !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
  ) {
    throw new Error(
      `A registration whose callback is not written inline, at ${at}`,
    );
  }

  const statements: readonly ts.Node[] = ts.isBlock(callback.body)
    ? callback.body.statements
    : [callback.body];
  const leaves: string[] = [];

  for (const statement of statements) {
    const expression = ts.isExpressionStatement(statement)
      ? statement.expression
      : statement;

    if (ts.isCallExpression(expression)) {
      leaves.push(`${key.text} › ${expression.expression.getText(source)}`);
    } else if (!ts.isVariableStatement(statement) || callsAnything(statement)) {
      throw new Error(
        `A statement of another shape in ${key.text}: ${
          statement.getText(source).split("\n", 1)[0]
        }`,
      );
    }
  }

  return leaves;
}

/**
 * Each call this plugin's registrations make, found by the channel the checker
 * resolves a call's signature to — so the callee's spelling does not decide
 * which calls are registrations.
 *
 * ⚠ Refused, not dropped: a key not written as a literal, a callback not
 * written inline, a statement {@link leavesOf} cannot read, a key reached
 * twice. A walk that skipped them would agree with a table missing their rows.
 */
function registrations(
  root: string = PLUGIN_SRC,
  tsconfig: string = PLUGIN_TSCONFIG,
): Registrations {
  const program = programOf(root, tsconfig);
  const checker = program.getTypeChecker();
  const channels = channelsOf(program);
  const leaves: string[] = [];
  const unread: { name: string; file: string; line: number }[] = [];

  // A symbol names a channel when a declaration of it holds a channel's
  // signature; a mapped type's property keeps the declaration it maps.
  const channelOf = (symbol: ts.Symbol | undefined): string | undefined =>
    symbol?.declarations
      ?.map((declaration) =>
        channels.get(
          ts.isPropertySignature(declaration)
            ? (declaration.type ?? declaration)
            : declaration,
        ),
      )
      .find((name) => name !== undefined);

  const isCallee = (node: ts.Node): boolean =>
    ts.isCallExpression(node.parent) && node.parent.expression === node;

  for (const source of program.getSourceFiles()) {
    const file = path.relative(root, source.fileName);

    // Only this plugin's files register; core's are read for their types.
    if (file.startsWith("..") || source.isDeclarationFile) {
      continue;
    }

    const lineOf = (node: ts.Node): number =>
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const declaration = checker.getResolvedSignature(node)?.declaration;

        if (declaration !== undefined && channels.has(declaration)) {
          leaves.push(...leavesOf(node, source));
        }
      }

      let named: string | undefined;

      if (ts.isPropertyAccessExpression(node) && !isCallee(node)) {
        named = channelOf(checker.getSymbolAtLocation(node.name));
      } else if (ts.isElementAccessExpression(node) && !isCallee(node)) {
        named = channelOf(checker.getSymbolAtLocation(node.argumentExpression));
      } else if (
        ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent)
      ) {
        const property = node.propertyName ?? node.name;

        named = ts.isIdentifier(property)
          ? channelOf(
              checker.getTypeAtLocation(node.parent).getProperty(property.text),
            )
          : undefined;
      }

      if (named !== undefined) {
        unread.push({ name: named, file, line: lineOf(node) });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  const repeated = leaves.filter(
    (leaf, index) => leaves.indexOf(leaf) !== index,
  );

  if (repeated.length > 0) {
    throw new Error(`A call keyed twice: ${repeated.join(", ")}`);
  }

  return {
    leaves,
    unread,
    diagnostics: ts
      .getPreEmitDiagnostics(program)
      .map(({ messageText }) =>
        ts.flattenDiagnosticMessageText(messageText, " "),
      ),
  };
}

/** A synthetic tree, each file given as its lines. */
type Tree = Readonly<Record<string, readonly string[]>>;

/** What `read` derives from a synthetic tree, written to a fresh directory. */
function inTree<T>(files: Tree, read: (root: string) => T): T {
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

    return read(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The census of a synthetic tree. */
const censusOf = (files: Tree): Census =>
  inTree(files, (root) => consultations(root));

/** The registrations of a synthetic tree, compiled with this plugin's options. */
const registrationsOf = (files: Tree): Registrations =>
  inTree(files, (root) => registrations(root));

/** The message `read` refuses a synthetic tree with, or `"NO REFUSAL"`. */
function refusalOf(
  files: Tree,
  read: (root: string) => unknown = (root) => consultations(root),
): string {
  try {
    inTree(files, read);

    return "NO REFUSAL";
  } catch (error) {
    return (error as Error).message;
  }
}

const sorted = (names: Iterable<string>): string[] =>
  [...names].toSorted((left, right) => left.localeCompare(right));

/** The files a table cites, each once, sorted. */
const citedBy = (table: Readonly<Record<string, string>>): string[] =>
  sorted(new Set(Object.values(table).filter((owner) => owner !== MIRRORED)));

/** The files a table cites that this directory does not hold. */
const absentFrom = (table: Readonly<Record<string, string>>): string[] =>
  citedBy(table).filter((file) => !existsSync(path.join(HERE, file)));

/** The keys a table records as {@link MIRRORED}, sorted. */
const mirroredIn = (table: Readonly<Record<string, string>>): string[] =>
  sorted(
    Object.entries(table)
      .filter(([, owner]) => owner === MIRRORED)
      .map(([key]) => key),
  );

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
    expect(citedBy(OWNER).length).toBeGreaterThan(0);

    expect(absentFrom(OWNER)).toStrictEqual([]);
  });

  it("the copies nothing can observe are exactly these", () => {
    // ⚠ EXACT, not a floor. A row leaving this set is someone deciding the copy
    // became observable — or that it should go, the way #2307 retired four
    // lists once measurement showed core refusing first.
    expect(mirroredIn(OWNER)).toStrictEqual(["eventBus.validateListenerArgs"]);
  });

  it("CONTROL — the walk reaches core and sees a consultation made twice", () => {
    // A walk that silently matched nothing would agree with an empty table, and
    // one that collapsed every site into one key would hide the file spread.
    expect(derived).toContain("routes.validateBuildPathArgs");
    expect(sites.length).toBeGreaterThan(derived.size);
  });
});

describe("each call a registration of this plugin makes is classified (#2388)", () => {
  const census = registrations();
  const derived = new Set(census.leaves);

  it("every reference to a channel the walk finds in this plugin is a registration", () => {
    // A reference the walk lists is a registration it cannot key, so it reds
    // here until the walk learns the form.
    expect(census.unread).toStrictEqual([]);
  });

  it("the compiler types every receiver in this plugin's tree", () => {
    // A call on a receiver without a type resolves to no channel, so the walk
    // would read a registration as some other call.
    expect(census.diagnostics).toStrictEqual([]);
  });

  // ⚑ Each call's signature is resolved through the checker, so a registration
  // is found however its callee is spelled — a property, an element access, a
  // member of a mapped type, a destructured local — and a namesake on an
  // object literal is not one. The destructuring itself, a `.call` and a
  // channel handed on are listed. A binding that calls nothing is skipped.
  const spellings = registrationsOf({
    "PluginApi.ts": [
      "export interface PluginApi {",
      "  addCheck: (position: string, check: (value: unknown) => void) => () => void;",
      "  subscribeDiagnostic(kind: string, handler: (value: unknown) => void): () => void;",
      "}",
    ],
    "plugin.ts": [
      'import type { PluginApi } from "./PluginApi";',
      "",
      "declare const api: PluginApi;",
      'declare const narrowed: Pick<PluginApi, "addCheck">;',
      "declare const helpers: { leaf: (value: unknown) => void };",
      "declare function first(value: unknown): void;",
      "declare function second(value: unknown): void;",
      "declare function consume(value: unknown): void;",
      "",
      'api.addCheck("block:entry", (value) => {',
      "  first(value);",
      "  second(value);",
      "});",
      'api["addCheck"]("element:entry", (value) => first(value));',
      'narrowed.addCheck("mapped:entry", (value) => {',
      "  helpers.leaf(value);",
      "});",
      'api.subscribeDiagnostic("METHOD", function (value) {',
      "  const text = value as string;",
      "  first(text);",
      "});",
      "const { subscribeDiagnostic } = api;",
      'subscribeDiagnostic("ALIASED", (value) => {',
      "  first(value);",
      "});",
      'api.addCheck.call(api, "called:entry", () => {});',
      "consume(api.addCheck);",
      "const namesake = {",
      "  addCheck: (position: string, check: () => void): void => {",
      "    void position;",
      "    check();",
      "  },",
      "};",
      'namesake.addCheck("namesake:entry", () => {',
      "  first(1);",
      "});",
    ],
  });

  it("CONTROL — the walk keys each spelling of a registration, and lists what it cannot key", () => {
    expect(spellings.leaves).toStrictEqual([
      "block:entry › first",
      "block:entry › second",
      "element:entry › first",
      "mapped:entry › helpers.leaf",
      "METHOD › first",
      "ALIASED › first",
    ]);
    expect(spellings.unread).toStrictEqual([
      { name: "subscribeDiagnostic", file: "plugin.ts", line: 22 },
      { name: "addCheck", file: "plugin.ts", line: 26 },
      { name: "addCheck", file: "plugin.ts", line: 27 },
    ]);
    expect(spellings.diagnostics).toStrictEqual([]);
  });

  const channel = [
    "export interface PluginApi {",
    "  addCheck: (position: string, check: (value: unknown) => void) => () => void;",
    "  subscribeDiagnostic: (kind: string, handler: (value: unknown) => void) => () => void;",
    "}",
  ];
  const registering = (...lines: readonly string[]): Tree => ({
    "PluginApi.ts": channel,
    "plugin.ts": [
      'import type { PluginApi } from "./PluginApi";',
      "",
      "declare const api: PluginApi;",
      "declare function first(value: unknown): void;",
      ...lines,
    ],
  });
  const read = (root: string): Registrations => registrations(root);
  const refused = {
    nonLiteral: refusalOf(
      registering(
        "declare const position: string;",
        "api.addCheck(position, (value) => {",
        "  first(value);",
        "});",
      ),
      read,
    ),
    byReference: refusalOf(
      registering('api.addCheck("reference:entry", first);'),
      read,
    ),
    branch: refusalOf(
      registering(
        'api.addCheck("branch:entry", (value) => {',
        "  if (value) {",
        "    first(value);",
        "  }",
        "});",
      ),
      read,
    ),
    callingBinding: refusalOf(
      registering(
        'api.addCheck("binding:entry", (value) => {',
        "  const text = String(value);",
        "  first(text);",
        "});",
      ),
      read,
    ),
    twice: refusalOf(
      registering(
        'api.addCheck("twice:entry", (value) => {',
        "  first(value);",
        "  first(value);",
        "});",
      ),
      read,
    ),
    noChannel: refusalOf({ "plugin.ts": ["export {};"] }, read),
    otherShape: refusalOf(
      {
        "PluginApi.ts": [
          "export interface PluginApi {",
          "  addCheck: Check;",
          "  subscribeDiagnostic: Check;",
          "}",
          "type Check = (key: string, callback: () => void) => () => void;",
        ],
      },
      read,
    ),
  };

  it("CONTROL — a registration the walk cannot read is refused, not read as empty", () => {
    expect(refused.nonLiteral).toBe(
      "A registration whose key is not a literal, at line 6 of plugin.ts",
    );
    expect(refused.byReference).toBe(
      "A registration whose callback is not written inline, at line 5 of plugin.ts",
    );
    expect(refused.branch).toBe(
      "A statement of another shape in branch:entry: if (value) {",
    );
    expect(refused.callingBinding).toBe(
      "A statement of another shape in binding:entry: const text = String(value);",
    );
    expect(refused.twice).toBe("A call keyed twice: twice:entry › first");
    expect(refused.noChannel).toBe(
      "No declaration of addCheck, subscribeDiagnostic",
    );
    expect(refused.otherShape).toContain("A channel of another shape");
  });

  it("the declared table covers the derived set, in both directions", () => {
    // ⚑ The ratchet of the member table, for the other door into the plugin:
    // a call a registration starts making reds here until someone removes it,
    // runs this package's suite and records what held it, and a call it stops
    // making reds here until its row goes.
    expect(sorted(Object.keys(REGISTRATION_OWNER))).toStrictEqual(
      sorted(derived),
    );
  });

  it("every authority a row cites exists", () => {
    expect(citedBy(REGISTRATION_OWNER).length).toBeGreaterThan(0);

    expect(absentFrom(REGISTRATION_OWNER)).toStrictEqual([]);
  });

  it("the copies nothing can observe are exactly these", () => {
    // ⚠ EXACT, as for the member table. Both are the reserved prefix (#1047):
    // core's backstop refuses it at the same door, with the same wording, on
    // the statement after the check.
    expect(mirroredIn(REGISTRATION_OWNER)).toStrictEqual([
      "removeRoute:entry › throwIfInternalRoute",
      "updateRoute:entry › throwIfInternalRoute",
    ]);
  });

  it("CONTROL — the walk reaches this plugin, through both channels and past a callback's first call", () => {
    // A walk that matched nothing would agree with an empty table, and one that
    // stopped at a callback's first call would hide the calls after it.
    expect(derived).toContain("PLUGIN_AFTER_START › warnPluginAfterStart");
    expect(derived).toContain("navigate:entry › validateNavigationOptions");
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
  // `throwIfInternalRouteInArray` and `validateParentOption` run inside
  // `checkRouteBatch`, the call both batch registrations key, so no row of
  // either table names them.
  const ROUTES = [
    { name: "a", path: "/a/:id" },
    { name: "b", path: "/b" },
  ];

  /** One reported warning: what the logger received, arguments included. */
  type Warning = readonly [
    channel: string,
    message: string,
    ...args: unknown[],
  ];

  const make = (withPlugin: boolean, logger?: LoggerConfig): Router => {
    const router = createRouter([...ROUTES], {
      allowNotFound: true,
      ...(logger && { logger }),
    });

    if (withPlugin) {
      router.usePlugin(validationPlugin());
    }

    return router;
  };

  /**
   * The warnings a router reports, through the sink an application configures.
   *
   * ⚑ `LoggerConfig.callback`, not a spy on the router's logger: `level: "none"`
   * keeps the console silent while `callbackIgnoresLevel` still hands the sink
   * every message, so a cell reads what the router REPORTED.
   */
  const warningSink = () => {
    const warnings: Warning[] = [];
    const logger: LoggerConfig = {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (level, channel, message, ...args) => {
        if (level === "warn") {
          warnings.push([channel, message, ...args]);
        }
      },
    };

    return { logger, warnings };
  };

  /** What the sink receives while `run` runs, and nothing it received before. */
  const warnedDuring = (
    sink: ReturnType<typeof warningSink>,
    run: () => void,
  ): Warning[] => {
    const before = sink.warnings.length;

    run();

    return sink.warnings.slice(before);
  };

  const refusalOf = (run: (router: Router) => unknown, withPlugin: boolean) => {
    try {
      run(make(withPlugin));

      return "NO THROW";
    } catch (error) {
      return (error as Error).message;
    }
  };

  /**
   * A class INSTANCE whose string reads and `ownKeys` land in `reads`. A wrong
   * shape is what the shape check refuses; the accessor is on the prototype,
   * which is what makes it the wrong shape.
   */
  const watchedInstance = (reads: string[]): object =>
    new Proxy(
      Object.create({
        get id(): string {
          return "7";
        },
      }) as object,
      {
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
      },
    );

  it("warnBatchOverwrite — setDependencies says which keys it replaced", () => {
    const overwrites = (withPlugin: boolean): string[] => {
      const sink = warningSink();
      const router = make(withPlugin, sink.logger);

      return warnedDuring(sink, () => {
        getDependenciesApi(router).setAll({ x: 1 });
        getDependenciesApi(router).setAll({ x: 2 });
      }).map((warning) => warning.join(" "));
    };

    expect(overwrites(true)).toStrictEqual([
      "router.setDependencies Overwritten: x",
    ]);
    expect(overwrites(false)).toStrictEqual([]);
  });

  /**
   * What the router warns while `register` runs, one message a warning; the
   * channel is not the subject here.
   */
  const warningsOf = (
    sink: ReturnType<typeof warningSink>,
    register: () => void,
  ): string[] => warnedDuring(sink, register).map(([, message]) => message);

  it("lifecycle.validateCountThresholds — a growing guard registry is named as it grows", () => {
    // `maxLifecycleHandlers: 10` puts the warning at the second guard.
    const run = (withPlugin: boolean): unknown[] => {
      const sink = warningSink();
      const router = createRouter([...ROUTES], {
        limits: { maxLifecycleHandlers: 10 },
        logger: sink.logger,
      });

      if (withPlugin) {
        router.usePlugin(validationPlugin());
      }

      return warningsOf(sink, () => {
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
      const sink = warningSink();
      const router = createRouter([...ROUTES], {
        limits: { maxPlugins: 10 },
        logger: sink.logger,
      });

      if (withPlugin) {
        router.usePlugin(validationPlugin());
      }

      return warningsOf(sink, () => {
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

    expect(() =>
      make(true).buildPath("a", watchedInstance(reads) as never),
    ).toThrow("params must be a plain object");

    expect(reads).toStrictEqual(["get:constructor"]);
  });

  /** A door whose entry check judges the shape, asked about one bag. */
  const askBag = {
    // Not `async`: the refusal is synchronous, and an async wrapper would turn
    // it into a rejection the plugin arm below could not see thrown.
    navigate: (router: Router, bag: object): unknown =>
      router.navigate("a", bag as never).catch(() => undefined),
    canNavigateTo: (router: Router, bag: object): unknown =>
      router.canNavigateTo("a", bag as never),
  };

  it.each(["navigate", "canNavigateTo"] as const)(
    "validateNavigateParamsShape — %s refuses BEFORE the caller's bag is walked",
    async (door) => {
      // ⚑ The cell above, at the doors whose entry check judges the shape: the
      // wording is the same with the check removed, and the order is what the
      // check alone decides. Started, because a stopped router's `navigate`
      // rejects before it reads the bag.
      const reads: string[] = [];
      const bareReads: string[] = [];
      const router = make(true);
      const bare = make(false);

      await router.start("/b");
      await bare.start("/b");

      expect(() => askBag[door](router, watchedInstance(reads))).toThrow(
        "params must be a plain object",
      );

      expect(reads).toStrictEqual(["get:constructor"]);

      await askBag[door](bare, watchedInstance(bareReads));

      expect(bareReads).toContain("ownKeys");
    },
  );

  it("validateHandler — addDeactivateGuard names a handler that is neither a boolean nor a factory", () => {
    const run = (router: Router): unknown => {
      getLifecycleApi(router).addDeactivateGuard("a", 123 as never);

      return undefined;
    };

    expect(refusalOf(run, true)).toBe(
      "[router.addDeactivateGuard] Handler must be a boolean or factory function, got number",
    );

    expect(refusalOf(run, false)).toBe("factory is not a function");
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
