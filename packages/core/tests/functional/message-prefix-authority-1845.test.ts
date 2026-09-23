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

/**
 * A message prefix names something the caller can look up (#1845).
 *
 * `[router.buildPath] Missing required param 'id'` is what
 * `router.buildPath("route", {})` printed. The caller wrote `buildPath`; they
 * cannot grep `SegmentMatcher` in their own code, cannot find it on the exports
 * map, and cannot find it in the wiki. #1819 retired `[search-params]` on that
 * reasoning and this is the remainder of the same class.
 *
 * ⚑ **Two prefixes are admissible, and both name something published.**
 * `[router…]` is the facade a caller typed. `[cloneRouter]` is exported from
 * `@real-router/core/api` and takes no router receiver, so naming it is naming a
 * call the reader made. `[RouterError…]` is a root export, so
 * naming it is naming something they can look up — which is why those were
 * excluded from the inventory rather than renamed.
 *
 * ⚑ **Every refusal core raises now takes one of two forms (#2487).** A prefix
 * names a call the reader made, or the message carries O-1's `Internal error
 * (please report): ` marker because no caller input can reach it. There is no
 * register of class-name prefixes: the FSM pair was the only entry, and
 * unbracketing it merged no cell — measured, 76/76 green, because `fsm.test.ts`
 * tells its cells apart by WHAT THEY CALL and not by a prefix.
 *
 * ⚠ **An ARGUMENT, not any bracketed literal.** Computed keys
 * (`[routerStates.STARTING]: …`) and ordinary values (`"[dynamic]"` for a
 * callback `forwardTo`) are bracketed strings that are not messages, and a
 * text scan counts them. Walking arguments of a call or a `new` is what
 * discriminates — measured, it is the difference between 24 sites and 30.
 */
const SRC = path.resolve(__dirname, "../../src");

/** The raiser-head fixture every reader of a raiser head answers for (#2537). */
const FIXTURE = path.resolve(__dirname, "../fixtures/raiser-heads");

/**
 * The leftmost leaf of a `+` chain — a message is often CONCATENATED, and the
 * prefix then sits in the head of the first operand rather than in the argument
 * itself. ⚠ Measured: skipping this hid twelve of the twenty-four sites, all the
 * registration errors, and the offender list read as complete without them.
 */
const leftmost = (node: ts.Expression): ts.Expression => {
  let inner = node;

  while (
    ts.isBinaryExpression(inner) &&
    inner.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    inner = inner.left;
  }

  return inner;
};

/** The prefix a literal opens with, whatever spelling carried it. */
const textOf = (node: ts.Expression): string | undefined => {
  const leaf = leftmost(node);

  if (ts.isStringLiteral(leaf) || ts.isNoSubstitutionTemplateLiteral(leaf)) {
    return leaf.text;
  }

  // The HEAD of a template — a prefix always sits before the first substitution.
  return ts.isTemplateExpression(leaf) ? leaf.head.text : undefined;
};

/** Tier one: the prefix names something published, so the caller can look it up. */
const PUBLISHED =
  /^\[(router(\.[A-Za-z$.{}]+)?|RouterError(\.[A-Za-z]+)?|cloneRouter)\]$/u;

/**
 * Tier four: the form O-1 gives a refusal no caller input can reach. No bracket
 * — there is no door to name — and a marker instead, which is what makes it
 * greppable and keeps it out of the bare register.
 */
const INTERNAL_DEFECT = "Internal error (please report): ";

/**
 * What one `raiser(receiver, door?)` call prints (#2487): a head when both
 * arguments are literals, and otherwise the dynamic case, which is out of this
 * tier's reach and is not judged.
 */
type BoundHead =
  | { readonly kind: "static"; readonly head: string }
  | { readonly kind: "dynamic" };

function headOfRaiserCall(call: ts.CallExpression): BoundHead {
  const [receiver, door] = call.arguments;

  if (receiver === undefined || !ts.isStringLiteral(receiver)) {
    return { kind: "dynamic" };
  }

  if (door === undefined) {
    return { kind: "static", head: `[${receiver.text}]` };
  }

  return ts.isStringLiteral(door)
    ? { kind: "static", head: `[${receiver.text}.${door.text}]` }
    : { kind: "dynamic" };
}

/** The name and head a declaration binds, when it binds `raiser(...)`. */
function raiserBindingOf(
  node: ts.Node,
  source: ts.SourceFile,
): { readonly name: string; readonly bound: BoundHead } | undefined {
  if (
    !ts.isVariableDeclaration(node) ||
    !ts.isIdentifier(node.name) ||
    node.initializer === undefined ||
    !ts.isCallExpression(node.initializer) ||
    node.initializer.expression.getText(source) !== "raiser"
  ) {
    return undefined;
  }

  return { name: node.name.text, bound: headOfRaiserCall(node.initializer) };
}

/**
 * Every raiser binding in a file, ONE ENTRY PER BINDING.
 *
 * The raiser writes the head once per binding, so at the throw there is no
 * literal bracket for tier one to read — the head is the BINDING, and each one
 * is judged whether or not another binding shares its name.
 *
 * ⚠ Not a map keyed by name. `validation-plugin` names every per-call binding
 * `at`, and a map hands the last binding's head to every site: on the shared
 * fixture, a mis-shaped door in the first of two such bindings passed this
 * tier (#2537).
 */
