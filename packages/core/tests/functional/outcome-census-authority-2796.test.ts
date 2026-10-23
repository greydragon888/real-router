// The census of the places in core that decide a navigation's OUTCOME — whose
// navigation an event ends, whether a failure is this navigation's or another's
// (#2796, the class of #2740 → #2798).
//
// A place decides by IDENTITY when it asks its own navigation — the plan the
// machine carries, its own controller, its own record — and by a SUBSTITUTE
// when it asks something any navigation could answer: a phase of the machine,
// an error's code. The census derives every place from the code and holds the
// set by equality, so a new place reds on the day it is written and is given a
// verdict from the vocabulary below.
//
// The set:
// - the machine's edges, from the transition table of `routerFSM.ts`;
// - every call that reaches a machine event: from `#fsm.send(` in the
//   machine-owning module up through the type checker's references, across
//   methods of that module, aliases and DI wrappers — a wrapper with a
//   condition of its own is a place as well;
// - every read of a machine phase, every code check, every read of an identity
//   (`cancelReason`, a signal's `aborted`, `.has(` on a module-level
//   `WeakSet`), and every call of a predicate that is nothing but one of those.
//
// ⚠ The census reads NAMES and SHAPES: a check reached through a computed key
// or a renamed import of a predicate is out of its reach.
//
// ⚠ A predicate is a function whose body is one expression. The calls of a
// longer classifier are not places; the checks in its body are.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { cellTitlesOf } from "./helpers";

const CORE = path.resolve(__dirname, "../..");
const SRC = path.join(CORE, "src");

/** The machine phases a place can ask instead of its own navigation. */
const PHASES = new Set([
  "isTransitioning",
  "isStarting",
  "isIdle",
  "isReady",
  "isActive",
  "canSend",
  "canCancel",
]);

/** Identity reads: a plan's own record and its own signal. */
const IDENTITY_READS = new Set(["cancelReason", "aborted"]);

/** The modules a reference crosses as a DI wrapper rather than stops at. */
const BUS_CLASS = "EventBusNamespace";

interface Site {
  readonly key: string;
  readonly fn: ts.Node | undefined;
}

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

function trackedFiles(): string[] {
  // The set is what is TRACKED, and asking the version control tool through
  // PATH is how the other tracked-file censuses here learn it.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- see the two lines above
  return execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: CORE,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .map((file) => path.join(CORE, file));
}

function languageService(
  files: readonly string[],
  overrides: ReadonlyMap<string, string> = new Map(),
): ts.LanguageService {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(CORE, "tsconfig.json"),
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
    throw new Error("packages/core/tsconfig.json did not parse");
  }

  const text = (file: string): string | undefined =>
    overrides.get(file) ??
    (ts.sys.fileExists(file) ? readFileSync(file, "utf8") : undefined);

  return ts.createLanguageService(
    {
      getScriptFileNames: () => [...files],
      getScriptVersion: () => "0",
      getScriptSnapshot: (file) => {
        const content = text(file);

        return content === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(content);
      },
      getCurrentDirectory: () => CORE,
      getCompilationSettings: () => config.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (file) => overrides.has(file) || ts.sys.fileExists(file),
      readFile: text,
      readDirectory: ts.sys.readDirectory,
      directoryExists: (directory) =>
        [...overrides.keys()].some((file) =>
          file.startsWith(`${directory}${path.sep}`),
        ) || ts.sys.directoryExists(directory),
      getDirectories: ts.sys.getDirectories,
    },
    ts.createDocumentRegistry(),
  );
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

const isFunctionLike = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node);

/** The name a function-like `node` is known by, when it has one. */
function nameOf(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return node.name?.getText();
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) {
    return undefined;
  }

  if (node.name !== undefined) {
    return node.name.getText();
  }

  const holder = node.parent;

  if (
    ts.isVariableDeclaration(holder) ||
    ts.isPropertyDeclaration(holder) ||
    ts.isPropertyAssignment(holder)
  ) {
    return holder.name.getText();
  }

  return undefined;
}

/** The nearest named function-like around `node`, and its name. */
function ownerOf(node: ts.Node): { name: string; fn: ts.Node | undefined } {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    const name = nameOf(current);

    if (name !== undefined) {
      return { name, fn: current };
    }
  }

  return { name: "<module>", fn: undefined };
}

function nearestFunction(
  node: ts.Node,
): ts.FunctionLikeDeclaration | undefined {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    if (isFunctionLike(current)) {
      return current;
    }
  }

  return undefined;
}

function nodeAt(sourceFile: ts.SourceFile, position: number): ts.Node {
  let found: ts.Node = sourceFile;

  const visit = (node: ts.Node): void => {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);

  return found;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

// ---------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------

const EQUALITIES: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

const SHORT_CIRCUITS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const byText = (a: string, b: string): number => a.localeCompare(b);

const isEquality = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) && EQUALITIES.has(node.operatorToken.kind);

const memberName = (node: ts.Node): string | undefined =>
  ts.isPropertyAccessExpression(node) ? node.name.text : undefined;

/** The code checks in `node` itself, by kind. */
function codeCheckOf(node: ts.Node): string | undefined {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    node.right.getText() === "RouterError"
  ) {
    return "code:instanceof RouterError";
  }

  if (isEquality(node)) {
    const sides = [node.left, node.right];

    if (sides.some((side) => memberName(side) === "code")) {
      return "code:.code";
    }

    if (
      sides.some((side) => memberName(side) === "name") &&
      sides.some(
        (side) => ts.isStringLiteral(side) && side.text === "AbortError",
      )
    ) {
      return "code:AbortError";
    }
  }

  return undefined;
}

