// The census sees LEAVES, not stacks: a new stack to an existing leaf outside
// a window is invisible to it, and the behavioural cells of that window hold it.
//
// Where core calls the application's code (#2786). Core runs that code in the
// middle of its own operations, and a navigation started there is refused only
// where `Router.#assertNotReentrant` counts the moment. The census derives
// three sets and pins each by equality:
// - KINDS — the callable positions of what the application hands core, read
//   from the published types;
// - PLACES — every call of one, keyed by declaration; where the event emitter
//   dispatches the call, the `emit` is the place;
// - WINDOWS — the try/finally regions whose counters the ban reads.
//
// Every place carries a verdict. `counted` is held by the code: the place
// stands inside its window, or every path of callers reaches it through that
// window. Any other verdict says why the place may run outside every window,
// and lapses when no call of the place does. A leaf that stacks of different
// verdicts share carries the strongest: `unsupported`, then `by-design`, then
// `harmless`, then `inherits`.
//
// ⚠ The census follows the TYPE a call resolves to. A value typed as core's
// own and replaced at run time — a stubbed member of `getInternals(router)` —
// is out of its reach, and so is code that runs with no call of its own: an
// iterator, a conversion (`String(x)`, a template, `toJSON`), a getter read by
// a property access.
//
// ⚠ A platform `abort()` dispatches listeners of its own;
// `abort-dispatch-authority-2778.test.ts` holds those.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { cellTitlesOf } from "./helpers";

const CORE = path.resolve(__dirname, "../..");
const SRC = path.join(CORE, "src");

const byText = (a: string, b: string): number => a.localeCompare(b);

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

/** The modules of the export map, by the condition that names their source. */
function exportEntries(): string[] {
  const manifest = JSON.parse(
    readFileSync(path.join(CORE, "package.json"), "utf8"),
  ) as { exports: Record<string, Record<string, string>> };

  return Object.values(manifest.exports).map((conditions) =>
    relativeTo(
      SRC,
      path.join(CORE, conditions["@real-router/internal-source"]),
    ),
  );
}

function languageService(
  files: readonly string[],
  overrides: ReadonlyMap<string, string>,
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

/** A path relative to `root`, with forward slashes. */
function relativeTo(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Owners and declarations
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

/** The name of the nearest named function-like around `node`. */
function ownerOf(node: ts.Node): string {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    const name = nameOf(current);

    if (name !== undefined) {
      return name;
    }
  }

  return "<module>";
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

/**
 * Where a declaration stands: its file, then the names from the nearest
 * interface, type or class down to it. A function or a method contributes
 * `name()`, so a parameter's type reads `runChecks().checks`.
 */
function declarationSite(declaration: ts.Node, root: string): string {
  const parts: string[] = [];

  for (
    let current: ts.Node | undefined = declaration;
    current !== undefined && !ts.isSourceFile(current);
    current = current.parent
  ) {
    if (
      ts.isPropertySignature(current) ||
      ts.isMethodSignature(current) ||
      ts.isPropertyDeclaration(current) ||
      ts.isParameter(current) ||
      ts.isVariableDeclaration(current) ||
      ts.isPropertyAssignment(current)
    ) {
      parts.unshift(current.name.getText());
    } else if (
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isClassDeclaration(current)
    ) {
      parts.unshift(current.name?.getText() ?? "<class>");

      break;
    } else if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current)
    ) {
      parts.unshift(`${current.name?.getText() ?? "<function>"}()`);
    }
  }

  return `${relativeTo(root, declaration.getSourceFile().fileName)} › ${parts.join(".")}`;
}

/** `file › rest`, without its file. */
const short = (site: string): string => site.slice(site.indexOf(" › ") + 3);

/** Does `site` start with `prefix` at the boundary of a name or a directory? */
function matchesPrefix(site: string, prefix: string): boolean {
  const next = site.charAt(prefix.length);

  return site.startsWith(prefix) && ["", ".", "(", " ", "/"].includes(next);
}

// ---------------------------------------------------------------------------
// What the census is told: the shape of the code it reads
// ---------------------------------------------------------------------------

interface Layout {
  readonly root: string;
  /** The modules of the export map, relative to `root`. */
  readonly entries: readonly string[];
  /** The handed-out surfaces, by the module that exports the type. */
  readonly surfaces: ReadonlyMap<string, string>;
  /** Declaration containers whose members fold into one kind. */
  readonly families: readonly string[];
  /** Internal declarations a value of the application travels through. */
  readonly transports: ReadonlySet<string>;
  /** Internal declarations whose values are core's own, by prefix. */
  readonly hops: ReadonlySet<string>;
  /** The ban, as `declarationSite` prints the method. */
  readonly ban: string;
  /** The emitter class, as `file › Class`. */
  readonly emitter: string;
}

const LIB = /[/\\]node_modules[/\\](?:typescript|@types)[/\\]/u;

const isLibrary = (node: ts.Node): boolean =>
  LIB.test(node.getSourceFile().fileName);

const CONTAINERS = new Set([
  "Array",
  "ReadonlyArray",
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
  "Promise",
  "PromiseLike",
]);

const SCALARS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.EnumLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.VoidLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Never |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown;

const isReadonly = (declaration: ts.Declaration): boolean =>
  (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly) !== 0;

const typeName = (type: ts.Type): string | undefined =>
  (type.aliasSymbol ?? type.getSymbol())?.getName();

/** The router a factory receives, and the errors core builds, are core's own. */
const CORE_TYPES = new Set(["Router", "RouterError"]);

const CONSTRAINED =
  ts.TypeFlags.TypeParameter |
  ts.TypeFlags.IndexedAccess |
  ts.TypeFlags.Conditional;

/** A type's members that are not the library's, with their declarations. */
function ownMembers(type: ts.Type): [ts.Symbol, ts.Declaration][] {
  return type.getProperties().flatMap((property) => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];

    return declaration === undefined || isLibrary(declaration)
      ? []
      : [[property, declaration] as [ts.Symbol, ts.Declaration]];
  });
}

// ---------------------------------------------------------------------------
// KINDS — the callable positions of what the application hands core
// ---------------------------------------------------------------------------

class KindWalker {
  readonly kinds = new Map<string, string[]>();

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly layout: Layout,
  ) {}

  /** The kind a call-signature declaration belongs to, families folded. */
  kindOf(declaration: ts.Node): string {
    const site = declarationSite(declaration, this.layout.root);
    const family = this.layout.families.find((container) =>
      site.startsWith(`${container}.`),
    );

    return family === undefined ? site : `${family}.*`;
  }

  /** Every callable inside a type the APPLICATION provides. */
  walkIn(type: ts.Type, at: string, seen: ReadonlySet<ts.Type>): void {
    if (seen.has(type) || seen.size > 7 || type.flags & SCALARS) {
      return;
    }

    const inner = new Set(seen).add(type);

    if (type.isUnion() || type.isIntersection()) {
      for (const member of type.types) {
        this.walkIn(member, at, inner);
      }
    } else if (type.flags & CONSTRAINED) {
      const constraint = this.checker.getBaseConstraintOfType(type);

      if (constraint !== undefined && constraint !== type) {
        this.walkIn(constraint, at, inner);
      }
    } else if (!CORE_TYPES.has(typeName(type) ?? "")) {
      this.walkObject(type, at, inner);
    }
  }

  /** What a signature takes is the application's. */
  walkParameters(signature: ts.Signature, at: string): void {
    for (const parameter of signature.getParameters()) {
      this.walkIn(
        this.checker.getTypeOfSymbol(parameter),
        `${at}(${parameter.getName()})`,
        new Set(),
      );
    }
  }

  /** A surface core HANDS OUT: what the application passes or writes into it. */
  walkOut(type: ts.Type, at: string, depth = 0): void {
    for (const [property, declaration] of ownMembers(type)) {
      const memberType = this.checker.getTypeOfSymbol(property);
      const member = `${at}.${property.getName()}`;
      const signatures = memberType.getCallSignatures();

      if (signatures.length > 0) {
        for (const signature of signatures) {
          this.walkParameters(signature, member);
        }
      } else if (
        !isReadonly(declaration) ||
        CONTAINERS.has(typeName(memberType) ?? "")
      ) {
        this.walkIn(memberType, member, new Set());
      } else {
        // A readonly slot: its writable callables are the application's, and
        // what its methods take is handed in like a surface's.
        this.recordWritable(memberType, member);

        if (depth < 2) {
          this.walkOut(memberType, member, depth + 1);
        }
      }
    }
  }

  private walkObject(
    type: ts.Type,
    at: string,
    seen: ReadonlySet<ts.Type>,
  ): void {
    const signatures = type.getCallSignatures();

    if (signatures.length === 0 && this.isLibraryType(type)) {
      this.walkContainer(type, at, seen);

      return;
    }

    this.record(at, type);

    // A factory's RESULT is the application's too.
    for (const signature of signatures) {
      this.walkIn(signature.getReturnType(), `${at}()=>`, seen);
    }

    for (const [property] of ownMembers(type)) {
      this.walkIn(
        this.checker.getTypeOfSymbol(property),
        `${at}.${property.getName()}`,
        seen,
      );
    }

    const index = type.getStringIndexType();

    if (index !== undefined) {
      this.walkIn(index, `${at}[string]`, seen);
    }
  }

  private record(at: string, type: ts.Type): void {
    for (const signature of type.getCallSignatures()) {
      // The checker synthesizes signatures with no declaration of their own,
      // for a union or an intersection; their parts are walked on their own.
      const declaration: ts.Declaration | undefined =
        signature.getDeclaration();

      if (declaration === undefined) {
        continue;
      }

      const kind = this.kindOf(declaration);

      this.kinds.set(kind, [...(this.kinds.get(kind) ?? []), at]);
    }
  }

  private recordWritable(type: ts.Type, at: string): void {
    for (const [property, declaration] of ownMembers(type)) {
      if (!isReadonly(declaration)) {
        this.record(
          `${at}.${property.getName()}`,
          this.checker.getTypeOfSymbol(property),
        );
      }
    }
  }

  private walkContainer(
    type: ts.Type,
    at: string,
    seen: ReadonlySet<ts.Type>,
  ): void {
    const name = typeName(type);

    if (name === undefined || !CONTAINERS.has(name)) {
      return;
    }

    const parameters =
      type.aliasTypeArguments ??
      this.checker.getTypeArguments(type as ts.TypeReference);

    for (const [index, argument] of parameters.entries()) {
      this.walkIn(argument, `${at}<${name}#${index}>`, seen);
    }
  }

  private isLibraryType(type: ts.Type): boolean {
    const declaration = type.getSymbol()?.declarations?.[0];

    return (
      ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Mapped) === 0 &&
      declaration !== undefined &&
      isLibrary(declaration)
    );
  }
}

