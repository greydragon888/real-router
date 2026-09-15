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
 * A message prefix names something the caller can look up (#1845).
 *
 * `[router.buildPath] Missing required param 'id'` is what
 * `router.buildPath("route", {})` printed. The caller wrote `buildPath`; they
 * cannot grep `SegmentMatcher` in their own code, cannot find it on the exports
 * map, and cannot find it in the wiki. #1819 retired `[search-params]` on that
 * reasoning and this is the remainder of the same class.
 *
 * ⚑ **Two prefixes are admissible, and both name something published.**
 * `[router…]` is the facade a caller typed. `[RouterError…]` is a root export, so
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
const PUBLISHED = /^\[(router(\.[A-Za-z$.{}]+)?|RouterError(\.[A-Za-z]+)?)\]$/u;

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
