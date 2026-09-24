import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  raiserPartsAt,
  raiserTagOf,
} from "../../../../scripts/lib/raiser-head.mjs";

import type { RaiserParts } from "../../../../scripts/lib/raiser-head.mjs";

/**
 * A message names a door that can REACH it (#2457).
 *
 * Core's `message-prefix-authority-1845` asks whether a prefix is a name a caller
 * can look up. That is a question about SHAPE, and #2399 passed it: a check
 * reachable only from `update` printed `[router.addRoute]` for three releases,
 * which is an admissible name for the wrong door. This authority asks the other
 * question — can the door it names get here at all.
 *
 * ⚠ **Measured before this existed: flipping the door on four messages left this
 * package's suite fully green**, one of them a route-CRUD message the #2399
 * behavioural table was thought to cover. That table closes the refusals its own
 * cells drive — not a door family; its file owns how many those are.
 *
 * Three derivations feed it, none of them a list:
 *
 * 1. **`addCheck("<door>:<slot>", cb)`** — the position names its door, and the
 *    callback's transitive callees inherit it.
 * 2. **A `RouterValidator` member** — core consults it inside an implementation,
 *    and the door is that implementation resolved upward to what a caller types.
 * 3. **A door handed in** — a helper serving several doors takes `methodName` and
 *    interpolates it, so its head is right by construction, and what needs
 *    asserting is that it does not write one door in instead.
 */
const CORE_SRC = path.resolve(__dirname, "../../../core/src");
const PLUGIN_SRC = path.resolve(__dirname, "../../src");

/** The raiser-head fixture every reader of a raiser head answers for (#2537). */
const FIXTURE = path.resolve(
  __dirname,
  "../../../core/tests/fixtures/raiser-heads",
);

/**
 * ⚠ Named predicates, not inline `/…/.test(…)`: `vitest/no-conditional-tests`
 * reads a `.test(` call inside an `if` as the vitest global in a conditional and
 * reds the file — the lesson `repo-scan-authority-2241` records.
 */
const isDoorParam = (name: string): boolean =>
  /^(methodName|caller|method|door)$/u.test(name);
const isDoorString = (text: string): boolean => /^[a-z][A-Za-z]+$/u.test(text);
const isApiFactory = (name: string): boolean =>
  /^get[A-Z][A-Za-z]*Api$/u.test(name);
const isAddCheck = (text: string): boolean => text.endsWith("addCheck");

/** Heads that name a published export rather than a door, admissible as such. */
const PUBLISHED_NAME: ReadonlySet<string> = new Set([
  // `@real-router/core/api` exports it, and it takes no router receiver — so
  // `[router.cloneRouter]` would be the wrong shape rather than the right one.
  "cloneRouter",
  // This package's own name, for the sweep over an already-registered table
  // that no call reaches. Its README documents both the spelling and the
  // reason.
  // ⚠ Not all of `retrospective.ts`: `validateResolvedDefaultRoute` there IS
  // reached by a call, and it names a router door instead.
  "validation-plugin",
]);

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

/**
 * The head a binding's parts build, or `undefined` if it names no receiver.
 *
 * ⚠ A dynamic door is left UNCLOSED — `[router.` — so the regexes below miss it
 * exactly as they miss the literal `[router.${methodName}]`.
 */
function headOf(parts: RaiserParts | undefined): string | undefined {
  if (parts?.receiver === undefined) {
    return undefined;
  }

  if (parts.dynamic) {
    return `[${parts.receiver}.`;
  }

  return parts.door === undefined
    ? `[${parts.receiver}] `
    : `[${parts.receiver}.${parts.door}] `;
}