function exportsOf(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): [string, ts.Symbol][] {
  const module = checker.getSymbolAtLocation(sourceFile);

  return (module === undefined ? [] : checker.getExportsOfModule(module)).map(
    (symbol) => [
      symbol.getName(),
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol,
    ],
  );
}

interface Kinds {
  /** Kind → the positions it was found at. */
  readonly kinds: ReadonlyMap<string, readonly string[]>;
  /** The object types the export map's functions and classes hand back. */
  readonly returned: ReadonlyMap<string, ts.Type>;
  readonly walker: KindWalker;
}

/** What an exported value can be called or constructed with. */
function signaturesOf(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): ts.Signature[] {
  if (!(symbol.flags & ts.SymbolFlags.Value)) {
    return [];
  }

  const type = checker.getTypeOfSymbol(symbol);

  return [...type.getCallSignatures(), ...type.getConstructSignatures()];
}

function sourceOf(
  program: ts.Program,
  layout: Layout,
  file: string,
): ts.SourceFile {
  const sourceFile = program.getSourceFile(path.join(layout.root, file));

  if (sourceFile === undefined) {
    throw new Error(`not in the program: ${file}`);
  }

  return sourceFile;
}

function deriveKinds(program: ts.Program, layout: Layout): Kinds {
  const checker = program.getTypeChecker();
  const walker = new KindWalker(checker, layout);
  const returned = new Map<string, ts.Type>();
  const exported = layout.entries.flatMap((entry) =>
    exportsOf(checker, sourceOf(program, layout, entry)),
  );

  for (const [name, symbol] of exported) {
    for (const signature of signaturesOf(checker, symbol)) {
      const result = signature.getReturnType();
      const resultName = typeName(result);

      walker.walkParameters(signature, name);

      if (resultName !== undefined && result.flags & ts.TypeFlags.Object) {
        returned.set(resultName, result);
      }
    }
  }

  for (const [surface, file] of layout.surfaces) {
    const found = exportsOf(checker, sourceOf(program, layout, file)).find(
      ([name]) => name === surface,
    );

    if (found === undefined) {
      throw new Error(`${file} exports no ${surface}`);
    }

    walker.walkOut(checker.getDeclaredTypeOfSymbol(found[1]), surface);
  }

  return { kinds: walker.kinds, returned, walker };
}

// ---------------------------------------------------------------------------
// PLACES — every call of the application's code
// ---------------------------------------------------------------------------

/**
 * The library members through which a call runs a value's own code: what
 * reads a thenable's `then`, and the invokers of a function.
 */
const PROTOCOL = new Set([
  "then",
  "catch",
  "finally",
  "call",
  "apply",
  "Reflect.apply",
  "Promise.resolve",
  "Promise.all",
  "Promise.allSettled",
  "Promise.race",
  "Promise.any",
]);

/** `a.b.then` → `then`; `Reflect.apply` and `Promise.x` keep their host. */
function protocolMember(callee: ts.Expression): string | undefined {
  let expression = callee;

  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }

  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  const host = expression.expression;
  const member = expression.name.text;

  return ts.isIdentifier(host) &&
    (host.text === "Promise" || host.text === "Reflect")
    ? `${host.text}.${member}`
    : member;
}

const hasBody = (declaration: ts.Node): boolean =>
  isFunctionLike(declaration) && declaration.body !== undefined;

/** An overload signature of a function or method core implements. */
function isOverload(declaration: ts.Node, checker: ts.TypeChecker): boolean {
  if (
    !(
      ts.isFunctionDeclaration(declaration) ||
      ts.isMethodDeclaration(declaration)
    ) ||
    declaration.name === undefined
  ) {
    return false;
  }

  return (
    checker
      .getSymbolAtLocation(declaration.name)
      ?.declarations?.some((each) => hasBody(each)) ?? false
  );
}

type CallNode =
  ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression;

const calleeOf = (call: CallNode): ts.Expression =>
  ts.isTaggedTemplateExpression(call) ? call.tag : call.expression;

const isCall = (node: ts.Node): node is CallNode =>
  ts.isCallExpression(node) ||
  ts.isNewExpression(node) ||
  ts.isTaggedTemplateExpression(node);

