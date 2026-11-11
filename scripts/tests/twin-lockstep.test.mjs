// Deliberate-twin registry + lockstep enforcement (#1522).
//
// The type-guards dissolution (#1520) left deliberate COPIES of guard code in
// several packages — by design: each consumer owns its subset with no shared
// runtime dependency. That stance has two flavors, decided per pair (#1522):
//
//   LOCKSTEP     — the copies encode ONE contract and must stay code-identical
//                  (comments are free). Drift here is the #1224/#1225 class:
//                  two packages silently disagreeing about the same value shape.
//                  Enforced below: the TypeScript parser reads every top-level
//                  declaration of both sides, and each compared member must
//                  parse to the same code in both twins, comments and layout
//                  aside.
//   INDEPENDENT  — a namesake or behavioral mirror that legitimately evolves
//                  per consumer. Registered with a written reason so a future
//                  audit neither "fixes" the divergence nor mistakes the entry
//                  for an accidental copy. Enforced only for existence (a
//                  stale registry fails loudly).
//
// `scripts/scripts-tests.mjs` runs it in pre-push and Repo Lints — no wiring
// needed. Sonar/jscpd CPD-exclude these files (sonar-project.properties,
// .jscpd.json — see #1523); THIS test is the actual drift guard.
//
// Stdlib node:test/node:assert, and `typescript` for the parse — scripts/ is
// not a vitest workspace.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ─── Registry ────────────────────────────────────────────────────────────────

const LOCKSTEP = [
  {
    pair: "state-guard transitive closure",
    // The default homes of a member. A member one twin declares in another
    // file carries its own `left` or `right`: the plugin splits the closure
    // across several files, the shared copy keeps it in one.
    left: "packages/validation-plugin/src/type-guards/guards/params.ts",
    right: "shared/browser-env/state-guard.ts",
    members: [
      // ⚑ The captured intrinsics (#1971). They belong in the COMPARED set
      // rather than the exempt one, and the reason is mechanical: the functions
      // this registry keeps identical reference them by name, so a capture
      // that existed on one side only would either break the comparison or —
      // worse — leave one twin reading the live global while the other reads its
      // captured copy. Comparing them is what makes "identical bodies" mean
      // "identical behaviour".
      "getPrototypeOf",
      "objectValues",
      "hasOwn",
      "NativeDate",
      "dateGetTime",
      "isPlainContainer",
      "pushChildren",
      "isSerializableLeaf",
      "SubtreeExit",
      "visitContainer",
      "isSerializable",
      "isPrimitiveValue",
      "isParams",
      "isParamsUnsafe",
      {
        name: "isRouteName",
        left: "packages/validation-plugin/src/type-guards/guards/routes.ts",
      },
      {
        name: "isRequiredFields",
        left: "packages/validation-plugin/src/type-guards/internal/meta-fields.ts",
      },
      {
        name: "FULL_ROUTE_PATTERN",
        left: "packages/validation-plugin/src/type-guards/internal/router-error.ts",
      },
      {
        name: "MAX_ROUTE_NAME_LENGTH",
        left: "packages/validation-plugin/src/type-guards/internal/router-error.ts",
      },
    ],
    // Declarations only one side has. This list is the only way a declaration
    // escapes comparison, so each needs a written reason, and a name both sides
    // declare or import is refused here.
    exempt: {
      isOptionalBag:
        "Shared-only, and deliberately OUTSIDE `isRequiredFields` (#1838). It " +
        "screens `transition` and `context`, members `State` declares that a " +
        "restored history entry may omit and which the twin has no notion of: " +
        "validation-plugin validates a State the router built, not a " +
        "`history.state` payload. Inside `isRequiredFields` it would force a " +
        "matching edit on the other side of a pair this registry keeps " +
        "identical.",
      isStateStrict:
        "The subject of the twin, not a member of it: validation-plugin has no " +
        "isStateStrict — it composes its own state validation from the same " +
        "closure through a different surface. Nothing to compare against.",
      RestorableEntry:
        "Shared-only: the type `isStateStrict` narrows a `history.state` entry " +
        "to. validation-plugin validates a State the router built and declares " +
        "no such type.",
      HAS_NON_WHITESPACE:
        "validation-plugin only: `validateRouteName` reads it to refuse a " +
        "whitespace-only name with a message of its own. `isRouteName`, the " +
        "member both twins share, refuses one through `FULL_ROUTE_PATTERN`.",
      createRouterError:
        "validation-plugin only: its validators throw the `TypeError` it " +
        "builds. The shared guard answers with a boolean and builds no error.",
    },
    // ONE contract, two consumers: validation-plugin vets user-supplied params,
    // state-guard vets history.state params on browser restore. If the
    // serializability rules move (e.g. a new allowed leaf type), BOTH must move
    // — a one-sided edit means restore accepts what validation rejects (or
    // vice versa). Both copies already carry the same #1052 getter-safe
    // hardening; keep it that way.
    onDrift:
      "These members are ONE contract distributed to two packages (#1520). " +
      "Apply the same code change to BOTH files (comments may differ freely), " +
      "or — if the contracts genuinely need to diverge — move the pair to the " +
      "INDEPENDENT registry with a written reason. See #1522.",
  },
];

