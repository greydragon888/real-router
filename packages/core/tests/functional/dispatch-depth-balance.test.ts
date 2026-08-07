// #1034 / #1178, structural half — every `#dispatchDepth` increment is restored
// in a `finally`.
//
// The counter is what `Router.#assertNotReentrant` reads, so a single leaked
// increment does not fail one navigation: it bans EVERY later top-level
// navigate, for the life of the router, with a false REENTRANT_NAVIGATION.
// `dispatch-depth-reset.properties.ts` is the behavioural half and it is
// mutation-proven — but its domain is a sequence of navigate outcomes, so it
// reaches six of the seven raise sites and cannot reach the seventh.
//
// The seventh is the `$start` emit (#1647). Its leak is not merely uncovered,
// it is behaviourally UNREACHABLE: a leak needs `emit` itself to throw, and
// every path into the emitter's error sink is isolated twice — `#invokeIsolated`
// catches the listener, and `RouterLogger.#invokeCallback` catches the user
// callback the sink ends in. Measured: stripping that site's `finally` reds
// nothing across the functional and property tiers. So the guarantee there is
// structural, and so is its guard.
//
// Checking the SHAPE rather than the behaviour is also what makes this survive
// an eighth site: a new raise added without a `finally` fails here on the day it
// is written, before anything routes user code through it.

import { readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `fsm-state-authority.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const EVENT_BUS = path.resolve(
  __dirname,
  "../../src/namespaces/EventBusNamespace/EventBusNamespace.ts",
);

const FIELD = "#dispatchDepth";

/**
 * A scan that reads CODE has to be mutated on the SHAPE of the code, not only
 * on its semantics — otherwise what gets validated is the parser (#1683).
 *
 * This one matched postfix `++` alone, so the same eighth raise site with no
 * restore at all was caught when written `this.#dispatchDepth++` and invisible
 * as `++this.#dispatchDepth` or `this.#dispatchDepth += 1`: `raises` stayed 7,
 * the balance held, and the "restore outside a `finally`" set stayed empty —
 * all three assertions missed it at once. RFC-1647 §11 п.10 recorded the pin as
 * mutationally validated on two forms, and both had been written postfix; the
 * variation was semantic, never syntactic.
 *
 * So the classifier below is deliberately TOTAL over writes: every write to the
 * field is collected, and one that is neither a raise nor a restore in
 * canonical form is `unclassified` — a violation in itself, rather than
 * something the scan quietly ignores. A form nobody anticipated then reds on
 * the day it is written instead of on the day someone audits the pin again.
 */
type WriteKind = "raise" | "restore" | "unclassified";

interface Write {
  readonly line: number;
  readonly kind: WriteKind;
  /** The source form, so a failure names what it found rather than a count. */
  readonly text: string;
  readonly insideFinally: boolean;
}

/** Is `node` lexically inside the `finally` block of some enclosing `try`? */
function isInsideFinally(node: ts.Node): boolean {
  for (
    let current = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    const { parent } = current;

    if (
      parent !== undefined &&
      ts.isTryStatement(parent) &&
      parent.finallyBlock === current
    ) {
      return true;
    }
  }

  return false;
}

function parse(name: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
}

/** Does this expression read or write the counter itself? */
function isDepthAccess(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === FIELD;
}

function isLiteralOne(node: ts.Expression): boolean {
  return ts.isNumericLiteral(node) && node.text === "1";
}

/**
 * `undefined` when the node does not WRITE the counter — `this.#dispatchDepth`
 * also appears in a comparison (`> 0`) and could appear under `-` / `!` / `~`,
 * and none of those is a mutation.
 */
function classifyWrite(node: ts.Node): WriteKind | undefined {
  if (
    (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
    isDepthAccess(node.operand)
  ) {
    if (node.operator === ts.SyntaxKind.PlusPlusToken) {
      return "raise";
    }

    if (node.operator === ts.SyntaxKind.MinusMinusToken) {
      return "restore";
    }

    return undefined;
  }

  if (!ts.isBinaryExpression(node) || !isDepthAccess(node.left)) {
    return undefined;
  }

  const operator = node.operatorToken.kind;

  // The whole assignment family — 16 operators including `||=` / `&&=` / `??=`
  // — sits in this range, and every comparison sits outside it. Verified
  // against the compiler rather than enumerated by hand, so a future operator
  // is covered by construction.
  if (
    operator < ts.SyntaxKind.FirstAssignment ||
    operator > ts.SyntaxKind.LastAssignment
  ) {
    return undefined;
  }

  if (operator === ts.SyntaxKind.PlusEqualsToken && isLiteralOne(node.right)) {
    return "raise";
  }

  if (operator === ts.SyntaxKind.MinusEqualsToken && isLiteralOne(node.right)) {
    return "restore";
  }

  // `= 0`, `+= 2`, `??= 1`, … — a write to the counter that is not a balanced
  // step. Silence here is what #1683 was.
  return "unclassified";
}

function depthWrites(sf: ts.SourceFile): Write[] {
  const hits: Write[] = [];

  const visit = (node: ts.Node): void => {
    const kind = classifyWrite(node);

    if (kind !== undefined) {
      hits.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        kind,
        text: node.getText(sf).replaceAll(/\s+/g, " "),
        insideFinally: isInsideFinally(node),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return hits;
}

describe(`#1034 — every ${FIELD} increment is restored in a finally`, () => {
  const writes = depthWrites(parse(EVENT_BUS, readFileSync(EVENT_BUS, "utf8")));
  const raises = writes.filter((w) => w.kind === "raise");
  const restores = writes.filter((w) => w.kind === "restore");

  it("finds every raise site — the scan is not vacuously green", () => {
    // Positive control, and a deliberate tripwire: adding a raise site is a
    // decision about the reentrancy ban's reach (a plugin `onStart` came under
    // it this way, #1647), so it should be made on purpose and land here.
    // Five `emitTransition*` + the sync `subscribeLeave` batch + `$start`.
    expect(raises).toHaveLength(7);
  });

  it("balances every raise with a restore", () => {
    expect(restores).toHaveLength(raises.length);
  });

  it("restores the depth in a `finally`, never on the straight line", () => {
    // The whole point: a restore that is merely the next statement is skipped
    // when the emit throws, and the counter never comes back down.
    expect(restores.filter((w) => !w.insideFinally)).toStrictEqual([]);
  });

  it("writes the counter only as a balanced step (#1683)", () => {
    // Every write is one of the two canonical steps. A `= 0` reset, a `+= 2`,
    // or an operator nobody has thought of yet lands here instead of being
    // dropped on the floor — which is what let three of the assertions above
    // pass over a genuine leak.
    expect(writes.filter((w) => w.kind === "unclassified")).toStrictEqual([]);
  });
});

// ============================================================================
// The scan's own pattern, pinned — the defect #1683 actually was
// ============================================================================

describe("the scan reads every form a step can be written in (#1683)", () => {
  // Synthetic source rather than the real file: the three forms are
  // semantically identical, so no mutation of `EventBusNamespace.ts` can show
  // that the classifier handles all of them — only that it handles the one
  // that happens to be written there. This is the assertion whose absence let
  // a postfix-only scan be recorded as mutationally validated.
  const SAMPLE = `
    class Probe {
      ${FIELD} = 0;

      postfix(): void { this.${FIELD}++; this.${FIELD}--; }
      prefix(): void { ++this.${FIELD}; --this.${FIELD}; }
      compound(): void { this.${FIELD} += 1; this.${FIELD} -= 1; }
      reads(): boolean { return this.${FIELD} > 0 && -this.${FIELD} < 0; }
      strange(): void { this.${FIELD} = 0; this.${FIELD} += 2; }
    }
  `;

  const writes = depthWrites(parse("sample.ts", SAMPLE));

  it("counts a raise in all three spellings", () => {
    expect(
      writes.filter((w) => w.kind === "raise").map((w) => w.text),
    ).toStrictEqual([
      `this.${FIELD}++`,
      `++this.${FIELD}`,
      `this.${FIELD} += 1`,
    ]);
  });

  it("counts a restore in all three spellings", () => {
    expect(
      writes.filter((w) => w.kind === "restore").map((w) => w.text),
    ).toStrictEqual([
      `this.${FIELD}--`,
      `--this.${FIELD}`,
      `this.${FIELD} -= 1`,
    ]);
  });

  it("flags a write that is not a balanced step", () => {
    expect(
      writes.filter((w) => w.kind === "unclassified").map((w) => w.text),
    ).toStrictEqual([`this.${FIELD} = 0`, `this.${FIELD} += 2`]);
  });

  it("ignores reads, including the field declaration", () => {
    // `> 0` is the ban's own predicate and `-x` is not a mutation; the class
    // field's `= 0` initializer is a declaration, not an assignment, so none of
    // the three may appear. Without this the classifier could satisfy every
    // assertion above by calling everything a write.
    expect(writes).toHaveLength(8);
  });
});
