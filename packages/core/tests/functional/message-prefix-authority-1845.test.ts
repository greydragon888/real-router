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
 * ⚑ **`CORE_INTERNAL` is the second tier, and registering a prefix there is the
 * STATEMENT, not an exemption.** A prefix belongs to it when no caller input can
 * reach the message, so arriving at one is a bug in this package rather than a
 * mistake in the application — and then naming the internal class is the most
 * useful thing the message can do, because the reader who needs it is working on
 * core. Measured for the two entries below: `FSM` is on neither the exports map
 * nor `src/index.ts`, its sole construction (`routerFSM.ts`) passes core's own
 * module-level `routerTransitions` literal, and nothing from options or routes
 * reaches it, so every one of its six messages is about core's own table.
 *
 * ⚠ The register is what #1845 asked for over a rename here: collapsing the two
 * would cost a discriminator. `fsm.test.ts` pins `state "GHOST" is not declared
 * in config.transitions` under BOTH prefixes, and the prefix is the only thing
 * that tells the two cells apart.
 *
 * ⚠ **An ARGUMENT, not any bracketed literal.** Computed keys
 * (`[routerStates.STARTING]: …`) and ordinary values (`"[dynamic]"` for a
 * callback `forwardTo`) are bracketed strings that are not messages, and a
 * text scan counts them. Walking arguments of a call or a `new` is what
 * discriminates — measured, it is the difference between 24 sites and 30.
 */
const SRC = path.resolve(__dirname, "../../src");

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
 * Tier two: unreachable from caller input, so the internal name is the useful
 * one. Each entry carries its reason in the docblock above; adding one without
 * measuring that reachability is what this list exists to make deliberate.
 */
const CORE_INTERNAL: ReadonlySet<string> = new Set([
  "[FSM.constructor]",
  "[FSM.on]",
]);

interface Offender {
  readonly file: string;
  readonly prefix: string;
}

const prefixOf = (text: string): string | undefined =>
  /^\[[^\]]+\]/u.exec(text)?.[0];

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

      if (
        prefix !== undefined &&
        !PUBLISHED.test(prefix) &&
        !CORE_INTERNAL.has(prefix)
      ) {
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

  it("CONTROL — every CORE_INTERNAL entry is still raised somewhere", () => {
    // A register whose entries no longer exist stops being a statement and
    // becomes slack: the next prefix of that shape would be admitted by a name
    // nothing raises. Both tiers red when a member leaves.
    const raised = new Set<string>();

    for (const file of globSync(`${SRC}/**/*.ts`)) {
      const text = readFileSync(file, "utf8");

      for (const entry of CORE_INTERNAL) {
        if (text.includes(entry)) {
          raised.add(entry);
        }
      }
    }

    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect([...raised].toSorted(byName)).toStrictEqual(
      [...CORE_INTERNAL].toSorted(byName),
    );
  });

  it("CONTROL — the walk reads messages at all, so an empty result means clean", () => {
    // Without this, a change to the AST shapes walked empties the result and the
    // assertion above passes over files it never inspected.
    let messages = 0;

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
              messages++;
            }
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }

    expect(messages).toBeGreaterThan(50);
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
 * ⚠ The WHOLE argument, not its leftmost operand: two of the rows below are `+`
 * chains, and rendering only the head made the row hold half a message — so a
 * `printWidth` change that re-split the chain moved the row while the message
 * stayed byte-identical.
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
}

/**
 * The class a `throw` falls into — the partition's single decision point.
 *
 * ⚠ An EMPTY template head is a message opening with a substitution
 * (`` `${PREFIX} …` ``), whose prefix is real but is not in the tree. Judging it
 * would report a prefixed message as BARE and forbid a legal refactor, so it
 * joins the unjudgeable rather than the offenders.
 */
type Seen =
  | {
      readonly kind: "literal";
      readonly text: string;
      readonly argument: ts.Expression;
    }
  | { readonly kind: "opaque" | "wrapped" | "rethrown" | "otherShape" };

function classify(thrown: ts.Expression): Seen {
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

function refusals(root: string = SRC): Refusals {
  const bare: string[] = [];
  let literals = 0;
  let opaque = 0;
  let wrapped = 0;
  let rethrown = 0;
  let otherShape = 0;
  let throwStatements = 0;
  let constructions = 0;
  let judged = 0;
  let files = 0;

  for (const file of globSync(`${root}/**/*.ts`)) {
    files++;

    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
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

      // The bare-message tier's own subject: every error CONSTRUCTION, whatever
      // carries it to the caller afterwards.
      if (
        ts.isNewExpression(node) &&
        ERROR_CONSTRUCTORS.has(node.expression.getText())
      ) {
        constructions++;

        const message = messageOfConstruction(node);
        const text = message === undefined ? undefined : textOf(message);

        if (message !== undefined && text !== undefined && text !== "") {
          judged++;

          if (!text.startsWith("[")) {
            bare.push(
              `${path.relative(root, file)} · ${shapeOf(message, source)}`,
            );
          }
        }
      }

      ts.forEachChild(node, walk);
    };

    walk(source);
  }

  return {
    bare: bare.toSorted(byteOrder),
    literals,
    opaque,
    wrapped,
    rethrown,
    otherShape,
    throwStatements,
    constructions,
    judged,
    files,
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
        seen.otherShape,
    ).toBe(seen.throwStatements);
    // No shape outside the four the partition names.
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
    expect(seen.literals).toBeGreaterThan(80);
    // The construction subject carries its own floors (#2493), because a broken
    // construction walk empties `bare` exactly the way a broken throw walk does,
    // and the floors above cannot see it: they count throws.
    expect(seen.constructions).toBeGreaterThan(130);
    expect(seen.judged).toBeGreaterThan(95);
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