class PlaceCollector {
  readonly places = new Map<string, ts.Node[]>();
  readonly dispatched = new Set<string>();
  readonly ownProtocol = new Set<string>();
  readonly reached = new Set<string>();
  readonly transported = new Map<string, number>();
  readonly hopped = new Map<string, number>();
  readonly unclassified = new Set<string>();
  readonly unresolved: string[] = [];

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly layout: Layout,
    private readonly kinds: Kinds,
    private readonly ownProtocolKeys: ReadonlySet<string>,
  ) {}

  visit(call: CallNode): void {
    const declaration = this.checker
      .getResolvedSignature(call)
      ?.getDeclaration();
    const callee = calleeOf(call);

    if (declaration === undefined) {
      this.visitUnresolved(call);
    } else if (isLibrary(declaration)) {
      this.visitProtocol(call, callee);
    } else if (hasBody(declaration) || isOverload(declaration, this.checker)) {
      this.visitOwn(call, declaration);
    } else {
      this.visitDeclared(call, callee, declaration);
    }
  }

  private keyOf(node: ts.Node, sign: string): string {
    const file = relativeTo(this.layout.root, node.getSourceFile().fileName);

    return `${file} › ${ownerOf(node)} › ${sign}`;
  }

  private add(key: string, call: ts.Node): void {
    this.places.set(key, [...(this.places.get(key) ?? []), call]);
  }

  private visitDeclared(
    call: CallNode,
    callee: ts.Expression,
    declaration: ts.Node,
  ): void {
    const site = declarationSite(declaration, this.layout.root);
    const reached = this.kindsOfCallee(callee);
    const family = reached.find((kind) => kind.endsWith(".*"));

    for (const kind of reached) {
      this.reached.add(kind);
    }

    if (family !== undefined) {
      this.add(`${family.slice(0, -2)} › family`, call);
    } else if (reached.length > 0) {
      this.leaf(
        call,
        `call:${reached
          .map((kind) => short(kind))
          .toSorted(byText)
          .join(" | ")}`,
      );
    } else if (this.layout.transports.has(site)) {
      this.transported.set(site, (this.transported.get(site) ?? 0) + 1);
      this.leaf(call, `call:${short(site)}`);
    } else {
      const hop = [...this.layout.hops].find((prefix) =>
        matchesPrefix(site, prefix),
      );

      if (hop === undefined) {
        this.unclassified.add(site);
      } else {
        this.hopped.set(hop, (this.hopped.get(hop) ?? 0) + 1);
      }
    }
  }

  /** The kinds a callee's TYPE carries, every member of a union included. */
  private kindsOfCallee(callee: ts.Expression): string[] {
    const type = this.checker.getTypeAtLocation(callee);
    const kinds = new Set<string>();

    for (const member of type.isUnion() ? type.types : [type]) {
      for (const signature of member.getCallSignatures()) {
        const declaration: ts.Declaration | undefined =
          signature.getDeclaration();
        const kind =
          declaration === undefined
            ? undefined
            : this.kinds.walker.kindOf(declaration);

        if (kind !== undefined && this.kinds.kinds.has(kind)) {
          kinds.add(kind);
        }
      }
    }

    return [...kinds];
  }

  /** A leaf the emitter dispatches is not a place: its `emit` is. */
  private leaf(call: ts.Node, sign: string): void {
    const key = this.keyOf(call, sign);

    if (this.isDispatched(call)) {
      this.dispatched.add(key);
    } else {
      this.add(key, call);
    }
  }

  /** Inside the emitter's module, or inside a function handed to its `on`. */
  private isDispatched(call: ts.Node): boolean {
    const [file] = this.layout.emitter.split(" › ", 1);

    if (relativeTo(this.layout.root, call.getSourceFile().fileName) === file) {
      return true;
    }

    const holder = nearestFunction(call)?.parent;
    const registration =
      holder !== undefined && ts.isCallExpression(holder)
        ? this.checker.getResolvedSignature(holder)?.getDeclaration()
        : undefined;

    return (
      registration !== undefined &&
      declarationSite(registration, this.layout.root) ===
        `${this.layout.emitter}.on()`
    );
  }

  private visitUnresolved(call: CallNode): void {
    // A class with no constructor of its own has no signature to resolve to.
    const created = ts.isNewExpression(call)
      ? this.checker.getTypeAtLocation(call.expression).getSymbol()
      : undefined;
    const declaredHere = created?.declarations?.some(
      (declaration) =>
        ts.isClassDeclaration(declaration) && !isLibrary(declaration),
    );

    if (declaredHere !== true) {
      this.unresolved.push(this.keyOf(call, calleeOf(call).getText()));
    }
  }

  private visitProtocol(call: CallNode, callee: ts.Expression): void {
    const member = protocolMember(callee);

    if (member === undefined || !PROTOCOL.has(member)) {
      return;
    }

    const key = this.keyOf(call, `then:${member}`);

    if (this.ownProtocolKeys.has(key)) {
      this.ownProtocol.add(key);
    } else {
      this.leaf(call, `then:${member}`);
    }
  }

  private visitOwn(call: CallNode, declaration: ts.Node): void {
    if (
      ts.isCallExpression(call) &&
      declarationSite(declaration, this.layout.root) ===
        `${this.layout.emitter}.emit()`
    ) {
      this.add(
        this.keyOf(call, `emit:${call.arguments[0]?.getText() ?? ""}`),
        call,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// WINDOWS — the regions whose counters the ban reads
// ---------------------------------------------------------------------------

interface Window {
  /** `file › owner [counter]`. */
  readonly key: string;
  readonly region: ts.TryStatement;
}

/** The member an expression reads: `this.#depth > 0` → `#depth`. */
function readMember(expression: ts.Expression): string | undefined {
  const read = ts.isBinaryExpression(expression) ? expression.left : expression;

  return ts.isPropertyAccessExpression(read) ? read.name.text : undefined;
}

/**
 * The counters the ban reads: each predicate it calls is a method whose body
 * is one `return` of a member.
 */
function banCounters(program: ts.Program, layout: Layout): Set<string> {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(
    path.join(layout.root, layout.ban.split(" › ", 1)[0]),
  );
  const counters = new Set<string>();

  if (sourceFile === undefined) {
    throw new Error(`not in the program: ${layout.ban}`);
  }

  walk(sourceFile, (node) => {
    if (
      !ts.isMethodDeclaration(node) ||
      declarationSite(node, layout.root) !== layout.ban
    ) {
      return;
    }

    walk(node, (inner) => {
      const predicate = ts.isCallExpression(inner)
        ? checker.getResolvedSignature(inner)?.getDeclaration()
        : undefined;
      const statements =
        predicate !== undefined && ts.isMethodDeclaration(predicate)
          ? (predicate.body?.statements ?? [])
          : [];
      const [only] = statements;
      const counter =
        statements.length === 1 &&
        only !== undefined &&
        ts.isReturnStatement(only) &&
        only.expression !== undefined
          ? readMember(only.expression)
          : undefined;

      if (counter !== undefined) {
        counters.add(counter);
      }
    });
  });

  return counters;
}

/** `x.c++`, `++x.c` or `x.c = true` raise `c`; `--` and `= false` lower it. */
function stepOf(node: ts.Node): { counter: string; up: boolean } | undefined {
  if (
    (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
    ts.isPropertyAccessExpression(node.operand) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return {
      counter: node.operand.name.text,
      up: node.operator === ts.SyntaxKind.PlusPlusToken,
    };
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    (node.right.kind === ts.SyntaxKind.TrueKeyword ||
      node.right.kind === ts.SyntaxKind.FalseKeyword)
  ) {
    return {
      counter: node.left.name.text,
      up: node.right.kind === ts.SyntaxKind.TrueKeyword,
    };
  }

  return undefined;
}

/** The steps of `counter` in `node` itself, nested functions left out. */
function stepsIn(node: ts.Node, counter: string, up: boolean): ts.Node[] {
  const steps: ts.Node[] = [];

  const visit = (child: ts.Node): void => {
    const step = stepOf(child);

    if (step?.counter === counter && step.up === up) {
      steps.push(child);
    }

    if (!isFunctionLike(child)) {
      ts.forEachChild(child, visit);
    }
  };

  ts.forEachChild(node, visit);

  return steps;
}

/**
 * A window: a `try` whose `finally` lowers a counter the ban reads, in a
 * function that raises it before the `try`.
 */
function deriveWindows(
  sourceFiles: readonly ts.SourceFile[],
  counters: ReadonlySet<string>,
  root: string,
): Window[] {
  const windows: Window[] = [];

  for (const sourceFile of sourceFiles) {
    walk(sourceFile, (node) => {
      const fn = nearestFunction(node);

      if (
        !ts.isTryStatement(node) ||
        node.finallyBlock === undefined ||
        fn === undefined
      ) {
        return;
      }

      for (const counter of counters) {
        if (
          stepsIn(node.finallyBlock, counter, false).length > 0 &&
          stepsIn(fn, counter, true).some(
            (step) => step.getStart() < node.getStart(),
          )
        ) {
          windows.push({
            key: `${relativeTo(root, sourceFile.fileName)} › ${ownerOf(node)} [${counter}]`,
            region: node,
          });
        }
      }
    });
  }

  return windows;
}

/** Inside the `try` of `window`, in the function that opens it. */
const inWindow = (node: ts.Node, window: Window): boolean =>
  node.getSourceFile() === window.region.getSourceFile() &&
  node.getStart() >= window.region.tryBlock.getStart() &&
  node.getEnd() <= window.region.tryBlock.getEnd() &&
  nearestFunction(node) === nearestFunction(window.region);

/**
 * `x`, `a.x` or `this.x`: the expression a reference stands in, or nothing
 * for a mention in a comment.
 */
function referenceExpression(
  sourceFile: ts.SourceFile,
  start: number,
): ts.Node | undefined {
  let expression = nodeAt(sourceFile, start);

  if (
    !(ts.isIdentifier(expression) || ts.isPrivateIdentifier(expression)) ||
    expression.getStart() !== start
  ) {
    return undefined;
  }

  while (
    ts.isPropertyAccessExpression(expression.parent) &&
    expression.parent.name === expression
  ) {
    expression = expression.parent;
  }

  return expression;
}

/** The name a function is called by: its own, or what it is assigned to. */
function leadOf(fn: ts.Node): ts.Node | undefined {
  if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) {
    return fn.name;
  }

  const holder = fn.parent;

  return (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    (ts.isVariableDeclaration(holder) ||
      ts.isPropertyAssignment(holder) ||
      ts.isPropertyDeclaration(holder))
    ? holder.name
    : undefined;
}

const isModuleSpecifier = (node: ts.Node): boolean =>
  ts.findAncestor(
    node,
    (ancestor) =>
      ts.isImportDeclaration(ancestor) || ts.isExportDeclaration(ancestor),
  ) !== undefined;

/**
 * The name of a member another type declares: a bag's interface answers for
 * its object literal, and the calls through that interface are references of
 * their own.
 */
const isMemberName = (node: ts.Node): boolean =>
  (ts.isPropertySignature(node.parent) ||
    ts.isMethodSignature(node.parent) ||
    ts.isPropertyDeclaration(node.parent) ||
    ts.isMethodDeclaration(node.parent) ||
    ts.isPropertyAssignment(node.parent)) &&
  node.parent.name === node;

interface Reach {
  readonly service: ts.LanguageService;
  readonly program: ts.Program;
}

/**
 * Does every path of callers reach `name` through one of `windows`? A
 * reference that hands the function on as a value is a path the census
 * cannot follow, so it answers no.
 */
function reachedOnlyThrough(
  name: ts.Node,
  windows: readonly Window[],
  reach: Reach,
  seen: Set<string>,
): boolean {
  const id = `${name.getSourceFile().fileName}:${name.getStart()}`;

  if (seen.has(id)) {
    return true;
  }

  if (seen.size > 8) {
    return false;
  }

  seen.add(id);

  const references = (
    reach.service.findReferences(
      name.getSourceFile().fileName,
      name.getStart(),
    ) ?? []
  )
    .flatMap((group) => group.references)
    .filter((reference) => !reference.isDefinition);

  return (
    references.length > 0 &&
    references.every((reference) => {
      const sourceFile = reach.program.getSourceFile(reference.fileName);

      if (sourceFile === undefined) {
        return false;
      }

      const expression = referenceExpression(
        sourceFile,
        reference.textSpan.start,
      );

      if (
        expression === undefined ||
        isModuleSpecifier(expression) ||
        isMemberName(expression)
      ) {
        return true;
      }

      const { parent } = expression;

      if (ts.isCallExpression(parent) && parent.expression === expression) {
        const caller = nearestFunction(parent);
        const lead = caller === undefined ? undefined : leadOf(caller);

        return (
          windows.some((window) => inWindow(parent, window)) ||
          (lead !== undefined && reachedOnlyThrough(lead, windows, reach, seen))
        );
      }

      // An alias in a wiring bag: `X: ctx.X`.
      return (
        ts.isPropertyAssignment(parent) &&
        parent.initializer === expression &&
        reachedOnlyThrough(parent.name, windows, reach, seen)
      );
    })
  );
}

/** Inside one of `windows`, or reached only through them. */
function heldBy(
  call: ts.Node,
  windows: readonly Window[],
  reach: Reach,
): boolean {
  const fn = nearestFunction(call);
  const lead = fn === undefined ? undefined : leadOf(fn);

  return (
    windows.some((window) => inWindow(call, window)) ||
    (lead !== undefined && reachedOnlyThrough(lead, windows, reach, new Set()))
  );
}

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

interface Census extends Reach {
  readonly kinds: Kinds;
  /** Place key → the calls it stands for. */
  readonly places: ReadonlyMap<string, readonly ts.Node[]>;
  /** Leaves the emitter dispatches: their `emit` is the place. */
  readonly dispatched: ReadonlySet<string>;
  /** Protocol calls on values core owns, as the ledger names them. */
  readonly ownProtocol: ReadonlySet<string>;
  /** The kinds a leaf of their own type calls. */
  readonly reached: ReadonlySet<string>;
  /** Transport → how many calls go through it. */
  readonly transported: ReadonlyMap<string, number>;
  /** Hop prefix → how many calls it accounts for. */
  readonly hopped: ReadonlyMap<string, number>;
  /** Internal declarations no ledger names. */
  readonly unclassified: ReadonlySet<string>;
  /** Calls the checker resolves to no declaration. */
  readonly unresolved: readonly string[];
  readonly counters: ReadonlySet<string>;
  readonly windows: readonly Window[];
}

function census(
  layout: Layout,
  files: readonly string[],
  ownProtocolKeys: ReadonlySet<string>,
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
  const kinds = deriveKinds(program, layout);
  const collector = new PlaceCollector(
    program.getTypeChecker(),
    layout,
    kinds,
    ownProtocolKeys,
  );

  for (const sourceFile of sourceFiles) {
    walk(sourceFile, (node) => {
      if (isCall(node)) {
        collector.visit(node);
      }
    });
  }

  const counters = banCounters(program, layout);

  return {
    kinds,
    places: collector.places,
    dispatched: collector.dispatched,
    ownProtocol: collector.ownProtocol,
    reached: collector.reached,
    transported: collector.transported,
    hopped: collector.hopped,
    unclassified: collector.unclassified,
    unresolved: collector.unresolved,
    counters,
    windows: deriveWindows(sourceFiles, counters, layout.root),
    service,
    program,
  };
}

// ---------------------------------------------------------------------------
// The ledgers
// ---------------------------------------------------------------------------

const EBN = "namespaces/EventBusNamespace/EventBusNamespace.ts";
const NN = "namespaces/NavigationNamespace/NavigationNamespace.ts";
const RS = "namespaces/RoutesNamespace/routesStore.ts";
const RLN = "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts";
const LOGGER = "utils/logger/RouterLogger.ts";

/** The objects core hands the application, by the module that exports the type. */
const SURFACES = new Map([
  ["Router", "types/index.ts"],
  ["Navigator", "types/index.ts"],
  ["PluginApi", "types/index.ts"],
  ["RoutesApi", "types/index.ts"],
  ["LifecycleApi", "types/index.ts"],
  ["DependenciesApi", "types/index.ts"],
  ["RouterInternals", "validation.ts"],
]);

/** Kinds whose members fold into one: core calls them at too many places to list. */
const FAMILIES = [
  "types/RouterValidator.ts › RouterValidator",
  "types/router.ts › RouterLogger",
];

const T_EMITTER =
  "utils/event-emitter/EventEmitter.ts › EventEmitter.#callListener()";
const T_DIAGNOSTIC = `${EBN} › EventBusNamespace.subscribeDiagnostic().handler`;
const T_TREE = `${EBN} › EventBusNamespace.subscribeTreeChanged().handler`;
const T_INTERCEPTORS = "internals.ts › executeInterceptorChain().interceptors";
const T_CHECKS = "internals.ts › runChecks().checks";
const T_FACTORY = "wiring/wireNamespaces.ts › createCompileFactory().factory";
const T_DECODE = `${RS} › commitScalarConfig().updates.decodeParams`;
const T_ENCODE = `${RS} › commitScalarConfig().updates.encodeParams`;
const T_SOURCE = `${RS} › assertForwardToShape().isTranspiledAsync.toString`;

/** Internal types that hold the application's functions under a type of core's. */
const TRANSPORTS = new Map([
  [T_EMITTER, "the emitter holds every listener under one type"],
  [T_DIAGNOSTIC, "the diagnostic subscription wraps the handler it is given"],
  [T_TREE, "the tree-change subscription wraps the handler it is given"],
  [T_INTERCEPTORS, "a seam runs its interceptors under one type"],
  [T_CHECKS, "a position runs its checks under one type"],
  [T_FACTORY, "guard and plugin factories compile through one type"],
  [T_DECODE, "`update()` wraps a route's new decoder"],
  [T_ENCODE, "`update()` wraps a route's new encoder"],
  [T_SOURCE, "the async-shape check reads a `forwardTo` function's source"],
]);

const LEAF = "leaf";
const UNCALLED = "uncalled";

/**
 * Every callable position the application fills, and how core calls it: at a
 * leaf of the kind's own type, through a transport, or not at all.
 */
const KINDS = new Map([
  ["internals.ts › RouterInternals.checks", T_CHECKS],
  ["internals.ts › RouterInternals.interceptors", T_INTERCEPTORS],
  ["internals.ts › RouterInternals.subscribeDiagnostic.handler", T_DIAGNOSTIC],
  ["internals.ts › RouterInternals.treeChanged.subscribe.handler", T_TREE],
  ["types/api.ts › CheckFn", T_CHECKS],
  // `claimContextNamespace` hands the claim OUT; core calls its own methods.
  ["types/api.ts › ContextNamespaceClaim.release", UNCALLED],
  ["types/api.ts › ContextNamespaceClaim.write", UNCALLED],
  ["types/api.ts › InterceptorFn", T_INTERCEPTORS],
  ["types/api.ts › PluginApi.subscribeDiagnostic.handler", T_DIAGNOSTIC],
  ["types/api.ts › RoutesApi.subscribeChanges.handler", T_TREE],
  ["types/router.ts › DefaultParamsCallback", LEAF],
  ["types/router.ts › DefaultRouteCallback", LEAF],
  ["types/router.ts › DefaultSearchCallback", LEAF],
  ["types/router.ts › ForwardToCallback", LEAF],
  ["types/router.ts › GuardFn", LEAF],
  ["types/router.ts › GuardFnFactory", T_FACTORY],
  ["types/router.ts › LeaveFn", LEAF],
  ["types/router.ts › LogCallback", LEAF],
  ["types/router.ts › Plugin.onStart", T_EMITTER],
  ["types/router.ts › Plugin.onStop", T_EMITTER],
  ["types/router.ts › Plugin.onTransitionCancel", T_EMITTER],
  ["types/router.ts › Plugin.onTransitionError", T_EMITTER],
  ["types/router.ts › Plugin.onTransitionLeaveApprove", T_EMITTER],
  ["types/router.ts › Plugin.onTransitionStart", T_EMITTER],
  ["types/router.ts › Plugin.onTransitionSuccess", T_EMITTER],
  ["types/router.ts › Plugin.teardown", LEAF],
  ["types/router.ts › PluginFactory", T_FACTORY],
  ["types/router.ts › Route.decodeParams", LEAF],
  ["types/router.ts › Route.encodeParams", LEAF],
  ["types/router.ts › RouteConfigUpdate.decodeParams", T_DECODE],
  ["types/router.ts › RouteConfigUpdate.encodeParams", T_ENCODE],
  ["types/router.ts › RouterLogger.*", LEAF],
  ["types/router.ts › SubscribeFn", LEAF],
  ["types/RouterValidator.ts › RouterValidator.*", LEAF],
]);

/** Internal declarations whose values core writes itself, by prefix. */
const HOPS = new Map([
  [
    "api/getRoutesApi.ts › collectFlatRoutes()",
    "its `include` is a predicate written at each call",
  ],
  [
    "api/getRoutesApi.ts › replaceRoutes()",
    "`readState` and `onCommitted` are closures `replace` builds",
  ],
  [
    "api/helpers.ts › throwIfReentrantTreeMutation()",
    "its predicates read core's own state",
  ],
  [
    "channels/defaults.ts › assertRouteDefaultChannels()",
    "its lookup is the route table's",
  ],
  [
    "channels/guard.ts › assertChannelCorrect()",
    "its source is the route table's",
  ],
  [
    "channels/modeGate.ts › admittedSearch()",
    "its reporter is a closure of core's",
  ],
  [
    "engine/path-matcher/encoding.ts",
    "the encoders `urlParamsEncoding` selects by name",
  ],
  [
    "engine/path-matcher/SegmentMatcher.ts › SegmentMatcher",
    "the decoder the matcher selects",
  ],
  [
    "engine/path-matcher/types.ts",
    "the matcher's codecs and query functions, core's own",
  ],
  [
    "engine/search-params/strategies",
    "the query-format strategies core selects by name",
  ],
  ["guards.ts › ingestDependencies()", "its installer is a closure of core's"],
  [
    "internals.ts › RouterInternals",
    "the members core implements; a run-time stub is out of reach (header)",
  ],
  ["internals.ts › createInterceptable()", "the method a seam wraps is core's"],
  [
    "internals.ts › createTernaryInterceptable()",
    "the method a seam wraps is core's",
  ],
  ["internals.ts › executeInterceptorChain().chain", "the chain's own step"],
  [
    "internals.ts › executeInterceptorChain().sanitiseNext",
    "the chain's own step",
  ],
  ["internals.ts › throwIfDisposed()", "its predicate reads core's own state"],
  [`${EBN} › bridgeSignal()`, "the bridge's own closures"],
  [
    `${EBN} › EventBusNamespace.#getValidator`,
    "the accessor `wireNamespaces` installs",
  ],
  [
    "namespaces/NavigationNamespace/transition/errorHandling.ts › resolveAsyncGuard().warnNonBooleanGuard",
    "the report a dependency bag carries, a closure `wireNamespaces` fills",
  ],
  [
    "namespaces/NavigationNamespace/transition/guardPhase.ts › runStep().emitLeaveApprove",
    "the pipeline's own step",
  ],
  [
    "namespaces/NavigationNamespace/transition/guardPhase.ts › runStep().isLive",
    "the pipeline's own liveness read",
  ],
  [
    "namespaces/NavigationNamespace/transition/guardPhase.ts › runStep().warnNonBooleanGuard",
    "the report a dependency bag carries, a closure `wireNamespaces` fills",
  ],
  [
    "namespaces/NavigationNamespace/types.ts › NavigationDependencies",
    "a dependency bag `wireNamespaces` fills",
  ],
  [
    "namespaces/PluginsNamespace/types.ts › PluginsDependencies",
    "a dependency bag `wireNamespaces` fills",
  ],
  [
    "namespaces/RouteLifecycleNamespace/types.ts › RouteLifecycleDependencies",
    "a dependency bag `wireNamespaces` fills",
  ],
  [
    "namespaces/RouterLifecycleNamespace/types.ts › RouterLifecycleDependencies",
    "a dependency bag `wireNamespaces` fills",
  ],
  [
    "namespaces/RoutesNamespace/types.ts › RoutesDependencies",
    "a dependency bag `wireNamespaces` fills",
  ],
  [
    "namespaces/StateNamespace/types.ts › StateNamespaceDependencies",
    "a dependency bag `wireNamespaces` fills",
  ],
  [
    "namespaces/RoutesNamespace/helpers.ts › clearConfigEntries()",
    "its matcher is the route table's",
  ],
  [`${RS} › compilePendingGuards()`, "its compiler is core's"],
  [`${RS} › walkRouteNames()`, "its visitor is a closure of core's"],
  [
    "namespaces/RoutesNamespace/types.ts › RouteConfig",
    "core's wrappers around a route's codecs: the codec call is the place",
  ],
  [
    "pipeline/canonicalize.ts › diagnoseUndeclaredKeys()",
    "its reporter is a closure of core's",
  ],
  [
    "pipeline/port.ts › RouteResolver",
    "the pipeline's port, implemented by core",
  ],
  [
    "Router.ts › Router.#buildPathIntent",
    "a function core installs at construction",
  ],
  ["Router.ts › Router.#startChain", "the start seam core builds"],
  ["RouterError.ts › Raiser", "the raiser core hands out"],
  ["RouterError.ts › Tag", "the template tag core hands out"],
  ["RouterError.ts › raiser()", "the raiser's own builder"],
  ["routerFSM.ts › CancellabilityScope", "the scope's own closures"],
  ["transitionPath.ts › RouteMetaLookup", "the lookup core passes"],
  ["types/api.ts › LifecycleApi", "core's own surface, called by core"],
  ["types/base.ts › Unsubscribe", "an unsubscriber core minted"],
  [
    "types/router.ts › Router",
    "core's own router, called through its published type",
  ],
  [
    "utils/event-emitter/EventEmitter.ts › EventEmitter.#onListenerError",
    "a reporter core passes the emitter",
  ],
  [
    "utils/event-emitter/EventEmitter.ts › EventEmitter.#onListenerWarn",
    "a reporter core passes the emitter",
  ],
  ["utils/fsm/fsm.ts › FSM", "the machine's actions, from core's table"],
  [
    "utils/fsm/fsm.ts › NormEdge",
    "the machine's edge functions, from core's table",
  ],
  [
    "utils/fsm/types.ts › TransitionListener",
    "a listener core registers on the machine",
  ],
  [
    "wiring/wireNamespaces.ts › GetDependency",
    "the dependency reader core builds",
  ],
]);

/** Protocol calls whose receiver core built, by place key. */
const OWN_PROTOCOL = new Map([
  [
    "helpers.ts › adoptForeignSegments › then:call",
    "`Array.prototype.slice` called on a bag",
  ],
  [
    `${EBN} › settleLeavePromises › then:then`,
    "the promise `Promise.allSettled` returns",
  ],
  [
    "namespaces/NavigationNamespace/constants.ts › <module> › then:catch",
    "the cached rejections core builds",
  ],
  [`${NN} › #settle › then:catch`, "a navigation's own promise"],
  [
    "namespaces/NavigationNamespace/transition/executeNavigation.ts › finishAsyncNavigation › then:catch",
    "the guard walk's own promise",
  ],
  [
    "namespaces/NavigationNamespace/transition/executeNavigation.ts › finishAsyncNavigation › then:Promise.race",
    "the guard walk's promise against the abort's",
  ],
  [
    `${RLN} › #checkGuardSync › then:catch`,
    "the promise `Promise.resolve` returns",
  ],
  [
    "Router.ts › #asPromise › then:Promise.resolve",
    "a state or a promise of navigation's own",
  ],
  [
    `${LOGGER} › #invokeCallback › then:catch`,
    "the promise `Promise.resolve` returns",
  ],
  [
    "utils/event-emitter/EventEmitter.ts › #invokeIsolated › then:catch",
    "the promise core builds around a listener's thenable",
  ],
]);

/** Leaves the emitter dispatches: each is reached from an `emit` place. */
const DISPATCHED = [
  `${EBN} › subscribe › call:SubscribeFn`,
  `${EBN} › subscribeDiagnostic › call:${short(T_DIAGNOSTIC)}`,
  `${EBN} › subscribeTreeChanged › call:${short(T_TREE)}`,
  `utils/event-emitter/EventEmitter.ts › #callListener › call:${short(T_EMITTER)}`,
  "utils/event-emitter/EventEmitter.ts › #invokeIsolated › then:call",
];

/** The windows, by `file › owner [counter]`. */
const WINDOWS = new Map([
  ["api/getRoutesApi.ts › replaceRoutes [revalidating]", "revalidation"],
  [`${EBN} › awaitLeaveListeners [#dispatchDepth]`, "leave-listeners"],
  [`${EBN} › dispatchAbort [#dispatchDepth]`, "abort"],
  [`${EBN} › emitRouterStart [#dispatchDepth]`, "$start"],
  [`${EBN} › emitTransitionCancel [#dispatchDepth]`, "$$cancel"],
  [`${EBN} › emitTransitionError [#dispatchDepth]`, "$$error"],
  [`${EBN} › emitTransitionLeaveApprove [#dispatchDepth]`, "$$leaveApprove"],
  [`${EBN} › emitTransitionStart [#dispatchDepth]`, "$$start"],
  [`${EBN} › emitTransitionSuccess [#dispatchDepth]`, "$$success"],
  [`${EBN} › sendStopForDispose [#dispatchDepth]`, "dispose-stop"],
  [`${NN} › #navigate [#preparingDepth]`, "navigate-prep"],
  [`${NN} › #navigateToDefault [#preparingDepth]`, "default-prep"],
  [`${NN} › navigateToNotFound [#notFoundDepth]`, "not-found"],
  [`${LOGGER} › #invokeCallback [#inCallback]`, "logger"],
]);

const SUPERSESSION = "by-design:supersession";
const STOP_RESTART = "by-design:stop-restart";
const DISPOSED = "harmless:disposed";
const INHERITS = "inherits";
const BOOT_RESTART = "unsupported:boot-restart";
const VALIDATOR = "unsupported:third-party-validator";
const LOGGER_MEMBER = "unsupported:replaced-logger-member";

/**
 * The verdict of every place.
 * - `counted:<window>` — the code holds it, see the header.
 * - `inherits` — core runs it only inside a call the application made, and a
 *   navigation started there is one the application could start right before
 *   or after that call.
 * - `by-design:<id>` — a navigation started there is supported: `HELD_BY`.
 * - `harmless:<id>` — a navigation started there is refused by state: `HELD_BY`.
 * - `unsupported:<id>` — a navigation started there is out of contract:
 *   `UNSUPPORTED`.
 */
const PLACES = new Map([
  [`${EBN} › awaitLeaveListeners › call:LeaveFn`, "counted:leave-listeners"],
  [`${EBN} › emitDiagnostic › emit:key`, INHERITS],
  [`${EBN} › emitRouterStart › emit:events.ROUTER_START`, "counted:$start"],
  [`${EBN} › emitRouterStop › emit:events.ROUTER_STOP`, STOP_RESTART],
  [
    `${EBN} › emitTransitionCancel › emit:events.TRANSITION_CANCEL`,
    "counted:$$cancel",
  ],
  [
    `${EBN} › emitTransitionError › emit:events.TRANSITION_ERROR`,
    "counted:$$error",
  ],
  [
    `${EBN} › emitTransitionLeaveApprove › emit:events.TRANSITION_LEAVE_APPROVE`,
    "counted:$$leaveApprove",
  ],
  [
    `${EBN} › emitTransitionStart › emit:events.TRANSITION_START`,
    "counted:$$start",
  ],
  [
    `${EBN} › emitTransitionSuccess › emit:events.TRANSITION_SUCCESS`,
    "counted:$$success",
  ],
  [`${EBN} › emitTreeChanged › emit:TREE_CHANGED`, INHERITS],
  [`${EBN} › settleLeavePromises › then:Promise.allSettled`, SUPERSESSION],
  [
    `internals.ts › executeInterceptorChain › call:${short(T_INTERCEPTORS)}`,
    BOOT_RESTART,
  ],
  [`internals.ts › runChecks › call:${short(T_CHECKS)}`, INHERITS],
  [
    "namespaces/NavigationNamespace/transition/guardPhase.ts › adoptThenable › then:Reflect.apply",
    SUPERSESSION,
  ],
  [
    "namespaces/NavigationNamespace/transition/guardPhase.ts › runStep › call:GuardFn",
    SUPERSESSION,
  ],
  [
    "namespaces/OptionsNamespace/helpers.ts › resolveOption › call:DefaultParamsCallback | DefaultRouteCallback | DefaultSearchCallback",
    "counted:default-prep",
  ],
  [
    "namespaces/PluginsNamespace/PluginsNamespace.ts › #startPlugin › call:Plugin.teardown",
    DISPOSED,
  ],
  [`${RLN} › #checkGuardSync › call:GuardFn`, INHERITS],
  [`${RLN} › #checkGuardSync › then:Promise.resolve`, INHERITS],
  [
    "namespaces/RoutesNamespace/RoutesNamespace.ts › #resolveDynamicForward › call:ForwardToCallback",
    BOOT_RESTART,
  ],
  [`${RS} › commitScalarConfig › call:${short(T_DECODE)}`, BOOT_RESTART],
  [`${RS} › commitScalarConfig › call:${short(T_ENCODE)}`, BOOT_RESTART],
  [`${RS} › assertForwardToShape › call:${short(T_SOURCE)}`, INHERITS],
  [
    `${RS} › registerSingleRouteHandlers › call:Route.decodeParams`,
    BOOT_RESTART,
  ],
  [
    `${RS} › registerSingleRouteHandlers › call:Route.encodeParams`,
    BOOT_RESTART,
  ],
  ["Router.ts › #runStart › then:catch", BOOT_RESTART],
  ["Router.ts › start › then:catch", BOOT_RESTART],
  ["types/router.ts › RouterLogger › family", LOGGER_MEMBER],
  ["types/RouterValidator.ts › RouterValidator › family", VALIDATOR],
  [`${LOGGER} › #invokeCallback › call:LogCallback`, "counted:logger"],
  [`${LOGGER} › #invokeCallback › then:Promise.resolve`, "counted:logger"],
  [
    `wiring/wireNamespaces.ts › createCompileFactory › call:${short(T_FACTORY)}`,
    INHERITS,
  ],
]);

/** What makes each unsupported verdict out of contract. */
const UNSUPPORTED = new Map([
  [
    BOOT_RESTART,
    "a restart from a boot stage — the start interceptors, the thenable one returns, the boot's `matchPath` — needs a boot-liveness predicate core does not have (#2798)",
  ],
  [
    VALIDATOR,
    "a `RouterValidator` that navigates: the shipped one throws or logs, and its logging is counted at `logger`",
  ],
  [
    LOGGER_MEMBER,
    "a member replaced on `getInternals(router).logger` runs at every logging call: the slot is deliberately bare (#2303)",
  ],
]);

/** The cell that holds each by-design and harmless verdict, as `tests/<file> › <title>`. */
const HELD_BY = new Map([
  [
    SUPERSESSION,
    "functional/navigation/pre-start-window-1610.test.ts › still allows the guard-redirect — a guard runs after the announce, not before it",
  ],
  [
    STOP_RESTART,
    "functional/navigation/reentrant-doors-2786.test.ts › control: a $stop listener of a top-level stop() still restarts the router",
  ],
  [
    DISPOSED,
    "functional/routerLifecycle/dispose.test.ts › a teardown dispose() runs can neither navigate nor restart the router",
  ],
]);

/**
 * CONTROL: the leaf of every place of the B1 census (#2786, README §4), by its
 * row ids. N12, N14, N15 and the abort half of S1 are aborts, which
 * `abort-dispatch-authority-2778.test.ts` holds.
 */
const B1_ROWS: readonly [string, string][] = [
  ["N5", "namespaces/OptionsNamespace/helpers.ts › resolveOption"],
  ["N6 N17 S5 F1 F3 R2", `${LOGGER} › #invokeCallback`],
  ["N7", `${EBN} › emitTransitionStart`],
  ["N8", "namespaces/NavigationNamespace/transition/guardPhase.ts › runStep"],
  ["N9", `${EBN} › emitTransitionLeaveApprove`],
  ["N10", `${EBN} › awaitLeaveListeners`],
  ["N11 R9", `${EBN} › emitTransitionSuccess`],
  ["N13 S1", `${EBN} › emitTransitionCancel`],
  ["N13 N16 F4", `${EBN} › emitTransitionError`],
  ["N1 B2 B4 B9 R7", "internals.ts › executeInterceptorChain"],
  [
    "N2 B5 B9 R7",
    "namespaces/RoutesNamespace/RoutesNamespace.ts › #resolveDynamicForward",
  ],
  ["N3 B3 B6 B9 R7", `${RS} › registerSingleRouteHandlers`],
  ["N3 B3 B6 B9 R7", `${RS} › commitScalarConfig`],
  ["N4 B1 B7 B9 R3 R5 R7", "types/RouterValidator.ts › RouterValidator"],
  ["B8", `${EBN} › emitRouterStart`],
  ["S2 S3 S4", `${EBN} › emitRouterStop`],
  ["S6", "namespaces/PluginsNamespace/PluginsNamespace.ts › #startPlugin"],
  ["F2 R8", `${RLN} › #checkGuardSync`],
  ["R1", "internals.ts › runChecks"],
  ["R4", "wiring/wireNamespaces.ts › createCompileFactory"],
  ["R6", `${EBN} › emitTreeChanged`],
];

const LAYOUT: Layout = {
  root: SRC,
  entries: exportEntries(),
  surfaces: SURFACES,
  families: FAMILIES,
  transports: new Set(TRANSPORTS.keys()),
  hops: new Set(HOPS.keys()),
  ban: "Router.ts › Router.#assertNotReentrant()",
  emitter: "utils/event-emitter/EventEmitter.ts › EventEmitter",
};

// ---------------------------------------------------------------------------
// The census of core
// ---------------------------------------------------------------------------

describe("the census of core's calls into the application's code (#2786)", () => {
  const found = census(LAYOUT, trackedFiles(), new Set(OWN_PROTOCOL.keys()));
  const windowsOf = (id: string): Window[] =>
    found.windows.filter((window) => WINDOWS.get(window.key) === id);
  const titles = new Map(
    [...HELD_BY.values()].map((cell) => {
      const file = path.join(CORE, "tests", cell.split(" › ", 1)[0]);

      return [
        file,
        existsSync(file)
          ? cellTitlesOf(readFileSync(file, "utf8"), file.endsWith(".tsx"))
          : new Set<string>(),
      ];
    }),
  );

  it("the surfaces are what the export map hands back, and the rest takes no function", () => {
    const walker = new KindWalker(found.program.getTypeChecker(), LAYOUT);

    for (const [name, type] of found.kinds.returned) {
      if (!SURFACES.has(name)) {
        walker.walkOut(type, name);
      }
    }

    expect([...walker.kinds.keys()]).toStrictEqual([]);
    expect(
      [...SURFACES.keys()].filter((name) => !found.kinds.returned.has(name)),
    ).toStrictEqual([]);
  });

  it("the kinds derived from the published types are the ledger's", () => {
    expect([...found.kinds.kinds.keys()].toSorted(byText)).toStrictEqual(
      [...KINDS.keys()].toSorted(byText),
    );
  });

  it("a kind is called at a leaf of its own type, through a transport, or not at all", () => {
    const leaves = [...KINDS].filter(([, how]) => how === LEAF);
    const carried = [...KINDS].filter(([, how]) => TRANSPORTS.has(how));

    expect([...found.reached].toSorted(byText)).toStrictEqual(
      leaves.map(([kind]) => kind).toSorted(byText),
    );
    expect(
      carried.filter(([, transport]) => !found.transported.has(transport)),
    ).toStrictEqual([]);
    expect(
      [...KINDS.values()].filter(
        (how) => how !== LEAF && how !== UNCALLED && !TRANSPORTS.has(how),
      ),
    ).toStrictEqual([]);
  });

  it("every call resolves to core, to the application's code or to a hop", () => {
    expect([...found.unclassified].toSorted(byText)).toStrictEqual([]);
    expect(found.unresolved).toStrictEqual([]);
  });

  it("every transport, hop and own protocol call accounts for a call", () => {
    expect(
      [...TRANSPORTS.keys()].filter((site) => !found.transported.has(site)),
    ).toStrictEqual([]);
    expect(
      [...HOPS.keys()].filter((prefix) => !found.hopped.has(prefix)),
    ).toStrictEqual([]);
    expect(
      [...OWN_PROTOCOL.keys()].filter((key) => !found.ownProtocol.has(key)),
    ).toStrictEqual([]);
  });

  it("the places found are the ledger", () => {
    expect([...found.places.keys()].toSorted(byText)).toStrictEqual(
      [...PLACES.keys()].toSorted(byText),
    );
    expect([...found.dispatched].toSorted(byText)).toStrictEqual(
      DISPATCHED.toSorted(byText),
    );
  });

  it("the windows are the regions whose counters the ban reads", () => {
    expect(
      found.windows.map((window) => window.key).toSorted(byText),
    ).toStrictEqual([...WINDOWS.keys()].toSorted(byText));
    expect(
      [...found.counters].filter((counter) =>
        found.windows.every((window) => !window.key.endsWith(` [${counter}]`)),
      ),
    ).toStrictEqual([]);
  });

  it("a counted place stands in its window, or every path of its callers does", () => {
    const unheld = [...PLACES]
      .filter(([, verdict]) => verdict.startsWith("counted:"))
      .filter(([key, verdict]) => {
        const windows = windowsOf(verdict.slice("counted:".length));

        return (
          windows.length === 0 ||
          (found.places.get(key) ?? []).some(
            (call) => !heldBy(call, windows, found),
          )
        );
      })
      .map(([key]) => key);

    expect(unheld).toStrictEqual([]);
  });

  it("a place with any other verdict runs outside every window", () => {
    const stale = [...PLACES]
      .filter(([, verdict]) => !verdict.startsWith("counted:"))
      .filter(([key]) => {
        const calls = found.places.get(key) ?? [];

        return (
          calls.length > 0 &&
          calls.every((call) => heldBy(call, found.windows, found))
        );
      })
      .map(([key]) => key);

    expect(stale).toStrictEqual([]);
  });

  it("every verdict is in the vocabulary, and an exception names what holds it", () => {
    const verdicts = new Set(PLACES.values());
    const outside = [...verdicts].filter(
      (verdict) =>
        verdict !== INHERITS &&
        !HELD_BY.has(verdict) &&
        !UNSUPPORTED.has(verdict) &&
        !(
          verdict.startsWith("counted:") &&
          [...WINDOWS.values()].includes(verdict.slice("counted:".length))
        ),
    );
    const unheld = [...HELD_BY].filter(([, cell]) => {
      const [file, title] = cell.split(" › ", 2);

      return !(
        titles.get(path.join(CORE, "tests", file))?.has(title ?? "") ?? false
      );
    });

    expect(outside).toStrictEqual([]);
    expect(unheld).toStrictEqual([]);
    expect(
      [...HELD_BY.keys(), ...UNSUPPORTED.keys()].filter(
        (verdict) => !verdicts.has(verdict),
      ),
    ).toStrictEqual([]);
  });

  it("CONTROL — the leaf of every place of the B1 census is found", () => {
    const owners = new Set(
      [...found.places.keys()].map((key) =>
        key.slice(0, key.lastIndexOf(" › ")),
      ),
    );
    const missing = B1_ROWS.filter(([, owner]) => !owners.has(owner)).map(
      ([rows, owner]) => `${rows}: ${owner}`,
    );

    expect(missing).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fixtures: each spelling the census reads, on a synthetic source
// ---------------------------------------------------------------------------

describe("the census reads every spelling (#2786)", () => {
  const SYNTHETIC = path.join(SRC, "__census_synthetic__");

  const TYPES = `
    export type Listener = (value: number) => void;
    export type StringListener = (value: string) => void;
    export type Later = () => void;
    export type Hook = () => void;
    export type Made = () => void;
    export type Factory = () => Made;
    export type Tag = (parts: TemplateStringsArray) => string;
    export type Ctor = new () => object;
    export type Handler = (event: string) => void;
    export type Watcher = () => void;
    export interface Options {
      readonly onValue: Listener;
      readonly later: Later;
      readonly hooks: readonly Hook[];
      readonly make: Factory;
      readonly either: Listener | StringListener;
      readonly tag: Tag;
      readonly Thing: Ctor;
      readonly thenable: PromiseLike<number>;
    }
    export interface Checker { check(value: number): void }
    export interface Bag { log: (message: string) => void }
    export interface Api {
      register(handler: Handler): void;
      validator: Checker | null;
      readonly bag: Bag;
      readonly nested: { readonly subscribe: (cb: Watcher) => void };
    }
  `;
  const EMITTER = `
    export class Emitter {
      readonly #listeners: ((value: number) => void)[] = [];
      on(listener: (value: number) => void): void { this.#listeners.push(listener); }
      emit(value: number): void { for (const listener of this.#listeners) { listener(value); } }
    }
  `;
  const MACHINE = `
    import { Emitter } from "./emitter";
    import type { Options, Watcher } from "./types";
    interface Deps { readonly fire: () => void }
    export class Machine {
      #depth = 0;
      #busy = false;
      readonly #emitter = new Emitter();
      readonly #options: Options;
      readonly #deps: Deps = { fire: () => { this.#options.hooks[1]?.(); } };
      constructor(options: Options) { this.#options = options; }
      isDispatching(): boolean { return this.#depth > 0; }
      isBusy(): boolean { return this.#busy; }
      #assertNotReentrant(): void { if (this.isDispatching() || this.isBusy()) { throw new Error("reentrant"); } }
      go(): void { this.#assertNotReentrant(); }
      dispatch(): void {
        this.#depth++;
        try {
          this.#options.onValue(1);
          this.#emitter.emit(1);
          [1].forEach(() => { this.#options.later(); });
          this.#helper();
          this.#deps.fire();
        } finally {
          this.#depth--;
        }
      }
      #helper(): void { this.#options.hooks[0]?.(); }
      #shared(): void { this.#options.make()(); }
      busy(): void { this.#busy = true; try { this.#shared(); } finally { this.#busy = false; } }
      idle(): void { this.#shared(); }
      raisesOnly(): void { this.#depth++; try { this.#options.either(1 as never); } finally { void 0; } }
      lowersOnly(): void { try { void this.#options.tag\`x\`; } finally { this.#depth--; } }
      subscribe(): void { this.#emitter.on((value) => { this.#options.onValue(value); }); }
      build(): object { return new this.#options.Thing(); }
      settle(): void { void Promise.resolve(this.#options.thenable); }
      settleOwn(): void { void Promise.resolve(1).catch(() => undefined); }
      watch(cb: Watcher): void { cb(); }
      #run(step: () => void): void { step(); }
      run(): void { this.#run(() => undefined); }
    }
  `;
  const INDEX = `
    import { Machine } from "./machine";
    import type { Api, Options } from "./types";
    export { Machine } from "./machine";
    export function create(options: Options): Api {
      const machine = new Machine(options);
      const api: Api = {
        register(handler) { handler("ready"); },
        validator: null,
        bag: { log: () => undefined },
        nested: { subscribe: (cb) => { machine.watch(cb); } },
      };
      api.validator?.check(1);
      api.bag.log("created");
      return api;
    }
  `;
  const overrides = new Map(
    Object.entries({
      "types.ts": TYPES,
      "emitter.ts": EMITTER,
      "machine.ts": MACHINE,
      "index.ts": INDEX,
    }).map(([name, text]) => [path.join(SYNTHETIC, name), text]),
  );
  const layout: Layout = {
    root: SYNTHETIC,
    entries: ["index.ts"],
    surfaces: new Map([["Api", "types.ts"]]),
    families: ["types.ts › Checker"],
    transports: new Set(["emitter.ts › Emitter.#listeners"]),
    hops: new Set(["machine.ts › Deps", "machine.ts › Machine.#run()"]),
    ban: "machine.ts › Machine.#assertNotReentrant()",
    emitter: "emitter.ts › Emitter",
  };
  const found = census(
    layout,
    [...overrides.keys()],
    new Set([
      "machine.ts › settleOwn › then:Promise.resolve",
      "machine.ts › settleOwn › then:catch",
    ]),
    overrides,
  );
  const held = (key: string): boolean[] =>
    (found.places.get(key) ?? []).map((call) =>
      heldBy(call, found.windows, found),
    );

  it("a kind from a parameter, a method, a writable member, a factory's result, a container and a nested surface", () => {
    expect([...found.kinds.kinds.keys()].toSorted(byText)).toStrictEqual([
      "types.ts › Bag.log",
      "types.ts › Checker.*",
      "types.ts › Factory",
      "types.ts › Handler",
      "types.ts › Hook",
      "types.ts › Later",
      "types.ts › Listener",
      "types.ts › Made",
      "types.ts › StringListener",
      "types.ts › Tag",
      "types.ts › Watcher",
    ]);
  });

  it("a direct call, a call through a union, a tagged template and a family", () => {
    expect([...found.places.keys()].toSorted(byText)).toStrictEqual([
      "index.ts › create › call:Bag.log",
      "index.ts › register › call:Handler",
      "machine.ts › #helper › call:Hook",
      "machine.ts › #shared › call:Factory",
      "machine.ts › #shared › call:Made",
      "machine.ts › dispatch › call:Later",
      "machine.ts › dispatch › call:Listener",
      "machine.ts › dispatch › emit:1",
      "machine.ts › fire › call:Hook",
      "machine.ts › lowersOnly › call:Tag",
      "machine.ts › raisesOnly › call:Listener | StringListener",
      "machine.ts › settle › then:Promise.resolve",
      "machine.ts › watch › call:Watcher",
      "types.ts › Checker › family",
    ]);
  });

  it("the emitter dispatches its own transport and a closure handed to `on`", () => {
    expect([...found.dispatched].toSorted(byText)).toStrictEqual([
      "emitter.ts › emit › call:Emitter.#listeners",
      "machine.ts › subscribe › call:Listener",
    ]);
    expect([...found.transported.keys()]).toStrictEqual([
      "emitter.ts › Emitter.#listeners",
    ]);
  });

  it("a hop, an own protocol call, and a `new` of the application's constructor left unclassified", () => {
    expect([...found.hopped.keys()].toSorted(byText)).toStrictEqual([
      "machine.ts › Deps",
      "machine.ts › Machine.#run()",
    ]);
    expect([...found.ownProtocol].toSorted(byText)).toStrictEqual([
      "machine.ts › settleOwn › then:catch",
      "machine.ts › settleOwn › then:Promise.resolve",
    ]);
    expect([...found.unclassified]).toStrictEqual(["types.ts › Ctor"]);
    expect(found.unresolved).toStrictEqual([]);
  });

  it("a window needs a raise before the `try` and a lowering in its `finally`", () => {
    expect([...found.counters].toSorted(byText)).toStrictEqual([
      "#busy",
      "#depth",
    ]);
    expect(
      found.windows.map((window) => window.key).toSorted(byText),
    ).toStrictEqual([
      "machine.ts › busy [#busy]",
      "machine.ts › dispatch [#depth]",
    ]);
    expect(
      held("machine.ts › raisesOnly › call:Listener | StringListener"),
    ).toStrictEqual([false]);
    expect(held("machine.ts › lowersOnly › call:Tag")).toStrictEqual([false]);
  });

  it("a window holds its own lines and every-caller paths, not a function handed on or a second caller", () => {
    expect(held("machine.ts › dispatch › call:Listener")).toStrictEqual([true]);
    expect(held("machine.ts › dispatch › emit:1")).toStrictEqual([true]);
    expect(held("machine.ts › #helper › call:Hook")).toStrictEqual([true]);
    expect(held("machine.ts › fire › call:Hook")).toStrictEqual([true]);
    expect(held("machine.ts › dispatch › call:Later")).toStrictEqual([false]);
    expect(held("machine.ts › #shared › call:Made")).toStrictEqual([false]);
  });
});