function raiserBindings(source: ts.SourceFile): BoundHead[] {
  const found: BoundHead[] = [];

  const visit = (node: ts.Node): void => {
    const binding = raiserBindingOf(node, source);

    if (binding !== undefined) {
      found.push(binding.bound);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

/** The head `name` is bound to by a statement of this one scope, if any. */
function boundHeadIn(
  scope: ts.Block | ts.SourceFile,
  name: string,
  source: ts.SourceFile,
): BoundHead | undefined {
  for (const statement of scope.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      const binding = raiserBindingOf(declaration, source);

      if (binding?.name === name) {
        return binding.bound;
      }
    }
  }

  return undefined;
}

/**
 * The binding a tag reads, resolved from the tag by LEXICAL SCOPE: the nearest
 * enclosing block or file that binds `name` to a raiser. Each scope is read
 * whole, so a binding written below the site still answers for it.
 */
function boundHeadAt(
  node: ts.Node,
  name: string,
  source: ts.SourceFile,
): BoundHead | undefined {
  // ⚠ `parent` is typed as present and IS undefined at the root, so the cast is
  // a guard rather than noise.
  for (
    let scope = node.parent as ts.Node | undefined;
    scope !== undefined;
    scope = scope.parent
  ) {
    const bound =
      ts.isBlock(scope) || ts.isSourceFile(scope)
        ? boundHeadIn(scope, name, source)
        : undefined;

    if (bound !== undefined) {
      return bound;
    }
  }

  return undefined;
}

/** A tag read off a named base, with the binding it resolves to. */
interface RaiserTag {
  readonly node: ts.TaggedTemplateExpression;
  readonly bound: BoundHead | undefined;
}

/** Every tag read off a named base in a file, with the binding it resolves to. */
function raiserTags(source: ts.SourceFile): RaiserTag[] {
  const found: RaiserTag[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(node)) {
      const name = boundNameOfTag(node.tag);

      if (name !== undefined) {
        found.push({ node, bound: boundHeadAt(node, name, source) });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

/**
 * The raiser a tagged template was built from: `at` in ``at.type`…` `` and in
 * ``at.code(code)`…` ``, or undefined when the tag is neither.
 */
function boundNameOfTag(tag: ts.Expression): string | undefined {
  const member = ts.isCallExpression(tag) ? tag.expression : tag;

  return ts.isPropertyAccessExpression(member) &&
    ts.isIdentifier(member.expression)
    ? member.expression.text
    : undefined;
}

interface Offender {
  readonly file: string;
  readonly prefix: string;
}

const prefixOf = (text: string): string | undefined =>
  /^\[[^\]]+\]/u.exec(text)?.[0];

/**
 * Raiser bodies that would render a SECOND head (О-3).
 *
 * Two shapes have a static signature and are refused: a body that is one
 * substitution and nothing else, and a body opening with `[`.
 *
 * ⚠ A body that opens with a substitution and continues — `` `${prebuilt} more` ``
 * — passes both and can still render a double head. That residue is accepted:
 * the rule that would catch it also rejects the sites whose body legitimately
 * opens with a value. It is pinned by the control below so it is not closed by
 * accident.
 */
/**
 * Whether `expression` is a call to a local builder that cannot contribute a head:
 * every `return` in its declaration is a string or template literal whose text does
 * not open with `[`. Anything else — a parameter, a member call, a builder with a
 * computed return — answers false, because the head then cannot be read.
 */
/** The literal text a `return` contributes, or `undefined` when it is not a literal. */
function returnedText(value: ts.Expression | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return value.text;
  }

  if (ts.isTemplateExpression(value)) {
    return value.head.text;
  }

  return undefined;
}

/** Whether every `return` in `declaration` is a literal that does not open a head. */
function returnsNoHead(declaration: ts.FunctionDeclaration): boolean {
  let ok = true;

  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) {
      const text = returnedText(node.expression);

      if (text === undefined || text.startsWith("[")) {
        ok = false;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(declaration);

  return ok;
}

/**
 * Whether `expression` is a call to a local builder that cannot contribute a head.
 * Anything else — a parameter, a member call, a builder with a computed return —
 * answers false, because the head then cannot be read off the source.
 */
function headFreeBuilderCall(
  expression: ts.Expression | undefined,
  root: string,
): boolean {
  if (expression === undefined || !ts.isCallExpression(expression)) {
    return false;
  }

  if (!ts.isIdentifier(expression.expression)) {
    return false;
  }

  const name = expression.expression.text;
  let seen = false;

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
        seen = true;

        if (!returnsNoHead(node)) {
          seen = false;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return seen;
}

/**
 * What is wrong with a raiser body, or `undefined` when nothing is.
 *
 * ⚠ A body that is ONE interpolation hands the whole sentence to an expression, so
 * the head cannot be read off the source. It is accepted only when that expression is
 * a call to a builder whose every return is a literal carrying no head — a check,
 * not a name on a list.
 */
function judgeBody(
  template: ts.TemplateLiteral,
  root: string,
): string | undefined {
  const parts = bodyParts(template);

  if (parts.every((part) => part === "")) {
    const fed = ts.isTemplateExpression(template)
      ? template.templateSpans[0]?.expression
      : undefined;

    return headFreeBuilderCall(fed, root) ? undefined : "pass-through body";
  }

  return parts[0].startsWith("[") ? "body opens with a head" : undefined;
}

/** The literal parts of a template, interpolations excluded. */
function bodyParts(template: ts.TemplateLiteral): string[] {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return [template.text];
  }

  return [
    template.head.text,
    ...template.templateSpans.map((span) => span.literal.text),
  ];
}

function doubleHeads(root: string = SRC): Offender[] {
  const found: Offender[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    // A dynamic-door binding has no head to read, so this rule does not judge
    // its body either.
    for (const { node, bound } of raiserTags(source)) {
      if (bound?.kind !== "static") {
        continue;
      }

      const verdict = judgeBody(node.template, root);

      if (verdict !== undefined) {
        found.push({ file: path.relative(root, file), prefix: verdict });
      }
    }
  }

  return found;
}

function offenders(root: string = SRC): Offender[] {
  const found: Offender[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const inspect = (node: ts.Expression): void => {
      // `new RouterError(code, { message })` keeps the message in the BAG, so the
      // argument walk below hands this an object literal with no text of its own
      // (#2493). The floors on `judged` are what hold this branch reachable.
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            property.name.getText() === "message"
          ) {
            inspect(property.initializer);
          }
        }

        return;
      }

      const text = textOf(node);

      if (text === undefined) {
        return;
      }

      const prefix = prefixOf(text);

      if (prefix !== undefined && !PUBLISHED.test(prefix)) {
        found.push({ file: path.relative(root, file), prefix });
      }
    };

    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        for (const argument of node.arguments ?? []) {
          inspect(argument);
        }
      }

      ts.forEachChild(node, walk);
    };

    walk(source);

    // A raiser throw carries no literal bracket: the head is the binding, and
    // each binding is judged by the same rule the literal heads answer to.
    for (const bound of raiserBindings(source)) {
      if (bound.kind === "static" && !PUBLISHED.test(bound.head)) {
        found.push({ file: path.relative(root, file), prefix: bound.head });
      }
    }
  }

  return found;
}

