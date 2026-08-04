// #1665 — the two reentrancy bans must never ship a bare code.
//
// `REENTRANT_NAVIGATION` and `REENTRANT_TREE_MUTATION` are not state errors.
// `ROUTER_DISPOSED` / `SAME_STATES` / `TRANSITION_CANCELLED` describe a
// SITUATION, and the remedy follows from the name — which is why 39 of core's
// `new RouterError(` sites are deliberately bare and `constants.ts` says so.
// These two name a RULE the caller broke, and the remedy (defer) follows from
// nothing. While it lived only in the docs it produced two issues — #1203 (an
// auth-redirect plugin written per the wiki threw at runtime) and #1219 — both
// closed by patching prose, which left the error saying nothing and the next
// surface free to spawn the same issue again.
//
// The behavioural pins live where each ban is exercised: `reentrant-ban.test.ts`
// (a router event listener), `pre-start-window-1610.test.ts` (an interceptor —
// a DIFFERENT window with its own text, because "you are inside a listener" is
// false there and reads as a spurious error), and `reentrant-crud-ban.test.ts`.
//
// This file is the CLASS lock, and it exists for the site that does not exist
// yet: a third ban added later would ship bare and no behavioural test would
// notice, because a new site arrives without one. An AST scan sees every
// construction of these two codes across the whole `src` graph, and ignores the
// comments that discuss them.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `fsm-state-authority.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

const REENTRANCY_CODES = new Set([
  "REENTRANT_NAVIGATION",
  "REENTRANT_TREE_MUTATION",
]);

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }

  return out;
}

interface Construction {
  readonly site: string;
  readonly code: string;
  readonly hasMessage: boolean;
}

/** Every `new RouterError(errorCodes.<CODE>, …)` in one file. */
function reentrancyConstructions(file: string): Construction[] {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const hits: Construction[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RouterError"
    ) {
      const [codeArg, optionsArg] = node.arguments ?? [];
      const code =
        codeArg &&
        ts.isPropertyAccessExpression(codeArg) &&
        ts.isIdentifier(codeArg.expression) &&
        codeArg.expression.text === "errorCodes"
          ? codeArg.name.text
          : undefined;

      if (code !== undefined && REENTRANCY_CODES.has(code)) {
        const hasMessage =
          optionsArg !== undefined &&
          ts.isObjectLiteralExpression(optionsArg) &&
          optionsArg.properties.some(
            (property) =>
              property.name !== undefined &&
              ts.isIdentifier(property.name) &&
              property.name.text === "message",
          );

        hits.push({
          site: `${path.relative(SRC_DIR, file)}:${
            sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
          }`,
          code,
          hasMessage,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return hits;
}

describe("#1665 — the reentrancy bans carry their remedy, not a bare code", () => {
  const constructions = tsFiles(SRC_DIR).flatMap((file) =>
    reentrancyConstructions(file),
  );

  it("finds both bans — the scan itself is not vacuously green", () => {
    // Positive control. Without it the assertion below passes on an empty set,
    // i.e. exactly when the scan has stopped working. Counted rather than
    // listed, so the file-walk order is not part of the contract: the
    // navigation ban is TWO constructions because its two windows say
    // different things (a listener vs an interceptor).
    const byCode: Record<string, number> = {};

    for (const { code } of constructions) {
      byCode[code] = (byCode[code] ?? 0) + 1;
    }

    expect(byCode).toStrictEqual({
      REENTRANT_NAVIGATION: 2,
      REENTRANT_TREE_MUTATION: 1,
    });
  });

  it("constructs neither code without a message", () => {
    expect(constructions.filter((c) => !c.hasMessage)).toStrictEqual([]);
  });
});
