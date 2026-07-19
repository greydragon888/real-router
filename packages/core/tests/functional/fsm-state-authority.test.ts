// #1169 state-authority invariant: the router FSM's committed state can only
// change through the transition TABLE (`send()`), never a direct bypass. The
// `forceState()` escape hatch (#307) — a direct `#state`/`#currentTransitions`
// write that skipped actions and listeners — was the mechanism behind the
// #1169 resurrection class (a `stop()`/`dispose()` from a transition listener
// could re-force the FSM out of IDLE/DISPOSED). The E′ refactor routed every
// navigation transition through the table and the primitive was removed from
// `@real-router/fsm` outright. This test is the PERMANENT lock, in two layers:
//
//   1. Root — the bypass primitive stays gone: the FSM engine exposes no
//      `forceState`. Re-adding it (e.g. "just for a hot-path optimization")
//      reds this immediately, before core can even call it. This is the layer
//      with real mutation-discriminating power — re-adding the method to
//      `packages/fsm/src/fsm.ts` fails this test.
//   2. Defense in depth (RFC §6.7 "no forceState in core") — a static scan of
//      the ENTIRE core `src` graph asserts core never reads `.forceState`, so
//      even if the primitive ever returns to the engine, core still cannot use
//      it to resurrect the FSM. (Comments that document the removal are AST
//      comments, not property accesses, so they do not trip the scan.)

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`); also what import-x/no-named-as-default-member expects now
// that the graph analysis is alive (#1525).
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { FSM } from "../../src/foundation/fsm";

const SRC_DIR = path.resolve(__dirname, "../../src");

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }

  return out;
}

/** 1-based line numbers of any `<expr>.forceState` / `<expr>["forceState"]` access. */
function forceStateAccesses(file: string): number[] {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const hits: number[] = [];

  const visit = (node: ts.Node): void => {
    const isDotAccess =
      ts.isPropertyAccessExpression(node) && node.name.text === "forceState";
    const isBracketAccess =
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "forceState";

    if (isDotAccess || isBracketAccess) {
      hits.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return hits;
}

describe("FSM state-authority invariant — no forceState bypass (#1169)", () => {
  it("the FSM engine exposes no forceState() method (the bypass primitive stays removed)", () => {
    // Prototype method, static, or instance field — none of the shapes a
    // re-introduced forceState could take should exist.
    expect("forceState" in FSM.prototype).toBe(false);
    expect("forceState" in FSM).toBe(false);
  });

  it("core src never accesses .forceState — the transition table is the sole state authority", () => {
    const offenders = tsFiles(SRC_DIR)
      .map((file) => ({
        file: path.relative(SRC_DIR, file),
        lines: forceStateAccesses(file),
      }))
      .filter((offender) => offender.lines.length > 0);

    expect(offenders).toStrictEqual([]);
  });
});
