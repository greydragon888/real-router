// The router FSM diagrams must equal the router FSM table.
//
// Two Mermaid `stateDiagram-v2` blocks in this repo draw the router's
// transition table, and both had drifted from it — one of them since #1185,
// which is roughly a year of a diagram quietly describing a machine that does
// not exist. The audit that found it had to compare 21 edges by hand, which is
// exactly the kind of check that gets done once and then never again.
//
// What each diagram was missing or inventing when this guard was written:
//
//   ARCHITECTURE.md                      drew READY --FAIL--> READY (removed
//                                        with its two senders in #1641), and
//                                        omitted both SYSTEM_COMMIT self-loops
//                                        plus STARTING --STOP--> IDLE (#1185)
//   packages/core/src/utils/fsm/         the same three, plus every DISPOSE
//   ARCHITECTURE.md                      safety-net edge except IDLE's
//
// Neither omission is cosmetic: the missing edges are the ones a reader would
// consult before deciding an edge is dead, and `routerFSM.ts` carries a
// standing warning that this graph may not be cleaned by trace coverage. A
// diagram that under-draws the table is an argument for deleting live edges.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs` — no
// wiring needed. Reads the table through the TypeScript AST rather than by
// regex, because the table mixes two edge forms (a bare target and
// `{ target, when?, update? }`) and a line-oriented parser silently drops the
// second one — the first draft of the audit script did exactly that and
// reported targets as "unknown" for every guarded edge.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = join(ROOT, "packages/core/src/routerFSM.ts");

/** Every diagram that claims to draw the ROUTER table, and must therefore match it. */
const DIAGRAMS = [
  "ARCHITECTURE.md",
  "packages/core/src/utils/fsm/ARCHITECTURE.md",
];

/** `routerStates.READY` / `routerEvents.COMPLETE` → "READY" / "COMPLETE". */
function memberName(node) {
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}

/**
 * The transition table as a set of "FROM --EVENT--> TARGET" strings.
 *
 * Both edge forms are read: a bare `routerStates.X` and the guarded object
 * `{ target: routerStates.X, when, update }`. States with no outgoing edge
 * (DISPOSED) contribute nothing, which is what the diagrams show too.
 */
function readTable() {
  const source = ts.createSourceFile(
    TABLE,
    readFileSync(TABLE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let table;

  const findTable = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "routerTransitions" &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      table = node.initializer;
    }

    ts.forEachChild(node, findTable);
  };

  findTable(source);

  assert.ok(table, "routerTransitions object literal not found in routerFSM.ts");

  const edges = new Set();
  const states = new Set();

  for (const stateProp of table.properties) {
    assert.ok(
      ts.isPropertyAssignment(stateProp) &&
        ts.isComputedPropertyName(stateProp.name),
      "every table key must be a computed `[routerStates.X]`",
    );

    const from = memberName(stateProp.name.expression);

    assert.ok(from, "table key must be `routerStates.<NAME>`");
    states.add(from);

    assert.ok(
      ts.isObjectLiteralExpression(stateProp.initializer),
      `edges of ${from} must be an object literal`,
    );

    for (const edgeProp of stateProp.initializer.properties) {
      assert.ok(
        ts.isPropertyAssignment(edgeProp) &&
          ts.isComputedPropertyName(edgeProp.name),
        `every edge key of ${from} must be a computed \`[routerEvents.X]\``,
      );

      const event = memberName(edgeProp.name.expression);
      const value = edgeProp.initializer;

      let target = memberName(value);

      if (target === undefined && ts.isObjectLiteralExpression(value)) {
        for (const field of value.properties) {
          if (
            ts.isPropertyAssignment(field) &&
            ts.isIdentifier(field.name) &&
            field.name.text === "target"
          ) {
            target = memberName(field.initializer);
          }
        }
      }

      assert.ok(
        event && target,
        `could not read an edge of ${from} — both the bare and the { target } form must parse`,
      );

      edges.add(`${from} --${event}--> ${target}`);
    }
  }

  return { edges, states };
}

/** The same shape, read out of a Mermaid `stateDiagram-v2` block. */
function readDiagram(relativePath) {
  const text = readFileSync(join(ROOT, relativePath), "utf8");
  const start = text.indexOf("stateDiagram-v2");

  assert.notStrictEqual(
    start,
    -1,
    `${relativePath}: no stateDiagram-v2 block — did the diagram move?`,
  );

  const block = text.slice(start, text.indexOf("```", start));
  const edges = new Set();

  for (const [, from, target, event] of block.matchAll(
    /^\s*(\S+)\s*-->\s*(\S+)\s*:\s*(\S+)\s*$/gm,
  )) {
    // `[*] --> IDLE` and `DISPOSED --> [*]` are Mermaid's start/end pseudo
    // states, not transitions; they carry no event and never match this shape,
    // but guard anyway so a future labelled one cannot slip in.
    if (from !== "[*]" && target !== "[*]") {
      edges.add(`${from} --${event}--> ${target}`);
    }
  }

  return edges;
}

test("the table itself parses into something non-trivial", () => {
  // Positive control. Without it, a parser broken by a refactor of routerFSM.ts
  // returns an empty set, every diagram trivially "matches" it, and this whole
  // file goes green while guarding nothing.
  const { edges, states } = readTable();

  assert.strictEqual(states.size, 6, "the router FSM has six states");
  assert.ok(
    edges.size >= 20,
    `expected the full table, parsed only ${edges.size} edges`,
  );
});

for (const relativePath of DIAGRAMS) {
  test(`${relativePath} draws exactly the router FSM table`, () => {
    const { edges: table } = readTable();
    const drawn = readDiagram(relativePath);

    const missing = [...table].filter((edge) => !drawn.has(edge)).sort();
    const invented = [...drawn].filter((edge) => !table.has(edge)).sort();

    assert.deepStrictEqual(
      { missing, invented },
      { missing: [], invented: [] },
      `${relativePath} is out of sync with routerFSM.ts\n` +
        `  in the table, not drawn: ${missing.join(", ") || "—"}\n` +
        `  drawn, not in the table: ${invented.join(", ") || "—"}`,
    );
  });
}