const INDEPENDENT = [
  {
    path: "packages/persistent-params-plugin/src/is-primitive-value.ts",
    reason:
      "URL-value contract (string | finite number | boolean; REJECTS " +
      "null/undefined) — a NAMESAKE of the serializability pipeline's " +
      "isPrimitiveValue (which accepts null/undefined as serializable leaves), " +
      "not a twin. Diverged semantics are the point.",
  },
  {
    path: "packages/core/src/engine/validation/route-batch.ts",
    counterpart:
      "packages/validation-plugin/src/type-guards/utilities/type-description.ts",
    reason:
      "getTypeDescription: already diverged by consumer needs — the " +
      "validation-plugin copy adds an `array[N]` branch and cites #787 where " +
      "the engine copy cites #903. Error-MESSAGE helpers; divergence is benign " +
      "(each package's tests pin its own messages).",
  },
  {
    path: "packages/core/src/engine/path-matcher/encoding.ts",
    counterpart: "packages/core/src/engine/search-params/utils.ts",
    reason:
      "totalize vs safeEncode: a behavioral mirror (never-throw encoding of " +
      "lone surrogates), not a textual twin — different shapes (encoder-factory " +
      "wrapper vs direct function) in two zero-dependency engine layers that " +
      "copy rather than import by design (see engine CLAUDE.md).",
  },
];

// ─── Reader ──────────────────────────────────────────────────────────────────

const isJSDoc = (node) =>
  node.kind >= ts.SyntaxKind.FirstJSDocNode &&
  node.kind <= ts.SyntaxKind.LastJSDocNode;

/**
 * Whether `child`, the last child of `node`, is a separator prettier adds when
 * it breaks the construct over lines: the trailing comma of a list, or the
 * `;` / `,` closing a type member.
 */
const isTrailingSeparator = (node, child) =>
  (node.kind === ts.SyntaxKind.SyntaxList &&
    child.kind === ts.SyntaxKind.CommaToken) ||
  (ts.isTypeElement(node) &&
    (child.kind === ts.SyntaxKind.SemicolonToken ||
      child.kind === ts.SyntaxKind.CommaToken));

/**
 * Whether `child`, the first child of `node` under `parent`, is the `|`
 * prettier puts before the first member of a union it breaks.
 */
const isLeadingBar = (node, child, parent) =>
  node.kind === ts.SyntaxKind.SyntaxList &&
  ts.isUnionTypeNode(parent) &&
  child.kind === ts.SyntaxKind.BarToken;

/**
 * Whether `node` is a pair of parentheses whose meaning the tree holds without
 * them. prettier adds or drops such a pair with layout: around a `return` it
 * breaks, around the conditional body of an arrow. A pair around an optional
 * chain ends the chain, which neither the kinds nor the tokens show, so it
 * stays.
 */
const isParentheses = (node) =>
  ts.isParenthesizedTypeNode(node) ||
  (ts.isParenthesizedExpression(node) && !ts.isOptionalChain(node.expression));

/**
 * The code of `statement`, read off the parse tree: a node is its kind, its
 * children and a closing mark of its kind, a leaf is its text, each with its
 * line. Comments are trivia and JSDoc is skipped, so neither reaches
 * the code. Left out as well: the statement's `export` keyword, which the twins
 * differ in by design, and what changes with layout rather than with code —
 * a trailing separator, the leading `|` of a union, and parentheses, whose
 * meaning the nesting and the kinds keep.
 */
function tokensOf(statement, source) {
  const tokens = [];
  const lineOf = (position) =>
    source.getLineAndCharacterOfPosition(position).line + 1;

  const walk = (node, parent) => {
    if (isJSDoc(node)) return;
    if (node.kind === ts.SyntaxKind.ExportKeyword && node.parent === statement)
      return;
    if (isParentheses(node)) {
      walk(
        ts.isParenthesizedTypeNode(node) ? node.type : node.expression,
        node,
      );
      return;
    }

    const children = node.getChildren(source);

    if (children.length === 0) {
      const text = node.getText(source);
      if (text !== "")
        tokens.push({ text, line: lineOf(node.getStart(source)) });
      return;
    }

    const open = tokens.length;
    tokens.push({ text: `<${node.kind}`, line: lineOf(node.getStart(source)) });

    for (const [index, child] of children.entries()) {
      if (index === 0 && isLeadingBar(node, child, parent)) continue;
      if (index === children.length - 1 && isTrailingSeparator(node, child))
        continue;
      walk(child, node);
    }

    // A node with nothing inside leaves no trace: an `export` alone in a
    // modifier list is no list at all.
    if (tokens.length === open + 1) tokens.pop();
    else tokens.push({ text: `>${node.kind}`, line: lineOf(node.getEnd()) });
  };

  walk(statement, statement.parent);

  return tokens;
}

/** Every name a binding declares: `a`, `{ a, b: c, ...d }`, `[e, , [f]]`. */
const bindingNames = (name) =>
  ts.isIdentifier(name)
    ? [name.text]
    : name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
      );

/**
 * The names a top-level statement declares, `[]` for an import, `undefined` for
 * a statement the reader does not place.
 */
function namesOf(statement) {
  if (ts.isImportDeclaration(statement)) return [];
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
    return statement.name ? [statement.name.text] : undefined;
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  )
    return [statement.name.text];
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.flatMap((declaration) =>
      bindingNames(declaration.name),
    );
  return undefined;
}

/** The local names an import binds. */
function importedNames(statement) {
  const clause = statement.importClause;
  const names = clause?.name ? [clause.name.text] : [];
  const bindings = clause?.namedBindings;

  if (bindings && ts.isNamespaceImport(bindings))
    names.push(bindings.name.text);
  if (bindings && ts.isNamedImports(bindings))
    names.push(...bindings.elements.map((element) => element.name.text));

  return names;
}

/**
 * The top-level declarations of one TypeScript source.
 *
 * `declared` maps each name a function, `const`/`let`/`var` binding, class,
 * interface or type alias declares to the code `tokensOf` reads from every
 * statement that declares it, in source order. `imported` holds the names its
 * imports bind. A function or class without a name, and any other top-level
 * statement, goes to `unplaced` with its line, and the caller reports it.
 *
 * @param {string} file
 * @param {string} text
 */
