// The census of the places outside core that decide whose a navigation's
// outcome is (#2796, the class of #2740 → #2798): a subscriber, a hook, a
// rejection handler, a writer of history or a slot that answers "this event
// ends MY navigation" or "this success is the one I started".
//
// A place decides by IDENTITY when it asks something only its own navigation
// has — the state's `context`, its own signal, a state object, the extent of
// its own call, the entry its own traversal reached — and by a SUBSTITUTE when
// it asks something any navigation could answer: an event's type, an error's
// code, the slot the last one wrote. The census derives every place from the
// code and holds the set by equality, so a new place reds on the day it is
// written and is given a verdict from the vocabulary below.
//
// The set, over what git tracks under `packages/*/src` (core's excluded) and
// `shared/`, symlinks left out so a shared file counts once:
// - a call of `addEventListener`, `subscribe`, `subscribeLeave`,
//   `navigateToState`, `navigateToNotFound`, `navigate` or `start` on a router
//   or a plugin API;
// - a hook of a plugin (`onStart`, `onStop`, `onTransition*`);
// - a code check: `errorCodes.`, a `.code` comparison, `instanceof RouterError`;
// - a rejection handler of a navigation's promise, through a function that
//   returns one too;
// - a read of a state's `transition`;
// - a write of history: `pushState`, `replaceState`, `go`, `back`, `forward`,
//   `traverseTo`, `updateCurrentEntry`, `reload` on a history-like receiver;
// - the mutable slots of every file holding one of those: a `let`, a class
//   field written outside its constructor, a `Map`, `Set`, `WeakMap` or
//   `WeakSet`.
//
// Each sign is read twice: by the type checker, under the tsconfig of the
// package the file belongs to — a shared directory under one package that
// links it — and by its syntax alone. The two halves differ by a pinned list.
//
// ⚠ A slot is a place only in a file that holds a sign: a slot a helper module
// keeps for a sign elsewhere, as `shared/ssr/staleRegistry.ts` does, is not a
// place of its own.
//
// ⚠ A sign reached through a computed member name, or a router handed on under
// a name the syntax does not know and a type the checker cannot resolve, is
// out of reach of both halves.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { cellTitlesOf } from "./helpers";

const ROOT = path.resolve(__dirname, "../../../..");

const SIGN_MEMBERS = new Set([
  "addEventListener",
  "subscribe",
  "subscribeLeave",
  "navigateToState",
  "navigateToNotFound",
  "navigate",
  "start",
]);

/** The types a sign's receiver is, to the type checker. */
const SIGN_TYPES = new Set(["Router", "PluginApi"]);

const HOOKS = new Set([
  "onStart",
  "onStop",
  "onTransitionStart",
  "onTransitionLeaveApprove",
  "onTransitionSuccess",
  "onTransitionError",
  "onTransitionCancel",
]);

const HISTORY_WRITES = new Set([
  "pushState",
  "replaceState",
  "go",
  "back",
  "forward",
  "traverseTo",
  "updateCurrentEntry",
  "reload",
]);

const CONTAINERS = new Set(["WeakMap", "Map", "WeakSet", "Set"]);

/** The receivers the syntactic half takes for a router or a plugin API. */
const ROUTERISH = /(?:^|[.#])(?:router|api|_router|pluginApi)$/iu;

const HISTORYISH = /history|navigation|browser|location/iu;

/** A shared directory is type-checked under the tsconfig of one consumer. */
const SHARED_OPTIONS: Readonly<Record<string, string>> = {
  "browser-env": "browser-plugin",
  "dom-utils": "react",
  ssr: "ssr-data-plugin",
};

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

interface Unit {
  readonly sf: ts.SourceFile;
  /** `undefined` for a `.svelte` component, which no program holds. */
  readonly checker: ts.TypeChecker | undefined;
}

const repoPath = (file: string): string =>
  path
    .relative(ROOT, existsSync(file) ? realpathSync(file) : file)
    .split(path.sep)
    .join("/");

/** The files of the census: tracked, not symlinks, code. */
function trackedFiles(): string[] {
  // The set is what is TRACKED, and asking the version control tool through
  // PATH is how the other tracked-file censuses here learn it.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- see the two lines above
  return execFileSync("git", ["ls-files", "-s", "-z", "packages", "shared"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((line) => line !== "" && !line.startsWith("120000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1))
    .filter(
      (file) =>
        /\.(?:ts|tsx|svelte)$/u.test(file) &&
        !file.endsWith(".d.ts") &&
        ((/^packages\/[^/]+\/src\//u.test(file) &&
          !file.startsWith("packages/core/")) ||
          file.startsWith("shared/")),
    );
}

/** The package whose tsconfig a file is checked under. */
function packageOf(file: string): string {
  const shared = /^shared\/([^/]+)\//u.exec(file);

  if (shared?.[1] !== undefined) {
    return SHARED_OPTIONS[shared[1]] ?? "react";
  }

  return /^packages\/([^/]+)\//u.exec(file)?.[1] ?? "react";
}

function compilerOptions(config: string): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
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

  if (parsed === undefined) {
    throw new Error(`${config} did not parse`);
  }

  return { ...parsed.options, noEmit: true, skipLibCheck: true };
}

/** A component's `<script>` blocks, the rest blanked so offsets hold. */
function svelteScript(text: string): string {
  let out = "";
  let last = 0;

  for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu)) {
    const body = match[1] ?? "";
    const start = match.index + match[0].indexOf(">") + 1;

    out += text.slice(last, start).replaceAll(/[^\n]/gu, " ") + body;
    last = start + body.length;
  }

  return out + text.slice(last).replaceAll(/[^\n]/gu, " ");
}

/** Every tracked file, each checked under its own package's tsconfig. */
function diskUnits(config: (package_: string) => string): Unit[] {
  const groups = new Map<string, string[]>();

  for (const file of trackedFiles()) {
    const package_ = packageOf(file);

    groups.set(package_, [...(groups.get(package_) ?? []), file]);
  }

  return [...groups].flatMap(([package_, files]) => {
    const scripts = files.filter((file) => !file.endsWith(".svelte"));
    const program = ts.createProgram(
      scripts.map((file) => path.join(ROOT, file)),
      compilerOptions(config(package_)),
    );
    const checker = program.getTypeChecker();
    const units: Unit[] = scripts.map((file) => {
      const sf = program.getSourceFile(path.join(ROOT, file));

      if (sf === undefined) {
        throw new Error(`not in the program: ${file}`);
      }

      return { sf, checker };
    });

    for (const file of files.filter((name) => name.endsWith(".svelte"))) {
      units.push({
        sf: ts.createSourceFile(
          path.join(ROOT, file),
          svelteScript(readFileSync(path.join(ROOT, file), "utf8")),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        ),
        checker: undefined,
      });
    }

    return units;
  });
}

const PACKAGE_CONFIG = (package_: string): string =>
  path.join(ROOT, "packages", package_, "tsconfig.json");

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

/** The name a declaration is known by, when it has one. */
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

  if (ts.isClassDeclaration(node)) {
    return node.name?.text;
  }

  if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) {
    return undefined;
  }

  if (node.name !== undefined) {
    return node.name.getText();
  }

  const holder = node.parent;

  return ts.isVariableDeclaration(holder) ||
    ts.isPropertyDeclaration(holder) ||
    ts.isPropertyAssignment(holder)
    ? holder.name.getText()
    : undefined;
}

/** The nearest named function or class around `node`. */
function ownerOf(node: ts.Node): { name: string; node: ts.Node | undefined } {
  for (let current = node.parent; current !== undefined;) {
    const name = nameOf(current);

    if (name !== undefined) {
      return { name, node: current };
    }

    current = current.parent;
  }

  return { name: "<module>", node: undefined };
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

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

// ---------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------

const EQUALITIES: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

const isEquality = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) && EQUALITIES.has(node.operatorToken.kind);

const isAssignment = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
  node.operatorToken.kind <= ts.SyntaxKind.LastAssignment;

const isWritten = (node: ts.Node): boolean =>
  isAssignment(node.parent) && node.parent.left === node;

/** The member a call or an access names, in either spelling. */
function memberOf(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  return ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
    ? node.argumentExpression.text
    : undefined;
}

const receiverOf = (node: ts.Expression): ts.Expression | undefined =>
  ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    ? node.expression
    : undefined;

function typeNames(checker: ts.TypeChecker, node: ts.Node): string[] {
  const type = checker.getTypeAtLocation(node);
  const parts = type.isUnionOrIntersection() ? type.types : [type];

  return parts
    .map((part) => (part.aliasSymbol ?? part.getSymbol())?.getName())
    .filter((name) => name !== undefined);
}

interface Sign {
  readonly label: string;
  readonly typed: boolean;
  readonly syntactic: boolean;
}

/** A call of a sign member on a router or a plugin API. */
function signOfCall(node: ts.Node, unit: Unit): Sign | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }

  const member = memberOf(node.expression);
  const receiver = receiverOf(node.expression);

  if (member === undefined || receiver === undefined) {
    return undefined;
  }

  if (!SIGN_MEMBERS.has(member)) {
    return undefined;
  }

  const typed =
    unit.checker !== undefined &&
    typeNames(unit.checker, receiver).some((name) => SIGN_TYPES.has(name));
  const syntactic = ROUTERISH.test(receiver.getText());
  const [event] = node.arguments;
  const label =
    member === "addEventListener" && event !== undefined
      ? `${member}(${event.getText().split(".").pop() ?? ""})`
      : member;

  return typed || syntactic ? { label, typed, syntactic } : undefined;
}

const isCodeComparison = (node: ts.Node): node is ts.BinaryExpression =>
  isEquality(node) &&
  [node.left, node.right].some((side) => memberOf(side) === "code");

function codeCheckOf(node: ts.Node): string | undefined {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    node.right.getText() === "RouterError"
  ) {
    return "code:instanceof RouterError";
  }

  if (isCodeComparison(node)) {
    const other = memberOf(node.left) === "code" ? node.right : node.left;

    return `code:.code(${memberOf(other) ?? other.getText()})`;
  }

  return ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "errorCodes" &&
    !isCodeComparison(node.parent)
    ? `code:errorCodes.${node.name.text}`
    : undefined;
}

const unwrap = (node: ts.Expression): ts.Expression => {
  let current = node;

  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isVoidExpression(current)
  ) {
    current = current.expression;
  }

  return current;
};

/**
 * The functions an expression names: a declaration's own, or the one a
 * factory call it was initialised with returns.
 */
function functionsAt(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration[] {
  const name = ts.isPropertyAccessExpression(expression)
    ? expression.name
    : expression;
  let symbol = checker.getSymbolAtLocation(name);

  if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }

  return (symbol?.declarations ?? []).flatMap((declaration) => {
    if (isFunctionLike(declaration) && declaration.body !== undefined) {
      return [declaration];
    }

    const value =
      ts.isVariableDeclaration(declaration) ||
      ts.isPropertyAssignment(declaration) ||
      ts.isPropertyDeclaration(declaration)
        ? declaration.initializer
        : undefined;

    if (value !== undefined && isFunctionLike(value)) {
      return [value];
    }

    return value !== undefined && ts.isCallExpression(value)
      ? functionsAt(value.expression, checker)
      : [];
  });
}

const calleeOf = (
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): ts.FunctionLikeDeclaration[] => functionsAt(call.expression, checker);

const declarationId = (node: ts.Node): string =>
  `${repoPath(node.getSourceFile().fileName)}:${node.pos}`;

/** The functions whose return value is a sign call's promise. */
function forwarders(units: readonly Unit[]): Set<string> {
  const ids = new Set<string>();

  for (const unit of units) {
    walk(unit.sf, (node) => {
      if (!isFunctionLike(node) || node.body === undefined) {
        return;
      }

      const returned = ts.isBlock(node.body)
        ? node.body.statements
            .filter((statement) => ts.isReturnStatement(statement))
            .map((statement) => statement.expression)
            .filter((expression) => expression !== undefined)
        : [node.body];

      if (returned.some((value) => signOfCall(unwrap(value), unit))) {
        ids.add(declarationId(node));
      }
    });
  }

  return ids;
}

/** The expressions a promise-valued identifier was given. */
function sourcesOf(id: ts.Identifier, unit: Unit): ts.Expression[] {
  const declaration = unit.checker?.getSymbolAtLocation(id)?.valueDeclaration;

  if (declaration === undefined || !ts.isVariableDeclaration(declaration)) {
    return [];
  }

  if (declaration.initializer !== undefined) {
    return [declaration.initializer];
  }

  const found: ts.Expression[] = [];

  walk(ownerOf(declaration).node ?? declaration.getSourceFile(), (node) => {
    if (
      isAssignment(node) &&
      ts.isIdentifier(node.left) &&
      node.left.text === id.text
    ) {
      found.push(node.right);
    }
  });

  return found;
}

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