/** Does `identifier` name a module-level variable holding `new WeakSet(…)`? */
function isModuleWeakSet(identifier: ts.Identifier): boolean {
  const sourceFile = identifier.getSourceFile();
  let found = false;

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      found ||=
        declaration.name.getText() === identifier.text &&
        declaration.initializer !== undefined &&
        ts.isNewExpression(declaration.initializer) &&
        declaration.initializer.expression.getText() === "WeakSet";
    }
  }

  return found;
}

/** An identity read in `node` itself: a property read, not a write. */
function identityReadOf(node: ts.Node): string | undefined {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "has" &&
    ts.isIdentifier(node.expression.expression) &&
    isModuleWeakSet(node.expression.expression)
  ) {
    return "read:registry";
  }

  const name = memberName(node);

  if (name === undefined || !IDENTITY_READS.has(name)) {
    return undefined;
  }

  const { parent } = node;
  const written =
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;

  return written ? undefined : `read:${name}`;
}

const calleeName = (call: ts.CallExpression): string | undefined => {
  const callee = call.expression;

  if (ts.isIdentifier(callee)) {
    return callee.text;
  }

  return memberName(callee);
};

/**
 * A predicate that is nothing but a check: a named function whose body is one
 * expression — or one `return` — holding a code check or an identity read.
 */
function predicateNames(sourceFiles: readonly ts.SourceFile[]): Set<string> {
  const names = new Set<string>();

  for (const sourceFile of sourceFiles) {
    walk(sourceFile, (node) => {
      if (!isFunctionLike(node) || node.body === undefined) {
        return;
      }

      const name = nameOf(node);
      let expression: ts.Node | undefined;

      if (ts.isBlock(node.body)) {
        const [only] = node.body.statements;

        if (
          node.body.statements.length === 1 &&
          only !== undefined &&
          ts.isReturnStatement(only)
        ) {
          expression = only.expression;
        }
      } else {
        expression = node.body;
      }

      if (name === undefined || expression === undefined) {
        return;
      }

      let checks = false;

      walk(expression, (inner) => {
        checks ||=
          codeCheckOf(inner) !== undefined ||
          identityReadOf(inner) !== undefined;
      });

      if (checks) {
        names.add(name);
      }
    });
  }

  return names;
}

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

/** Does `node` hold a condition: a branch, a choice, a short circuit? */
function decides(node: ts.Node): boolean {
  let found = false;

  walk(node, (inner) => {
    found ||=
      ts.isIfStatement(inner) ||
      ts.isConditionalExpression(inner) ||
      (ts.isBinaryExpression(inner) &&
        SHORT_CIRCUITS.has(inner.operatorToken.kind));
  });

  return found;
}

interface Census {
  readonly sites: ReadonlyMap<string, Site>;
  /** DI wrappers and aliases a reference crossed: they decide nothing. */
  readonly forwarders: ReadonlyMap<string, ts.Node>;
}

/** A symbol the walk asks the type checker for the references of. */
interface Lead {
  readonly file: string;
  readonly position: number;
  readonly label: string;
}

class Collector {
  readonly sites = new Map<string, Site>();
  readonly forwarders = new Map<string, ts.Node>();

  add(sourceFile: ts.SourceFile, node: ts.Node, kind: string): void {
    const owner = ownerOf(node);
    const key = `${relative(sourceFile.fileName)} › ${owner.name} › ${kind}`;

    if (!this.sites.has(key)) {
      this.sites.set(key, { key, fn: owner.fn });
    }
  }
}

const relative = (file: string): string => path.relative(SRC, file);

const leadOf = (name: ts.Node): Lead => ({
  file: name.getSourceFile().fileName,
  position: name.getStart(),
  label: name.getText(),
});

/** The edges of the transition table, with the `when` each one asks. */
function collectEdges(collector: Collector, machine: ts.SourceFile): void {
  walk(machine, (node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      node.name.getText() !== "routerTransitions" ||
      node.initializer === undefined ||
      !ts.isObjectLiteralExpression(node.initializer)
    ) {
      return;
    }

    for (const state of node.initializer.properties) {
      if (
        ts.isPropertyAssignment(state) &&
        ts.isObjectLiteralExpression(state.initializer)
      ) {
        collectStateEdges(collector, state.name, state.initializer);
      }
    }
  });
}

function collectStateEdges(
  collector: Collector,
  state: ts.PropertyName,
  events: ts.ObjectLiteralExpression,
): void {
  const from = state.getText().replaceAll(/^\[routerStates\.|\]$/gu, "");

  for (const event of events.properties) {
    if (!ts.isPropertyAssignment(event)) {
      continue;
    }

    const name = event.name.getText().replaceAll(/^\[routerEvents\.|\]$/gu, "");
    const when = ts.isObjectLiteralExpression(event.initializer)
      ? event.initializer.properties.find(
          (property): property is ts.PropertyAssignment =>
            ts.isPropertyAssignment(property) &&
            property.name.getText() === "when",
        )
      : undefined;
    const key = `routerFSM.ts › routerTransitions › edge:${from}.${name}(${when?.initializer.getText() ?? "-"})`;

    collector.sites.set(key, { key, fn: undefined });
  }
}

/** The methods of the machine-owning module that send an event. */
function senders(bus: ts.SourceFile): Lead[] {
  const leads: Lead[] = [];

  walk(bus, (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText().endsWith("#fsm.send")
    ) {
      const method = nearestFunction(node);

      if (method !== undefined && ts.isMethodDeclaration(method)) {
        leads.push(leadOf(method.name));
      }
    }
  });

  return leads;
}

/** `x`, `a.x` or `this.x`: the expression a reference stands in. */
function referenceExpression(
  sourceFile: ts.SourceFile,
  start: number,
): ts.Node {
  let expression = nodeAt(sourceFile, start);

  while (
    ts.isPropertyAccessExpression(expression.parent) &&
    expression.parent.name === expression
  ) {
    expression = expression.parent;
  }

  return expression;
}

