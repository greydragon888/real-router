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

/**
 * The one head that names neither a door nor an export, kept with its reason.
 *
 * ⚑ One entry, where the issue expected two. "Both batch doors report `addRoute`"
 * needs none: the shared helper is reached from `addRoute:batch` and
 * `replaceRoutes:batch` alike, so `addRoute` is in its reacher set and the rule
 * admits it unaided. An exception that dissolves under the derivation is the
 * derivation working.
 */
const UNREACHABLE_BY_CONSTRUCTION: ReadonlyMap<string, string> = new Map([
  [
    "internal",
    "collectPathsToRoute's not-found throw, which its own `v8 ignore … unreachable` " +
      "marks as beyond caller input — the analogue of core's CORE_INTERNAL register",
  ],
]);

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

/** The literal text a node contributes as a message head. */
function headTextOf(node: ts.Node): string | undefined {
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

/** A declaration that introduces a named function. */
function declaredFunction(node: ts.Node): Declared | undefined {
  const source = node.getSourceFile();

  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name !== undefined
  ) {
    return { name: node.name.getText(source), parameters: node.parameters };
  }

  if (
    ts.isVariableDeclaration(node) &&
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

/** Every name called anywhere inside `node`. */
function calleesOf(node: ts.Node): Set<string> {
  const names = new Set<string>();

  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      const name = calleeName(child);

      if (name !== undefined) {
        names.add(name);
      }
    }

    ts.forEachChild(child, visit);
  };

  visit(node);

  return names;
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  const bucket = map.get(key) ?? new Set<string>();

  bucket.add(value);
  map.set(key, bucket);
}