function declarationsOf(file, text) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const lines = text.split("\n");
  const declared = new Map();
  const imported = new Set();
  const unplaced = [];

  for (const statement of source.statements) {
    const names = namesOf(statement);
    const { line } = source.getLineAndCharacterOfPosition(
      statement.getStart(source),
    );

    if (names === undefined) {
      unplaced.push({ line: line + 1, text: lines[line].trim() });
      continue;
    }
    if (ts.isImportDeclaration(statement)) {
      for (const name of importedNames(statement)) imported.add(name);
      continue;
    }

    const tokens = tokensOf(statement, source);

    for (const name of new Set(names)) {
      const code = declared.get(name) ?? { file, lines, tokens: [] };
      code.tokens.push(...tokens);
      declared.set(name, code);
    }
  }

  return { declared, imported, unplaced };
}

/** The index of the first token the two differ at, or -1. */
function firstDifference(a, b) {
  const shorter = Math.min(a.tokens.length, b.tokens.length);

  for (let i = 0; i < shorter; i++) {
    if (a.tokens[i].text !== b.tokens[i].text) return i;
  }

  return a.tokens.length === b.tokens.length ? -1 : shorter;
}

/** `file:line  source line` of the token at `index`, or of the last one. */
function where(code, index) {
  const { line } = code.tokens[index] ?? code.tokens.at(-1);

  return `${code.file}:${line}  ${code.lines[line - 1].trim()}`;
}

// ─── Lockstep enforcement ────────────────────────────────────────────────────

/** `"name"` or `{ name, left?, right? }` → `{ name, left, right }`. */
const resolveMember = (member, entry) =>
  typeof member === "string"
    ? { name: member, left: entry.left, right: entry.right }
    : {
        name: member.name,
        left: member.left ?? entry.left,
        right: member.right ?? entry.right,
      };

/** The files of each side of an entry: its default, then the members' own. */
function sidesOf(entry) {
  const members = entry.members.map((member) => resolveMember(member, entry));

  return {
    left: [...new Set([entry.left, ...members.map((m) => m.left)])],
    right: [...new Set([entry.right, ...members.map((m) => m.right)])],
  };
}

/**
 * Every finding of one LOCKSTEP entry over `sources` (path → text). A finding
 * carries its `kind`, the member `name`, the `file` and `line` where they
 * apply, and the `message` the cell prints:
 *
 *   unread       a file of the pair is not among the sources
 *   unplaceable  a top-level statement the reader does not place
 *   missing      a compared member is not declared in its file
 *   drift        a compared member's code differs between the twins
 *   uncovered    a declaration the registry neither compares nor exempts
 *   twin         an exempt name both sides declare or import
 *   stale        an exempt name no file of the pair declares
 *   reason       an exemption without a written reason
 */
function lockstepFindings(entry, sources) {
  const findings = [];
  const members = entry.members.map((member) => resolveMember(member, entry));
  const exempt = entry.exempt ?? {};
  const sides = sidesOf(entry);
  const read = new Map();

  for (const file of new Set([...sides.left, ...sides.right])) {
    const text = sources.get(file);

    if (text === undefined) {
      findings.push({
        kind: "unread",
        file,
        message: `${file}, a file of the pair, is not in the tree — follow the move in the registry`,
      });
      continue;
    }

    const declarations = declarationsOf(file, text);
    read.set(file, declarations);

    for (const { line, text: first } of declarations.unplaced) {
      findings.push({
        kind: "unplaceable",
        file,
        line,
        message:
          `${file}:${line}: \`${first}\` — the reader places no top-level statement of this form. ` +
          "Write it as a declaration the reader compares (function, const/let, class, interface, type), " +
          "or teach the reader to compare the form.",
      });
    }
  }

  for (const member of members) {
    const { name, left, right } = member;
    const code = {
      left: read.get(left)?.declared.get(name),
      right: read.get(right)?.declared.get(name),
    };

    for (const side of ["left", "right"]) {
      const file = member[side];
      if (!read.has(file) || code[side]) continue;

      const other = side === "left" ? right : left;

      findings.push({
        kind: "missing",
        name,
        file,
        message: code[side === "left" ? "right" : "left"]
          ? `${file} does not declare ${name}, and ${other} does. Follow a rename or a move in \`members\` ` +
            `(a member declared outside the default file takes its own \`${side}\`), or make the same change in both twins.`
          : `neither ${left} nor ${right} declares ${name}: drop it from \`members\`, or follow its new name there.`,
      });
    }

    if (code.left && code.right) {
      const at = firstDifference(code.left, code.right);

      if (at >= 0) {
        findings.push({
          kind: "drift",
          name,
          message:
            `${name} differs between the twins, comments and layout aside:\n` +
            `  ${where(code.left, at)}\n  ${where(code.right, at)}\n${entry.onDrift}`,
        });
      }
    }
  }

  for (const side of ["left", "right"]) {
    for (const file of sides[side]) {
      for (const name of read.get(file)?.declared.keys() ?? []) {
        if (Object.hasOwn(exempt, name)) continue;
        if (members.some((m) => m.name === name && m[side] === file)) continue;

        findings.push({
          kind: "uncovered",
          name,
          file,
          message:
            `${file} declares ${name}, and the registry neither compares nor exempts it. ` +
            "A member both twins declare goes to `members`" +
            (file === entry[side] ? "" : ` with \`${side}: "${file}"\``) +
            "; a declaration only one side has goes to `exempt`, with its reason.",
        });
      }
    }
  }

  /** The files of `side` that declare or import `name`. */
  const holders = (side, name) =>
    sides[side].filter(
      (file) =>
        read.get(file)?.declared.has(name) ||
        read.get(file)?.imported.has(name),
    );

  // With a file of the pair unread, no exemption can be called stale.
  const complete = [...sides.left, ...sides.right].every((file) =>
    read.has(file),
  );

  for (const [name, reason] of Object.entries(exempt)) {
    const declared = [...sides.left, ...sides.right].some((file) =>
      read.get(file)?.declared.has(name),
    );
    const left = holders("left", name);
    const right = holders("right", name);

    if (!declared && complete) {
      findings.push({
        kind: "stale",
        name,
        message: `${name} is exempt, and no file of the pair declares it — drop it from \`exempt\``,
      });
    } else if (left.length > 0 && right.length > 0) {
      findings.push({
        kind: "twin",
        name,
        message:
          `${name} is exempt, but both twins have it (${[...left, ...right].join(", ")}): ` +
          "a member both twins have is compared — move it to `members`, " +
          "with its own `left` or `right` where a twin declares it outside the default file.",
      });
    }

    if (reason.length < 40) {
      findings.push({
        kind: "reason",
        name,
        message: `exemption ${name} needs a written reason — it is the only way a declaration escapes comparison`,
      });
    }
  }

  return findings;
}