interface Place {
  readonly key: string;
  readonly kind: string;
  /** The node the sign was read at. */
  readonly node: ts.Node;
  readonly unit: Unit;
  typed: boolean;
  syntactic: boolean;
}

class Collector {
  readonly places = new Map<string, Place>();
  readonly signFiles = new Set<string>();

  add(
    unit: Unit,
    node: ts.Node,
    kind: string,
    sign: Omit<Sign, "label">,
  ): void {
    const file = repoPath(unit.sf.fileName);
    const key = `${file} › ${ownerOf(node).name} › ${kind}`;
    const place = this.places.get(key) ?? {
      key,
      kind,
      node,
      unit,
      typed: false,
      syntactic: false,
    };

    place.typed ||= sign.typed;
    place.syntactic ||= sign.syntactic;
    this.places.set(key, place);
    this.signFiles.add(file);
  }
}

const BOTH = { typed: true, syntactic: true } as const;

/** Where a hook's place is read: inside its function, so the hook owns it. */
function hookAnchor(property: ts.ObjectLiteralElementLike): ts.Node {
  const value = ts.isPropertyAssignment(property)
    ? property.initializer
    : property;

  if (!isFunctionLike(value) || value.body === undefined) {
    return property;
  }

  return ts.isBlock(value.body)
    ? (value.body.statements[0] ?? value.body)
    : value.body;
}

function hookOf(node: ts.Node, unit: Unit): Sign | undefined {
  if (
    !(ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) ||
    !ts.isObjectLiteralExpression(node.parent) ||
    !HOOKS.has(node.name.getText())
  ) {
    return undefined;
  }

  const value = ts.isPropertyAssignment(node) ? node.initializer : node;

  if (
    !isFunctionLike(value) &&
    !ts.isIdentifier(value) &&
    !ts.isCallExpression(value) &&
    !ts.isPropertyAccessExpression(value)
  ) {
    return undefined;
  }

  const contextual = unit.checker?.getContextualType(node.parent);
  const typed = (
    contextual?.getProperty(node.name.getText())?.declarations ?? []
  ).some(
    (declaration) =>
      ts.isInterfaceDeclaration(declaration.parent) &&
      declaration.parent.name.text === "Plugin",
  );

  return { label: node.name.getText(), typed, syntactic: true };
}

function forwardedSign(
  call: ts.Expression,
  unit: Unit,
  ids: ReadonlySet<string>,
): Sign | undefined {
  const direct = signOfCall(call, unit);

  if (direct !== undefined || unit.checker === undefined) {
    return direct;
  }

  if (!ts.isCallExpression(call)) {
    return undefined;
  }

  const forwarder = calleeOf(call, unit.checker).find((fn) =>
    ids.has(declarationId(fn)),
  );

  return forwarder === undefined
    ? undefined
    : {
        label: nameOf(forwarder) ?? "<forwarder>",
        typed: true,
        syntactic: false,
      };
}

const PROMISE_METHODS = new Set(["then", "catch", "finally"]);

/** A `.catch(` or two-argument `.then(` on a navigation's promise. */
function rejectOf(
  node: ts.Node,
  unit: Unit,
  ids: ReadonlySet<string>,
): Sign | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }

  const member = memberOf(node.expression);
  let inner = receiverOf(node.expression);

  if (
    inner === undefined ||
    !(member === "catch" || (member === "then" && node.arguments.length === 2))
  ) {
    return undefined;
  }

  while (
    ts.isCallExpression(inner) &&
    PROMISE_METHODS.has(memberOf(inner.expression) ?? "")
  ) {
    inner = receiverOf(inner.expression) ?? inner;
  }

  const candidates = ts.isIdentifier(inner) ? sourcesOf(inner, unit) : [inner];
  const sign = candidates
    .map((candidate) => forwardedSign(unwrap(candidate), unit, ids))
    .find((found) => found !== undefined);
  const handler = node.arguments.at(-1);
  const swallowed =
    node.arguments.length === 1 &&
    handler !== undefined &&
    (ts.isIdentifier(handler) ||
      (isFunctionLike(handler) &&
        handler.body !== undefined &&
        ts.isBlock(handler.body) &&
        handler.body.statements.length === 0));

  return sign === undefined
    ? undefined
    : { ...sign, label: `${sign.label}${swallowed ? " (swallowed)" : ""}` };
}

function awaitedSign(
  block: ts.Block,
  unit: Unit,
  ids: ReadonlySet<string>,
): Sign | undefined {
  let found: Sign | undefined;

  walk(block, (node) => {
    if (found === undefined && ts.isAwaitExpression(node)) {
      found = forwardedSign(unwrap(node.expression), unit, ids);
    }
  });

  return found;
}

function transitionRead(node: ts.Node, unit: Unit): Sign | undefined {
  if (
    !ts.isPropertyAccessExpression(node) ||
    node.name.text !== "transition" ||
    isWritten(node)
  ) {
    return undefined;
  }

  const typed =
    unit.checker !== undefined &&
    typeNames(unit.checker, node.expression).includes("State");

  return { label: "transition", typed, syntactic: true };
}

function writerOf(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }

  const member = memberOf(node.expression);
  const receiver = receiverOf(node.expression);

  return member !== undefined &&
    HISTORY_WRITES.has(member) &&
    receiver !== undefined &&
    HISTORYISH.test(receiver.getText())
    ? member
    : undefined;
}

function collectSigns(
  collector: Collector,
  unit: Unit,
  ids: ReadonlySet<string>,
): void {
  walk(unit.sf, (node) => {
    const sign = signOfCall(node, unit);
    const hook = hookOf(node, unit);
    const check = codeCheckOf(node);
    const read = transitionRead(node, unit);
    const writer = writerOf(node);
    const reject = rejectOf(node, unit, ids);

    if (sign !== undefined) {
      collector.add(unit, node, `sign:${sign.label}`, sign);
    }

    if (hook !== undefined) {
      collector.add(
        unit,
        hookAnchor(node as ts.ObjectLiteralElementLike),
        `hook:${hook.label}`,
        hook,
      );
    }

    if (check !== undefined) {
      collector.add(unit, node, check, BOTH);
    }

    if (read !== undefined) {
      collector.add(unit, node, "read:transition", read);
    }

    if (writer !== undefined) {
      collector.add(unit, node, `writer:${writer}`, BOTH);
    }

    if (reject !== undefined) {
      collector.add(unit, node, `reject:${reject.label}`, reject);
    }

    if (ts.isTryStatement(node) && node.catchClause !== undefined) {
      const awaited = awaitedSign(node.tryBlock, unit, ids);

      if (awaited !== undefined) {
        collector.add(
          unit,
          node.catchClause,
          `reject:${awaited.label} (try)`,
          awaited,
        );
      }
    }
  });
}

const isContainer = (value: ts.Expression | undefined): boolean =>
  value !== undefined &&
  ts.isNewExpression(value) &&
  CONTAINERS.has(value.expression.getText());

/** The expression a node writes, when it writes one. */
function writeTarget(node: ts.Node): ts.Expression | undefined {
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return node.operand;
  }

  return isAssignment(node) ? node.left : undefined;
}

/** Is a class field written outside its constructor? */
function writtenOutsideConstructor(field: ts.PropertyDeclaration): boolean {
  const name = field.name.getText();

  return contains(field.parent, (node) => {
    const target = writeTarget(node);

    if (
      target === undefined ||
      !ts.isPropertyAccessExpression(target) ||
      target.expression.kind !== ts.SyntaxKind.ThisKeyword ||
      target.name.getText() !== name
    ) {
      return false;
    }

    for (let current = target.parent; current !== field.parent;) {
      if (ts.isConstructorDeclaration(current)) {
        return false;
      }

      current = current.parent;
    }

    return true;
  });
}

function collectSlots(collector: Collector, unit: Unit): void {
  walk(unit.sf, (node) => {
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.flags & ts.NodeFlags.Let
    ) {
      for (const declaration of node.declarationList.declarations) {
        collector.add(
          unit,
          declaration,
          `slot:${declaration.name.getText()}`,
          BOTH,
        );
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      !(node.parent.flags & ts.NodeFlags.Let) &&
      isContainer(node.initializer)
    ) {
      collector.add(unit, node, `slot:${node.name.getText()}`, BOTH);
    }

    if (
      ts.isPropertyDeclaration(node) &&
      ts.isClassLike(node.parent) &&
      (isContainer(node.initializer) || writtenOutsideConstructor(node))
    ) {
      collector.add(unit, node, `slot:${node.name.getText()}`, BOTH);
    }
  });
}

interface Census {
  readonly places: ReadonlyMap<string, Place>;
}

function census(units: readonly Unit[]): Census {
  const collector = new Collector();
  const ids = forwarders(units);

  for (const unit of units) {
    collectSigns(collector, unit, ids);
  }

  const signFiles = new Set(collector.signFiles);

  for (const unit of units) {
    if (signFiles.has(repoPath(unit.sf.fileName))) {
      collectSlots(collector, unit);
    }
  }

  return { places: collector.places };
}

// ---------------------------------------------------------------------------
// The code of a place
// ---------------------------------------------------------------------------

const inCensus = (node: ts.Node): boolean =>
  /^(?:packages\/(?!core\/)[^/]+\/src\/|shared\/)/u.test(
    repoPath(node.getSourceFile().fileName),
  );

/** The functions a node's calls reach, with the factory each one lives in. */
function callees(
  nodes: readonly ts.Node[],
  checker: ts.TypeChecker | undefined,
  depth: number,
): ts.Node[] {
  if (checker === undefined || depth === 0) {
    return [];
  }

  const reached: ts.Node[] = [];

  for (const node of nodes) {
    walk(node, (inner) => {
      if (!ts.isCallExpression(inner)) {
        return;
      }

      for (const fn of calleeOf(inner, checker).filter((each) =>
        inCensus(each),
      )) {
        // A closure's factory holds the state it shares; a method's class is
        // not a factory.
        const factory = ownerOf(fn).node;

        reached.push(
          fn,
          ...(factory !== undefined && isFunctionLike(factory)
            ? [factory]
            : []),
        );
      }
    });
  }

  return [...reached, ...callees(reached, checker, depth - 1)];
}

/** The listener a subscription hands the router. */
function handlersOf(place: Place): ts.Node[] {
  const call = place.node;

  if (!ts.isCallExpression(call)) {
    return [];
  }

  const handler = call.arguments.at(-1);

  if (handler === undefined) {
    return [];
  }

  if (isFunctionLike(handler)) {
    return [handler];
  }

  const { checker } = place.unit;

  if (checker === undefined) {
    return [];
  }

  if (ts.isCallExpression(handler)) {
    return calleeOf(handler, checker);
  }

  return ts.isIdentifier(handler) ? functionsAt(handler, checker) : [];
}