/** The literal text a node contributes as a message head. */
function headTextOf(node: ts.Node): string | undefined {
  // ⛑ The raiser builds the head from its binding, so the literal carries only
  // the BODY. Measured before this branch existed: the same unreachable door reds
  // this file in the literal form and passes in the raiser form, so converting the
  // package without it disarms the authority silently (#2487 step 7).
  const tag = raiserTagOf(node);

  if (tag !== undefined) {
    const head = headOf(raiserPartsAt(node, tag.base));

    if (head !== undefined) {
      const { template } = node as ts.TaggedTemplateExpression;

      return (
        head +
        (ts.isNoSubstitutionTemplateLiteral(template)
          ? template.text
          : template.head.text)
      );
    }
  }

  if (ts.isTemplateExpression(node)) {
    return node.head.text;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return undefined;
}

/** The called name of a call expression, however it is spelled. */
function calleeName(node: ts.CallExpression): string | undefined {
  const target = node.expression;

  if (ts.isIdentifier(target)) {
    return target.text;
  }

  if (ts.isPropertyAccessExpression(target)) {
    return target.name.text;
  }

  return undefined;
}

/**
 * ⚠ Only the LEFTMOST operand of a `+` chain is the head. Recorded per-operand,
 * the tail of a concatenated message reads as a head of its own and lands in the
 * wrong class — measured, two of them did.
 */
function isRightOfPlus(node: ts.Node): boolean {
  // ⚠ `parent` is typed non-optional and IS undefined at the root of a tree, so
  // the guard is load-bearing and the cast is what makes it visible to the type.
  const parent = node.parent as ts.Node | undefined;

  return (
    parent !== undefined &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    parent.right === node
  );
}

interface Declared {
  readonly name: string;
  readonly parameters: readonly ts.ParameterDeclaration[];
}

/**
 * A declaration that introduces a named function with a body.
 *
 * ⚠ Only the one with a body: an overloaded function declares its signatures
 * first, and a call resolved to a signature would reach none of its calls.
 */
function declaredFunction(node: ts.Node): Declared | undefined {
  const source = node.getSourceFile();

  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name !== undefined &&
    node.body !== undefined
  ) {
    return { name: node.name.getText(source), parameters: node.parameters };
  }

  // A variable, an object property or a class field holding a function.
  if (
    (ts.isVariableDeclaration(node) ||
      ts.isPropertyAssignment(node) ||
      ts.isPropertyDeclaration(node)) &&
    node.initializer !== undefined &&
    (ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer))
  ) {
    return {
      name: node.name.getText(source),
      parameters: node.initializer.parameters,
    };
  }

  return undefined;
}

/** The name of the nearest enclosing function-ish declaration. */
function ownerOf(node: ts.Node, source: ts.SourceFile): string | undefined {
  let parent = node.parent as ts.Node | undefined;

  while (parent !== undefined) {
    const declared = declaredFunction(parent);

    if (declared !== undefined) {
      return declared.name;
    }

    if (ts.isPropertyAssignment(parent)) {
      return parent.name.getText(source);
    }

    parent = parent.parent;
  }

  return undefined;
}

function add<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const bucket = map.get(key) ?? new Set<V>();

  bucket.add(value);
  map.set(key, bucket);
}

/**
 * The members `RouterValidator` declares, each as `namespace.member`.
 *
 * ⚠ Qualified, because a member name is not unique across namespaces:
 * `validateCountThresholds` belongs to three of them, and core consults each one
 * from its own doors (#2545).
 */