describe("a message prefix names something the caller can look up (#1845)", () => {
  it("no message in core names an internal class or layer", () => {
    expect(offenders()).toStrictEqual([]);
  });

  it("CONTROL — the two discriminators the walk rests on, both polarities", () => {
    // ⚑ Neither is exercised by the tree as it stands, and both are load-bearing.
    // `leftmost` sees twelve of the twenty-four sites, all of them concatenated;
    // the ARGUMENT walk is what keeps a computed key and an ordinary bracketed
    // value out of the count. A green suite says nothing about either, because
    // the offender list is empty when they work AND when they are removed.
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-"));

    try {
      writeFileSync(
        path.join(directory, "concatenated.ts"),
        "throw new Error(`[Layer.thing] first half ` + `second half`);\n",
      );
      writeFileSync(
        path.join(directory, "computed-key.ts"),
        "const t = { [routerStates.STARTING]: 1 };\n",
      );
      writeFileSync(
        path.join(directory, "plain-value.ts"),
        'const fallback = typeof x === "string" ? x : "[dynamic]";\n',
      );
      writeFileSync(
        path.join(directory, "admissible.ts"),
        "throw new Error(`[router.buildPath] fine` + ` and still fine`);\n",
      );

      expect(offenders(directory)).toStrictEqual([
        { file: "concatenated.ts", prefix: "[Layer.thing]" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — a raiser head is judged by its BINDING, both polarities", () => {
    // The raiser writes no bracket at the throw, so the literal walk above sees
    // nothing there. Until a family converts, the whole branch is unreachable
    // from the tree and a green suite says nothing about it.
    const directory = mkdtempSync(path.join(tmpdir(), "prefix-raiser-"));

    try {
      writeFileSync(
        path.join(directory, "well-shaped.ts"),
        'const at = raiser("router", "buildPath");\n' +
          "throw at.type`Missing required param`;\n",
      );
      // О-2's bare form, for a raiser several doors reach. The PLUGIN's own
      // receiver is not admissible here and is not meant to be: core writes no
      // such binding, and #2457 judges the heads that do.
      writeFileSync(
        path.join(directory, "bare.ts"),
        'const at = raiser("router");\n' +
          "throw at.plain`cannot commit a state before the router has started`;\n",
      );
      writeFileSync(
        path.join(directory, "mis-shaped.ts"),
        'const at = raiser("router", "Segment Matcher");\n' +
          "throw at.type`Invalid format`;\n",
      );

      expect(offenders(directory)).toStrictEqual([
        { file: "mis-shaped.ts", prefix: "[router.Segment Matcher]" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — the shared raiser fixture: each binding answers for its own sites (#2537)", () => {
    // ⚑ The fixture is SHARED: every reader of a raiser head answers for every
    // site in it, each in its own terms. `two-bindings.ts` is the row that
    // matters — a reader resolving a name file-wide hands the second binding to
    // both sites and loses the door planted in the first. A new file there reds
    // this cell until its answer is written below.
    const read: Record<string, string[]> = {};

    for (const file of globSync(`${FIXTURE}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TS,
      );

      read[path.relative(FIXTURE, file)] = raiserTags(source).map(
        ({ bound }) =>
          bound?.kind === "static" ? bound.head : (bound?.kind ?? "unbound"),
      );
    }

    expect(read).toStrictEqual({
      "bare-receiver.ts": ["[router]"],
      "binding-after-use.ts": ["[router.matchPath]"],
      "dynamic-door.ts": ["dynamic"],
      "static-door.ts": ["[router.buildPath]"],
      "two-bindings.ts": ["[router.Segment Matcher]", "[router.navigate]"],
    });
    expect(offenders(FIXTURE)).toStrictEqual([
      { file: "two-bindings.ts", prefix: "[router.Segment Matcher]" },
    ]);
  });

  it("no raiser body renders a second head, and the residue stays open", () => {
    expect(doubleHeads()).toStrictEqual([]);
  });

  it("CONTROL — О-3's two rejections fire, and the third shape does not", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "double-head-"));

    try {
      writeFileSync(
        path.join(directory, "pass-through.ts"),
        'const at = raiser("router", "buildPath");\n' +
          "throw at.type`${prebuilt}`;\n",
      );
      writeFileSync(
        path.join(directory, "second-head.ts"),
        'const at = raiser("router", "buildPath");\n' +
          "throw at.type`[router.x] Missing ${name}`;\n",
      );
      writeFileSync(
        path.join(directory, "residue.ts"),
        'const at = raiser("router", "buildPath");\n' +
          "throw at.type`${prebuilt} Missing '${name}'`;\n",
      );
      writeFileSync(
        path.join(directory, "honest.ts"),
        'const at = raiser("router", "buildPath");\n' +
          "throw at.type`Missing required param '${name}'`;\n",
      );

      expect(doubleHeads(directory)).toStrictEqual([
        { file: "pass-through.ts", prefix: "pass-through body" },
        { file: "second-head.ts", prefix: "body opens with a head" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("every raiser use is the shape the head tier can read", () => {
    expect(unreadableRaiserUses()).toStrictEqual([]);
  });

  it("CONTROL — the four spellings the tier cannot read are refused", () => {
    // Each file carries a MIS-SHAPED door, so a spelling missing from the result
    // is one the head tier would pass silently.
    const directory = mkdtempSync(path.join(tmpdir(), "raiser-shape-"));

    try {
      writeFileSync(
        path.join(directory, "bound.ts"),
        'const at = raiser("router", "Segment Matcher");\nthrow at.type`x`;\n',
      );
      writeFileSync(
        path.join(directory, "aliased.ts"),
        'import { raiser as r } from "./utils";\nconst at = r("router", "x");\n',
      );
      writeFileSync(
        path.join(directory, "inline.ts"),
        'throw raiser("router", "Segment Matcher").type`x`;\n',
      );
      writeFileSync(
        path.join(directory, "destructured.ts"),
        'const { type } = raiser("router", "Segment Matcher");\nthrow type`x`;\n',
      );
      writeFileSync(
        path.join(directory, "reassigned.ts"),
        'let at = raiser("router", "buildPath");\n' +
          'at = raiser("router", "Segment Matcher");\nthrow at.type`x`;\n',
      );

      expect(unreadableRaiserUses(directory)).toStrictEqual([
        "aliased.ts · imported under an alias",
        "destructured.ts · not bound to a name",
        "inline.ts · not bound to a name",
        "reassigned.ts · not bound to a name",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — the walk reads messages at all, so an empty result means clean", () => {
    // Without this, a change to the AST shapes walked empties the result and the
    // assertion above passes over files it never inspected.
    let bracketed = 0;
    let bindings = 0;

    for (const file of globSync(`${SRC}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const walk = (node: ts.Node): void => {
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          for (const argument of node.arguments ?? []) {
            const text = textOf(argument);

            if (text !== undefined && prefixOf(text) !== undefined) {
              bracketed++;
            }
          }
        }

        // A raiser binding is where a converted head lives, so it is what the
        // tier reads there instead of an argument.
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "raiser"
        ) {
          bindings++;
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }

    // ⚠ Only the half that cannot reach zero is a live floor. Bindings rise as
    // families convert; literal heads fall toward zero BY DESIGN, so a floor on
    // them would red on the migration succeeding. That half is a control below,
    // on a tree written for it.
    expect(bindings).toBeGreaterThan(0);
    // Both kinds are still READ here, which is what this cell is for.
    expect(bracketed + bindings).toBeGreaterThan(20);
  });
});

/**
 * Tier three: a refusal that names NOTHING (#2456).
 *
 * The rule above polices WHICH prefix a message uses and answers `undefined` for
 * a message that has none — so `Circular forwardTo: a → b → a` passed it while
 * its neighbour at the same door said `[router.addRoute] forwardTo target "x"
 * does not exist`. The register below is what makes a new bare refusal loud: add
 * one and this reds, and the author either prefixes it or records the row with a
 * reason.
 *
 * ⚑ **The backlog is EMPTY, and that is the adjudication rather than the
 * absence of one (#2459).** #2456 prefixed the forward-chain family and
 * registered thirteen more without judging them. Each was then driven through
 * the doors that print it: twelve are reachable by caller input and took
 * `[router]`, the bare facade form #1845 settles multi-door raisers with. A
 * thirteenth was registered here for a static check nothing called; the check is
 * gone and the register is back to the FSM pair.
 *
 * ⚠ **An empty register still reds on a NEW bare refusal, and that is what it
 * is for.** What an empty one cannot do is double as a positive control on the
 * recogniser, the way a populated list did. Two cells carry that instead, and
 * neither may be removed with this one: the floors below (`literals` against a
 * measured count) and `CONTROL — both polarities`, which writes a bare throw on
 * a purpose-built tree and asserts it is found.
 *
 * ⚠ **The rule judges one spelling — `throw new X(<literal>)` — and the census
 * below says so out loud.** Core also throws through a factory
 * (`throw freezeThrownError(new …)`, `throw createRouterError(door, msg)`) and
 * re-throws a caught error, and a bare message hidden inside either is invisible
 * to the rule. Those shapes are COUNTED, in a partition that has to add up to
 * every `throw` in the tree, so a new one cannot arrive unnoticed even where it
 * cannot be judged.
 */
const BARE: readonly string[] = [];

/**
 * `Route "${current}" does not exist` → the shape, substitutions collapsed.
 *
 * ⚠ The WHOLE argument, not its leftmost operand: rendering only the head of a
 * `+` chain would make the row hold half a message — so a `printWidth` change
 * that re-split the chain would move the row while the message stayed
 * byte-identical.
 */
const shapeOf = (node: ts.Expression, source: ts.SourceFile): string =>
  node
    .getText(source)
    // Whitespace first, so a chain wrapped across lines and one written on a
    // single line reduce to the same junction below.
    .replaceAll(/\s+/gu, " ")
    // The junction between two literals joins ONE message: drop the operator and
    // the quotes either side, keeping the spacing the literals themselves carry.
    .replaceAll(/[`"'] \+ [`"']/gu, "")
    .replaceAll(/\$\{[^}]*\}/gu, "${}")
    .replaceAll(/[`"']/gu, "")
    .trim()
    .slice(0, 120);

interface Refusals {
  readonly bare: string[];
  /** Literal-message `throw new` sites — the throw partition's own floor. */
  readonly literals: number;
  /** `throw new X(nonLiteral)` — the message is not in the tree. */
  readonly opaque: number;
  /** `throw factory(…)` — a message may hide inside, unjudged by the rule. */
  readonly wrapped: number;
  /** `throw error` — a caught error re-thrown, carrying someone else's message. */
  readonly rethrown: number;
  /** `throw at.type`…`` — a refusal whose head came from a binding (#2487). */
  readonly raised: number;
  /** Any other `throw` shape. Zero today; a new one has to be classified. */
  readonly otherShape: number;
  /** Every `throw` in the tree — the throw partition's total. */
  readonly throwStatements: number;
  /**
   * Every error CONSTRUCTION — the bare-message tier's own total (#2493). A
   * separate subject from `throwStatements`, deliberately: that partition guards
   * against a new THROW shape, this one against a refusal that never throws here.
   */
  readonly constructions: number;
  /** Of those, the ones whose message text is in the tree. */
  readonly judged: number;
  /** Files the glob reached — reach, asserted apart from recognition. */
  readonly files: number;
  /** Constructions carrying O-1's marker — admissible without a bracket. */
  readonly marked: number;
  /** ``internalDefect.plain`…` `` sites, which write no literal message. */
  readonly defects: number;
  /** Bracketed heads reaching a bag through a variable — bounded, not judged. */
  readonly variableFed: number;
}

/**
 * The class a `throw` falls into — the partition's single decision point.
 *
 * ⚠ An EMPTY template head is a message opening with a substitution
 * (`` `${PREFIX} …` ``), whose prefix is real but is not in the tree. Judging it
 * would report a prefixed message as BARE and forbid a legal refactor, so it
 * joins the unjudgeable rather than the offenders.
 */
/** `at.type`, `atRouter.plain`, `internalDefect.plain`, `at.code(code)` — and nothing else. */
function isRaiserTag(tag: ts.Expression): boolean {
  const member = ts.isCallExpression(tag) ? tag.expression : tag;

  return (
    ts.isPropertyAccessExpression(member) &&
    ts.isIdentifier(member.expression) &&
    ["type", "plain", "ref", "range", "code"].includes(member.name.text)
  );
}

type Seen =
  | {
      readonly kind: "literal";
      readonly text: string;
      readonly argument: ts.Expression;
    }
  | {
      readonly kind:
        "opaque" | "wrapped" | "rethrown" | "raised" | "otherShape";
    };

function classify(thrown: ts.Expression): Seen {
  // A raiser or `internalDefect` throw: the head is the BINDING, so there is no
  // literal here to read. Its head is judged where it is written — by tier one on
  // the binding, and by #2479 against the public call surface.
  //
  // ⚠ The FLAVOUR is part of the test. `isTaggedTemplateExpression` alone would
  // count any tagged template thrown anywhere as a converted refusal, and the floor
  // below would then be satisfied by something that is not one.
  if (ts.isTaggedTemplateExpression(thrown) && isRaiserTag(thrown.tag)) {
    return { kind: "raised" };
  }

  if (ts.isCallExpression(thrown)) {
    return { kind: "wrapped" };
  }

  if (ts.isIdentifier(thrown)) {
    return { kind: "rethrown" };
  }

  if (!ts.isNewExpression(thrown)) {
    return { kind: "otherShape" };
  }

  const argument = thrown.arguments?.[0];
  const text = argument === undefined ? undefined : textOf(argument);

  return argument === undefined || text === undefined || text === ""
    ? { kind: "opaque" }
    : { kind: "literal", text, argument };
}

/**
 * The five constructors a refusal is built from. The bare-message tier judges a
 * CONSTRUCTION (#2493), because a refusal reaches a caller by three channels —
 * thrown where it is built, returned into `Promise.reject`, or built here and
 * thrown by someone else — and only the first is a `throw`.
 */
const ERROR_CONSTRUCTORS: ReadonlySet<string> = new Set([
  "TypeError",
  "Error",
  "RangeError",
  "ReferenceError",
  "RouterError",
]);

/**
 * Where a construction keeps its message. `new RouterError(code, { message })`
 * puts it in the bag and its FIRST argument is the code, so reading argument 0
 * for every constructor counts a code-only refusal as a message.
 */
function messageOfConstruction(
  node: ts.NewExpression,
): ts.Expression | undefined {
  const args = node.arguments ?? [];

  const fromBag = (): ts.Expression | undefined => {
    for (const argument of args) {
      if (!ts.isObjectLiteralExpression(argument)) {
        continue;
      }

      for (const property of argument.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          property.name.getText() === "message"
        ) {
          return property.initializer;
        }
      }
    }

    return undefined;
  };

  if (node.expression.getText() === "RouterError") {
    return fromBag();
  }

  const [first] = args;

  if (first === undefined) {
    return undefined;
  }

  return ts.isObjectLiteralExpression(first) ? fromBag() : first;
}

/**
 * A name bound to a bracketed literal, by declaration or by assignment — the
 * left half of О-6's shape. The right half, a `RouterError` bag consuming that
 * name, is a text match in the same file.
 *
 * ⚠ Both spellings, deliberately. Measured: with only the assignment form, a
 * planted `const` site passed the bound this feeds.
 */
/**
 * Which bucket an error CONSTRUCTION falls in — the bare-message tier's subject,
 * whatever carries the error to the caller afterwards.
 */
/**
 * Raiser uses that the head tier cannot read (#2487).
 *
 * The tier reads `const at = raiser(receiver, door)` and nothing else. Measured,
 * four other spellings carry a head it never judges: an aliased import, an
 * inline call with no binding, a reassignment, and a destructured flavour. Rather
 * than teach four shapes — and still miss a raiser returned from a helper — the
 * OTHER spellings are refused, which makes the tier's reach exhaustive by
 * construction.
 */
function unreadableRaiserUses(root: string = SRC): string[] {
  const found: string[] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );
    const where = path.relative(root, file);

    const visit = (node: ts.Node): void => {
      // An alias would make the callee text below lie about which function it is.
      if (
        ts.isImportSpecifier(node) &&
        node.propertyName !== undefined &&
        ["raiser", "internalDefect"].includes(node.propertyName.text)
      ) {
        found.push(`${where} · imported under an alias`);
      }

      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "raiser" &&
        !(
          node.parent !== undefined &&
          ts.isVariableDeclaration(node.parent) &&
          ts.isIdentifier(node.parent.name)
        )
      ) {
        found.push(`${where} · not bound to a name`);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found.toSorted(byteOrder);
}

function classifyConstruction(
  node: ts.Node,
  source: ts.SourceFile,
):
  | { readonly kind: "none" }
  | { readonly kind: "unjudged" }
  | { readonly kind: "marked" }
  | { readonly kind: "headed" }
  | { readonly kind: "bare"; readonly shape: string } {
  if (
    !ts.isNewExpression(node) ||
    !ERROR_CONSTRUCTORS.has(node.expression.getText())
  ) {
    return { kind: "none" };
  }

  const message = messageOfConstruction(node);
  const text = message === undefined ? undefined : textOf(message);

  if (message === undefined || text === undefined || text === "") {
    return { kind: "unjudged" };
  }

  if (text.startsWith(INTERNAL_DEFECT)) {
    return { kind: "marked" };
  }

  return text.startsWith("[")
    ? { kind: "headed" }
    : { kind: "bare", shape: shapeOf(message, source) };
}

function bracketedNameOf(node: ts.Node): string | undefined {
  let name: string | undefined;
  let value: ts.Expression | undefined;

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(node.left)
  ) {
    name = node.left.text;
    value = node.right;
  } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    name = node.name.text;
    value = node.initializer;
  }

  if (
    name === undefined ||
    value === undefined ||
    !(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ||
    !value.text.startsWith("[")
  ) {
    return undefined;
  }

  return name;
}

function refusals(root: string = SRC): Refusals {
  const bare: string[] = [];
  let literals = 0;
  let opaque = 0;
  let wrapped = 0;
  let rethrown = 0;
  let raised = 0;
  let otherShape = 0;
  let throwStatements = 0;
  let constructions = 0;
  let judged = 0;
  let marked = 0;
  let defects = 0;
  let variableFed = 0;
  let files = 0;

  for (const file of globSync(`${root}/**/*.ts`)) {
    files++;

    const fileText = readFileSync(file, "utf8");
    const fed: string[] = [];
    const source = ts.createSourceFile(
      file,
      fileText,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const walk = (node: ts.Node): void => {
      if (ts.isThrowStatement(node)) {
        throwStatements++;

        const seen = classify(node.expression);

        switch (seen.kind) {
          case "wrapped": {
            wrapped++;

            break;
          }
          case "rethrown": {
            rethrown++;

            break;
          }
          case "raised": {
            raised++;

            break;
          }
          case "otherShape": {
            otherShape++;

            break;
          }
          case "opaque": {
            opaque++;

            break;
          }
          default: {
            literals++;
          }
        }
      }

      const construction = classifyConstruction(node, source);

      switch (construction.kind) {
        case "none": {
          break;
        }
        case "unjudged": {
          constructions++;

          break;
        }
        case "marked": {
          constructions++;
          judged++;
          marked++;

          break;
        }
        case "headed": {
          constructions++;
          judged++;

          break;
        }
        default: {
          constructions++;
          judged++;
          bare.push(`${path.relative(root, file)} · ${construction.shape}`);
        }
      }

      // A bracketed literal assigned to a NAME that a `RouterError` bag later
      // consumes. О-6's ratified answer is to bound the count rather than judge
      // the shape: the only detector is a same-file heuristic, and a heuristic
      // in a gate decides cases nobody reviewed.
      const fedName = bracketedNameOf(node);

      if (fedName !== undefined) {
        fed.push(fedName);
      }

      // A site raising through O-1's marker writes no literal message at all,
      // so the construction walk above cannot see it. Counted here, and floored
      // below, so the form stays visible rather than silently unwatched.
      if (
        ts.isTaggedTemplateExpression(node) &&
        boundNameOfTag(node.tag) === "internalDefect"
      ) {
        defects++;
      }

      ts.forEachChild(node, walk);
    };

    walk(source);

    for (const name of fed) {
      if (new RegExp(String.raw`message:\s*${name}\b`, "u").test(fileText)) {
        variableFed++;
      }
    }
  }

  return {
    bare: bare.toSorted(byteOrder),
    literals,
    opaque,
    wrapped,
    rethrown,
    raised,
    otherShape,
    throwStatements,
    constructions,
    judged,
    files,
    marked,
    defects,
    variableFed,
  };
}

/** Byte order, so the frozen register reads the same on any locale. */
function byteOrder(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

describe("a refusal with no prefix at all is registered, not invisible (#2456)", () => {
  it("no literal refusal in core is left without a prefix", () => {
    // Was "the backlog is exactly this, and it only shrinks" while rows
    // remained (#2456). Adjudicated to empty in #2459, so the claim is now the
    // statement itself rather than a list — the same assertion, one register
    // later. It reds on a new bare refusal; the two controls named in the
    // docblock are what keep it from passing on a broken recogniser.
    expect(refusals().bare).toStrictEqual([...BARE].toSorted(byteOrder));
  });

  it("CONTROL — every throw in the tree lands in exactly one class", () => {
    // ⚑ A PARTITION, not two lower bounds. The rule judges `throw new
    // X(<literal>)`; the first draft asserted only that it had seen some of
    // those, which left 58 throws — every factory call and every re-throw —
    // counted by nothing, so a shape the rule cannot judge could arrive in
    // silence. The sum is what makes an unjudgeable shape still VISIBLE.
    const seen = refusals();

    expect(
      seen.literals +
        seen.opaque +
        seen.wrapped +
        seen.rethrown +
        seen.raised +
        seen.otherShape,
    ).toBe(seen.throwStatements);
    // No shape outside the five the partition names.
    expect(seen.otherShape).toBe(0);
  });

  it("CONTROL — the glob reaches the tree, and the rule recognises most of it", () => {
    // Two separate claims, deliberately not one. A narrowed glob moves `files`;
    // a broken recogniser moves `literals`. The first draft conflated them in a
    // single `literals > 60` against a measured 90, so a glob narrowed to a handful
    // of files still passed. Both floors sit close under what is measured today.
    const seen = refusals();

    expect(seen.files).toBeGreaterThan(120);
    expect(seen.throwStatements).toBeGreaterThan(130);
    // ⚠ The SUM, not the two halves. A conversion moves a site from `literals` to
    // `raised` and leaves the total alone — measured, 87 on both sides of step 3 —
    // so ONE floor holds from the first family to the last. Two would need re-basing
    // at every family, and a floor lowered by reflex is a floor that stopped
    // guarding: the recogniser it watches can break by exactly the amount the last
    // conversion moved.
    expect(seen.literals + seen.raised).toBeGreaterThan(80);
    // The construction subject carries its own floors (#2493), because a broken
    // construction walk empties `bare` exactly the way a broken throw walk does,
    // and the floors above cannot see it: they count throws.
    // ⚠ Summed with the converted half, for the reason the literal floor is.
    // Measured across steps 3 and 4: `constructions + raised` is 151 and
    // `judged + raised` is 115 on both sides of every conversion, because a
    // conversion MOVES a site between the two rather than removing one.
    expect(seen.constructions + seen.raised).toBeGreaterThan(130);
    expect(seen.judged + seen.raised).toBeGreaterThan(95);
    // O-1's marker is recognised rather than registered, and a recogniser that
    // stopped matching would empty this without emptying anything above.
    expect(seen.marked).toBeGreaterThan(0);
  });

  it("the variable-fed head does not spread (О-6, ratified 2026-09-22)", () => {
    // A bracketed literal assigned to a name a `RouterError` bag later consumes
    // is the one shape neither tier can judge: the authority reads the bag's
    // expression and finds an identifier. Teaching it would put a same-file
    // heuristic inside a gate, so the count is BOUNDED instead — a new site of
    // this shape reds here without any door being judged.
    const seen = refusals();

    expect(seen.variableFed).toBeLessThanOrEqual(3);
  });

  it("CONTROL — the variable-fed detector still finds one", () => {
    // ⚠ The anti-vacuum half cannot be a floor on the live count. Step 5 converts
    // `EventBusNamespace`, which holds all three, and the count then reaches zero
    // BY DESIGN — a floor there would red on the work succeeding, and the reflex
    // would be to lower it, which is how a ratchet stops ratcheting.
    const directory = mkdtempSync(path.join(tmpdir(), "variable-fed-"));

    try {
      writeFileSync(
        path.join(directory, "fed.ts"),
        'const phase = "[router] cannot commit";\n' +
          "throw new RouterError(code, { message: phase });\n",
      );

      expect(refusals(directory).variableFed).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — only a raiser flavour counts as converted", () => {
    // Without this the shape test has no oracle: core throws no other tagged
    // template today, so dropping it leaves the suite green while the sum floor
    // above becomes satisfiable by something that is not a refusal at all.
    const directory = mkdtempSync(path.join(tmpdir(), "raised-shape-"));

    try {
      writeFileSync(
        path.join(directory, "converted.ts"),
        'const at = raiser("router", "buildPath");\nthrow at.type`Missing ${name}`;\n',
      );
      writeFileSync(
        path.join(directory, "unrelated.ts"),
        "throw sql`select ${id}`;\n",
      );

      const seen = refusals(directory);

      expect(seen.raised).toBe(1);
      expect(seen.otherShape).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — the marker is admissible, a bare message is not, and raise sites are counted", () => {
    // `defects` is zero in the tree today — step 6 of #2487 is what converts the
    // FSM onto this form — so a floor on it would be vacuous. Its detector is
    // controlled here instead.
    const directory = mkdtempSync(path.join(tmpdir(), "marker-"));

    try {
      writeFileSync(
        path.join(directory, "marked.ts"),
        "throw new Error(`Internal error (please report): ${why}`);\n",
      );
      writeFileSync(
        path.join(directory, "bare.ts"),
        "throw new Error(`Circular forwardTo: ${chain}`);\n",
      );
      writeFileSync(
        path.join(directory, "raised.ts"),
        "throw internalDefect.plain`unreachable: ${why}`;\n",
      );

      const seen = refusals(directory);

      expect(seen.bare).toStrictEqual(["bare.ts · Circular forwardTo: ${}"]);
      expect(seen.marked).toBe(1);
      expect(seen.defects).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — both polarities, on a tree written for the purpose", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "bare-prefix-"));

    try {
      writeFileSync(
        path.join(directory, "bare.ts"),
        "throw new Error(`no prefix here: ${x}`);\n",
      );
      writeFileSync(
        path.join(directory, "prefixed.ts"),
        "throw new TypeError(`[router.addRoute] fine`);\n",
      );
      writeFileSync(
        path.join(directory, "opaque.ts"),
        "throw new Error(buildMessage(x));\n",
      );
      // ⚠ A factory-wrapped throw is judged by its CONSTRUCTION (#2493): the
      // message is in the tree, so this fixture belongs in `bare` — while the
      // THROW partition still counts it `wrapped`, because that is its throw.
      writeFileSync(
        path.join(directory, "wrapped.ts"),
        "throw freezeThrownError(new Error(`bare inside a factory`));\n",
      );
      // The bag, and a construction that never reaches a `throw` at all — the two
      // channels #2493 added. Both must be judged like any other refusal.
      writeFileSync(
        path.join(directory, "bag.ts"),
        "throw freezeThrownError(new RouterError(CODE, { message: `no prefix in a bag` }));\n",
      );
      writeFileSync(
        path.join(directory, "rejected.ts"),
        "const p = Promise.reject(new Error(`bare and never thrown`));\n",
      );
      writeFileSync(
        path.join(directory, "rethrown.ts"),
        "try { f(); } catch (error) { throw error; }\n",
      );
      writeFileSync(
        path.join(directory, "hoisted-prefix.ts"),
        "throw new Error(`${PREFIX} prefixed, but not in the tree`);\n",
      );
      // Recursion: a bare throw one directory down must still be found.
      mkdirSync(path.join(directory, "nested"));
      writeFileSync(
        path.join(directory, "nested", "deep.ts"),
        "throw new Error(`deeper and bare`);\n",
      );

      const seen = refusals(directory);

      expect(seen.bare).toStrictEqual([
        "bag.ts · no prefix in a bag",
        "bare.ts · no prefix here: ${}",
        "nested/deep.ts · deeper and bare",
        "rejected.ts · bare and never thrown",
        "wrapped.ts · bare inside a factory",
      ]);
      // The two subjects, side by side: `literals` counts THROWS whose message is
      // a literal (bare, prefixed, deep); `constructions` counts every error
      // built, whatever carries it afterwards.
      expect(seen.literals).toBe(3);
      expect(seen.constructions).toBe(8);
      expect(seen.judged).toBe(6);
      // `buildMessage(x)` and the hoisted-prefix template, which is prefixed at
      // runtime and would be a FALSE offender if the empty head were judged.
      expect(seen.opaque).toBe(2);
      // Two, because `bag.ts` is a second factory-wrapped throw.
      expect(seen.wrapped).toBe(2);
      expect(seen.rethrown).toBe(1);
      expect(seen.files).toBe(9);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