function nearestFunction(node: ts.Node): ts.Node | undefined {
  for (let current = node.parent; current !== undefined;) {
    if (isFunctionLike(current)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

/** The functions that read or write a slot, in the scope that declares it. */
function slotUsers(place: Place): ts.Node[] {
  const declaration = place.node;

  if (
    !ts.isVariableDeclaration(declaration) &&
    !ts.isPropertyDeclaration(declaration)
  ) {
    return [];
  }

  const name = declaration.name.getText();
  const scope = ts.isPropertyDeclaration(declaration)
    ? declaration.parent
    : (ownerOf(declaration).node ?? declaration.getSourceFile());
  const users = new Set<ts.Node>();

  walk(scope, (node) => {
    const named =
      (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) &&
      node.text === name &&
      node !== declaration.name;
    const fn = named ? nearestFunction(node) : undefined;

    if (fn !== undefined) {
      users.add(fn);
    }
  });

  return [...users];
}

/** The kinds whose place is the listener a subscription hands the router. */
const SUBSCRIPTIONS = ["sign:addEventListener", "sign:subscribe"];

/** The code a place's verdict is read from. */
function holders(place: Place): ts.Node[] {
  const owner = ownerOf(place.node).node;
  let own: ts.Node[];

  if (place.kind.startsWith("slot:")) {
    own = slotUsers(place);
  } else if (SUBSCRIPTIONS.some((kind) => place.kind.startsWith(kind))) {
    own = handlersOf(place);
  } else {
    own = owner === undefined ? [place.node] : [owner];
  }

  return [...own, ...callees(own, place.unit.checker, 2)];
}

// ---------------------------------------------------------------------------
// The forms of identity
// ---------------------------------------------------------------------------

const KEY_METHODS = new Set(["get", "set", "has", "delete", "add"]);

const readsContext = (node: ts.Node): boolean =>
  memberOf(node) === "context" ||
  (ts.isIdentifier(node) &&
    contains(node.getSourceFile(), (declaration) => {
      if (
        !ts.isVariableDeclaration(declaration) ||
        declaration.name.getText() !== node.text ||
        declaration.initializer === undefined
      ) {
        return false;
      }

      return memberOf(declaration.initializer) === "context";
    }));

/** `undefined`, `null` or `void …`: a presence check, not a reference. */
const isNullish = (node: ts.Expression): boolean =>
  (ts.isIdentifier(node) && node.text === "undefined") ||
  node.kind === ts.SyntaxKind.NullKeyword ||
  ts.isVoidExpression(node);

function isObjectTyped(checker: ts.TypeChecker, node: ts.Expression): boolean {
  const type = checker.getTypeAtLocation(node);
  const parts = type.isUnion() ? type.types : [type];

  return parts.some((part) => (part.flags & ts.TypeFlags.Object) !== 0);
}

const LANDED_CALLS = new Set(["readPosition", "arrive", "movedOn"]);

const calleeName = (call: ts.CallExpression): string | undefined =>
  ts.isIdentifier(call.expression)
    ? call.expression.text
    : memberOf(call.expression);

/** A form of identity, read in one node of a place's code. */
type Form = (node: ts.Node, checker: ts.TypeChecker | undefined) => boolean;

const FORMS: Readonly<Record<string, Form>> = {
  context: (node) =>
    (isEquality(node) &&
      [node.left, node.right].some((side) => memberOf(side) === "context")) ||
    (ts.isCallExpression(node) &&
      KEY_METHODS.has(memberOf(node.expression) ?? "") &&
      node.arguments[0] !== undefined &&
      readsContext(node.arguments[0])),
  signal: (node) =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "aborted" &&
    !isWritten(node),
  "state-object": (node, checker) =>
    checker !== undefined &&
    isEquality(node) &&
    !isNullish(node.left) &&
    !isNullish(node.right) &&
    [node.left, node.right].some((side) => isObjectTyped(checker, side)),
  generation: (node) =>
    isEquality(node) &&
    [node.left, node.right].some((side) =>
      /generation|token|version/iu.test(side.getText()),
    ),
  "call-extent": (node) =>
    ts.isTryStatement(node) &&
    node.finallyBlock !== undefined &&
    contains(node.finallyBlock, isAssignment),
  "landed-position": (node) =>
    (ts.isCallExpression(node) && LANDED_CALLS.has(calleeName(node) ?? "")) ||
    (ts.isPropertyAccessExpression(node) &&
      node.name.text === "state" &&
      ts.isIdentifier(node.expression) &&
      /^(?:evt|event)$/u.test(node.expression.text)),
};

/**
 * Is an arm the code picks decided inside it? The code check is one operand
 * of an `&&` whose other operand calls the predicate that decides.
 */
function armDecidedInside(place: Place): boolean {
  for (let node = place.node; !ts.isStatement(node); node = node.parent) {
    const { parent } = node;

    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const other = parent.left === node ? parent.right : parent.left;

      return contains(other, (inner) => ts.isCallExpression(inner));
    }
  }

  return false;
}

const isClear = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
  (node.right.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(node.right) && node.right.text === "undefined"));

const PROMISE_CALLBACKS = new Set(["then", "catch", "finally"]);

/** Does `node` run after its function awaited, or in a promise's callback? */
function inContinuation(node: ts.Node): boolean {
  const fn = nearestFunction(node);

  if (fn === undefined) {
    return false;
  }

  const { parent } = fn;

  if (
    ts.isCallExpression(parent) &&
    PROMISE_CALLBACKS.has(memberOf(parent.expression) ?? "")
  ) {
    return true;
  }

  return contains(
    fn,
    (inner) =>
      ts.isAwaitExpression(inner) &&
      nearestFunction(inner) === fn &&
      inner.getEnd() <= node.getStart(),
  );
}

/**
 * The clears of a slot a navigation's continuation runs that no comparison of
 * the slot guards: a continuation that clears what it does not own.
 */
function unguardedClears(place: Place): ts.Node[] {
  const declaration = place.node;

  if (
    !ts.isVariableDeclaration(declaration) &&
    !ts.isPropertyDeclaration(declaration)
  ) {
    return [];
  }

  const name = declaration.name.getText();
  const names = (node: ts.Node): boolean =>
    node.getText() === name ||
    (ts.isPropertyAccessExpression(node) && node.name.getText() === name);
  const guarded = (node: ts.Node): boolean => {
    for (let current = node.parent; current !== undefined;) {
      if (
        ts.isIfStatement(current) &&
        contains(
          current.expression,
          (inner) =>
            isEquality(inner) && (names(inner.left) || names(inner.right)),
        )
      ) {
        return true;
      }

      current = current.parent;
    }

    return false;
  };
  const scope = ts.isPropertyDeclaration(declaration)
    ? declaration.parent
    : (ownerOf(declaration).node ?? declaration.getSourceFile());
  const clears: ts.Node[] = [];

  walk(scope, (node) => {
    if (
      isClear(node) &&
      names(node.left) &&
      inContinuation(node) &&
      !guarded(node)
    ) {
      clears.push(node);
    }
  });

  return clears;
}

/** Does the code of a place hold `form`? A reject holds its own call. */
function holdsForm(place: Place, form: string): boolean {
  const check = FORMS[form];

  if (check === undefined) {
    return false;
  }

  if (
    form === "call-extent" &&
    (place.kind.startsWith("reject:") || ts.isCatchClause(place.node))
  ) {
    return true;
  }

  return holders(place).some((holder) =>
    contains(holder, (node) => check(node, place.unit.checker)),
  );
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

/**
 * The vocabulary. `identity:<form>` names the form the place's code must hold;
 * `no-decision` is a place that forwards, swallows, or acts on its own event's
 * payload alone; the rest name the fact or the decision that leaves a
 * substitute standing. An `equivalent` or `contract` verdict names the cells
 * that hold its fact (`HELD_BY`); an `unsupported` one lapses when its place
 * gains an identity form.
 */
const VERDICT =
  /^(?:identity:(?:context|signal|state-object|generation|call-extent|landed-position)|equivalent:.+|contract:.+|unsupported:.+|no-decision)$/u;

const NO = "no-decision";
const CONTEXT = "identity:context";
const SIGNAL = "identity:signal";
const OBJECT = "identity:state-object";
const EXTENT = "identity:call-extent";
const GENERATION = "identity:generation";
const LANDED = "identity:landed-position";
const EQ_END =
  "equivalent:Ф1–Ф3 — an end event ends the transition whose start the listener heard last";
const EQ_LEAVE = "equivalent:Ф3 — a success never aborts its leave signal";
const EQ_VT =
  "equivalent:Ф2–Ф3 — every success follows its own leave or a cancel that cleared the slot";
const EQ_RESTART =
  "equivalent:#2778 — core refuses a restart from a router notification";
const EQ_ABORTED =
  "equivalent:a navigation the browser aborts is refused its commit";
const EQ_ARM =
  "equivalent:the code picks the arm, and identity decides inside it";
const EQ_REPLAY =
  "equivalent:a popstate that arrives mid-transition is replayed as the next transition";
const EQ_COMMITTED =
  "equivalent:Ф2–Ф3 — a commit a watch hears before it is read follows the cancel of the navigation it watches for";
const CONTRACT_2751 =
  "contract:#2751 — a navigation whose signal aborts as it lands gets the scroll";
const CONTRACT_RESET =
  "contract:an error boundary auto-resets on TRANSITION_SUCCESS";
const CONTRACT_COMMIT =
  "contract:#2754 — a commit inside the plugin's not-found call takes that call's record";
const CONTRACT_ACTIVATION =
  "contract:#531 — the first transition or commit the plugin hears takes the activation's record";
const CONTRACT_INITIAL_LOAD =
  "contract:the initial page load is the start() commit of a router that had committed nothing when the announcer was created";
const UNSUPPORTED_Z12 =
  "unsupported:Z12 — a scroll-spy emit superseded by a commit that starts no transition";

const LEDGER: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "packages/angular/src/directives/RealLink.ts": {
    "onClick › reject:navigateWithHash (swallowed)": NO,
    "RealLink › slot:prevActiveClass": NO,
    "RealLink › slot:prevHref": NO,
  },
  "packages/angular/src/functions/injectRouteExit.ts": {
    "injectRouteExit › sign:subscribeLeave": SIGNAL,
  },
  "packages/angular/src/internal/install.ts": {
    "installViewTransitions › sign:subscribe": NO,
    "installViewTransitions › slot:offTick": NO,
  },
  "packages/angular/src/providersFactory.ts": {
    "provideRealRouterFactory › sign:start": NO,
  },
  "packages/browser-plugin/src/factory.ts": {
    "createBrowserPlugin › slot:currentHash": NO,
    "createBrowserPlugin › slot:myHashRemover": NO,
    "createDefaultBrowser › slot:cachedPathname": NO,
    "createDefaultBrowser › slot:cachedResult": NO,
    "createDefaultBrowser › slot:cachedSearch": NO,
    "onStart › hook:onStart": NO,
    "onStop › hook:onStop": NO,
    "onTransitionSuccess › hook:onTransitionSuccess": NO,
  },
  "packages/hash-plugin/src/plugin.ts": {
    "constructor › slot:hashWarned": NO,
    "onTransitionSuccess › hook:onTransitionSuccess": NO,
  },
  "packages/lifecycle-plugin/src/factory.ts": {
    "createPlugin › hook:onStop": NO,
    "createPlugin › slot:commitController": NO,
    "createPlugin › slot:compiledHooks": NO,
    "createPlugin › slot:ended": NO,
    "createPlugin › slot:routeController": NO,
    "onTransitionSuccess › hook:onTransitionSuccess": NO,
  },
  "packages/logger-plugin/src/plugin.ts": {
    "LoggerPlugin › slot:#announced": CONTEXT,
    "LoggerPlugin › slot:#shouldLogParams": NO,
    "LoggerPlugin › slot:#startMarkName": NO,
    "LoggerPlugin › slot:#transitionLabel": NO,
    "LoggerPlugin › slot:#transitionStartTime": NO,
    "onStart › hook:onStart": NO,
    "onStop › hook:onStop": NO,
    "onTransitionCancel › hook:onTransitionCancel": EQ_END,
    "onTransitionError › hook:onTransitionError": CONTEXT,
    "onTransitionLeaveApprove › hook:onTransitionLeaveApprove": NO,
    "onTransitionStart › hook:onTransitionStart": NO,
    "onTransitionSuccess › hook:onTransitionSuccess": EQ_END,
  },
  "packages/memory-plugin/src/plugin.ts": {
    "#go › reject:navigateToState": EXTENT,
    "#go › sign:navigateToState": EXTENT,
    "#go › slot:promise": NO,
    "#waitFor › sign:addEventListener(TRANSITION_CANCEL)": NO,
    "#waitFor › sign:addEventListener(TRANSITION_ERROR)": NO,
    "#waitFor › sign:addEventListener(TRANSITION_SUCCESS)": NO,
    "#waitFor › slot:looks": GENERATION,
    "MemoryPlugin › slot:#disposed": NO,
    "MemoryPlugin › slot:#ends": CONTEXT,
    "MemoryPlugin › slot:#inFlight": CONTEXT,
    "MemoryPlugin › slot:#ranLast": CONTEXT,
    "MemoryPlugin › slot:#restores": CONTEXT,
    "MemoryPlugin › slot:#running": CONTEXT,
    "MemoryPlugin › slot:#shown": NO,
    "MemoryPlugin › slot:#staged": EXTENT,
    "MemoryPlugin › slot:#waiting": GENERATION,
    "onStop › hook:onStop": NO,
    "onTransitionCancel › hook:onTransitionCancel": CONTEXT,
    "onTransitionError › hook:onTransitionError": CONTEXT,
    "onTransitionStart › hook:onTransitionStart": CONTEXT,
    "onTransitionSuccess › hook:onTransitionSuccess": CONTEXT,
  },
  "packages/navigation-plugin/src/navigate-handler.ts": {
    "createNavigateHandler › slot:taken": OBJECT,
    "handler › code:errorCodes.ROUTE_NOT_FOUND": NO,
    "handler › sign:navigateToNotFound": CONTRACT_2751,
    "handler › sign:navigateToState": CONTRACT_2751,
    "returnToOrigin › writer:traverseTo": OBJECT,
    "withRecovery › code:.code(SAME_STATES)": SIGNAL,
    "withRecovery › code:.code(TRANSITION_CANCELLED)": EQ_ARM,
    "withRecovery › code:instanceof RouterError": NO,
  },
  "packages/navigation-plugin/src/plugin.ts": {
    "createNavigateLifecycle › slot:myRemover": NO,
    "NavigationPlugin › slot:#activation": CONTRACT_ACTIVATION,
    "NavigationPlugin › slot:#staged": EXTENT,
    "NavigationPlugin › slot:#stagedCommit": CONTRACT_COMMIT,
    "NavigationPlugin › slot:#transitions": CONTEXT,
    "onStart › hook:onStart": EQ_RESTART,
    "onStop › hook:onStop": NO,
    "onTransitionStart › hook:onTransitionStart": CONTEXT,
    "onTransitionSuccess › hook:onTransitionSuccess": CONTEXT,
    "onTransitionSuccess › slot:meta": NO,
    "onTransitionSuccess › writer:traverseTo": CONTEXT,
    "onTransitionSuccess › writer:updateCurrentEntry": EQ_ABORTED,
    "traverseToLast › sign:navigate": EXTENT,
  },
  "packages/persistent-params-plugin/src/plugin.ts": {
    "#onTransitionSuccess › slot:newParams": NO,
    "constructor › slot:removeForwardState": NO,
    "onTransitionSuccess › hook:onTransitionSuccess": NO,
    "PersistentParamsPlugin › slot:#persistentParams": NO,
  },
  "packages/preact/src/components/Link.tsx": {
    "handleClick › reject:navigateWithHash (swallowed)": NO,
  },
  "packages/preact/src/hooks/useRouteExit.tsx": {
    "useRouteExit › sign:subscribeLeave": SIGNAL,
  },
  "packages/preload-plugin/src/plugin.ts": {
    "#resolvePreload › slot:fn": NO,
    "#runPreload › slot:result": NO,
    "onStart › hook:onStart": NO,
    "onStop › hook:onStop": NO,
    "PreloadPlugin › slot:#compiledPreloads": NO,
    "PreloadPlugin › slot:#currentAnchor": NO,
    "PreloadPlugin › slot:#hoverTimer": NO,
    "PreloadPlugin › slot:#lastTouchTarget": NO,
    "PreloadPlugin › slot:#lastTouchTimeStamp": NO,
    "PreloadPlugin › slot:#stateCache": NO,
    "PreloadPlugin › slot:#touchStartY": NO,
    "PreloadPlugin › slot:#touchTimer": NO,
  },
  "packages/react/src/components/InkLink.tsx": {
    "InkLinkImpl › reject:navigate (swallowed)": NO,
    "InkLinkImpl › sign:navigate": NO,
  },
  "packages/react/src/components/Link.tsx": {
    "handleClick › reject:navigateWithHash (swallowed)": NO,
  },
  "packages/react/src/hooks/useRouteExit.tsx": {
    "useRouteExit › sign:subscribeLeave": SIGNAL,
  },
  "packages/rx/src/events$.ts": {
    "events$ › sign:addEventListener(ROUTER_START)": NO,
    "events$ › sign:addEventListener(ROUTER_STOP)": NO,
    "events$ › sign:addEventListener(TRANSITION_CANCEL)": NO,
    "events$ › sign:addEventListener(TRANSITION_ERROR)": NO,
    "events$ › sign:addEventListener(TRANSITION_LEAVE_APPROVE)": NO,
    "events$ › sign:addEventListener(TRANSITION_START)": NO,
    "events$ › sign:addEventListener(TRANSITION_SUCCESS)": NO,
  },
  "packages/rx/src/state$.ts": {
    "state$ › sign:addEventListener(TRANSITION_SUCCESS)": NO,
    "state$ › slot:sawEvent": NO,
  },
  "packages/solid/src/components/Link.tsx": {
    "handleClick › reject:navigateWithHash (swallowed)": NO,
  },
  "packages/solid/src/directives/link.tsx": {
    "handleClick › reject:navigate (swallowed)": NO,
    "handleClick › sign:navigate": NO,
  },
  "packages/solid/src/hooks/useRouteExit.tsx": {
    "useRouteExit › sign:subscribeLeave": SIGNAL,
  },
  "packages/sources/src/createActiveNameSelector.ts": {
    "<module> › slot:selectorCache": NO,
    "connect › sign:subscribe": NO,
    "createActiveNameSelector › slot:activeByName": NO,
    "createActiveNameSelector › slot:listenersByName": NO,
    "createActiveNameSelector › slot:routerUnsubscribe": NO,
    "subscribe › slot:listeners": NO,
    "subscribe › slot:unsubscribed": NO,
  },
  "packages/sources/src/createActiveRouteSource.ts": {
    "<module> › slot:activeSourceCache": NO,
    "buildActiveRouteSource › slot:routerUnsubscribe": NO,
    "createActiveRouteSource › slot:cached": NO,
    "createActiveRouteSource › slot:key": NO,
    "createActiveRouteSource › slot:perRouter": NO,
    "onFirstSubscribe › sign:subscribe": NO,
  },
  "packages/sources/src/createErrorSource.ts": {
    "<module> › slot:errorSourceCache": NO,
    "createErrorSource › sign:addEventListener(TRANSITION_ERROR)": NO,
    "createErrorSource › sign:addEventListener(TRANSITION_SUCCESS)":
      CONTRACT_RESET,
    "createErrorSource › slot:errorVersion": NO,
    "createErrorSource › slot:hasError": NO,
    "getErrorSource › slot:cached": NO,
  },
  "packages/sources/src/createRouteEnterGate.ts": {
    "createRouteEnterGate › read:transition": OBJECT,
    "createRouteEnterGate › slot:lastHandledRoute": OBJECT,
  },
  "packages/sources/src/createRouteNodeSource.ts": {
    "<module> › slot:nodeSourceCache": NO,
    "buildRouteNodeSource › slot:routerUnsubscribe": NO,
    "createRouteNodeSource › slot:cached": NO,
    "createRouteNodeSource › slot:perRouter": NO,
    "onFirstSubscribe › sign:subscribe": NO,
  },
  "packages/sources/src/createRouteSource.ts": {
    "createRouteSource › slot:routerUnsubscribe": NO,
    "onFirstSubscribe › sign:subscribe": NO,
  },
  "packages/sources/src/createTransitionSource.ts": {
    "<module> › slot:transitionSourceCache": NO,
    "createTransitionSource › sign:addEventListener(TRANSITION_CANCEL)": EQ_END,
    "createTransitionSource › sign:addEventListener(TRANSITION_ERROR)": CONTEXT,
    "createTransitionSource › sign:addEventListener(TRANSITION_LEAVE_APPROVE)":
      NO,
    "createTransitionSource › sign:addEventListener(TRANSITION_START)": NO,
    "createTransitionSource › sign:addEventListener(TRANSITION_SUCCESS)":
      EQ_END,
    "createTransitionSource › slot:shown": CONTEXT,
    "getTransitionSource › slot:cached": NO,
  },
  "packages/sources/src/stabilizeState.ts": {
    "readReloadFlag › read:transition": NO,
  },
  "packages/ssr-utils/src/hydrateRouter.ts": {
    "hydrateRouter › sign:start": NO,
  },
  "packages/svelte/src/actions/link.svelte.ts": {
    "<module> › slot:delegationByRouter": NO,
    "findRegisteredNode › slot:element": NO,
    "getDelegation › slot:count": NO,
    "getDelegation › slot:nodes": NO,
    "navigate › reject:navigate (swallowed)": NO,
    "navigate › sign:navigate": NO,
  },
  "packages/svelte/src/composables/useRouteExit.svelte.ts": {
    "useRouteExit › sign:subscribeLeave": SIGNAL,
  },
  "packages/vue/src/components/Link.ts": {
    "handleClick › reject:navigateWithHash (swallowed)": NO,
    "setup › slot:cachedParams": NO,
  },
  "packages/vue/src/composables/useRouteExit.ts": {
    "useRouteExit › sign:subscribeLeave": SIGNAL,
    "useRouteExit › slot:isDeactivated": NO,
  },
  "packages/vue/src/directives/vLink.ts": {
    "<module> › slot:handlers": NO,
    "createClickHandler › reject:navigate (swallowed)": NO,
    "createClickHandler › sign:navigate": NO,
    "createKeydownHandler › reject:navigate (swallowed)": NO,
    "createKeydownHandler › sign:navigate": NO,
  },
  "shared/browser-env/history-api.ts": {
    "go › writer:go": NO,
    "pushState › writer:pushState": NO,
    "replaceState › writer:replaceState": NO,
  },
  "shared/browser-env/history-position.ts": {
    "<module> › slot:runCount": NO,
    "createEntryPositions › slot:arrived": LANDED,
    "createEntryPositions › slot:awaited": NO,
    "createEntryPositions › slot:current": NO,
    "go › writer:go": NO,
    "pushState › writer:pushState": NO,
    "replaceState › writer:replaceState": LANDED,
  },
  "shared/browser-env/newer-navigations.ts": {
    "watchNewerNavigations › sign:addEventListener(TRANSITION_CANCEL)": CONTEXT,
    "watchNewerNavigations › sign:addEventListener(TRANSITION_ERROR)": CONTEXT,
    "watchNewerNavigations › sign:addEventListener(TRANSITION_START)": CONTEXT,
    "watchNewerNavigations › sign:addEventListener(TRANSITION_SUCCESS)":
      CONTEXT,
    "watchNewerNavigations › slot:committed": EQ_COMMITTED,
    "watchNewerNavigations › slot:ends": CONTEXT,
    "watchNewerNavigations › slot:looking": GENERATION,
    "watchNewerNavigations › slot:looks": GENERATION,
    "watchNewerNavigations › slot:running": CONTEXT,
    "watchNewerNavigations › slot:settled": NO,
  },
  "shared/browser-env/plugin-utils.ts": {
    "createReplaceHistoryState › slot:hashSegment": NO,
    "createReplaceHistoryState › writer:replaceState": NO,
  },
  "shared/browser-env/popstate-handler.ts": {
    "createHashSyncLifecycle › hook:onStop": NO,
    "createHashSyncLifecycle › slot:myRemover": NO,
    "createHashSyncLifecycle › slot:resetScheduled": NO,
    "createHashSyncLifecycle › slot:sawHashchange": NO,
    "createHashSyncLifecycle › slot:sawPopstate": NO,
    "createPopstateHandler › slot:deferred": NO,
    "createPopstateHandler › slot:isTransitioning": EXTENT,
    "createPopstateHandler › slot:waitedOn": OBJECT,
    "createPopstateLifecycle › slot:myRemover": NO,
    "onPopState › code:errorCodes.ROUTE_NOT_FOUND": NO,
    "onPopState › code:instanceof RouterError": NO,
    "onPopState › reject:navigateToState (try)": EXTENT,
    "onPopState › sign:navigateToNotFound": NO,
    "onPopState › sign:navigateToState": LANDED,
    "onStart › hook:onStart": NO,
    "onStop › hook:onStop": NO,
    "recoverFromRouterError › code:.code(SAME_STATES)": NO,
    "recoverFromRouterError › code:.code(TRANSITION_CANCELLED)": EQ_ARM,
    "returnOrRollback › writer:go": OBJECT,
  },
  "shared/browser-env/popstate-utils.ts": {
    "createUpdateBrowserState › writer:pushState": NO,
    "createUpdateBrowserState › writer:replaceState": NO,
    "getRouteFromEvent › slot:snapshot": NO,
    "updateBrowserState › writer:pushState": NO,
    "updateBrowserState › writer:replaceState": NO,
  },
  "shared/browser-env/state-guard.ts": {
    "isParamsUnsafe › slot:needsDeepCheck": NO,
    "isSerializable › slot:done": NO,
    "isSerializable › slot:onPath": NO,
    "isStateStrict › read:transition": NO,
  },
  "shared/dom-utils/direction-tracker.ts": {
    "createDirectionTracker › sign:addEventListener(TRANSITION_CANCEL)": EQ_END,
    "createDirectionTracker › sign:addEventListener(TRANSITION_ERROR)": CONTEXT,
    "createDirectionTracker › sign:addEventListener(TRANSITION_START)": NO,
    "createDirectionTracker › sign:addEventListener(TRANSITION_SUCCESS)":
      EQ_END,
    "createDirectionTracker › sign:subscribeLeave": EQ_REPLAY,
    "createDirectionTracker › slot:inFlight": CONTEXT,
    "createDirectionTracker › slot:popstateFlag": EQ_REPLAY,
    "createDirectionTracker › slot:replay": EQ_REPLAY,
  },
  "shared/dom-utils/link-utils.ts": {
    "buildActiveClassName › slot:seen": NO,
    "buildHref › slot:normHash": NO,
    "buildHref › slot:resolved": NO,
    "navigateWithHash › sign:navigate": NO,
    "navigateWithHash › slot:navigatedSearch": NO,
  },
  "shared/dom-utils/route-announcer.ts": {
    "createRouteAnnouncer › sign:subscribe": CONTRACT_INITIAL_LOAD,
    "createRouteAnnouncer › slot:clearTimeoutId": NO,
    "createRouteAnnouncer › slot:initialLoadPending": CONTRACT_INITIAL_LOAD,
    "createRouteAnnouncer › slot:isDestroyed": NO,
    "createRouteAnnouncer › slot:isReady": NO,
    "createRouteAnnouncer › slot:lastAnnouncedText": NO,
    "createRouteAnnouncer › slot:pendingText": NO,
  },
  "shared/dom-utils/scroll-restore.ts": {
    "createScrollRestoration › read:transition": NO,
    "createScrollRestoration › sign:subscribe": NO,
    "createScrollRestoration › slot:destroyed": NO,
    "createScrollRestoration › slot:restoreToken": NO,
    "createScrollRestoration › slot:scrollSettled": NO,
    "createScrollRestoration › slot:store": NO,
    "restorePos › slot:frames": NO,
    "scrollToHashOrTop › slot:id": NO,
  },
  "shared/dom-utils/scroll-spy.ts": {
    "createCooldown › slot:active": NO,
    "createCooldown › slot:listener": NO,
    "createCooldown › slot:listenerContainer": NO,
    "createCooldown › slot:timeout": NO,
    "createDebouncer › slot:raf": NO,
    "createDebouncer › slot:timeout": NO,
    "createObserverPair › slot:duplicateIdWarned": NO,
    "createObserverPair › slot:io": NO,
    "createObserverPair › slot:mo": NO,
    "createObserverPair › slot:mutationTimer": NO,
    "createObserverPair › slot:observed": NO,
    "createObserverPair › slot:observerContainer": NO,
    "createObserverPair › slot:pending": NO,
    "createScrollSpy › reject:navigate (swallowed)": NO,
    "createScrollSpy › sign:navigate": NO,
    "createScrollSpy › sign:subscribe": UNSUPPORTED_Z12,
    "createScrollSpy › slot:destroyed": NO,
    "createScrollSpy › slot:flush": NO,
    "createScrollSpy › slot:selfEmitting": UNSUPPORTED_Z12,
    "createScrollSpy › slot:silenced": NO,
    "createUrlPluginDetector › sign:subscribe": NO,
    "createUrlPluginDetector › slot:detectionConsumed": NO,
    "createUrlPluginDetector › slot:detectionUnsub": NO,
    "observeMatches › slot:candidates": NO,
    "observeMatches › slot:seenIds": NO,
    "pickTopmost › slot:bestNegative": NO,
    "pickTopmost › slot:bestNegativeDist": NO,
    "pickTopmost › slot:bestPositive": NO,
    "pickTopmost › slot:bestPositiveDist": NO,
  },
  "shared/dom-utils/view-transitions.ts": {
    "createViewTransitions › sign:subscribe": EQ_VT,
    "createViewTransitions › sign:subscribeLeave": SIGNAL,
    "createViewTransitions › slot:closeVT": EQ_VT,
    "createViewTransitions › slot:currentVT": OBJECT,
    "createViewTransitions › slot:successFired": EQ_LEAVE,
  },
  "shared/ssr/createSsrLoaderPlugin.ts": {
    "compile › slot:compiled": NO,
    "compile › slot:loader": NO,
    "compile › slot:modeFn": NO,
    "compile › slot:staticMode": NO,
    "createSsrLoaderPlugin › sign:subscribeLeave": SIGNAL,
    "createSsrLoaderPlugin › slot:compiled": NO,
    "createSsrLoaderPlugin › slot:dataClaim": NO,
    "createSsrLoaderPlugin › slot:deferredClaims": NO,
    "createSsrLoaderPlugin › slot:modeClaim": NO,
    "createSsrLoaderPlugin › slot:refreshes": CONTEXT,
    "onTransitionSuccess › hook:onTransitionSuccess": CONTEXT,
  },
};

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

const NAV_PLUGIN = "packages/navigation-plugin/tests/functional";
const BROWSER_PLUGIN = "packages/browser-plugin/tests/functional";
const REACT_DOM = "packages/react/tests/functional/dom-utils";
const MEMORY =
  "packages/memory-plugin/tests/functional/restore-belongs-to-its-go.test.ts";
const RECORD = `${NAV_PLUGIN}/transition-record-2753-2754.test.ts`;
const CORE_NAV = "packages/core/tests/functional/navigation";
const SUPERSEDED_TRAVERSAL = `${BROWSER_PLUGIN}/superseded-traversal-2802.test.ts`;
const SUPERSEDED_RESTORE =
  "packages/memory-plugin/tests/functional/superseded-restore-2802.test.ts";

/** Cells, each a test file and the title of an `it` in it. */
const CELL = {
  leave:
    "packages/sources/tests/unit/guardLeaveListener.test.ts › skips when the signal is already aborted (reentrant-abort pre-check)",
  logger:
    "packages/logger-plugin/tests/functional/early-refusal-2779.test.ts › a SAME_STATES refusal equal to the transition in flight in all but its context leaves its group open",
  memoryRefused: `${MEMORY} › a second back() its guard refuses leaves the stack on the entry the router shows`,
  memoryStaged: `${MEMORY} › a second back() refused inside the first one's announce leaves the first one's restore`,
  memoryListener: `${MEMORY} › a second back() from a listener that runs before the plugin's own leaves the first one's restore`,
  memoryCancelled: `${MEMORY} › a first back() cancelled by a second leaves the stack to the second while it is held`,
  memoryCommit: `${MEMORY} › a navigation that commits over a restore in flight shows its own position to its commit's listeners`,
  memoryNewer: `${SUPERSEDED_RESTORE} › while the newer navigation runs, the stack stands on the entry the restore moves to`,
  memoryEndings: `${SUPERSEDED_RESTORE} › the newer navigation %s`,
  memoryEarlyRefusal: `${SUPERSEDED_RESTORE} › a navigation refused before it starts while the newer one runs decides nothing, and the plugin's hooks throw nothing`,
  memoryEndedInAnnounce: `${SUPERSEDED_RESTORE} › a restore a listener ends inside its announce moves no position`,
  memoryOwnRejection: `${SUPERSEDED_RESTORE} › a back() a TRANSITION_ERROR listener registered %s the plugin defers after a refused back() keeps its own target while its guard holds it`,
  memoryBatch: `${SUPERSEDED_RESTORE} › a navigation refused at once that cancels the one the restore waits for ends the wait as that one's refusal does: a redirect a listener defers that %s, registered %s the plugin, lands where it does after one refusal`,
  memoryLateEnd: `${SUPERSEDED_RESTORE} › the newer navigation ends when %s %i microtasks after it cancels the restore: a redirect a listener registered before the plugin defers lands past the restore's target`,
  memoryNeverRan: `${SUPERSEDED_RESTORE} › after a guard cancels the restore quietly at once, a navigation to %s the caller starts then %s: a redirect a listener of that refusal defers lands where the end of a navigation that ran decides`,
  taken: `${NAV_PLUGIN}/quiet-cancelled-navigation-2796.test.ts › a navigation that arrives after a newer one was taken leaves the newer one's record`,
  origin: `${NAV_PLUGIN}/refused-navigation-returns-2740.test.ts › after one a newer navigation cancelled, a refused one returns to the entry the router stands on`,
  sameStates: `${NAV_PLUGIN}/browser-push-rewritten-url-2744.test.ts › a newer navigation owns the URL: the alias an older one committed is not written`,
  navCancel: `${NAV_PLUGIN}/quiet-cancelled-navigation-2796.test.ts › refused before the Back settles: nothing owns the URL, and the Back returns`,
  navNewerEnds: `${NAV_PLUGIN}/superseded-navigation-2802.test.ts › Back: the newer navigation %s after the Back settled`,
  navStoppedAfterCommit: `${NAV_PLUGIN}/superseded-navigation-2802.test.ts › stop() after the newer navigation commits the URL the Back reached, before the wait is read, leaves the Back's navigation finished: that one committed`,
  scroll: `${NAV_PLUGIN}/rewritten-url-scroll-2751.test.ts › control: a navigation a newer one cancels gets no scroll, the newer one does`,
  scrollNotFound: `${NAV_PLUGIN}/rewritten-url-scroll-2751.test.ts › control: a navigation to a URL no route matches that a newer one overtakes gets no scroll, the newer one does`,
  record: `${RECORD} › a browser navigation that supersedes a held browser navigation publishes its own metadata`,
  recordTraverse: `${RECORD} › one that supersedes a traverseToLast() onto an entry with a fragment publishes its own`,
  recordNested: `${RECORD} › a navigation to a URL no route matches, nested in another's call, leaves the outer one its record`,
  recordGuard: `${RECORD} › one a guard starts within traverseToLast()'s call ends as router.navigate() alone`,
  recordCommit: `${RECORD} › a commit an app makes during the plugin's not-found call takes that call's record`,
  activation: `${NAV_PLUGIN}/navigation-meta-activation.test.ts › activation "reload" → first transition has navigationType "reload"`,
  gateInitial:
    "packages/sources/tests/unit/createRouteEnterGate.test.ts › skips the initial commit — transition.from undefined (arm 2, skip-initial)",
  gateDedupe:
    "packages/sources/tests/unit/createRouteEnterGate.test.ts › dedupes the same snapshot reference — dispatches exactly once (arm 4)",
  transitionSource:
    "packages/sources/tests/functional/early-refusal-2779.test.ts › a SAME_STATES refusal equal to the transition in flight in all but its context leaves it in flight",
  errorReset:
    "packages/react/tests/functional/RouterErrorBoundary.test.tsx › auto-resets on successful navigation",
  overlapping: `${BROWSER_PLUGIN}/overlapping-traversals-keep-their-entries.test.ts › overlapping: the held Back commits while a refused one waits behind it`,
  newerOwns: `${BROWSER_PLUGIN}/quiet-cancelled-traversal-2796.test.ts › still running when the Back settles: it owns the URL, and the plugin does not travel`,
  newerNone: `${BROWSER_PLUGIN}/quiet-cancelled-traversal-2796.test.ts › refused before the Back settles: nothing owns the URL, and the Back returns`,
  quietCancel: `${BROWSER_PLUGIN}/quiet-cancelled-traversal-2796.test.ts › a canDeactivate guard that %s: the page the Back was for is still one Back away`,
  newerEnds: `${SUPERSEDED_TRAVERSAL} › the newer navigation %s after the Back settled`,
  newerWatchEnds: `${SUPERSEDED_TRAVERSAL} › the watch ends with the newer navigation, which %s %s: it keeps no listener, nor does a later Back's`,
  newerEarlyRefusal: `${SUPERSEDED_TRAVERSAL} › a navigation refused before it starts while the newer one runs decides nothing`,
  newerEndedInAnnounce: `${SUPERSEDED_TRAVERSAL} › a traversal a listener ends inside its announce settles at once: its watch keeps no listener`,
  newerBatch: `${SUPERSEDED_TRAVERSAL} › a navigation refused at once that cancels the newer one ends the watch as that one's refusal does: a redirect a TRANSITION_ERROR listener defers by a microtask that %s owns the URL`,
  newerLateEnd: `${SUPERSEDED_TRAVERSAL} › the newer navigation ends when %s %i microtasks after it starts: a redirect a listener of that end defers by a microtask owns the URL`,
  deferred: `${BROWSER_PLUGIN}/refused-traversal-returns-2740.test.ts › a second Back while the guard decides is dropped with the first, and the guard is asked once`,
  rollback: `${BROWSER_PLUGIN}/refused-traversal-returns-2740.test.ts › a redirect a TRANSITION_ERROR listener defers is not undone by the return`,
  trackerError: `${REACT_DOM}/direction-tracker-early-refusal-2779.test.ts › a SAME_STATES refusal equal to a held reload in all but its context leaves a Back that cancels the reload labelled back`,
  trackerHeld: `${REACT_DOM}/direction-tracker-overlapping-traversals.test.ts › a Back held before its leave and a second one behind it are both labelled back`,
  trackerAddress: `${REACT_DOM}/direction-tracker-overlapping-traversals.test.ts › a refusal that names another address leaves a Back behind a held one labelled back`,
  announcer: `${REACT_DOM}/route-announcer-initial-load.test.ts › an announcer created after start() announces the first navigation it sees`,
  announcerRestart: `${REACT_DOM}/route-announcer-initial-load.test.ts › an announcer created %s start() announces the start() of a restart`,
  vtSignal: `${REACT_DOM}/view-transitions.test.ts › reentrant abort — signal aborted before listener runs, utility skips VT entirely`,
  vtCurrent: `${REACT_DOM}/view-transitions.test.ts › control: when the success resolver runs BEFORE the next leave, cancellation skips VT-2`,
  ssrSignal:
    "packages/ssr-data-plugin/tests/functional/data-loader.test.ts › preserves the flag when navigation is cancelled mid-loader — next nav refreshes",
  ssrStale:
    "packages/ssr-data-plugin/tests/functional/stale-flag-cleared-by-its-commit.test.ts › a navigation refused after its leave leaves the refresh to the next one",
  // Core's facts Ф1–Ф3 (A2 §4) and the others an equivalence rests on.
  f1: `${CORE_NAV}/quiet-cancel-leaves-the-band-2787.test.ts › a quiet-cancelling guard superseded by a navigation still in flight: only the superseded one is cancelled`,
  f2: `${CORE_NAV}/transition-event-order-1732.test.ts › orders a supersede: the loser starts, then cancels, then the winner starts`,
  f3: `${CORE_NAV}/navigateToNotFound.test.ts › should emit TRANSITION_SUCCESS for navigateToNotFound after cancel`,
  leaveSignal: `${CORE_NAV}/navigate/leave-signal-cancellation.test.ts › guard path, async guard: signal stays unaborted after success`,
  restart: `${CORE_NAV}/reentrant-start-and-abort-2778.test.ts › leaves the router startable after it refuses a restart`,
  aborted: `${CORE_NAV}/navigate/abort-signal.test.ts › 2. navigate() with signal aborted during async guard → reject with TRANSITION_CANCELLED`,
} as const;

/** The cells that hold each exception's fact. */
const HELD_BY = new Map<string, readonly string[]>([
  [EQ_END, [CELL.f1, CELL.f2, CELL.f3]],
  [EQ_LEAVE, [CELL.leaveSignal]],
  [EQ_VT, [CELL.f2, CELL.f3]],
  [EQ_RESTART, [CELL.restart]],
  [EQ_ABORTED, [CELL.aborted]],
  [EQ_ARM, [CELL.newerNone, CELL.navCancel, CELL.newerEnds, CELL.navNewerEnds]],
  [EQ_REPLAY, [CELL.trackerHeld]],
  [EQ_COMMITTED, [CELL.f2, CELL.f3, CELL.navStoppedAfterCommit]],
  [CONTRACT_2751, [CELL.scroll]],
  [CONTRACT_RESET, [CELL.errorReset]],
  [CONTRACT_COMMIT, [CELL.recordCommit]],
  [CONTRACT_ACTIVATION, [CELL.activation]],
  [CONTRACT_INITIAL_LOAD, [CELL.announcer, CELL.announcerRestart]],
]);

const HANDLER = "packages/navigation-plugin/src/navigate-handler.ts";
const NAVIGATION = "packages/navigation-plugin/src/plugin.ts";
const MEMORY_PLUGIN = "packages/memory-plugin/src/plugin.ts";
const POPSTATE = "shared/browser-env/popstate-handler.ts";
const NEWER = "shared/browser-env/newer-navigations.ts";
const POSITIONS = "shared/browser-env/history-position.ts";
const TRACKER =
  "shared/dom-utils/direction-tracker.ts › createDirectionTracker";
const VT = "shared/dom-utils/view-transitions.ts › createViewTransitions";
const SSR = "shared/ssr/createSsrLoaderPlugin.ts";
const TRANSITION_SOURCE =
  "packages/sources/src/createTransitionSource.ts › createTransitionSource";

/**
 * The cell of every identity place and every place of this batch (#2796):
 * the anchor, the gap and the check the place's verdict stands on.
 */
const CELLS = new Map<string, string>([
  [
    "packages/angular/src/functions/injectRouteExit.ts › injectRouteExit › sign:subscribeLeave",
    CELL.leave,
  ],
  [
    "packages/preact/src/hooks/useRouteExit.tsx › useRouteExit › sign:subscribeLeave",
    CELL.leave,
  ],
  [
    "packages/react/src/hooks/useRouteExit.tsx › useRouteExit › sign:subscribeLeave",
    CELL.leave,
  ],
  [
    "packages/solid/src/hooks/useRouteExit.tsx › useRouteExit › sign:subscribeLeave",
    CELL.leave,
  ],
  [
    "packages/svelte/src/composables/useRouteExit.svelte.ts › useRouteExit › sign:subscribeLeave",
    CELL.leave,
  ],
  [
    "packages/vue/src/composables/useRouteExit.ts › useRouteExit › sign:subscribeLeave",
    CELL.leave,
  ],
  [
    "packages/logger-plugin/src/plugin.ts › onTransitionError › hook:onTransitionError",
    CELL.logger,
  ],
  [
    "packages/logger-plugin/src/plugin.ts › LoggerPlugin › slot:#announced",
    CELL.logger,
  ],
  [`${MEMORY_PLUGIN} › #go › sign:navigateToState`, CELL.memoryListener],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#ends`, CELL.memoryEndedInAnnounce],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#inFlight`, CELL.memoryCancelled],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#ranLast`, CELL.memoryNeverRan],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#restores`, CELL.memoryCommit],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#running`, CELL.memoryEarlyRefusal],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#staged`, CELL.memoryStaged],
  [
    `${MEMORY_PLUGIN} › onTransitionCancel › hook:onTransitionCancel`,
    CELL.memoryEndings,
  ],
  [
    `${MEMORY_PLUGIN} › onTransitionError › hook:onTransitionError`,
    CELL.memoryRefused,
  ],
  [
    `${MEMORY_PLUGIN} › onTransitionStart › hook:onTransitionStart`,
    CELL.memoryCommit,
  ],
  [
    `${MEMORY_PLUGIN} › onTransitionSuccess › hook:onTransitionSuccess`,
    CELL.memoryCommit,
  ],
  [`${MEMORY_PLUGIN} › #go › reject:navigateToState`, CELL.memoryOwnRejection],
  [`${MEMORY_PLUGIN} › #waitFor › slot:looks`, CELL.memoryBatch],
  [`${MEMORY_PLUGIN} › MemoryPlugin › slot:#waiting`, CELL.memoryLateEnd],
  [`${HANDLER} › createNavigateHandler › slot:taken`, CELL.taken],
  [`${HANDLER} › handler › sign:navigateToNotFound`, CELL.scrollNotFound],
  [`${HANDLER} › handler › sign:navigateToState`, CELL.scroll],
  [`${HANDLER} › returnToOrigin › writer:traverseTo`, CELL.origin],
  [
    `${HANDLER} › withRecovery › code:.code(TRANSITION_CANCELLED)`,
    CELL.navCancel,
  ],
  [`${HANDLER} › withRecovery › code:.code(SAME_STATES)`, CELL.sameStates],
  [`${NAVIGATION} › NavigationPlugin › slot:#staged`, CELL.recordNested],
  [`${NAVIGATION} › NavigationPlugin › slot:#transitions`, CELL.record],
  [`${NAVIGATION} › onTransitionStart › hook:onTransitionStart`, CELL.record],
  [
    `${NAVIGATION} › onTransitionSuccess › hook:onTransitionSuccess`,
    CELL.record,
  ],
  [
    `${NAVIGATION} › onTransitionSuccess › writer:traverseTo`,
    CELL.recordTraverse,
  ],
  [`${NAVIGATION} › traverseToLast › sign:navigate`, CELL.recordGuard],
  [
    "packages/sources/src/createRouteEnterGate.ts › createRouteEnterGate › read:transition",
    CELL.gateInitial,
  ],
  [
    "packages/sources/src/createRouteEnterGate.ts › createRouteEnterGate › slot:lastHandledRoute",
    CELL.gateDedupe,
  ],
  [
    `${TRANSITION_SOURCE} › sign:addEventListener(TRANSITION_ERROR)`,
    CELL.transitionSource,
  ],
  [`${TRANSITION_SOURCE} › slot:shown`, CELL.transitionSource],
  [`${POSITIONS} › createEntryPositions › slot:arrived`, CELL.overlapping],
  [`${POSITIONS} › replaceState › writer:replaceState`, CELL.overlapping],
  [
    `${NEWER} › watchNewerNavigations › sign:addEventListener(TRANSITION_START)`,
    CELL.newerOwns,
  ],
  [
    `${NEWER} › watchNewerNavigations › sign:addEventListener(TRANSITION_ERROR)`,
    CELL.newerNone,
  ],
  [
    `${NEWER} › watchNewerNavigations › sign:addEventListener(TRANSITION_CANCEL)`,
    CELL.newerEnds,
  ],
  [
    `${NEWER} › watchNewerNavigations › sign:addEventListener(TRANSITION_SUCCESS)`,
    CELL.newerWatchEnds,
  ],
  [`${NEWER} › watchNewerNavigations › slot:ends`, CELL.newerEndedInAnnounce],
  [`${NEWER} › watchNewerNavigations › slot:looking`, CELL.newerLateEnd],
  [`${NEWER} › watchNewerNavigations › slot:looks`, CELL.newerBatch],
  [`${NEWER} › watchNewerNavigations › slot:running`, CELL.newerEarlyRefusal],
  [`${POPSTATE} › createPopstateHandler › slot:isTransitioning`, CELL.deferred],
  [`${POPSTATE} › createPopstateHandler › slot:waitedOn`, CELL.newerEnds],
  [`${POPSTATE} › onPopState › reject:navigateToState (try)`, CELL.deferred],
  [`${POPSTATE} › onPopState › sign:navigateToState`, CELL.overlapping],
  [
    `${POPSTATE} › recoverFromRouterError › code:.code(TRANSITION_CANCELLED)`,
    CELL.quietCancel,
  ],
  [`${POPSTATE} › returnOrRollback › writer:go`, CELL.rollback],
  [`${TRACKER} › sign:addEventListener(TRANSITION_ERROR)`, CELL.trackerError],
  [`${TRACKER} › slot:inFlight`, CELL.trackerError],
  [`${TRACKER} › sign:subscribeLeave`, CELL.trackerHeld],
  [`${TRACKER} › slot:popstateFlag`, CELL.trackerHeld],
  [`${TRACKER} › slot:replay`, CELL.trackerAddress],
  [
    "shared/dom-utils/route-announcer.ts › createRouteAnnouncer › sign:subscribe",
    CELL.announcer,
  ],
  [
    "shared/dom-utils/route-announcer.ts › createRouteAnnouncer › slot:initialLoadPending",
    CELL.announcerRestart,
  ],
  [`${VT} › sign:subscribeLeave`, CELL.vtSignal],
  [`${VT} › slot:currentVT`, CELL.vtCurrent],
  [`${SSR} › createSsrLoaderPlugin › sign:subscribeLeave`, CELL.ssrSignal],
  [`${SSR} › createSsrLoaderPlugin › slot:refreshes`, CELL.ssrStale],
  [`${SSR} › onTransitionSuccess › hook:onTransitionSuccess`, CELL.ssrStale],
]);

/** This batch's places that stand on no identity form: they name a cell too. */
const BATCH = [
  `${HANDLER} › handler › sign:navigateToNotFound`,
  `${HANDLER} › handler › sign:navigateToState`,
  `${HANDLER} › withRecovery › code:.code(TRANSITION_CANCELLED)`,
  `${POPSTATE} › recoverFromRouterError › code:.code(TRANSITION_CANCELLED)`,
  "shared/dom-utils/route-announcer.ts › createRouteAnnouncer › sign:subscribe",
  "shared/dom-utils/route-announcer.ts › createRouteAnnouncer › slot:initialLoadPending",
  `${TRACKER} › sign:subscribeLeave`,
  `${TRACKER} › slot:popstateFlag`,
  `${TRACKER} › slot:replay`,
];

/** Where the two halves part, and why. */
const DIFFERENCE = {
  // A function that returns a navigation's promise is known only by its type.
  typedOnly: [
    "packages/angular/src/directives/RealLink.ts › onClick › reject:navigateWithHash (swallowed)",
    "packages/preact/src/components/Link.tsx › handleClick › reject:navigateWithHash (swallowed)",
    "packages/react/src/components/Link.tsx › handleClick › reject:navigateWithHash (swallowed)",
    "packages/solid/src/components/Link.tsx › handleClick › reject:navigateWithHash (swallowed)",
    "packages/vue/src/components/Link.ts › handleClick › reject:navigateWithHash (swallowed)",
  ],
  // A `transition` read through a cast to a loose shape is not a State's.
  syntacticOnly: [
    "packages/sources/src/stabilizeState.ts › readReloadFlag › read:transition",
    "shared/browser-env/state-guard.ts › isStateStrict › read:transition",
  ],
};

/**
 * Each place of the A2 census (§2), as the declaration it is found under. A
 * declaration is found while any sign is read there, so a place that changes
 * how it decides stays found and the ledger is what reds.
 */
const A2_ROWS: readonly (readonly [string, readonly string[]])[] = [
  ["I1", [`${POPSTATE} › returnOrRollback`]],
  ["I2", [`${HANDLER} › createNavigateHandler`]],
  ["I3", [`${HANDLER} › returnToOrigin`]],
  ["I4", [`${HANDLER} › handler`]],
  ["I5", [`${HANDLER} › withRecovery`]],
  ["I6", [`${NAVIGATION} › onTransitionStart`]],
  [
    "I7",
    [`${NAVIGATION} › onTransitionSuccess`, `${NAVIGATION} › NavigationPlugin`],
  ],
  ["I8", [`${MEMORY_PLUGIN} › #go`]],
  ["I9", [TRANSITION_SOURCE]],
  [
    "I10",
    [
      "packages/angular/src/functions/injectRouteExit.ts › injectRouteExit",
      "packages/preact/src/hooks/useRouteExit.tsx › useRouteExit",
      "packages/react/src/hooks/useRouteExit.tsx › useRouteExit",
      "packages/solid/src/hooks/useRouteExit.tsx › useRouteExit",
      "packages/svelte/src/composables/useRouteExit.svelte.ts › useRouteExit",
      "packages/vue/src/composables/useRouteExit.ts › useRouteExit",
    ],
  ],
  [
    "I11",
    ["packages/sources/src/createRouteEnterGate.ts › createRouteEnterGate"],
  ],
  ["I12", [TRACKER]],
  ["I13", [VT]],
  ["I14", [VT]],
  ["I15", [`${SSR} › createSsrLoaderPlugin`]],
  ["I16", ["packages/logger-plugin/src/plugin.ts › onTransitionError"]],
  ["Z1", [`${POPSTATE} › recoverFromRouterError`]],
  ["Z2", [`${HANDLER} › withRecovery`]],
  [
    "Z3",
    [
      `${POSITIONS} › replaceState`,
      `${POPSTATE} › onPopState`,
      "packages/browser-plugin/src/factory.ts › onTransitionSuccess",
      "packages/hash-plugin/src/plugin.ts › onTransitionSuccess",
    ],
  ],
  ["Z4", [`${HANDLER} › createNavigateHandler`]],
  ["Z5", [`${MEMORY_PLUGIN} › #go`]],
  ["Z6", [`${MEMORY_PLUGIN} › onTransitionSuccess`]],
  ["Z7", [`${MEMORY_PLUGIN} › #go`]],
  ["Z8", ["shared/dom-utils/route-announcer.ts › createRouteAnnouncer"]],
  ["Z9", [`${SSR} › createSsrLoaderPlugin`, `${SSR} › onTransitionSuccess`]],
  ["Z10", [TRACKER]],
  ["Z11", [TRACKER]],
  ["Z12", ["shared/dom-utils/scroll-spy.ts › createScrollSpy"]],
  ["Z13", [`${HANDLER} › handler`]],
  ["Z14", ["packages/sources/src/createErrorSource.ts › createErrorSource"]],
  ["Z15", [`${NAVIGATION} › NavigationPlugin`]],
  ["E1", [TRANSITION_SOURCE]],
  ["E2", [TRACKER]],
  [
    "E3",
    [
      "packages/logger-plugin/src/plugin.ts › onTransitionSuccess",
      "packages/logger-plugin/src/plugin.ts › onTransitionCancel",
    ],
  ],
  ["E4", [VT]],
  ["E5", [VT]],
  ["E6", [`${NAVIGATION} › onStart`]],
  ["E7", [`${NAVIGATION} › onTransitionSuccess`]],
  ["E8", [`${HANDLER} › createNavigateHandler`]],
];

/** The slot of each new place A2 §7 found, under its name today. */
const SLOT_SAMPLE = [
  `${HANDLER} › createNavigateHandler › slot:taken`,
  `${MEMORY_PLUGIN} › MemoryPlugin › slot:#shown`,
  `${MEMORY_PLUGIN} › MemoryPlugin › slot:#inFlight`,
  `${MEMORY_PLUGIN} › MemoryPlugin › slot:#staged`,
  `${MEMORY_PLUGIN} › MemoryPlugin › slot:#restores`,
  `${TRACKER} › slot:popstateFlag`,
  `${TRACKER} › slot:inFlight`,
  `${TRACKER} › slot:replay`,
  "shared/dom-utils/scroll-spy.ts › createScrollSpy › slot:selfEmitting",
  `${POSITIONS} › createEntryPositions › slot:current`,
  `${POSITIONS} › createEntryPositions › slot:awaited`,
  `${POSITIONS} › createEntryPositions › slot:arrived`,
  `${VT} › slot:successFired`,
  `${VT} › slot:closeVT`,
  `${SSR} › createSsrLoaderPlugin › slot:refreshes`,
];

/** The titles of the `it` / `test` calls of a test file, `.each` included. */
function cellTitles(file: string): Set<string> {
  const absolute = path.join(ROOT, file);

  return existsSync(absolute)
    ? cellTitlesOf(readFileSync(absolute, "utf8"), file.endsWith("x"))
    : new Set<string>();
}

/** The file a cell named here lives in: its text before the first ` › `. */
const fileOf = (cell: string): string => cell.slice(0, cell.indexOf(" › "));

// Every file a cell named here lives in, read once at collection, where no
// cell's read budget reaches (#2818).
const TITLES = new Map(
  [
    ...new Set(
      [...CELLS.values(), ...[...HELD_BY.values()].flat()].map((cell) =>
        fileOf(cell),
      ),
    ),
  ].map((file) => [file, cellTitles(file)]),
);

const cellExists = (cell: string): boolean => {
  const at = cell.indexOf(" › ");

  return at > 0 && (TITLES.get(fileOf(cell))?.has(cell.slice(at + 3)) ?? false);
};

const byText = (a: string, b: string): number => a.localeCompare(b);

/** `file › owner`: the declaration a place's key names. */
const declarationOf = (key: string): string =>
  key.slice(0, key.lastIndexOf(" › "));

const TOKEN_GREP = [
  "grep",
  "-n",
  "-I",
  "-E",
  "TRANSITION_[A-Z_]+|errorCodes[.]|CANCELLED",
  "--",
  "packages",
  "shared",
];

/** The tracked lines, outside comments and Markdown, the fact tokens reach. */
function tokenHits(): string[] {
  // The sample asks the version control tool through PATH, as the file set
  // does, and shares none of the census's filters but its roots.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- see the two lines above
  const out = execFileSync("git", TOKEN_GREP, { cwd: ROOT, encoding: "utf8" });

  return out
    .split("\n")
    .filter((line) => line !== "")
    .filter((line) => {
      const [file = "", , ...rest] = line.split(":");
      const text = rest.join(":").trim();

      return (
        (/^packages\/(?!core\/)[^/]+\/src\//u.test(file) ||
          file.startsWith("shared/")) &&
        !file.endsWith(".md") &&
        !/^(?:\/\/|\*|\/\*)/u.test(text)
      );
    })
    .map((line) => line.slice(0, line.indexOf(":")));
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const ledger = new Map(
  Object.entries(LEDGER).flatMap(([file, places]) =>
    Object.entries(places).map(([place, verdict]) => [
      `${file} › ${place}`,
      verdict,
    ]),
  ),
);

describe("the outcome-decision census outside core (#2796)", () => {
  const found = census(diskUnits(PACKAGE_CONFIG));
  // The verdicts of the places found: a place the ledger names and the code
  // lacks is the equality cell's to report, so the others read on.
  const present = [...ledger].filter(([key]) => found.places.has(key));
  const place = (key: string): Place => {
    const value = found.places.get(key);

    if (value === undefined) {
      throw new Error(`not found: ${key}`);
    }

    return value;
  };

  it("the places found are the ledger", () => {
    expect([...found.places.keys()].toSorted(byText)).toStrictEqual(
      [...ledger.keys()].toSorted(byText),
    );
  });

  it("every verdict is in the vocabulary", () => {
    const outside = [...ledger].filter(([, verdict]) => !VERDICT.test(verdict));

    expect(outside).toStrictEqual([]);
  });

  it("an identity verdict is held by the code of its place", () => {
    const unheld = present
      .filter(([, verdict]) => verdict.startsWith("identity:"))
      .filter(
        ([key, verdict]) =>
          !holdsForm(place(key), verdict.slice("identity:".length)),
      )
      .map(([key]) => key);

    expect(unheld).toStrictEqual([]);
  });

  it("an unsupported place still decides without an identity form", () => {
    const stale = present
      .filter(([, verdict]) => verdict.startsWith("unsupported:"))
      .filter(([key]) =>
        Object.keys(FORMS).some((form) => holdsForm(place(key), form)),
      )
      .map(([key]) => key);

    expect(stale).toStrictEqual([]);
  });

  it("an arm a code picks is decided inside it by a call", () => {
    const undecided = present
      .filter(([, verdict]) => verdict === EQ_ARM)
      .filter(([key]) => !armDecidedInside(place(key)))
      .map(([key]) => key);

    expect(undecided).toStrictEqual([]);
  });

  it("a continuation clears an identity slot only when the slot is its own", () => {
    const unguarded = present
      .filter(
        ([key, verdict]) =>
          key.includes(" › slot:") && verdict.startsWith("identity:"),
      )
      .flatMap(([key]) =>
        unguardedClears(place(key)).map((node) => `${key}: ${node.getText()}`),
      );

    expect(unguarded).toStrictEqual([]);
  });

  it("an exception's fact is held by cells that exist", () => {
    const exceptions = new Set(
      [...ledger.values()].filter((verdict) =>
        /^(?:equivalent|contract):/u.test(verdict),
      ),
    );
    const unheld = [...exceptions].filter((verdict) => {
      const cells = HELD_BY.get(verdict) ?? [];

      return cells.length === 0 || cells.some((cell) => !cellExists(cell));
    });

    expect(unheld).toStrictEqual([]);
    expect([...HELD_BY.keys()].toSorted(byText)).toStrictEqual(
      [...exceptions].toSorted(byText),
    );
  });

  it("every identity place and every place of this batch names a cell that exists", () => {
    const owed = new Set([
      ...[...ledger]
        .filter(([, verdict]) => verdict.startsWith("identity:"))
        .map(([key]) => key),
      ...BATCH,
    ]);
    const missing = [...owed].filter((key) => {
      const cell = CELLS.get(key);

      return cell === undefined || !cellExists(cell);
    });

    expect(missing).toStrictEqual([]);
    expect([...CELLS.keys()].toSorted(byText)).toStrictEqual(
      [...owed].toSorted(byText),
    );
  });

  it("the type checker and the syntax part where the pinned list says", () => {
    const places = [...found.places.values()];

    expect(
      places
        .filter((each) => each.typed && !each.syntactic)
        .map((each) => each.key)
        .toSorted(byText),
    ).toStrictEqual(DIFFERENCE.typedOnly);
    expect(
      places
        .filter((each) => !each.typed && each.syntactic)
        .map((each) => each.key)
        .toSorted(byText),
    ).toStrictEqual(DIFFERENCE.syntacticOnly);
  });

  it("CONTROL — every place of the A2 census is found", () => {
    const declarations = new Set(
      [...found.places.keys()].map((key) => declarationOf(key)),
    );
    const missing = A2_ROWS.flatMap(([row, places]) =>
      places
        .filter((each) => !declarations.has(each))
        .map((each) => `${row}: ${each}`),
    );

    expect(missing).toStrictEqual([]);
  });

  it("CONTROL — the slot of every new place A2 §7 found is found", () => {
    expect(SLOT_SAMPLE.filter((key) => !found.places.has(key))).toStrictEqual(
      [],
    );
  });

  it("CONTROL — every file the fact tokens reach holds a place", () => {
    const files = new Set(
      [...found.places.keys()].map((key) => key.slice(0, key.indexOf(" › "))),
    );
    const hits = tokenHits();

    expect(hits.length).toBeGreaterThan(0);
    expect([...new Set(hits.filter((file) => !files.has(file)))]).toStrictEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// Fixtures: each spelling the census reads, on a synthetic source
// ---------------------------------------------------------------------------

const FIXTURE = path.join(ROOT, "shared/__census_fixture__");

/** One program over in-memory files, as `diskUnits` builds one per package. */
function memoryUnits(files: Readonly<Record<string, string>>): Unit[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    noEmit: true,
    skipLibCheck: true,
  };
  const texts = new Map(
    Object.entries(files).map(([name, text]) => [
      path.join(FIXTURE, name),
      text,
    ]),
  );
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const scripts = [...texts.keys()].filter((name) => !name.endsWith(".svelte"));

  host.getSourceFile = (name, version) => {
    const text = texts.get(name);

    return text === undefined
      ? getSourceFile(name, version)
      : ts.createSourceFile(name, text, version, true);
  };
  host.fileExists = (name) => texts.has(name) || ts.sys.fileExists(name);
  host.directoryExists = (name) =>
    [...texts.keys()].some((file) => file.startsWith(`${name}${path.sep}`)) ||
    ts.sys.directoryExists(name);
  host.readFile = (name) => texts.get(name) ?? ts.sys.readFile(name);

  const program = ts.createProgram(scripts, options, host);
  const checker = program.getTypeChecker();
  const units: Unit[] = scripts.map((name) => {
    const sf = program.getSourceFile(name);

    if (sf === undefined) {
      throw new Error(`not in the program: ${name}`);
    }

    return { sf, checker };
  });

  for (const [name, text] of texts) {
    if (name.endsWith(".svelte")) {
      units.push({
        sf: ts.createSourceFile(
          name,
          svelteScript(text),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        ),
        checker: undefined,
      });
    }
  }

  return units;
}

const TYPES = `
  export interface State {
    readonly name: string;
    readonly context: object;
    readonly transition?: { readonly from?: string };
  }
  export interface Router {
    navigate(name: string): Promise<State>;
    subscribe(fn: (payload: { route: State; previousRoute?: State }) => void): () => void;
    subscribeLeave(fn: (payload: { signal: AbortSignal }) => void): () => void;
  }
  export interface PluginApi {
    addEventListener(event: string, fn: (toState: State) => void): () => void;
    navigateToState(state: State): Promise<State>;
  }
  export interface Plugin {
    onStart?(): void;
    onTransitionSuccess?(toState: State): void;
  }
  export declare class RouterError extends Error {
    readonly code: string;
  }
  export declare const errorCodes: { readonly TRANSITION_CANCELLED: string };
`;

const SPELLINGS = `
  import { errorCodes, RouterError } from "./types";
  import type { Plugin, PluginApi, Router, State } from "./types";

  export function typedOnly(r: Router): void {
    r.subscribe(() => undefined);
  }
  export function syntacticOnly(router: any): void {
    void router.navigate("a");
  }
  export function element(router: Router): void {
    void router["navigate"]("a");
  }
  export const plugin: Plugin = {
    onTransitionSuccess(toState) {
      void toState;
    },
  };
  export const loose = { onStart: () => undefined };
  export async function rejects(api: PluginApi, state: State): Promise<void> {
    let promise: Promise<State>;
    promise = api.navigateToState(state);
    promise.catch(() => {});
    try {
      await api.navigateToState(state);
    } catch (error) {
      if (error instanceof RouterError && error.code === errorCodes.TRANSITION_CANCELLED) {
        return;
      }
    }
  }
  export function go(router: Router): Promise<State> {
    return router.navigate("a");
  }
  export function forwarded(router: Router): void {
    go(router).catch((error: unknown) => {
      throw error;
    });
  }
  export function initialized(router: Router): void {
    const pending = router.navigate("a");
    pending.catch(() => {});
  }
  export function chained(router: Router): void {
    void router.navigate("b").then(() => undefined).catch(() => {});
  }
  export function twoArguments(router: Router): void {
    void router.navigate("c").then(() => undefined, () => {});
  }
  export function writes(): void {
    history.pushState(null, "", "/");
  }
  export function reads(route: State): boolean {
    return route.transition?.from === undefined;
  }
  export class Holder {
    #flag = false;
    flip(): void {
      this.#flag = !this.#flag;
    }
  }
  let counter = 0;
  export const registry = new WeakMap<object, number>();
  export const cancelled = errorCodes.TRANSITION_CANCELLED;
  export function bump(): number {
    counter += 1;

    return counter;
  }
`;

const FORM_SOURCE = `
  import type { PluginApi, Router, State } from "./types";

  declare function readPosition(state: unknown): number;

  let staged: object | undefined;

  export function listens(api: PluginApi, router: Router): void {
    let shown: State | undefined;
    const owners = new Set<object>();

    api.addEventListener("ERROR", (toState) => {
      if (toState.context === shown?.context) {
        shown = undefined;
      }
    });
    api.addEventListener("START", (toState) => {
      owners.add(toState.context);
    });
    router.subscribeLeave(({ signal }) => {
      if (signal.aborted) {
        return;
      }
    });
    router.subscribe(({ route }) => {
      if (route === shown) {
        return;
      }
    });
    api.addEventListener("PLAIN", () => undefined);
  }
  export function presence(router: Router): void {
    router.subscribe(({ previousRoute }) => {
      if (previousRoute === undefined) {
        return;
      }
    });
  }
  export function versioned(router: Router): void {
    let version = 0;

    router.subscribe(() => {
      const mine = ++version;

      if (mine === version) {
        return;
      }
    });
  }
  export function stage(router: Router): void {
    const outer = staged;

    staged = {};
    try {
      void router.navigate("a");
    } finally {
      staged = outer;
    }
  }
  export function lands(evt: { state: unknown }, router: Router): void {
    void readPosition(evt.state);
    void router.navigate("b");
  }
  declare const errorCodes: { readonly TRANSITION_CANCELLED: string };
  declare function owned(): boolean;
  export function arms(error: { code: string }): boolean {
    return error.code === errorCodes.TRANSITION_CANCELLED && owned();
  }
  export function bare(error: { code: string }, flag: boolean): boolean {
    return error.code === errorCodes.TRANSITION_CANCELLED && flag;
  }
  export function continues(router: Router): void {
    let mine: object | null | undefined;
    const record = {};

    mine = record;
    void (async () => {
      await router.navigate("c");
      if (mine === record) {
        mine = undefined;
      }
    })();
    void router.navigate("d").then(() => {
      mine = undefined;
    });
    void (async () => {
      await router.navigate("e");
      mine = null;
    })();
  }
`;

describe("the census reads every spelling (#2796)", () => {
  const found = census(
    memoryUnits({
      "types.ts": TYPES,
      "spellings.ts": SPELLINGS,
      "forms.ts": FORM_SOURCE,
      "Component.svelte": `<script lang="ts">\n  router.navigate("a");\n</script>\n<p>text</p>\n`,
    }),
  );
  const at = (file: string, rest: string): Place | undefined =>
    found.places.get(`shared/__census_fixture__/${file} › ${rest}`);
  const halves = (place: Place | undefined): string => {
    if (place === undefined) {
      return "missing";
    }

    const typed = place.typed ? "typed" : "-";
    const syntactic = place.syntactic ? "syntactic" : "-";

    return `${typed}/${syntactic}`;
  };

  it("a sign by its type alone, by its receiver's name alone, and in brackets", () => {
    expect(halves(at("spellings.ts", "typedOnly › sign:subscribe"))).toBe(
      "typed/-",
    );
    expect(halves(at("spellings.ts", "syntacticOnly › sign:navigate"))).toBe(
      "-/syntactic",
    );
    expect(halves(at("spellings.ts", "element › sign:navigate"))).toBe(
      "typed/syntactic",
    );
    expect(halves(at("Component.svelte", "<module> › sign:navigate"))).toBe(
      "-/syntactic",
    );
  });

  it("a hook of a Plugin, and one only its name tells", () => {
    expect(
      halves(
        at("spellings.ts", "onTransitionSuccess › hook:onTransitionSuccess"),
      ),
    ).toBe("typed/syntactic");
    expect(halves(at("spellings.ts", "onStart › hook:onStart"))).toBe(
      "-/syntactic",
    );
  });

  it("a rejection handler on an assigned promise, in a try, and through a forwarder", () => {
    expect(
      halves(
        at("spellings.ts", "rejects › reject:navigateToState (swallowed)"),
      ),
    ).toBe("typed/syntactic");
    expect(
      halves(at("spellings.ts", "rejects › reject:navigateToState (try)")),
    ).toBe("typed/syntactic");
    expect(halves(at("spellings.ts", "forwarded › reject:go"))).toBe("typed/-");
  });

  it("a rejection handler on a promise a declaration holds, at the end of a chain, and as then's second argument", () => {
    expect(
      halves(at("spellings.ts", "initialized › reject:navigate (swallowed)")),
    ).toBe("typed/syntactic");
    expect(
      halves(at("spellings.ts", "chained › reject:navigate (swallowed)")),
    ).toBe("typed/syntactic");
    expect(halves(at("spellings.ts", "twoArguments › reject:navigate"))).toBe(
      "typed/syntactic",
    );
  });

  it("code checks, a history write, a transition read and the slots", () => {
    const rests = [
      "rejects › code:instanceof RouterError",
      "rejects › code:.code(TRANSITION_CANCELLED)",
      "<module> › code:errorCodes.TRANSITION_CANCELLED",
      "writes › writer:pushState",
      "reads › read:transition",
      "Holder › slot:#flag",
      "<module> › slot:counter",
      "<module> › slot:registry",
    ];

    expect(
      rests.map((rest) => [rest, halves(at("spellings.ts", rest))]),
    ).toStrictEqual(rests.map((rest) => [rest, "typed/syntactic"]));
  });

  it("each form of identity, and a place that holds none", () => {
    const holds = (rest: string, form: string): boolean => {
      const place = at("forms.ts", rest);

      return place !== undefined && holdsForm(place, form);
    };

    expect(holds('listens › sign:addEventListener("ERROR")', "context")).toBe(
      true,
    );
    expect(holds('listens › sign:addEventListener("START")', "context")).toBe(
      true,
    );
    expect(holds("listens › sign:subscribeLeave", "signal")).toBe(true);
    expect(holds("listens › sign:subscribe", "state-object")).toBe(true);
    expect(holds("versioned › sign:subscribe", "generation")).toBe(true);
    expect(holds("stage › sign:navigate", "call-extent")).toBe(true);
    expect(holds("lands › sign:navigate", "landed-position")).toBe(true);
    // Each negative is read off a place the census found.
    expect(
      at("forms.ts", 'listens › sign:addEventListener("PLAIN")'),
    ).toBeDefined();
    expect(
      Object.keys(FORMS).filter((form) =>
        holds('listens › sign:addEventListener("PLAIN")', form),
      ),
    ).toStrictEqual([]);
    // A presence check reads no reference: `previousRoute === undefined`
    // holds no form of its own.
    expect(at("forms.ts", "presence › sign:subscribe")).toBeDefined();
    expect(
      Object.keys(FORMS).filter((form) =>
        holds("presence › sign:subscribe", form),
      ),
    ).toStrictEqual([]);
  });

  it("an arm decided by a call, and one decided by a value", () => {
    const decided = (rest: string): boolean | undefined => {
      const place = at("forms.ts", rest);

      return place === undefined ? undefined : armDecidedInside(place);
    };

    expect(decided("arms › code:.code(TRANSITION_CANCELLED)")).toBe(true);
    expect(decided("bare › code:.code(TRANSITION_CANCELLED)")).toBe(false);
  });

  it("a continuation's guarded clear, after an await, and an unguarded one in a callback", () => {
    const place = at("forms.ts", "continues › slot:mine");

    expect(
      place === undefined
        ? "missing"
        : unguardedClears(place).map((node) => node.getText()),
    ).toStrictEqual(["mine = undefined", "mine = null"]);
  });

  it("a cell that runs holds a fact, and a skipped, pending or focused one does not", () => {
    const cells = `
      it("runs", () => {});
      test("runs too", () => {});
      it.each([1])("runs per row %s", () => {});
      it.skip("skipped", () => {});
      it.todo("pending");
      test.only("focused", () => {});
      it.skip.each([1])("skipped per row %s", () => {});
      describe("a describe", () => {});
      describe.todo("a pending suite", () => {
        it("inside a pending suite", () => {});
      });
      describe.each([1])("a suite per row %s", () => {
        it("inside a suite per row", () => {});
      });
    `;

    expect([...cellTitlesOf(cells, false)]).toStrictEqual([
      "runs",
      "runs too",
      "runs per row %s",
      "inside a suite per row",
    ]);
  });
});