const isBusMethod = (fn: ts.Node | undefined): fn is ts.MethodDeclaration =>
  fn !== undefined &&
  ts.isMethodDeclaration(fn) &&
  ts.isClassDeclaration(fn.parent) &&
  fn.parent.name?.text === BUS_CLASS;

const isWrapper = (
  fn: ts.Node | undefined,
): fn is (ts.ArrowFunction | ts.FunctionExpression) & {
  parent: ts.PropertyAssignment;
} =>
  fn !== undefined &&
  (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
  ts.isPropertyAssignment(fn.parent);

/**
 * Where one reference to `lead` leads: a place, or a symbol whose own
 * references the walk follows next.
 */
function followReference(
  collector: Collector,
  sourceFile: ts.SourceFile,
  start: number,
  lead: Lead,
): Lead | undefined {
  const expression = referenceExpression(sourceFile, start);
  const { parent } = expression;

  // An alias: `X: ctx.X`.
  if (ts.isPropertyAssignment(parent) && parent.initializer === expression) {
    collector.forwarders.set(
      `${relative(sourceFile.fileName)} › ${parent.name.getText()}`,
      parent,
    );

    return leadOf(parent.name);
  }

  if (!ts.isCallExpression(parent) || parent.expression !== expression) {
    return undefined;
  }

  const fn = nearestFunction(parent);

  if (isBusMethod(fn)) {
    collector.add(sourceFile, parent, `bus:${lead.label}`);

    return leadOf(fn.name);
  }

  if (isWrapper(fn)) {
    // A wrapper with a condition of its own is a place; one without is a
    // forwarder. The walk goes on through both.
    if (decides(fn)) {
      collector.add(sourceFile, parent, `gate:${lead.label}`);
    } else {
      collector.forwarders.set(
        `${relative(sourceFile.fileName)} › ${fn.parent.name.getText()}`,
        fn,
      );
    }

    return leadOf(fn.parent.name);
  }

  collector.add(sourceFile, parent, `send:${lead.label}`);

  return undefined;
}

/** Every call that reaches a machine event, up from `#fsm.send(`. */
function collectSenders(
  collector: Collector,
  service: ts.LanguageService,
  program: ts.Program,
  bus: ts.SourceFile,
  tracked: ReadonlySet<string>,
): void {
  const frontier = senders(bus);
  const seen = new Set<string>();

  for (
    let lead = frontier.shift();
    lead !== undefined;
    lead = frontier.shift()
  ) {
    const id = `${lead.file}:${lead.position}`;

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    const references = (service.findReferences(lead.file, lead.position) ?? [])
      .flatMap((group) => group.references)
      .filter(
        (reference) =>
          !reference.isDefinition && tracked.has(reference.fileName),
      );

    for (const reference of references) {
      const sourceFile = program.getSourceFile(reference.fileName);
      const next =
        sourceFile === undefined
          ? undefined
          : followReference(
              collector,
              sourceFile,
              reference.textSpan.start,
              lead,
            );

      if (next !== undefined) {
        frontier.push(next);
      }
    }
  }
}

/** Phases, code checks, identity reads and the predicates made of them. */
function collectSigns(
  collector: Collector,
  sourceFiles: readonly ts.SourceFile[],
): void {
  const predicates = predicateNames(sourceFiles);

  for (const sourceFile of sourceFiles) {
    walk(sourceFile, (node) => {
      const name = ts.isCallExpression(node) ? calleeName(node) : undefined;

      if (name !== undefined && PHASES.has(name)) {
        collector.add(sourceFile, node, `phase:${name}`);
      } else if (name !== undefined && predicates.has(name)) {
        collector.add(sourceFile, node, `call:${name}`);
      }

      const check = codeCheckOf(node) ?? identityReadOf(node);

      if (check !== undefined) {
        collector.add(sourceFile, node, check);
      }
    });
  }
}

function census(
  files: readonly string[],
  overrides: ReadonlyMap<string, string> = new Map(),
): Census {
  const service = languageService(files, overrides);
  const program = service.getProgram();

  if (program === undefined) {
    throw new Error("no program");
  }

  const sourceFiles = files.map((file) => {
    const sourceFile = program.getSourceFile(file);

    if (sourceFile === undefined) {
      throw new Error(`not in the program: ${file}`);
    }

    return sourceFile;
  });
  const named = (suffix: string): ts.SourceFile => {
    const sourceFile = sourceFiles.find((file) =>
      file.fileName.endsWith(suffix),
    );

    if (sourceFile === undefined) {
      throw new Error(`no ${suffix}`);
    }

    return sourceFile;
  };
  const collector = new Collector();

  collectEdges(collector, named("/routerFSM.ts"));
  collectSenders(
    collector,
    service,
    program,
    named(`/${BUS_CLASS}/${BUS_CLASS}.ts`),
    new Set(files),
  );
  collectSigns(collector, sourceFiles);

  return { sites: collector.sites, forwarders: collector.forwarders };
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

/**
 * The vocabulary. `identity:<form>` names the form the place's code must hold;
 * the rest name why a place without one is not a defect, or which decision
 * left it as it is. An `equivalent`, `ban-equivalent` or `contract` verdict
 * names the test cell that holds its fact (`HELD_BY`); an `unsupported` one
 * lapses when its place gains an identity form.
 */
const VERDICT =
  /^(?:identity:(?:plan|own-controller|plan-record|end-record)|slot-intent|equivalent:.+|ban-equivalent:.+|unsupported:.+|contract:.+|not-outcome)$/u;

const EBN = "namespaces/EventBusNamespace/EventBusNamespace.ts";
const NAV = "namespaces/NavigationNamespace";
const TRANSITION = `${NAV}/transition`;
const LIFECYCLE =
  "namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts";
const EDGE = "routerFSM.ts › routerTransitions › edge";

const SLOT = "slot-intent";
const NOT = "not-outcome";
const BAN_ANNOUNCE = "ban-equivalent:the announce is a counted dispatch";
const BAN_BRIDGE = "ban-equivalent:the bridge closes with its navigation";
const BAN_REVALIDATION =
  "ban-equivalent:the revalidation window refuses navigation";
const BAN_NOT_FOUND = "ban-equivalent:the 404 consultation refuses navigation";
const EQ_UNWIND =
  "equivalent:a start in READY without a state is the one unwinding";
const EQ_EDGE =
  "equivalent:the code picks the edge, and identity decides inside it";
const EQ_FENCED =
  "equivalent:runStep calls it behind its own controller's fence";
const N1 = "unsupported:N1 — a restart in the middle of a held start (#2798)";
const N5 = "unsupported:N5 — a stopped start degrading to 404 (#2798)";
const R2798 = "unsupported:#2798";
const CONTRACT_933 = "contract:#933 — a guard's own cancellation is quiet";

/** Every place, with its verdict. The A1 row is in the comment. */
const LEDGER = new Map<string, string>([
  // The machine's edges (A1 §2).
  [`${EDGE}:IDLE.START(-)`, NOT],
  [`${EDGE}:IDLE.DISPOSE(-)`, SLOT],
  [`${EDGE}:STARTING.STARTED(-)`, N1], // row 5
  [`${EDGE}:STARTING.FAIL(-)`, R2798], // row 4
  [`${EDGE}:STARTING.STOP(-)`, SLOT],
  [`${EDGE}:STARTING.DISPOSE(-)`, SLOT],
  [`${EDGE}:READY.NAVIGATE(-)`, NOT],
  [`${EDGE}:READY.SYSTEM_COMMIT(-)`, N5], // row 7
  [`${EDGE}:READY.STOP(-)`, SLOT],
  [`${EDGE}:READY.DISPOSE(-)`, SLOT],
  [`${EDGE}:TRANSITION_STARTED.NAVIGATE(-)`, NOT],
  [`${EDGE}:TRANSITION_STARTED.LEAVE_APPROVE(-)`, BAN_ANNOUNCE], // row 6
  [`${EDGE}:TRANSITION_STARTED.CANCEL(-)`, SLOT], // row 3
  [`${EDGE}:TRANSITION_STARTED.FAIL(mayFail)`, "identity:plan"], // row 1
  [`${EDGE}:TRANSITION_STARTED.DISPOSE(-)`, SLOT],
  [`${EDGE}:LEAVE_APPROVED.NAVIGATE(-)`, NOT],
  [`${EDGE}:LEAVE_APPROVED.COMPLETE(mayCommit)`, "identity:plan"], // row 2
  [`${EDGE}:LEAVE_APPROVED.CANCEL(-)`, SLOT], // row 3
  [`${EDGE}:LEAVE_APPROVED.FAIL(mayFail)`, "identity:plan"], // row 1
  [`${EDGE}:LEAVE_APPROVED.DISPOSE(-)`, SLOT],
  ["routerFSM.ts › mayCommit › read:aborted", "identity:own-controller"], // row 2

  // Router.
  ["Router.ts › #runStart › send:sendStart", NOT],
  ["Router.ts › #unwindFailedStart › phase:isStarting", R2798], // row 19
  ["Router.ts › #unwindFailedStart › send:sendFail", R2798], // row 19
  [
    "Router.ts › #unwindFailedStart › phase:isReady",
    EQ_UNWIND, // row 20
  ],
  [
    "Router.ts › #unwindFailedStart › send:sendStop",
    EQ_UNWIND, // row 20
  ],
  ["Router.ts › constructor › call:isExpectedRejection", NOT],
  ["Router.ts › systemCommit › gate:systemCommit", NOT],
  ["Router.ts › dispose › phase:isReady", SLOT], // row 9
  ["Router.ts › dispose › phase:isTransitioning", SLOT], // row 9
  ["Router.ts › dispose › send:sendCancelIfPossible", SLOT], // row 9
  ["Router.ts › dispose › send:sendDispose", SLOT], // row 9
  ["Router.ts › dispose › send:sendStopForDispose", SLOT], // row 9
  ["Router.ts › isActive › phase:isActive", NOT],
  ["Router.ts › isTransitioning › phase:isTransitioning", NOT],
  ["Router.ts › navigateToNotFound › phase:isActive", NOT],
  ["Router.ts › stop › phase:isReady", SLOT], // row 8
  ["Router.ts › stop › phase:isStarting", SLOT], // row 8
  ["Router.ts › stop › phase:isTransitioning", SLOT], // row 8
  ["Router.ts › stop › send:sendCancelIfPossible", SLOT], // row 8
  ["Router.ts › stop › send:sendStop", SLOT], // row 8

  // Route CRUD and plugin doors: a time gate.
  ["api/getPluginApi.ts › setRootPath › phase:isTransitioning", NOT],
  ["api/getRoutesApi.ts › clear › phase:isTransitioning", NOT],
  ["api/getRoutesApi.ts › remove › phase:isTransitioning", NOT],
  ["api/getRoutesApi.ts › replace › phase:isTransitioning", NOT],
  ["api/getRoutesApi.ts › update › phase:isTransitioning", NOT],
  [
    "api/getRoutesApi.ts › commitRevalidated › send:systemCommit",
    BAN_REVALIDATION, // row 16
  ],
  ["engine/validation/routes.ts › removedFormMessage › code:.code", NOT],

  // The machine-owning module.
  [`${EBN} › #refuseSystemCommit › phase:isStarting`, NOT],
  [`${EBN} › #refuseSystemCommit › phase:isTransitioning`, NOT],
  [
    `${EBN} › awaitLeaveListeners › call:settleLeavePromises`,
    "identity:own-controller",
  ], // row 29
  [`${EBN} › settleLeavePromises › read:aborted`, "identity:own-controller"], // row 29
  [`${EBN} › bridgeExternalSignal › read:cancelReason`, "identity:plan-record"], // bridge-registration-reentry-2786.test.ts
  [`${EBN} › canBeginTransition › phase:canSend`, NOT],
  [`${EBN} › canCancel › phase:canSend`, SLOT],
  [`${EBN} › canCommitTransition › phase:canSend`, "identity:plan"], // row 18
  [`${EBN} › canStart › phase:canSend`, NOT],
  [`${EBN} › onAbort › code:.code`, NOT],
  [`${EBN} › onAbort › code:instanceof RouterError`, NOT],
  [
    `${EBN} › onExternalAbort › send:sendCancelIfPossible`,
    BAN_BRIDGE, // row 12
  ],
  [`${EBN} › sendCancelIfInFlight › bus:sendCancelIfPossible`, "identity:plan"], // row 13
  [`${EBN} › sendCancelIfPossible › bus:sendCancel`, SLOT], // row 3
  [`${EBN} › sendCancelIfPossible › phase:canCancel`, SLOT], // row 3
  [`${EBN} › systemCommit › phase:canSend`, N5], // row 7

  // Navigation.
  [`${NAV}/NavigationNamespace.ts › #navigate › phase:isStarting`, NOT],
  [`${NAV}/NavigationNamespace.ts › #navigateToState › phase:isStarting`, NOT],
  [
    `${NAV}/NavigationNamespace.ts › setDependencies › call:isExpectedRejection`,
    NOT,
  ],
  [
    `${NAV}/constants.ts › isExpectedRejection › code:instanceof RouterError`,
    NOT,
  ],
  [
    `${TRANSITION}/completeTransition.ts › completeTransition › send:sendTransitionDone`,
    "identity:plan",
  ], // row 18
  [
    `${TRANSITION}/completeTransition.ts › completeTransition › send:sendTransitionFail`,
    "identity:plan",
  ], // row 17
  [
    `${TRANSITION}/errorHandling.ts › asCancellation › call:isTransitionCancelled`,
    NOT,
  ],
  [
    `${TRANSITION}/errorHandling.ts › handleGuardError › call:isNavigationEnd`,
    "identity:end-record",
  ], // row 28
  [
    `${TRANSITION}/errorHandling.ts › handleGuardError › call:isTransitionCancelled`,
    CONTRACT_933,
  ], // row 28
  [
    `${TRANSITION}/errorHandling.ts › handleGuardError › code:AbortError`,
    CONTRACT_933,
  ], // row 28
  [`${TRANSITION}/errorHandling.ts › isTransitionCancelled › code:.code`, NOT],
  [
    `${TRANSITION}/errorHandling.ts › isTransitionCancelled › code:instanceof RouterError`,
    NOT,
  ],
  [
    `${TRANSITION}/errorHandling.ts › leaveFailure › call:isNavigationEnd`,
    "identity:end-record",
  ], // row 28, the leave-listener arm: another-navigations-end-in-a-leave-listener.test.ts
  [
    `${TRANSITION}/errorHandling.ts › rethrowAsRouterError › code:instanceof RouterError`,
    NOT,
  ],
  [
    `${TRANSITION}/errorHandling.ts › routeTransitionError › call:isTransitionCancelled`,
    EQ_EDGE, // row 27
  ],
  [
    `${TRANSITION}/errorHandling.ts › routeTransitionError › phase:isTransitioning`,
    "identity:plan",
  ], // row 14
  [
    `${TRANSITION}/errorHandling.ts › routeTransitionError › send:cancelIfInFlight`,
    "identity:plan",
  ], // row 13
  [
    `${TRANSITION}/errorHandling.ts › routeTransitionError › send:sendTransitionFail`,
    "identity:plan",
  ], // row 14
  [
    `${TRANSITION}/executeNavigation.ts › abortPreviousNavigation › phase:isTransitioning`,
    SLOT,
  ], // row 10
  [
    `${TRANSITION}/executeNavigation.ts › abortPreviousNavigation › send:cancelNavigation`,
    SLOT,
  ], // row 10
  [
    `${TRANSITION}/executeNavigation.ts › beginTransition › send:startTransition`,
    BAN_ANNOUNCE,
  ], // row 23
  [
    `${TRANSITION}/executeNavigation.ts › bridgeLateIfOnlyGuardsCanAbort › read:cancelReason`,
    "identity:plan-record",
  ], // row 30
  [
    `${TRANSITION}/executeNavigation.ts › completeImmediate › send:sendLeaveApprove`,
    BAN_ANNOUNCE,
  ], // row 6
  [
    `${TRANSITION}/executeNavigation.ts › emitLeaveApproveCallback › send:sendLeaveApprove`,
    EQ_FENCED,
  ], // row 6
  [
    `${TRANSITION}/executeNavigation.ts › executeNavigation › call:isLive`,
    "identity:own-controller",
  ], // row 26
  [
    `${TRANSITION}/executeNavigation.ts › executeNavigation › read:aborted`,
    "identity:own-controller",
  ], // row 11: the signal this navigation was called with
  [
    `${TRANSITION}/executeNavigation.ts › executeNavigation › send:cancelNavigation`,
    BAN_ANNOUNCE,
  ], // row 11
  [
    `${TRANSITION}/executeNavigation.ts › finishAsyncNavigation › call:isLive`,
    "identity:own-controller",
  ], // row 25
  [
    `${TRANSITION}/executeNavigation.ts › finishAsyncNavigation › read:aborted`,
    "identity:own-controller",
  ], // row 25
  [
    `${TRANSITION}/executeNavigation.ts › handleNavigateError › read:cancelReason`,
    "identity:plan-record",
  ], // row 24
  [
    `${TRANSITION}/executeNavigation.ts › handleNoGuardsLeave › send:sendLeaveApprove`,
    BAN_ANNOUNCE,
  ], // row 6
  [
    `${TRANSITION}/executeNavigation.ts › isLive › read:aborted`,
    "identity:own-controller",
  ], // row 26
  [
    `${TRANSITION}/executeNavigation.ts › openController › read:cancelReason`,
    "identity:plan-record",
  ], // row 30
  [
    `${TRANSITION}/guardPhase.ts › runStep › call:isLive`,
    "identity:own-controller",
  ], // row 26
  [
    `${TRANSITION}/navigateToNotFound.ts › commitNotFound › send:systemCommit`,
    BAN_NOT_FOUND,
  ], // row 15
  [
    "navigationEnds.ts › isNavigationEnd › read:registry",
    "identity:end-record",
  ], // row 28
  [
    "navigationEnds.ts › recordNavigationEnd › read:registry",
    "identity:end-record",
  ], // row 28

  // The start.
  [`${LIFECYCLE} › isMissingRoute › code:.code`, NOT], // row 31
  [`${LIFECYCLE} › isMissingRoute › code:instanceof RouterError`, NOT], // row 31
  [`${LIFECYCLE} › start › call:isMissingRoute`, N5], // row 22
  [`${LIFECYCLE} › start › phase:isIdle`, N1], // row 21
  [`${LIFECYCLE} › start › send:completeStart`, N1], // row 21

  // Predicates handed on through the wiring.
  ["wiring/wireNamespaces.ts › isIdle › phase:isIdle", NOT],
  ["wiring/wireNamespaces.ts › isStarting › phase:isStarting", NOT],
  ["wiring/wireNamespaces.ts › isTransitioning › phase:isTransitioning", NOT],
]);

/**
 * The cell that holds each exception's fact: a file under `tests/` and the
 * title of an `it` in it.
 */
const HELD_BY = new Map<string, string>([
  [
    BAN_ANNOUNCE,
    "functional/navigation/navigate/reentrant-ban.test.ts › reentrant navigate() from a plugin onTransitionStart (TRANSITION_START) hook throws",
  ],
  [
    BAN_BRIDGE,
    "functional/navigation/cancellability-scope-1716.test.ts › a superseded navigation's bridge does not cancel a later one",
  ],
  [
    BAN_REVALIDATION,
    "functional/revalidation-window-doors-1758.test.ts › every named door consults the window",
  ],
  [
    BAN_NOT_FOUND,
    "functional/navigation/reentrant-doors-2786.test.ts › refuses a navigation a consulted guard starts; the guard's own verdict then decides",
  ],
  [
    EQ_UNWIND,
    "functional/routerLifecycle/start/error-handling.test.ts › should allow start() after failed async transition resets isActive",
  ],
  [
    EQ_EDGE,
    "functional/navigation/quiet-cancel-leaves-the-band-2787.test.ts › a navigation started inside completeTransition's own FAIL keeps running: the stale FAIL is refused",
  ],
  [
    EQ_FENCED,
    "functional/leave-approve-integration.test.ts › supersede: the LEAVE_APPROVE event names the SURVIVING navigation, not the superseded one",
  ],
  [
    CONTRACT_933,
    "functional/navigation/errorHandling.test.ts › a guard's AbortError is a cancellation — no onTransitionError",
  ],
]);

/** The titles of the cells a test file runs (`cellTitlesOf`). */
function cellTitles(file: string): Set<string> {
  return cellTitlesOf(readFileSync(file, "utf8"), file.endsWith("x"));
}

/** The wiring a reference crosses to its callers: it decides nothing. */
const FORWARDERS: readonly string[] = [
  "wiring/wireNamespaces.ts › cancelIfInFlight",
  "wiring/wireNamespaces.ts › cancelNavigation",
  "wiring/wireNamespaces.ts › completeStart",
  "wiring/wireNamespaces.ts › sendLeaveApprove",
  "wiring/wireNamespaces.ts › sendTransitionDone",
  "wiring/wireNamespaces.ts › sendTransitionFail",
  "wiring/wireNamespaces.ts › startTransition",
  "wiring/wireNamespaces.ts › systemCommit",
];

/**
 * Each place of the A1 census (§7), as the declaration it is found under: a
 * function as `file › owner`, an edge as `edge:STATE.EVENT` whatever its
 * `when`. A place is found while any sign is read there, so a place that
 * changes how it decides stays found and the ledger is what reds.
 */
const A1_ROWS: readonly (readonly [number, readonly string[]])[] = [
  [1, ["edge:TRANSITION_STARTED.FAIL", "edge:LEAVE_APPROVED.FAIL"]],
  [2, ["edge:LEAVE_APPROVED.COMPLETE", "routerFSM.ts › mayCommit"]],
  [
    3,
    [
      "edge:TRANSITION_STARTED.CANCEL",
      "edge:LEAVE_APPROVED.CANCEL",
      `${EBN} › sendCancelIfPossible`,
    ],
  ],
  [4, ["edge:STARTING.FAIL"]],
  [5, ["edge:STARTING.STARTED"]],
  [
    6,
    [
      "edge:TRANSITION_STARTED.LEAVE_APPROVE",
      `${TRANSITION}/executeNavigation.ts › handleNoGuardsLeave`,
    ],
  ],
  [7, ["edge:READY.SYSTEM_COMMIT", `${EBN} › systemCommit`]],
  [8, ["Router.ts › stop"]],
  [9, ["Router.ts › dispose"]],
  [10, [`${TRANSITION}/executeNavigation.ts › abortPreviousNavigation`]],
  [11, [`${TRANSITION}/executeNavigation.ts › executeNavigation`]],
  [12, [`${EBN} › onExternalAbort`]],
  [
    13,
    [
      `${EBN} › sendCancelIfInFlight`,
      `${TRANSITION}/errorHandling.ts › routeTransitionError`,
    ],
  ],
  [14, [`${TRANSITION}/errorHandling.ts › routeTransitionError`]],
  [15, [`${TRANSITION}/navigateToNotFound.ts › commitNotFound`]],
  [16, ["api/getRoutesApi.ts › commitRevalidated"]],
  [17, [`${TRANSITION}/completeTransition.ts › completeTransition`]],
  [18, [`${TRANSITION}/completeTransition.ts › completeTransition`]],
  [19, ["Router.ts › #unwindFailedStart"]],
  [20, ["Router.ts › #unwindFailedStart"]],
  [21, [`${LIFECYCLE} › start`]],
  [22, [`${LIFECYCLE} › start`]],
  [23, [`${TRANSITION}/executeNavigation.ts › beginTransition`]],
  [24, [`${TRANSITION}/executeNavigation.ts › handleNavigateError`]],
  [25, [`${TRANSITION}/executeNavigation.ts › finishAsyncNavigation`]],
  [
    26,
    [
      `${TRANSITION}/guardPhase.ts › runStep`,
      `${TRANSITION}/executeNavigation.ts › isLive`,
    ],
  ],
  [27, [`${TRANSITION}/errorHandling.ts › routeTransitionError`]],
  [28, [`${TRANSITION}/errorHandling.ts › handleGuardError`]],
  [29, [`${EBN} › settleLeavePromises`]],
  [
    30,
    [
      `${TRANSITION}/executeNavigation.ts › openController`,
      `${TRANSITION}/executeNavigation.ts › bridgeLateIfOnlyGuardsCanAbort`,
    ],
  ],
  [31, [`${LIFECYCLE} › isMissingRoute`]],
];

// ---------------------------------------------------------------------------
// The forms of identity
// ---------------------------------------------------------------------------

/** A plan handed on to the machine, by the names it travels under. */
const PLAN_NAMES = new Set(["nav", "plan", "payload", "commit"]);

function contains(
  node: ts.Node,
  predicate: (node: ts.Node) => boolean,
): boolean {
  let found = false;

  walk(node, (inner) => {
    found ||= predicate(inner);
  });

  return found;
}

const comparesWithPlan = (node: ts.Node): boolean =>
  isEquality(node) &&
  [node.left, node.right].some(
    (side) =>
      /(?:^|\.)inflight$/u.test(side.getText()) || side.getText() === "nav",
  );

const handsOnPlan = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  node.arguments.some(
    (argument) => ts.isIdentifier(argument) && PLAN_NAMES.has(argument.text),
  );

const FORMS: Readonly<Record<string, (node: ts.Node) => boolean>> = {
  plan: (node) => comparesWithPlan(node) || handsOnPlan(node),
  "own-controller": (node) => identityReadOf(node) === "read:aborted",
  "plan-record": (node) => identityReadOf(node) === "read:cancelReason",
  "end-record": (node) => identityReadOf(node) === "read:registry",
};

/**
 * The code a place's form is read from: the place's function — or, for a call
 * of a predicate, the predicate; for an edge, its `when` function.
 */
function formHolders(
  found: Census,
  key: string,
  functions: ReadonlyMap<string, ts.Node>,
): ts.Node[] {
  const edge = /\((\w+)\)$/u.exec(key);

  if (key.startsWith(EDGE) && edge?.[1] !== undefined) {
    return [functions.get(edge[1])].filter((node) => node !== undefined);
  }

  const site = found.sites.get(key);
  const call = /› call:(\w+)$/u.exec(key);
  const holders = [site?.fn];

  if (call?.[1] !== undefined) {
    holders.push(functions.get(call[1]));
  }

  return holders.filter((node) => node !== undefined);
}

/** Every named function of the files, by name. */
function functionsByName(files: readonly string[]): Map<string, ts.Node> {
  const byName = new Map<string, ts.Node>();

  for (const file of files) {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );

    walk(sourceFile, (node) => {
      const name = isFunctionLike(node) ? nameOf(node) : undefined;

      if (name !== undefined && !byName.has(name)) {
        byName.set(name, node);
      }
    });
  }

  return byName;
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

describe("the outcome-decision census of core (#2796)", () => {
  const files = trackedFiles();
  const found = census(files);
  const functions = functionsByName(files);

  it("the places found are the ledger", () => {
    expect([...found.sites.keys()].toSorted(byText)).toStrictEqual(
      [...LEDGER.keys()].toSorted(byText),
    );
  });

  it("every verdict is in the vocabulary", () => {
    const outside = [...LEDGER].filter(([, verdict]) => !VERDICT.test(verdict));

    expect(outside).toStrictEqual([]);
  });

  it("an identity verdict is held by the code of its place", () => {
    const unheld = [...LEDGER]
      .filter(([, verdict]) => verdict.startsWith("identity:"))
      .filter(([key, verdict]) => {
        const form = FORMS[verdict.slice("identity:".length)];

        return formHolders(found, key, functions).every(
          (holder) => form === undefined || !contains(holder, form),
        );
      })
      .map(([key]) => key);

    expect(unheld).toStrictEqual([]);
  });

  it("an unsupported place still decides without an identity form", () => {
    const stale = [...LEDGER]
      .filter(([, verdict]) => verdict.startsWith("unsupported:"))
      .filter(([key]) =>
        formHolders(found, key, functions).some((holder) =>
          Object.values(FORMS).some((form) => contains(holder, form)),
        ),
      )
      .map(([key]) => key);

    expect(stale).toStrictEqual([]);
  });

  it("an exception's fact is held by a cell that exists", () => {
    const exceptions = new Set(
      [...LEDGER.values()].filter((verdict) =>
        /^(?:equivalent|ban-equivalent|contract):/u.test(verdict),
      ),
    );
    const unheld = [...exceptions].filter((verdict) => {
      const [file, title] = (HELD_BY.get(verdict) ?? "").split(" › ", 2);
      const absolute = path.join(CORE, "tests", file);

      return (
        title === undefined ||
        !existsSync(absolute) ||
        !cellTitles(absolute).has(title)
      );
    });

    expect(unheld).toStrictEqual([]);
    expect([...HELD_BY.keys()].toSorted(byText)).toStrictEqual(
      [...exceptions].toSorted(byText),
    );
  });

  it("CONTROL — every place of the A1 census is found", () => {
    const declarations = new Set(
      [...found.sites.keys()].map((key) =>
        key.startsWith(EDGE)
          ? key.slice(EDGE.length - "edge".length, key.lastIndexOf("("))
          : key.slice(0, key.lastIndexOf(" › ")),
      ),
    );
    const missing = A1_ROWS.flatMap(([row, places]) =>
      places
        .filter((place) => !declarations.has(place))
        .map((place) => `${row}: ${place}`),
    );

    expect(missing).toStrictEqual([]);
  });

  it("the walk crosses the wiring to reach the places that decide", () => {
    expect([...found.forwarders.keys()].toSorted(byText)).toStrictEqual(
      FORWARDERS,
    );
  });
});

// ---------------------------------------------------------------------------
// Fixtures: each spelling the census reads, on a synthetic source
// ---------------------------------------------------------------------------

describe("the census reads every spelling (#2796)", () => {
  const SYNTHETIC = path.join(SRC, "__census_synthetic__");
  const fixture = (files: Record<string, string>): Census => {
    const overrides = new Map(
      Object.entries(files).map(([name, text]) => [
        path.join(SYNTHETIC, name),
        text,
      ]),
    );

    return census([...overrides.keys()], overrides);
  };

  const MACHINE = `
    const routerStates = { A: "A", B: "B" } as const;
    const routerEvents = { GO: "GO" } as const;
    const mayGo = (ctx: { inflight?: object }, payload: { nav: object }) =>
      payload.nav === ctx.inflight;
    export const routerTransitions = {
      [routerStates.A]: { [routerEvents.GO]: { target: routerStates.B, when: mayGo } },
      [routerStates.B]: { [routerEvents.GO]: routerStates.A },
    };
  `;
  const BUS = `
    export class EventBusNamespace {
      readonly #fsm = { send: (event: string) => event };
      sendGo(): void { this.#fsm.send("GO"); }
      sendGoIfPossible(ok: boolean): void { if (ok) { this.sendGo(); } }
    }
  `;
  const CALLERS = `
    import { EventBusNamespace } from "./namespaces/EventBusNamespace/EventBusNamespace";
    declare class RouterError extends Error { code: string }
    const bus = new EventBusNamespace();
    const wired = { go: (ok: boolean) => bus.sendGoIfPossible(ok) };
    const guarded = { stop: (ok: boolean) => (ok ? bus.sendGoIfPossible(ok) : undefined) };
    const aliased = { again: wired.go };
    export function decide(nav: { cancelReason?: unknown }, signal: AbortSignal, error: unknown): void {
      if (error instanceof RouterError && error.code === "X") { aliased.again(true); }
      if ("Y" !== (error as RouterError).code) { wired.go(false); guarded.stop(true); }
      if ((error as Error).name === "AbortError" || "AbortError" === (error as Error).name) { return; }
      if (nav.cancelReason !== undefined || signal.aborted) { return; }
    }
    export function writes(nav: { cancelReason?: unknown }, signal: AbortSignal): void { nav.cancelReason = 1; void signal.aborted; }
    const isGone = (error: unknown) => error instanceof RouterError;
    function notAPredicate(error: unknown): boolean { const seen = error; return seen instanceof RouterError; }
    export function asks(error: unknown): boolean { return isGone(error) && notAPredicate(error); }
  `;

  const found = fixture({
    "routerFSM.ts": MACHINE,
    "namespaces/EventBusNamespace/EventBusNamespace.ts": BUS,
    "callers.ts": CALLERS,
  });
  const keys = [...found.sites.keys()]
    .map((key) => key.replace(/^__census_synthetic__\//u, ""))
    .toSorted(byText);

  it("edges with and without a when", () => {
    expect(keys).toContain(
      "routerFSM.ts › routerTransitions › edge:A.GO(mayGo)",
    );
    expect(keys).toContain("routerFSM.ts › routerTransitions › edge:B.GO(-)");
  });

  it("a sender reached through a bus method, a wrapper and an alias", () => {
    expect(keys).toContain(
      "namespaces/EventBusNamespace/EventBusNamespace.ts › sendGoIfPossible › bus:sendGo",
    );
    expect(keys).toContain("callers.ts › decide › send:go");
    expect(keys).toContain("callers.ts › decide › send:again");
    expect(keys).toContain("callers.ts › stop › gate:sendGoIfPossible");
    expect(keys).toContain("callers.ts › decide › send:stop");
    expect(
      [...found.forwarders.keys()]
        .map((key) => key.replace(/^__census_synthetic__\//u, ""))
        .toSorted(byText),
    ).toStrictEqual(["callers.ts › again", "callers.ts › go"]);
  });

  it("every spelling of a code check, and identity reads but not writes", () => {
    expect(keys).toContain("callers.ts › decide › code:instanceof RouterError");
    expect(keys).toContain("callers.ts › decide › code:.code");
    expect(keys).toContain("callers.ts › decide › code:AbortError");
    expect(keys).toContain("callers.ts › decide › read:cancelReason");
    expect(keys).toContain("callers.ts › decide › read:aborted");
    // The negative is read off a function the census reads.
    expect(keys).toContain("callers.ts › writes › read:aborted");
    expect(keys).not.toContain("callers.ts › writes › read:cancelReason");
  });

  it("a predicate's calls, and not a function of two statements", () => {
    expect(keys).toContain("callers.ts › asks › call:isGone");
    expect(keys).not.toContain("callers.ts › asks › call:notAPredicate");
  });
});