function contractMembers(): Set<string> {
  const source = parse(path.join(CORE_SRC, "types/RouterValidator.ts"));
  const members = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertySignature(node) &&
      node.type !== undefined &&
      ts.isTypeLiteralNode(node.type)
    ) {
      const namespace = node.name.getText(source);

      for (const member of node.type.members) {
        if (member.name !== undefined) {
          members.add(`${namespace}.${member.name.getText(source)}`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return members;
}

/** Doors that print nothing themselves: facade methods and api-object members. */
function silentDoors(node: ts.Node, into: Set<string>): void {
  if (ts.isClassDeclaration(node) && node.name?.text === "Router") {
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
        into.add(member.name.text);
      }
    }
  }

  const declared = declaredFunction(node);

  if (declared === undefined || !isApiFactory(declared.name)) {
    return;
  }

  const walk = (child: ts.Node): void => {
    if (ts.isObjectLiteralExpression(child)) {
      for (const property of child.properties) {
        if (property.name !== undefined && ts.isIdentifier(property.name)) {
          into.add(property.name.text);
        }
      }
    }

    ts.forEachChild(child, walk);
  };

  walk(node);
}

interface CoreFacts {
  /** `namespace.member` → the implementations that consult it. */
  readonly consulted: Map<string, Set<string>>;
  /** implementation → the door strings core itself hands down from it. */
  readonly passed: Map<string, Set<string>>;
  /** callee → its callers, for resolving an implementation upward. */
  readonly callers: Map<string, Set<string>>;
  /** Every name a caller can type as a door. */
  readonly vocabulary: Set<string>;
}

/**
 * `validator.<namespace>.<member>(…)` → `namespace.member`, in every spelling of
 * the receiver core uses: optional, a local, a getter's result.
 *
 * ⚠ The namespace is what makes a call a CONSULTATION. Read by the member name
 * alone, core's own `validateRouteName` in the route batch — a function sharing a
 * member's name, not the validator — counted as consulting it.
 */
function consultedMember(node: ts.CallExpression): string | undefined {
  const target = node.expression;

  if (
    !ts.isPropertyAccessExpression(target) ||
    !ts.isPropertyAccessExpression(target.expression)
  ) {
    return undefined;
  }

  return `${target.expression.name.text}.${target.name.text}`;
}

/** One consultation core makes, recorded three ways. */
function recordConsultation(
  node: ts.CallExpression,
  owner: string,
  contract: ReadonlySet<string>,
  facts: Pick<CoreFacts, "consulted" | "passed" | "callers">,
): void {
  const name = calleeName(node);

  if (name === undefined) {
    return;
  }

  if (name !== owner) {
    add(facts.callers, name, owner);
  }

  const member = consultedMember(node);

  if (member === undefined || !contract.has(member)) {
    return;
  }

  add(facts.consulted, member, owner);

  for (const argument of node.arguments) {
    const text = headTextOf(argument);

    if (text !== undefined && isDoorString(text)) {
      add(facts.passed, owner, text);
    }
  }
}

/**
 * ⚠ **The upward resolution must be intersected with the vocabulary.** Taken raw
 * it ran to 232 names for one function — a set that size admits anything, which is
 * how a gate reaches zero failures by getting wider rather than by getting right.
 * The vocabulary is itself derived, from four places a door legitimately appears:
 * a prefix core prints, a door string core hands a validator, a public method of
 * the facade, and a member of what a `get*Api` factory returns.
 */
function readCore(): CoreFacts {
  const contract = contractMembers();
  const facts = {
    consulted: new Map<string, Set<string>>(),
    passed: new Map<string, Set<string>>(),
    callers: new Map<string, Set<string>>(),
  };
  const vocabulary = new Set<string>();

  for (const file of globSync(`${CORE_SRC}/**/*.ts`)) {
    const source = parse(file);

    const visit = (node: ts.Node): void => {
      const owner = ownerOf(node, source);

      if (ts.isCallExpression(node) && owner !== undefined) {
        recordConsultation(node, owner, contract, facts);
      }

      const text = headTextOf(node);
      const printed =
        text === undefined ? null : /^\[router\.([A-Za-z]+)\]/u.exec(text);

      if (printed !== null) {
        vocabulary.add(printed[1]);
      }

      silentDoors(node, vocabulary);
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  for (const doors of facts.passed.values()) {
    for (const door of doors) {
      vocabulary.add(door);
    }
  }

  return { ...facts, vocabulary };
}

/** Core's facts, read once: every census judges against the same core. */
let coreFacts: CoreFacts | undefined;

const readCoreOnce = (): CoreFacts => (coreFacts ??= readCore());

interface Head {
  readonly file: string;
  readonly line: number;
  /** `undefined` when the door is interpolated rather than written in. */
  readonly prefix: string | undefined;
  /** The comments above the statement that raises it, if any. */
  readonly justification: string;
}

interface Fn {
  /** The declarations its calls reach. */
  readonly calls: Set<ts.Node>;
  readonly heads: Head[];
  takesDoor: boolean;
}

interface PluginGraph {
  /** A function's declaration → the function. */
  readonly fns: Map<ts.Node, Fn>;
  readonly checker: ts.TypeChecker;
  /** The tree's own files, in the order the glob lists them. */
  readonly files: readonly ts.SourceFile[];
  readonly root: string;
}

/**
 * ⚠ **A function is its DECLARATION, and the checker says which one a call
 * reaches (#2545).** Keyed by name — even with the file in the key — two
 * declarations sharing a name are one function whose calls are the union of both,
 * and each one's reachers then admit the other's door. A file declares a name
 * twice in more ways than a key anticipates: two object-literal methods, a
 * function and a method, two nested helpers. The checker binds a call as the
 * compiler does — lexical scope, an import through a barrel's re-export, a method
 * on the object or class that declares it — so no spelling of the collision is
 * left for a key to separate. It also keeps the wiring table's inline methods out
 * of lexical scope, where most share a name with the function they delegate to.
 *
 * Only a relative import resolves: a package import stays unresolved, so the
 * program never reads core's sources or a `dist` behind them.
 */
function programOf(root: string): ts.Program {
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noLib: true,
    target: ts.ScriptTarget.Latest,
    types: [],
  };
  const host = ts.createCompilerHost(options, /* setParentNodes */ true);

  host.resolveModuleNameLiterals = (literals, containingFile) =>
    literals.map((literal) =>
      literal.text.startsWith(".")
        ? ts.resolveModuleName(literal.text, containingFile, options, host)
        : { resolvedModule: undefined },
    );

  return ts.createProgram(globSync(`${root}/**/*.ts`), options, host);
}

/** The function a symbol names, past any import or re-export of it. */
function functionOf(
  found: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ts.Node | undefined {
  const symbol =
    found !== undefined && (found.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(found)
      : found;

  return symbol?.declarations?.find(
    (declaration) => declaredFunction(declaration) !== undefined,
  );
}

/** The declaration a call reaches, or `undefined` when the tree holds none. */
function declarationCalled(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
): ts.Node | undefined {
  return functionOf(checker.getSymbolAtLocation(node.expression), checker);
}

/** Every declaration a call anywhere inside `node` reaches. */
function calledFrom(node: ts.Node, checker: ts.TypeChecker): Set<ts.Node> {
  const reached = new Set<ts.Node>();

  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      const target = declarationCalled(child, checker);

      if (target !== undefined) {
        reached.add(target);
      }
    }

    ts.forEachChild(child, visit);
  };

  visit(node);

  return reached;
}

/** The nearest declaration around `node` that introduces a function. */
const enclosingFunction = (node: ts.Node): ts.Node | undefined =>
  ts.findAncestor(
    node.parent,
    (ancestor) => declaredFunction(ancestor) !== undefined,
  );

/**
 * The comments above the statement raising a message.
 *
 * ⚠ This is what makes a register entry's REASON checkable rather than merely
 * written. It catches the marker being REMOVED; it cannot catch the marker
 * outliving its truth, because nothing in this repository flags an unnecessary
 * `v8 ignore` — proving one unnecessary costs a coverage run per ignore. That
 * hole is named here rather than papered over.
 */
function leadingCommentsOf(node: ts.Node, source: ts.SourceFile): string {
  // ⚠ `ts.findAncestor` rather than a hand-rolled walk: `Node.parent` is typed
  // non-optional while being undefined at the root, so every hand-rolled form
  // either casts (and the cast reads as unnecessary) or compares (and the compare
  // reads as unnecessary). The library's own helper types the absence correctly.
  const statement = ts.findAncestor(node, ts.isStatement);

  if (statement === undefined) {
    return "";
  }

  const ranges =
    ts.getLeadingCommentRanges(source.text, statement.getFullStart()) ?? [];

  return ranges.map((r) => source.text.slice(r.pos, r.end)).join("\n");
}

/** One node's contribution to the graph: a declaration, a call, or a head. */
function absorb(
  node: ts.Node,
  source: ts.SourceFile,
  graph: PluginGraph,
  ensure: (fn: ts.Node) => Fn,
): void {
  const declared = declaredFunction(node);

  if (declared !== undefined) {
    const entry = ensure(node);

    if (
      declared.parameters.some(
        (p) => ts.isIdentifier(p.name) && isDoorParam(p.name.text),
      )
    ) {
      entry.takesDoor = true;
    }
  }

  // ⚠ Outside every function a node belongs to its FILE, which no root reaches,
  // so a door named there is refused as undetermined instead of dropped unjudged.
  const entry = ensure(enclosingFunction(node) ?? source);

  if (ts.isCallExpression(node)) {
    const target = declarationCalled(node, graph.checker);

    if (target !== undefined) {
      entry.calls.add(target);
    }
  }

  const text = isRightOfPlus(node) ? undefined : headTextOf(node);

  if (text?.startsWith("[") !== true) {
    return;
  }

  const closed = /^\[([^\]]+)\]/u.exec(text);

  entry.heads.push({
    file: path.relative(graph.root, source.fileName),
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    prefix: closed === null ? undefined : closed[1],
    justification: leadingCommentsOf(node, source),
  });
}

function readPlugin(root: string = PLUGIN_SRC): PluginGraph {
  const program = programOf(root);
  const graph: PluginGraph = {
    fns: new Map<ts.Node, Fn>(),
    checker: program.getTypeChecker(),
    files: program.getRootFileNames().map((file) => {
      const source = program.getSourceFile(file);

      // ⚠ Refused, not dropped: the glob also lists a directory or a dangling
      // link named `*.ts`, and a file the walk cannot read hides every head in it.
      if (source === undefined) {
        throw new Error(`The program did not load ${file}`);
      }

      return source;
    }),
    root,
  };
  const ensure = (fn: ts.Node): Fn => {
    const found = graph.fns.get(fn) ?? {
      calls: new Set<ts.Node>(),
      heads: [],
      takesDoor: false,
    };

    graph.fns.set(fn, found);

    return found;
  };

  for (const source of graph.files) {
    const visit = (node: ts.Node): void => {
      absorb(node, source, graph, ensure);
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return graph;
}

interface Root {
  readonly seed: ts.Node;
  readonly doors: Set<string>;
}

/**
 * The doors that can consult `member`, as a caller would name them.
 *
 * ⚠ **Core's call graph stays keyed by NAME, unlike this package's (#2545).** Core
 * reaches some of its doors through a dependency-injection interface the checker
 * cannot follow, and linking those calls by name is what finds the door behind
 * them. Measured, a checker-resolved graph that falls back to names where it
 * cannot resolve gives every member the same doors as this one, and without the
 * fallback a member loses a door behind the injection.
 */
function doorsForMember(
  core: CoreFacts,
  member: string,
): Set<string> | undefined {
  const impls = core.consulted.get(member);

  if (impls === undefined) {
    return undefined;
  }

  const doors = new Set<string>();
  const keep = (name: string): void => {
    if (core.vocabulary.has(name)) {
      doors.add(name);
    }
  };

  for (const impl of impls) {
    for (const door of core.passed.get(impl) ?? []) {
      keep(door);
    }

    // ⚠ **Resolution STOPS at a published name, and that is the whole design.**
    // The walk exists only to translate an internal implementation into the door
    // it implements — `#runStart` into `start`, `#startPlugin` → `use` into
    // `usePlugin`. Left to run past a published name it becomes an unbounded
    // closure: measured, that gave `validateBuildPathArgs` ELEVEN doors, because
    // `navigate`, `start` and `matchPath` all reach a path build eventually, and a
    // wrong door then passed. The question #2399 asks is which door the CALLER
    // typed, not what is transitively reachable.
    const queue = [impl];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.pop() ?? "";

      if (seen.has(current)) {
        continue;
      }

      seen.add(current);

      if (core.vocabulary.has(current)) {
        doors.add(current);

        continue;
      }

      for (const up of core.callers.get(current) ?? []) {
        queue.push(up);
      }
    }
  }

  return doors;
}

/** The name a wiring entry declares, in the three shapes the table uses. */
function wiringEntryName(node: ts.Node): string | undefined {
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  if (ts.isShorthandPropertyAssignment(node)) {
    return node.name.text;
  }

  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return undefined;
}

/**
 * The contract member a wiring entry implements, as `namespace.member`: the entry
 * sits in an object literal that is itself the value of a namespace.
 */
function wiringMemberName(node: ts.Node): string | undefined {
  const name = wiringEntryName(node);
  // ⚠ `parent` is typed non-optional and IS undefined at the root of a tree.
  const table = node.parent as ts.Node | undefined;
  const namespace = table?.parent;

  if (
    name === undefined ||
    namespace === undefined ||
    !ts.isPropertyAssignment(namespace) ||
    !ts.isIdentifier(namespace.name)
  ) {
    return undefined;
  }

  return `${namespace.name.text}.${name}`;
}

/** The function a wiring entry delegates to or, written inline, is. */
function wiringSeed(
  node: ts.Node,
  checker: ts.TypeChecker,
): ts.Node | undefined {
  if (ts.isShorthandPropertyAssignment(node)) {
    return functionOf(checker.getShorthandAssignmentValueSymbol(node), checker);
  }

  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.initializer)) {
    return functionOf(checker.getSymbolAtLocation(node.initializer), checker);
  }

  return declaredFunction(node) === undefined ? undefined : node;
}