/** The text of every file a LOCKSTEP entry names, read once, at collection. */
const TREE = new Map(
  LOCKSTEP.flatMap((entry) => Object.values(sidesOf(entry)).flat())
    .filter((path) => existsSync(join(ROOT, path)))
    .map((path) => [path, readFileSync(join(ROOT, path), "utf8")]),
);

const COMPARISON = new Set(["unread", "missing", "drift"]);

for (const entry of LOCKSTEP) {
  test(`lockstep: ${entry.pair} — every compared member is identical in both twins`, () => {
    const found = lockstepFindings(entry, TREE).filter((f) =>
      COMPARISON.has(f.kind),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      [],
    );
  });

  test(`lockstep coverage: ${entry.pair} — every declaration of both sides is compared or exempt`, () => {
    const found = lockstepFindings(entry, TREE).filter(
      (f) => !COMPARISON.has(f.kind),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      [],
    );
  });
}

// ─── The reader against the shapes of the closure (#2940) ────────────────────
//
// A miniature of the pair, in memory: a default left-hand file, a second
// left-hand file for members with their own `left`, and the right-hand file.
// Their compared members differ only in comments and in `export`.

const F = {
  params: "fixture/validation/params.ts",
  routes: "fixture/validation/routes.ts",
  guard: "fixture/browser-env/state-guard.ts",
};

const FIXTURE = new Map([
  [
    F.params,
    `// fixture: the validation twin, default left-hand file

import type { Params } from "@real-router/core";

/** Captured at module load. */
const hasOwn = Object.hasOwn;

/**
 * Marker pushed after a container's children.
 *
 * @internal
 */
class SubtreeExit {
  constructor(readonly container: object) {}
}

/**
 * Inspects one container popped from the work-stack.
 *
 * @internal
 */
function visitContainer(
  value: object,
  stack: unknown[],
  onPath: WeakSet<object>,
  done: WeakSet<object>,
): boolean {
  if (onPath.has(value)) {
    return false; // back-edge → genuine circular reference
  }

  if (done.has(value)) {
    return true; // shared reference — subtree already validated
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false; // instance of a class
  }

  onPath.add(value);
  stack.push(new SubtreeExit(value));

  for (const key in value) {
    if (hasOwn(value, key)) {
      stack.push((value as Record<string, unknown>)[key]);
    }
  }

  return true;
}

/**
 * Type guard for a Params object.
 */
export function isParams(value: unknown): value is Params {
  const stack: unknown[] = [value];
  const onPath = new WeakSet<object>();
  const done = new WeakSet<object>();

  while (stack.length > 0) {
    const item = stack.pop();

    // Subtree fully processed: leave the current path.
    if (item instanceof SubtreeExit) {
      onPath.delete(item.container);
      done.add(item.container);

      continue;
    }

    if (typeof item !== "object" || item === null) {
      continue;
    }

    if (!visitContainer(item, stack, onPath, done)) {
      return false;
    }
  }

  return true;
}
`,
  ],
  [
    F.routes,
    `// fixture: the validation twin, a second left-hand file

/** Maximum route name length. */
export const MAX_ROUTE_NAME_LENGTH = 10_000;

/** Type guard for a route name. */
export function isRouteName(name: unknown): name is string {
  return typeof name === "string" && name.length <= MAX_ROUTE_NAME_LENGTH;
}

/** The validation twin's own error builder; the shared twin has none. */
export function createRouterError(message: string): TypeError {
  return new TypeError("[router] " + message);
}
`,
  ],
  [
    F.guard,
    `// fixture: the shared twin, right-hand file

import type { Params } from "@real-router/core";

/** Captures, twin of the validation file. */
const hasOwn = Object.hasOwn;

/** Maximum route name length (twin). */
const MAX_ROUTE_NAME_LENGTH = 10_000;

/** Route-name guard (twin). */
function isRouteName(name: unknown): name is string {
  return typeof name === "string" && name.length <= MAX_ROUTE_NAME_LENGTH;
}

/** Marker (twin). */
class SubtreeExit {
  constructor(readonly container: object) {}
}

/** One container popped from the work-stack (twin). */
function visitContainer(
  value: object,
  stack: unknown[],
  onPath: WeakSet<object>,
  done: WeakSet<object>,
): boolean {
  if (onPath.has(value)) {
    return false; // back-edge
  }

  if (done.has(value)) {
    return true; // shared reference
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false; // instance of a class
  }

  onPath.add(value);
  stack.push(new SubtreeExit(value));

  for (const key in value) {
    if (hasOwn(value, key)) {
      stack.push((value as Record<string, unknown>)[key]);
    }
  }

  return true;
}

/** Params guard (twin). */
function isParams(value: unknown): value is Params {
  const stack: unknown[] = [value];
  const onPath = new WeakSet<object>();
  const done = new WeakSet<object>();

  while (stack.length > 0) {
    const item = stack.pop();

    if (item instanceof SubtreeExit) {
      onPath.delete(item.container);
      done.add(item.container);

      continue;
    }

    if (typeof item !== "object" || item === null) {
      continue;
    }

    if (!visitContainer(item, stack, onPath, done)) {
      return false;
    }
  }

  return true;
}

/** What a restorable history entry carries. */
export interface RestorableEntry {
  readonly name: string;
  readonly params: Params;
}

/** A member a restored entry may omit. */
function isOptionalBag(value: unknown): boolean {
  return value === undefined || (typeof value === "object" && value !== null);
}

/** The subject of the twin. */
export function isStateStrict(value: unknown): value is RestorableEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return (
    isRouteName(entry.name) &&
    isParams(entry.params) &&
    isOptionalBag(entry.context)
  );
}
`,
  ],
]);