/** The members `RouterValidator` declares. */
function contractMembers(): Set<string> {
  const source = parse(path.join(CORE_SRC, "types/RouterValidator.ts"));
  const members = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertySignature(node) &&
      node.type !== undefined &&
      ts.isTypeLiteralNode(node.type)
    ) {
      for (const member of node.type.members) {
        if (member.name !== undefined) {
          members.add(member.name.getText(source));
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
  /** validator member → the implementations that consult it. */
  readonly consulted: Map<string, Set<string>>;
  /** implementation → the door strings core itself hands down from it. */
  readonly passed: Map<string, Set<string>>;
  /** callee → its callers, for resolving an implementation upward. */
  readonly callers: Map<string, Set<string>>;
  /** Every name a caller can type as a door. */
  readonly vocabulary: Set<string>;
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

  if (!contract.has(name)) {
    return;
  }

  add(facts.consulted, name, owner);

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

interface Head {
  readonly file: string;
  readonly line: number;
  /** `undefined` when the door is interpolated rather than written in. */
  readonly prefix: string | undefined;
  /** The comments above the statement that raises it, if any. */
  readonly justification: string;
}

interface Fn {
  readonly calls: Set<string>;
  readonly heads: Head[];
  takesDoor: boolean;
}

interface PluginGraph {
  /** `<relative file>#<name>` → the function. */
  readonly fns: Map<string, Fn>;
  /** file → the names it can call, each resolved to the key that declares it. */
  readonly scopes: Map<string, Map<string, string>>;
  /** Calls whose callee no scope resolves — a dropped edge, floored below. */
  unresolved: number;
}

/**
 * ⚠ **Functions are keyed by FILE, not by name.** Measured on this package: three
 * a name can be declared in more than one file, and `assertNotAsync` is —
 * `retrospective.ts` gives it a `[validation-plugin]` head, `routes.ts` a
 * `[router.updateRoute]` one. Keyed by name they merge into a single entry whose
 * door set is the union of both, and a wrong door written into either can then be
 * admitted by the other's reachers. Measured, that union is empty on this tree
 * today and the merge is inert — so this is the assumption removed rather than a
 * defect fixed, and what it removes is an assumption nothing was holding.
 */
const keyOf = (relative: string, name: string): string => `${relative}#${name}`;

/** `./routes` or `../type-guards/validators/routes` → the file it names. */
function resolveSpecifier(
  fromFile: string,
  specifier: string,
  root: string,
): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const base = path.resolve(path.dirname(fromFile), specifier);

  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (globSync(candidate).length > 0) {
      return path.relative(root, candidate);
    }
  }

  return undefined;
}

/** Per file: every name its code can call, mapped to the key declaring it. */
function fileScopes(
  files: readonly string[],
  root: string,
): Map<string, Map<string, string>> {
  const scopes = new Map<string, Map<string, string>>();

  for (const file of files) {
    const source = parse(file);
    const relative = path.relative(root, file);
    const scope = new Map<string, string>();

    const visit = (node: ts.Node): void => {
      const declared = declaredFunction(node);

      // ⚠ A METHOD of an object literal is not a lexical binding, so it must not
      // enter the scope. The wiring table names an inline method exactly as the
      // imported function it delegates to — `validateListenerArgs(name, cb) {
      // validateListenerArgs<EventName>(…) }` — and letting the method win
      // overwrote the import and dropped the edge to the real implementation.
      // Measured: eight functions lost their door that way.
      if (declared !== undefined && !ts.isMethodDeclaration(node)) {
        scope.set(declared.name, keyOf(relative, declared.name));
      }

      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const target = resolveSpecifier(file, node.moduleSpecifier.text, root);
        const bindings = node.importClause?.namedBindings;

        if (
          target !== undefined &&
          bindings !== undefined &&
          ts.isNamedImports(bindings)
        ) {
          for (const element of bindings.elements) {
            const declaredName = (element.propertyName ?? element.name).text;

            scope.set(element.name.text, keyOf(target, declaredName));
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
    scopes.set(relative, scope);
  }

  return scopes;
}

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
  relative: string,
  graph: PluginGraph,
  ensure: (key: string) => Fn,
): void {
  const scope = graph.scopes.get(relative) ?? new Map<string, string>();
  const declared = declaredFunction(node);

  if (declared !== undefined) {
    const entry = ensure(keyOf(relative, declared.name));

    if (
      declared.parameters.some(
        (p) => ts.isIdentifier(p.name) && isDoorParam(p.name.text),
      )
    ) {
      entry.takesDoor = true;
    }
  }

  const owner = ownerOf(node, source);

  if (owner === undefined) {
    return;
  }

  const entry = ensure(keyOf(relative, owner));

  if (ts.isCallExpression(node)) {
    const name = calleeName(node);
    const target = name === undefined ? undefined : scope.get(name);

    if (target !== undefined) {
      entry.calls.add(target);
    } else if (name !== undefined) {
      // A method call, a global, or a name no import brought in: not an edge
      // between two functions of this package. Counted so the floor can see it.
      graph.unresolved++;
    }
  }

  const text = isRightOfPlus(node) ? undefined : headTextOf(node);

  if (text?.startsWith("[") !== true) {
    return;
  }

  const closed = /^\[([^\]]+)\]/u.exec(text);

  entry.heads.push({
    file: relative,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    prefix: closed === null ? undefined : closed[1],
    justification: leadingCommentsOf(node, source),
  });
}

function readPlugin(root: string = PLUGIN_SRC): PluginGraph {
  const files = globSync(`${root}/**/*.ts`);
  const graph: PluginGraph = {
    fns: new Map<string, Fn>(),
    scopes: fileScopes(files, root),
    unresolved: 0,
  };
  const ensure = (key: string): Fn => {
    const found = graph.fns.get(key) ?? {
      calls: new Set<string>(),
      heads: [],
      takesDoor: false,
    };

    graph.fns.set(key, found);

    return found;
  };

  for (const file of files) {
    const source = parse(file);
    const relative = path.relative(root, file);

    const visit = (node: ts.Node): void => {
      absorb(node, source, relative, graph, ensure);
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return graph;
}

interface Root {
  readonly seed: string;
  readonly doors: Set<string>;
}

/** The doors that can consult `member`, as a caller would name them. */
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

/**
 * The contract member a wiring entry implements, in any of the three shapes the
 * table uses: shorthand, an alias to another name, and an inline method.
 */
function wiringMemberName(node: ts.Node): string | undefined {
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

/** Roots from the wiring table, whose three shapes all appear in it. */
function wiringRoots(
  core: CoreFacts,
  root: string,
  graph: PluginGraph,
): Root[] {
  const file = path.join(root, "validationPlugin.ts");

  // A synthetic tree carries no wiring table; its doors come from positions alone.
  if (globSync(file).length === 0) {
    return [];
  }

  const source = parse(file);
  const relative = path.relative(root, file);
  const scope = graph.scopes.get(relative) ?? new Map<string, string>();
  const seedOf = (name: string): string =>
    scope.get(name) ?? keyOf(relative, name);
  const roots: Root[] = [];

  const visit = (node: ts.Node): void => {
    const member = wiringMemberName(node);
    const doors =
      member === undefined ? undefined : doorsForMember(core, member);

    // Both guards, not one: `doors` is computed FROM `member`, but only naming
    // `member` here narrows it for the branch that seeds a root with it.
    if (member !== undefined && doors !== undefined) {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.initializer)) {
        roots.push({ seed: seedOf(node.initializer.text), doors });
      } else if (ts.isShorthandPropertyAssignment(node)) {
        roots.push({ seed: seedOf(node.name.text), doors });
      } else if (ts.isMethodDeclaration(node)) {
        roots.push({ seed: keyOf(relative, member), doors });

        for (const seed of calleesOf(node)) {
          roots.push({ seed: seedOf(seed), doors });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return roots;
}

/** Roots from `addCheck("<door>:<slot>", cb)`. */
function positionRoots(root: string, graph: PluginGraph): Root[] {
  const roots: Root[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = parse(file);
    const relative = path.relative(root, file);
    const scope = graph.scopes.get(relative) ?? new Map<string, string>();
    const seedOf = (name: string): string =>
      scope.get(name) ?? keyOf(relative, name);

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

          for (const seed of calleesOf(callback)) {
            roots.push({ seed: seedOf(seed), doors: new Set([door]) });
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
  fns: ReadonlyMap<string, Fn>,
): Map<string, Set<string>> {
  const reach = new Map<string, Set<string>>();

  for (const { seed, doors } of roots) {
    const queue = [seed];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.pop() ?? "";
      const fn = fns.get(current);

      if (seen.has(current) || fn === undefined) {
        continue;
      }

      seen.add(current);

      for (const callee of fn.calls) {
        queue.push(callee);
      }
    }

    for (const name of seen) {
      for (const door of doors) {
        add(reach, name, door);
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
  const core = readCore();
  const graph = readPlugin(root);
  const reach = closure(
    [...wiringRoots(core, root, graph), ...positionRoots(root, graph)],
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

  for (const [name, info] of graph.fns) {
    for (const head of info.heads) {
      judge(head, info, reach.get(name), out);
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
      .filter(
        (head) =>
          !UNREACHABLE_BY_CONSTRUCTION.has(head) && !PUBLISHED_NAME.has(head),
      )
      .toSorted((a, b) => a.localeCompare(b));

    expect(unregistered).toStrictEqual([]);
  });

  it("a register entry's reason is present where it is claimed", () => {
    // `[internal]` is admissible only because its own site says the throw is
    // beyond caller input. Asserting the head alone would keep passing after that
    // justification was deleted, which is the moment the entry stops being true.
    const graph = readPlugin();
    const unjustified: string[] = [];

    for (const info of graph.fns.values()) {
      for (const head of info.heads) {
        if (
          head.prefix !== undefined &&
          UNREACHABLE_BY_CONSTRUCTION.has(head.prefix) &&
          !head.justification.includes("unreachable")
        ) {
          unjustified.push(`${head.file}:${head.line} [${head.prefix}]`);
        }
      }
    }

    expect(unjustified).toStrictEqual([]);
  });

  it("CONTROL — every register entry is still raised", () => {
    const seen = census().otherHeads;
    const stale = [
      ...UNREACHABLE_BY_CONSTRUCTION.keys(),
      ...PUBLISHED_NAME,
    ].filter((head) => !seen.has(head));

    expect(stale).toStrictEqual([]);
  });

  it("CONTROL — the walks read both trees, so an empty result means clean", () => {
    // Floors, not counts: adding a door or a message must not make this a promise
    // to re-measure. Each sits far below what the trees hold.
    const core = readCore();
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
    // This tree is what makes the file key load-bearing rather than merely tidier:
    // measured, the three real collisions in this package are inert today, so
    // nothing else here would notice the keys collapsing.
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

  it("CONTROL — both polarities, on a tree written for the purpose", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-2457-"));

    try {
      writeFileSync(
        path.join(directory, "checks.ts"),
        [
          'api.addCheck("updateRoute:entry", () => {',
          "  reachable();",
          "  wrongDoor();",
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
          line: 11,
          says: "router.addRoute",
          reachers: "updateRoute",
        },
      ]);
      expect(seen.noDoor).toStrictEqual([]);
      expect(seen.judged).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