/** Roots from the wiring table, whose three shapes all appear in it. */
function wiringRoots(core: CoreFacts, graph: PluginGraph): Root[] {
  const source = graph.files.find(
    (file) =>
      path.relative(graph.root, file.fileName) === "validationPlugin.ts",
  );

  // A tree without a wiring table takes its doors from positions alone.
  if (source === undefined) {
    return [];
  }

  const roots: Root[] = [];

  const visit = (node: ts.Node): void => {
    const member = wiringMemberName(node);
    const doors =
      member === undefined ? undefined : doorsForMember(core, member);

    if (doors !== undefined) {
      const seed = wiringSeed(node, graph.checker);

      if (seed !== undefined) {
        roots.push({ seed, doors });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return roots;
}

/** Roots from `addCheck("<door>:<slot>", cb)`. */
function positionRoots(graph: PluginGraph): Root[] {
  const roots: Root[] = [];

  for (const source of graph.files) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        isAddCheck(node.expression.getText(source))
      ) {
        // ⚠ Indexed access is typed as present and IS undefined for a call with
        // fewer arguments, so both casts are guards rather than noise.
        const position = node.arguments[0] as ts.Expression | undefined;
        const callback = node.arguments[1] as ts.Expression | undefined;
        const text = position === undefined ? undefined : headTextOf(position);

        if (text !== undefined && callback !== undefined) {
          const [door] = text.split(":", 1);

          for (const seed of calledFrom(callback, graph.checker)) {
            roots.push({ seed, doors: new Set([door]) });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return roots;
}

function closure(
  roots: readonly Root[],
  fns: ReadonlyMap<ts.Node, Fn>,
): Map<ts.Node, Set<string>> {
  const reach = new Map<ts.Node, Set<string>>();

  for (const { seed, doors } of roots) {
    const seen = new Set<ts.Node>();

    const visit = (current: ts.Node): void => {
      const fn = fns.get(current);

      if (seen.has(current) || fn === undefined) {
        return;
      }

      seen.add(current);

      for (const callee of fn.calls) {
        visit(callee);
      }
    };

    visit(seed);

    for (const fn of seen) {
      for (const door of doors) {
        add(reach, fn, door);
      }
    }
  }

  return reach;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly says: string;
  readonly reachers: string;
}

interface Census {
  readonly wrongDoor: Finding[];
  readonly noDoor: Finding[];
  readonly hardcodedShared: Finding[];
  readonly otherHeads: Map<string, number>;
  judged: number;
  interpolated: number;
}

function judge(
  head: Head,
  info: Fn,
  doors: Set<string> | undefined,
  out: Census,
): void {
  const at = (says: string): Finding => ({
    file: head.file,
    line: head.line,
    says,
    reachers: [...(doors ?? [])]
      .toSorted((a, b) => a.localeCompare(b))
      .join("|"),
  });

  if (head.prefix === undefined) {
    out.interpolated++;

    if (!info.takesDoor) {
      out.hardcodedShared.push(at("<interpolated>"));
    }

    return;
  }

  if (head.prefix === "router") {
    out.judged++;

    return;
  }

  const door = /^router\.([A-Za-z]+)$/u.exec(head.prefix);

  if (door === null) {
    out.otherHeads.set(head.prefix, (out.otherHeads.get(head.prefix) ?? 0) + 1);

    return;
  }

  out.judged++;

  if (doors === undefined || doors.size === 0) {
    out.noDoor.push(at(head.prefix));
  } else if (!doors.has(door[1])) {
    out.wrongDoor.push(at(head.prefix));
  }
}

function census(root: string = PLUGIN_SRC): Census {
  const core = readCoreOnce();
  const graph = readPlugin(root);
  const reach = closure(
    [...wiringRoots(core, graph), ...positionRoots(graph)],
    graph.fns,
  );
  const out: Census = {
    wrongDoor: [],
    noDoor: [],
    hardcodedShared: [],
    otherHeads: new Map(),
    judged: 0,
    interpolated: 0,
  };

  for (const [fn, info] of graph.fns) {
    for (const head of info.heads) {
      judge(head, info, reach.get(fn), out);
    }
  }

  return out;
}

const render = (findings: readonly Finding[]): string[] =>
  findings.map(
    (f) => `${f.file}:${f.line} says [${f.says}], reachers: ${f.reachers}`,
  );

describe("a message names a door that can reach it (#2457)", () => {
  it("no message names a door that cannot reach it", () => {
    expect(render(census().wrongDoor)).toStrictEqual([]);
  });

  it("every judged head has a door some derivation could determine", () => {
    // An undetermined door is not a pass: it means the walk lost the site, and a
    // lost site is where the next wrong door sits unseen.
    expect(render(census().noDoor)).toStrictEqual([]);
  });

  it("a helper that builds its door interpolates one it was handed", () => {
    // The #2399 shape at its most dangerous is a SHARED helper with one door
    // written into it. This fails if a head is built without a door to build from.
    expect(render(census().hardcodedShared)).toStrictEqual([]);
  });

  it("the heads naming neither the facade nor a door are registered", () => {
    const unregistered = [...census().otherHeads.keys()]
      .filter((head) => !PUBLISHED_NAME.has(head))
      .toSorted((a, b) => a.localeCompare(b));

    expect(unregistered).toStrictEqual([]);
  });

  it("CONTROL — every published name is still raised", () => {
    const seen = census().otherHeads;
    const stale = [...PUBLISHED_NAME].filter((head) => !seen.has(head));

    expect(stale).toStrictEqual([]);
  });

  it("CONTROL — the walks read both trees, so an empty result means clean", () => {
    // Floors, not counts: adding a door or a message must not make this a promise
    // to re-measure. Each sits far below what the trees hold.
    const core = readCoreOnce();
    const seen = census();

    expect(core.vocabulary.size).toBeGreaterThan(20);
    expect(core.consulted.size).toBeGreaterThan(25);
    // ⚠ Both count the PRE-raiser form, and step 7 of #2487 converts this package.
    // When they fall, the answer is not a lower number: a floor on a count the
    // design drives toward zero reds on the work succeeding, and lowering it by
    // reflex is how a ratchet stops ratcheting. Core's authority took the two
    // shapes that fix it — sum the count with the converted half where a
    // conversion MOVES a site, and move the anti-vacuum half to a control on a
    // purpose-built tree where a conversion EMPTIES it.
    expect(seen.judged).toBeGreaterThan(40);
    expect(seen.interpolated).toBeGreaterThan(20);
  });

  it("CONTROL — one name in separate files: the keys keep them apart", () => {
    // Keyed by NAME they merge, their reacher sets union, and BOTH heads pass.
    // This tree holds the two declarations apart across files; the next one
    // holds them apart inside one.
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-2457-dupe-"));

    try {
      writeFileSync(
        path.join(directory, "a.ts"),
        [
          'api.addCheck("updateRoute:entry", () => {',
          "  shared();",
          "});",
          "",
          "export function shared() {",
          '  throw new Error("[router.addRoute] only updateRoute reaches this one");',
          "}",
          "",
        ].join("\n"),
      );
      writeFileSync(
        path.join(directory, "b.ts"),
        [
          'api.addCheck("addRoute:batch", () => {',
          "  shared();",
          "});",
          "",
          "export function shared() {",
          '  throw new Error("[router.addRoute] and addRoute reaches this one");',
          "}",
          "",
        ].join("\n"),
      );

      const seen = census(directory);

      // Field by field, because a rendered `file:line` is what
      // `line-anchor-authority` holds the tree at zero of.
      expect(seen.wrongDoor).toStrictEqual([
        {
          file: "a.ts",
          line: 6,
          says: "router.addRoute",
          reachers: "updateRoute",
        },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — one name declared twice in one file: each declaration keeps its own doors (#2545)", () => {
    // Keyed by name, even with the file in the key, the two declarations of `run`
    // or `helper` are one function whose calls are the union of both, so `alpha`
    // inherits the door that reaches `beta` and its wrong door passes. Each file
    // below declares a name twice in a different form. An overload is the one
    // form whose declarations ARE one function: its call has to land on the
    // body, where the calls are.
    const heads = [
      "function alpha() {",
      '  throw new Error("[router.buildPath] only navigate reaches alpha");',
      "}",
      "",
      "function beta() {",
      '  throw new Error("[router.buildPath] and buildPath reaches beta");',
      "}",
      "",
    ];
    const forms: Record<string, readonly string[]> = {
      "object-literal-methods.ts": [
        "const first = { run() { alpha(); } };",
        "const second = { run() { beta(); } };",
        'api.addCheck("navigate:entry", () => { first.run(); });',
        'api.addCheck("buildPath:entry", () => { second.run(); });',
      ],
      "property-arrows.ts": [
        "const first = { run: () => { alpha(); } };",
        "const second = { run: () => { beta(); } };",
        'api.addCheck("navigate:entry", () => { first.run(); });',
        'api.addCheck("buildPath:entry", () => { second.run(); });',
      ],
      "class-methods.ts": [
        "class First { run() { alpha(); } }",
        "class Second { run() { beta(); } }",
        'api.addCheck("navigate:entry", () => { new First().run(); });',
        'api.addCheck("buildPath:entry", () => { new Second().run(); });',
      ],
      "nested-functions.ts": [
        "function outerA() { function helper() { alpha(); } helper(); }",
        "function outerB() { function helper() { beta(); } helper(); }",
        'api.addCheck("navigate:entry", () => { outerA(); });',
        'api.addCheck("buildPath:entry", () => { outerB(); });',
      ],
      "nested-arrows.ts": [
        "function outerA() { const helper = () => { alpha(); }; helper(); }",
        "function outerB() { const helper = () => { beta(); }; helper(); }",
        'api.addCheck("navigate:entry", () => { outerA(); });',
        'api.addCheck("buildPath:entry", () => { outerB(); });',
      ],
      "function-and-method.ts": [
        "function run() { alpha(); }",
        "const second = { run() { beta(); } };",
        'api.addCheck("navigate:entry", () => { run(); });',
        'api.addCheck("buildPath:entry", () => { second.run(); });',
      ],
      "class-fields.ts": [
        "class First { run = () => { alpha(); }; }",
        "class Second { run = () => { beta(); }; }",
        'api.addCheck("navigate:entry", () => { new First().run(); });',
        'api.addCheck("buildPath:entry", () => { new Second().run(); });',
      ],
      "overload.ts": [
        "function run(): void;",
        "function run() { alpha(); }",
        'api.addCheck("navigate:entry", () => { run(); });',
        'api.addCheck("buildPath:entry", () => { beta(); });',
      ],
    };
    const byFile = (findings: readonly Finding[]): Finding[] =>
      findings.toSorted((a, b) => a.file.localeCompare(b.file));
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-2457-twice-"));

    try {
      for (const [file, lines] of Object.entries(forms)) {
        // `export {}` makes each file a module, so no name is shared between two.
        writeFileSync(
          path.join(directory, file),
          ["export {};", ...lines, "", ...heads].join("\n"),
        );
      }

      // `alpha`'s throw follows the module marker, the form, a blank line and
      // `function alpha() {`.
      expect(byFile(census(directory).wrongDoor)).toStrictEqual(
        byFile(
          Object.entries(forms).map(([file, lines]) => ({
            file,
            line: lines.length + 4,
            says: "router.buildPath",
            reachers: "navigate",
          })),
        ),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — one member name in two namespaces: each keeps the doors that consult it (#2545)", () => {
    // `validateCountThresholds` is a member of `plugins`, `lifecycle` and
    // `eventBus`, and core consults each one from its own doors. Keyed by the bare
    // name, the consultations pool their doors, and a head wired only to the
    // plugins member passes with a door that only the event bus consults. The
    // event bus entry is an arrow: of the shapes `wiringSeed` reads, the one the
    // real table does not use.
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-2457-member-"));

    try {
      writeFileSync(
        path.join(directory, "validationPlugin.ts"),
        [
          "export function buildValidatorObject() {",
          "  return {",
          "    plugins: { validateCountThresholds: pluginThresholds },",
          "    eventBus: { validateCountThresholds: () => listenerThresholds() },",
          "  };",
          "}",
          "",
          "function pluginThresholds() {",
          '  throw new Error("[router.subscribe] only usePlugin consults this one");',
          "}",
          "",
          "function listenerThresholds() {",
          '  throw new Error("[router.subscribe] and subscribe consults this one");',
          "}",
          "",
        ].join("\n"),
      );

      const seen = census(directory);

      expect(seen.wrongDoor).toStrictEqual([
        {
          file: "validationPlugin.ts",
          line: 9,
          says: "router.subscribe",
          reachers: "usePlugin",
        },
      ]);
      expect(seen.noDoor).toStrictEqual([]);
      expect(seen.judged).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — the shared raiser fixture: each site reads its own binding (#2537)", () => {
    // ⚑ The fixture is SHARED: every reader of a raiser head answers for every
    // site in it, each in its own terms. Here a head is the text inside a CLOSED
    // bracket, so a dynamic door — rendered `[router.` and never closed — is
    // interpolated rather than read. `two-bindings.ts` is the row that matters:
    // a reader resolving a name file-wide gives both sites the second binding.
    // Keyed by FILE, so a file with no head still has to be answered for: a new
    // one reds this cell until its answer is written below.
    const heads = new Map<string, string[]>(
      globSync(`${FIXTURE}/**/*.ts`).map((file) => [
        path.relative(FIXTURE, file),
        [],
      ]),
    );
    const read = [...readPlugin(FIXTURE).fns.values()]
      .flatMap((fn) => fn.heads)
      .toSorted((left, right) => left.line - right.line);

    for (const head of read) {
      heads.get(head.file)?.push(head.prefix ?? "<interpolated>");
    }

    expect(Object.fromEntries(heads)).toStrictEqual({
      "bare-receiver.ts": ["router"],
      "binding-after-use.ts": ["router.matchPath"],
      "code-flavour.ts": ["router.navigateToState"],
      "dynamic-door.ts": ["<interpolated>"],
      "static-door.ts": ["router.buildPath"],
      "two-bindings.ts": ["router.Segment Matcher", "router.navigate"],
    });
  });

  it("CONTROL — both polarities, on a tree written for the purpose", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-2457-"));

    try {
      writeFileSync(
        path.join(directory, "checks.ts"),
        [
          'api.addCheck("updateRoute:entry", () => {',
          "  reachable();",
          "  wrongDoor();",
          '  hardcoded("route");',
          '  handed("updateRoute");',
          "});",
          "",
          "function reachable() {",
          '  throw new Error("[router.updateRoute] the position names this door");',
          "}",
          "",
          "function wrongDoor() {",
          '  throw new Error("[router.addRoute] no position here reaches addRoute");',
          "}",
          "",
          "function unreached() {",
          '  throw new Error("[router.updateRoute] no position reaches this one");',
          "}",
          "",
          "const outside = {",
          '  message: "[router.updateRoute] a head outside every function",',
          "};",
          "",
          "function hardcoded(name) {",
          "  throw new Error(`[router.${door}] builds a door nobody handed it`);",
          "}",
          "",
          "function handed(methodName) {",
          "  throw new Error(`[router.${methodName}] builds the door it was handed`);",
          "}",
          "",
        ].join("\n"),
      );

      const seen = census(directory);

      // ⚠ Asserted field by field rather than through `render`, because the
      // rendered form carries a `file:line` coordinate and `line-anchor-authority`
      // holds the tree at zero of those. Exempting this file would buy a blind
      // spot to save a line.
      expect(seen.wrongDoor).toStrictEqual([
        {
          file: "checks.ts",
          line: 13,
          says: "router.addRoute",
          reachers: "updateRoute",
        },
      ]);
      // A head no root reaches, inside a function or outside every one.
      expect(seen.noDoor.toSorted((a, b) => a.line - b.line)).toStrictEqual([
        {
          file: "checks.ts",
          line: 17,
          says: "router.updateRoute",
          reachers: "",
        },
        {
          file: "checks.ts",
          line: 21,
          says: "router.updateRoute",
          reachers: "",
        },
      ]);
      // A door interpolated with nothing handed in; `handed` takes its door.
      expect(seen.hardcodedShared).toStrictEqual([
        {
          file: "checks.ts",
          line: 25,
          says: "<interpolated>",
          reachers: "updateRoute",
        },
      ]);
      expect(seen.judged).toBe(4);
      expect(seen.interpolated).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — a file the glob lists and the program cannot load is refused (#2545)", () => {
    // The glob lists a directory named `*.ts` as readily as a file.
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-2457-unread-"));

    try {
      writeFileSync(path.join(directory, "checks.ts"), "export {};\n");
      mkdirSync(path.join(directory, "folder.ts"));

      expect(() => census(directory)).toThrow(/did not load .*folder\.ts/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