const FIXTURE_ENTRY = {
  pair: "fixture closure",
  left: F.params,
  right: F.guard,
  members: [
    "hasOwn",
    "SubtreeExit",
    "visitContainer",
    "isParams",
    { name: "isRouteName", left: F.routes },
    { name: "MAX_ROUTE_NAME_LENGTH", left: F.routes },
  ],
  exempt: {
    isOptionalBag:
      "Right-only: the restorable-entry check the validation twin has no notion of.",
    isStateStrict:
      "Right-only: the subject of the twin, composed from the shared closure.",
    RestorableEntry:
      "Right-only: the type the subject of the twin narrows an entry to.",
    createRouterError:
      "Left-only: the validation twin's error builder; the shared twin raises none.",
  },
  onDrift: "(fixture)",
};

/** `text` with the ONE occurrence of `from` replaced (slice-based: no `$` patterns). */
function swap(text, from, to) {
  const at = text.indexOf(from);
  assert.ok(
    at >= 0 && text.indexOf(from, at + 1) < 0,
    `fixture edit: expected exactly one occurrence of ${JSON.stringify(from)}`,
  );
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** `sources` with each file's edits applied in order. */
const edited = (edits, sources = FIXTURE) =>
  new Map(
    [...sources].map(([path, text]) => [
      path,
      (edits[path] ?? []).reduce((acc, edit) => edit(acc), text),
    ]),
  );

const SIG =
  "function visitContainer(\n  value: object,\n  stack: unknown[],\n  onPath: WeakSet<object>,\n  done: WeakSet<object>,\n): boolean {";
const CALL = "visitContainer(item, stack, onPath, done)";
const END =
  "      stack.push((value as Record<string, unknown>)[key]);\n    }\n  }\n\n  return true;\n}";
const DRIFT_FROM = "return false; // instance of a class";

/** The same drift the probe of #2940 makes: the guard admits a class instance. */
const drift = (text) =>
  swap(text, DRIFT_FROM, "return true; // instance of a class");

/** S7: the walk state bundled into one destructured parameter. */
const destructuredParam = (text) =>
  swap(
    swap(
      swap(
        text,
        SIG,
        "function visitContainer(\n  value: object,\n  { stack, onPath, done }: WalkState,\n): boolean {",
      ),
      CALL,
      "visitContainer(item, { stack, onPath, done })",
    ),
    "\nclass SubtreeExit {",
    "\ninterface WalkState {\n  stack: unknown[];\n  onPath: WeakSet<object>;\n  done: WeakSet<object>;\n}\n\nclass SubtreeExit {",
  );

/** S6: the function written as an arrow const. */
const arrowConst = (text) =>
  swap(
    swap(
      text,
      SIG,
      "const visitContainer = (\n  value: object,\n  stack: unknown[],\n  onPath: WeakSet<object>,\n  done: WeakSet<object>,\n): boolean => {",
    ),
    END,
    `${END};`,
  );

/** S4: the capture written destructured. */
const destructuredCapture = (text) =>
  swap(text, "const hasOwn = Object.hasOwn;", "const { hasOwn } = Object;");

/** One twin reads the global at call time; the other keeps its capture. */
const liveHasOwn = (text) =>
  swap(
    text,
    "const { hasOwn } = Object;",
    "function hasOwn(o: object, key: PropertyKey): boolean {\n  return Object.hasOwn(o, key);\n}",
  );

/** The entry with `name` no longer compared. */
const withoutMember = (name) => (entry) => ({
  ...entry,
  members: entry.members.filter((member) => member !== name),
});

/** The entry with the exemption of `name` removed. */
const withoutExemption = (name) => (entry) => ({
  ...entry,
  exempt: Object.fromEntries(
    Object.entries(entry.exempt).filter(([key]) => key !== name),
  ),
});

/** The entry with `name` moved from `members` to `exempt`. */
const exempted = (name) => (entry) => ({
  ...withoutMember(name)(entry),
  exempt: {
    ...entry.exempt,
    [name]: "Moved here to silence the coverage cell, with a long reason.",
  },
});

/** `kind name file:line` of a finding, for exact comparison. */
const brief = (finding) =>
  [
    finding.kind,
    finding.name,
    finding.line ? `${finding.file}:${finding.line}` : finding.file,
  ]
    .filter(Boolean)
    .join(" ");

const findingsOf = (entry, sources) =>
  lockstepFindings(entry, sources).map(brief).sort();

const PROBE = [
  [
    "CONTROL — a drift in today's function form",
    { [F.guard]: [drift] },
    undefined,
    ["drift visitContainer"],
  ],
  [
    "S7 — a destructured parameter in both twins",
    { [F.params]: [destructuredParam], [F.guard]: [destructuredParam] },
    undefined,
    [`uncovered WalkState ${F.params}`, `uncovered WalkState ${F.guard}`],
  ],
  [
    "S7 — and a drift in the shared twin",
    {
      [F.params]: [destructuredParam],
      [F.guard]: [destructuredParam, drift],
    },
    undefined,
    [
      "drift visitContainer",
      `uncovered WalkState ${F.params}`,
      `uncovered WalkState ${F.guard}`,
    ],
  ],
  [
    "S6 — an arrow const in both twins",
    { [F.params]: [arrowConst], [F.guard]: [arrowConst] },
    undefined,
    [],
  ],
  [
    "S6 — and a drift in the shared twin",
    { [F.params]: [arrowConst], [F.guard]: [arrowConst, drift] },
    undefined,
    ["drift visitContainer"],
  ],
  [
    "S4 — a destructured capture in both twins",
    { [F.params]: [destructuredCapture], [F.guard]: [destructuredCapture] },
    undefined,
    [],
  ],
  [
    "S4 — and the validation twin reads Object.hasOwn live",
    {
      [F.params]: [destructuredCapture, liveHasOwn],
      [F.guard]: [destructuredCapture],
    },
    undefined,
    ["drift hasOwn"],
  ],
  [
    "S4 — with the member dropped from the registry",
    { [F.params]: [destructuredCapture], [F.guard]: [destructuredCapture] },
    withoutMember("hasOwn"),
    [`uncovered hasOwn ${F.params}`, `uncovered hasOwn ${F.guard}`],
  ],
  [
    "S4 — dropped, and the validation twin reads Object.hasOwn live",
    {
      [F.params]: [destructuredCapture, liveHasOwn],
      [F.guard]: [destructuredCapture],
    },
    withoutMember("hasOwn"),
    [`uncovered hasOwn ${F.params}`, `uncovered hasOwn ${F.guard}`],
  ],
  [
    "S4 — moved to `exempt`, and the validation twin reads Object.hasOwn live",
    {
      [F.params]: [destructuredCapture, liveHasOwn],
      [F.guard]: [destructuredCapture],
    },
    exempted("hasOwn"),
    ["twin hasOwn"],
  ],
];

for (const [label, edits, registry, expected] of PROBE) {
  test(`probe ${label}`, () => {
    const entry = registry ? registry(FIXTURE_ENTRY) : FIXTURE_ENTRY;

    assert.deepEqual(findingsOf(entry, edited(edits)), [...expected].sort());
  });
}

// ─── The reader: what it places, what it compares, what it refuses ───────────

test("fixture: the twins, which differ in comments and `export`, are in lockstep", () => {
  assert.deepEqual(findingsOf(FIXTURE_ENTRY, FIXTURE), []);
});

test("fixture: a drift is reported at the line that differs in each twin", () => {
  const lineOf = (file) =>
    FIXTURE.get(file)
      .slice(0, FIXTURE.get(file).indexOf(DRIFT_FROM))
      .split("\n").length;
  const [finding] = lockstepFindings(
    FIXTURE_ENTRY,
    edited({ [F.guard]: [drift] }),
  );

  assert.match(
    finding.message,
    new RegExp(`${F.params}:${lineOf(F.params)}  `),
  );
  assert.match(finding.message, new RegExp(`${F.guard}:${lineOf(F.guard)}  `));
});

test("fixture: an edit of comments alone, with the layout prettier gives it, is not a drift", () => {
  // Both twins first gain three locals, each on one line.
  const typed = (text) =>
    swap(
      text,
      "    const item = stack.pop();\n",
      "    const item = stack.pop();\n" +
        "    const frame: { item: unknown; depth: number } = { item, depth: 0 };\n" +
        '    const kind: "leaf" | "node" = typeof item === "object" ? "node" : "leaf";\n' +
        '    const describe = () => (kind === "leaf" ? "a leaf" : "a node");\n',
    );
  const sources = edited({
    [F.params]: [typed],
    [F.guard]: [
      typed,
      (text) =>
        swap(
          text,
          "/** Params guard (twin). */",
          "/**\n * Params guard, rewritten: see {@link isParams}.\n *\n * @internal\n */",
        ),
      (text) =>
        swap(
          text,
          "  onPath.add(value);\n",
          "  // Enter the container.\n  onPath.add(value); /* on the path now */\n",
        ),
      (text) =>
        swap(
          text,
          "Object.getPrototypeOf(value) !== Object.prototype",
          "Object.getPrototypeOf(value) /* own prototype */ !== Object.prototype",
        ),
      // A line comment inside a call: prettier breaks it and adds a trailing
      // comma.
      (text) =>
        swap(
          text,
          "  stack.push(new SubtreeExit(value));\n",
          "  stack.push(\n    new SubtreeExit(value), // the marker\n  );\n",
        ),
      // A line comment inside a type literal: prettier breaks it and closes
      // every member with `;`.
      (text) =>
        swap(
          text,
          "    const frame: { item: unknown; depth: number } = { item, depth: 0 };\n",
          "    const frame: {\n      item: unknown; // the popped value\n      depth: number;\n    } = { item, depth: 0 };\n",
        ),
      // …inside a union: prettier puts a `|` before its first member.
      (text) =>
        swap(
          text,
          '    const kind: "leaf" | "node" = typeof item === "object" ? "node" : "leaf";\n',
          '    const kind:\n      | "leaf" // a primitive\n      | "node" = typeof item === "object" ? "node" : "leaf";\n',
        ),
      // …inside the conditional body of an arrow: prettier drops its
      // parentheses.
      (text) =>
        swap(
          text,
          '    const describe = () => (kind === "leaf" ? "a leaf" : "a node");\n',
          '    const describe = () =>\n      kind === "leaf" // a primitive\n        ? "a leaf"\n        : "a node";\n',
        ),
      // …inside a returned expression: prettier wraps it in parentheses.
      (text) =>
        swap(
          text,
          '  return typeof name === "string" && name.length <= MAX_ROUTE_NAME_LENGTH;\n',
          '  return (\n    typeof name === "string" && // a string first\n    name.length <= MAX_ROUTE_NAME_LENGTH\n  );\n',
        ),
    ],
  });

  assert.deepEqual(findingsOf(FIXTURE_ENTRY, sources), []);
});

/**
 * One pair per declaration form: the left text, the right text with a drift,
 * and the names the form declares.
 */
const FORMS = [
  [
    "a function",
    "function f(a: number): number {\n  return a + 1;\n}\n",
    "function f(a: number): number {\n  return a + 2;\n}\n",
    ["f"],
  ],
  [
    "an overloaded function, drifted in a signature",
    "function o(a: string): string;\nfunction o(a: number): number;\nfunction o(a: unknown): unknown {\n  return a;\n}\n",
    "function o(a: boolean): string;\nfunction o(a: number): number;\nfunction o(a: unknown): unknown {\n  return a;\n}\n",
    ["o"],
  ],
  [
    "an overloaded function, drifted in its body",
    "function o(a: string): string;\nfunction o(a: unknown): unknown {\n  return a;\n}\n",
    "function o(a: string): string;\nfunction o(a: unknown): unknown {\n  return [a];\n}\n",
    ["o"],
  ],
  [
    "an arrow const",
    "const g = (a: number): number => a + 1;\n",
    "const g = (a: number): number => a + 2;\n",
    ["g"],
  ],
  ["a let", "let counter = 0;\n", "let counter = 1;\n", ["counter"]],
  [
    "an object binding pattern",
    "const { a, b: renamed, c = 1, ...rest } = source;\n",
    "const { a, b: renamed, c = 2, ...rest } = source;\n",
    ["a", "renamed", "c", "rest"],
  ],
  [
    "an array binding pattern",
    "const [first, , [nested], ...others] = source;\n",
    "const [first, , [nested], ...others] = other;\n",
    ["first", "nested", "others"],
  ],
  [
    "two declarators",
    "const x = 1,\n  y = 2;\n",
    "const x = 1,\n  y = 3;\n",
    ["x", "y"],
  ],
  [
    "a class",
    "class K {\n  m(): number {\n    return 1;\n  }\n}\n",
    "class K {\n  m(): number {\n    return 2;\n  }\n}\n",
    ["K"],
  ],
  [
    "an interface",
    "interface I {\n  a: string;\n}\n",
    "interface I {\n  a: number;\n}\n",
    ["I"],
  ],
  [
    "a merged interface, extended in one twin",
    "interface M {\n  a: string;\n}\n",
    "interface M {\n  a: string;\n}\n\ninterface M {\n  b: number;\n}\n",
    ["M"],
  ],
  [
    "a type alias",
    "type T = { a: string; b: number };\n",
    "type T = { a: string; b: string };\n",
    ["T"],
  ],
];

const PAIR = { left: "forms/left.ts", right: "forms/right.ts" };

for (const [label, left, right, names] of FORMS) {
  test(`reader: ${label} is placed, covered and compared`, () => {
    const entry = { ...PAIR, members: names, onDrift: "" };
    const same = new Map([
      [PAIR.left, left],
      [PAIR.right, left],
    ]);

    assert.deepEqual(
      findingsOf({ ...entry, members: [] }, same),
      names
        .flatMap((name) => [
          `uncovered ${name} ${PAIR.left}`,
          `uncovered ${name} ${PAIR.right}`,
        ])
        .sort(),
      "an unregistered declaration of this form is asked back from both sides",
    );
    assert.deepEqual(findingsOf(entry, same), [], "identical twins are green");
    assert.deepEqual(
      findingsOf(
        entry,
        new Map([
          [PAIR.left, left],
          [PAIR.right, right],
        ]),
      ),
      names.map((name) => `drift ${name}`).sort(),
      "a drift in one twin is reported",
    );
  });
}

/** Top-level statements the reader does not place, one per form. */
const UNPLACED = [
  "enum Mode {\n  A,\n}",
  "namespace N {\n  export const a = 1;\n}",
  "declare global {\n  interface W {\n    w: number;\n  }\n}",
  "Object.freeze(Mode);",
  "export { Mode };",
  "export * from './other';",
  "export default function () {}",
  "if (Mode) {\n  void 0;\n}",
  ";",
  "import fs = require('node:fs');",
];

test("reader: parentheses that group, end an optional chain or make a body an object are a drift", () => {
  for (const [left, right] of [
    ["const p = (a + b) * c;\n", "const p = a + b * c;\n"],
    ["const q = (a?.b).c;\n", "const q = a?.b.c;\n"],
    ["const r = () => ({});\n", "const r = () => {};\n"],
    ["type S = (A | B)[];\n", "type S = A | B[];\n"],
  ]) {
    const name = /^(?:const|type) (\w+)/.exec(left)[1];

    assert.deepEqual(
      findingsOf(
        { ...PAIR, members: [name], onDrift: "" },
        new Map([
          [PAIR.left, left],
          [PAIR.right, right],
        ]),
      ),
      [`drift ${name}`],
      `${left.trim()}  vs  ${right.trim()}`,
    );
  }
});

test("reader: a statement of any other form is reported where it stands", () => {
  // Each block starts on the line after the blank line that ends the last.
  let next = 1;
  const starts = UNPLACED.map((block) => {
    const start = next;
    next += block.split("\n").length + 1;
    return start;
  });

  assert.deepEqual(
    findingsOf(
      { ...PAIR, members: [], onDrift: "" },
      new Map([
        [PAIR.left, UNPLACED.join("\n\n")],
        [PAIR.right, "const kept = 1;\n\nexport = kept;\n"],
      ]),
    ),
    [
      ...starts.map((line) => `unplaceable ${PAIR.left}:${line}`),
      `unplaceable ${PAIR.right}:3`,
      `uncovered kept ${PAIR.right}`,
    ].sort(),
  );
});

test("exempt: a name both sides have is refused, whether declared or imported", () => {
  const sources = (right) =>
    new Map([
      [PAIR.left, "function helper(): number {\n  return 1;\n}\n"],
      [PAIR.right, right],
    ]);
  const entry = {
    ...PAIR,
    members: [],
    exempt: { helper: "Moved here to silence the coverage cell, at length." },
    onDrift: "",
  };

  assert.deepEqual(
    findingsOf(entry, sources("function helper(): number {\n  return 2;\n}\n")),
    ["twin helper"],
  );
  assert.deepEqual(
    findingsOf(entry, sources('import { helper } from "./helpers";\n')),
    ["twin helper"],
  );
  assert.deepEqual(
    findingsOf(entry, sources("const other = 1;\n")),
    [`uncovered other ${PAIR.right}`],
    "CONTROL — a name one side has is exempt",
  );
});

test("exempt: a name nobody declares is stale, and a reason must be written", () => {
  assert.deepEqual(
    findingsOf(
      {
        ...PAIR,
        members: ["kept"],
        exempt: {
          ghost: "Declared nowhere: the coverage cell can never need this.",
          short: "too short",
        },
        onDrift: "",
      },
      new Map([
        [PAIR.left, "const kept = 1;\nconst short = 2;\n"],
        [PAIR.right, "const kept = 1;\n"],
      ]),
    ),
    ["reason short", "stale ghost"],
  );
});

test("files: a declaration in a member's own file is covered too", () => {
  assert.deepEqual(
    findingsOf(withoutExemption("createRouterError")(FIXTURE_ENTRY), FIXTURE),
    [`uncovered createRouterError ${F.routes}`],
  );
});

test("files: a member the shared twin moves to a file of its own is followed by its `right`", () => {
  const intrinsics = "fixture/browser-env/intrinsics.ts";
  const moved = new Map([
    ...edited({
      [F.guard]: [
        (text) =>
          swap(
            text,
            "/** Captures, twin of the validation file. */\nconst hasOwn = Object.hasOwn;\n",
            'import { hasOwn } from "./intrinsics";\n',
          ),
      ],
    }),
    [
      intrinsics,
      "/** Captured once. */\nconst hasOwn = Object.hasOwn;\n\nconst objectValues = Object.values;\n",
    ],
  ]);
  const followed = {
    ...FIXTURE_ENTRY,
    members: [
      ...FIXTURE_ENTRY.members.filter((member) => member !== "hasOwn"),
      { name: "hasOwn", right: intrinsics },
    ],
  };

  assert.deepEqual(findingsOf(FIXTURE_ENTRY, moved), [
    `missing hasOwn ${F.guard}`,
  ]);
  assert.deepEqual(findingsOf(followed, moved), [
    `uncovered objectValues ${intrinsics}`,
  ]);
  assert.deepEqual(findingsOf(exempted("hasOwn")(FIXTURE_ENTRY), moved), [
    "twin hasOwn",
  ]);
});

test("files: a file of the pair absent from the tree is reported, and no exemption is called stale", () => {
  const gone = new Map(FIXTURE);
  gone.delete(F.routes);

  assert.deepEqual(findingsOf(FIXTURE_ENTRY, gone), [`unread ${F.routes}`]);
});

test("missing: a member renamed in one twin is missing there, and the new name is asked back", () => {
  const renamed = edited({
    [F.guard]: [
      (text) => swap(text, "function visitContainer(", "function visit("),
      (text) => swap(text, "!visitContainer(item", "!visit(item"),
    ],
  });

  assert.deepEqual(findingsOf(FIXTURE_ENTRY, renamed), [
    "drift isParams",
    `missing visitContainer ${F.guard}`,
    `uncovered visit ${F.guard}`,
  ]);
});

// ─── Independent-registry hygiene ────────────────────────────────────────────

test("independent registry: files exist and reasons are written", () => {
  for (const entry of INDEPENDENT) {
    assert.ok(
      existsSync(join(ROOT, entry.path)),
      `stale INDEPENDENT entry: ${entry.path} is gone — drop or update the registry entry`,
    );
    if (entry.counterpart) {
      assert.ok(
        existsSync(join(ROOT, entry.counterpart)),
        `stale INDEPENDENT entry: counterpart ${entry.counterpart} is gone — drop or update the registry entry`,
      );
    }
    assert.ok(
      entry.reason.length >= 40,
      `INDEPENDENT entry ${entry.path} needs a real written reason`,
    );
  }
});
