// #1751 — CLASS guard: every API door that mutates the route store carries the
// reentrancy ban, and the set of doors is DERIVED, never listed.
//
// The point is the sixth door. #1032 shipped the ban for the five
// `getRoutesApi` mutators; `setRootPath` was the sixth and sat unguarded for
// twelve releases precisely because it lives on `PluginApi` and no test knew the
// family had six members. A test that enumerates doors by name would have been
// green throughout — the name list is exactly where the next one hides.
//
// ⚠ The obvious key — "reaches `rebuildTree` / `applyRootPath`" — is WRONG, and
// `update()` is the counter-example: it carries the guard (`getRoutesApi.ts`)
// and rebuilds nothing (`commitRouteUpdate` is documented NO_TREE_REBUILD). That
// key drops a guarded door and picks up `cloneRouter`; it is a different set,
// not a deeper one. The key here is a WRITE to any `RoutesStore` field, reached
// transitively — which is what "mutates the tree" actually means.
//
// Direction is one-sided: `reachable ⊆ guarded ∪ exempt`. A guard in a place
// that needs none is not a fail-open and must not red. The exemptions, however,
// are asserted by STRICT equality, so a stale entry fails exactly like a missed
// door.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `reentrancy-ban-messages.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

const GUARD = "throwIfReentrantTreeMutation";

const byName = (a: string, b: string): number => a.localeCompare(b);

/**
 * `RoutesStore` deliberately carries two cross-namespace references that are
 * assigned once during wiring and are not route data — see the store-pattern
 * note in `packages/core/CLAUDE.md`. Writing them is not a tree mutation, and
 * counting them would seed the taint with `setDependencies`, a method name
 * every namespace has: the whole wiring layer would go tainted and the scan
 * would report half the router as a door.
 */
const WIRING_FIELDS = new Set(["depsStore", "lifecycleNamespace"]);

/**
 * Doors that reach a store write and deliberately carry no reentrancy guard.
 * Strict equality — a stale entry is as much a defect as a missing guard.
 */
const EXEMPT: Record<string, string> = {
  "api/cloneRouter.ts:cloneRouter":
    "writes the CLONE's store; the clone's emitter is fresh and never dispatching (#1175)",
  "Router.ts:dispose":
    "runs after `clearAll()` released every subscribeChanges listener",
  "Router.ts:setRootPath":
    // ⚠ CORRECTED. This used to read "not a public door", and #1751's own body
    // refutes that: the internals bag is reachable from the PUBLISHED
    // `@real-router/core/validation` subpath, which re-exports `getInternals`
    // (`packages/core/src/validation.ts`, `package.json` exports `./validation`).
    // So `getInternals(router).setRootPath(...)` is callable by any consumer and
    // bypasses BOTH guards this door carries — the reentrancy ban (#1751) and
    // the navigation-in-flight gate (#1755).
    //
    // It stays exempt because it is the DI closure every namespace method is
    // reached through, and guarding it would double-guard the public door for
    // every internal caller (`cloneRouter` among them). The bypass is a
    // property of the internals bag, not of this member — same class as #1749,
    // and tracked there rather than pretended away here.
    "the internals-bag DI closure; the public door is `getPluginApi.setRootPath`. Reachable via the published validation subpath — bypass tracked on #1749",
};

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

const parse = (file: string, text?: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    text ?? readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

/**
 * The leftmost receiver of a property/element chain: for
 * `store.config.forwardMap` and `store.routeCustomFields[n]` alike it is
 * `store`; for `this.#store.tree` it is `this.#store`.
 */
function rootReceiver(node: ts.Expression): string | undefined {
  let current: ts.Expression = node;

  for (;;) {
    if (ts.isPropertyAccessExpression(current)) {
      if (
        ts.isPrivateIdentifier(current.name) &&
        current.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        return `this.${current.name.text}`;
      }

      current = current.expression;
      continue;
    }

    if (ts.isElementAccessExpression(current)) {
      current = current.expression;
      continue;
    }

    return ts.isIdentifier(current) ? current.text : undefined;
  }
}

/** The first field of a store chain: `store.config.forwardMap` → `config`. */
function firstField(node: ts.Expression): string | undefined {
  let current: ts.Expression = node;
  let field: string | undefined;

  for (;;) {
    if (ts.isPropertyAccessExpression(current)) {
      if (
        ts.isPrivateIdentifier(current.name) &&
        current.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        return field;
      }

      field = current.name.getText();
      current = current.expression;
      continue;
    }

    if (ts.isElementAccessExpression(current)) {
      current = current.expression;
      continue;
    }

    return field;
  }
}

const isStoreTarget = (node: ts.Expression): boolean => {
  const root = rootReceiver(node);

  if (root !== "store" && root !== "this.#store") {
    return false;
  }

  const field = firstField(node);

  return field !== undefined && !WIRING_FIELDS.has(field);
};

/**
 * Does this node write a field of the routes store?
 *
 * Covers every shape present in `routesStore.ts` today: plain and compound
 * assignment (the whole `FirstAssignment..LastAssignment` range — an
 * `=`-only matcher already missed `??=` once, #1683), `delete`, and
 * `Object.assign(store.…, …)`.
 */
function writesStore(node: ts.Node): boolean {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
    isStoreTarget(node.left)
  ) {
    return true;
  }

  if (ts.isDeleteExpression(node) && isStoreTarget(node.expression)) {
    return true;
  }

  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Object" &&
    node.expression.name.text === "assign" &&
    node.arguments.length > 0 &&
    isStoreTarget(node.arguments[0])
  );
}

interface Fn {
  readonly key: string;
  readonly name: string;
  readonly body: ts.Node;
  /**
   * A door is a member of an API object literal, a class method, or an
   * exported function. A module-private `function` declaration is a CONDUIT —
   * `addRoutes` / `removeRoute` / `replaceRoutes` live in `api/` but nobody
   * outside can call them, and treating them as doors would both demand a
   * guard where none belongs and cut the taint path to the doors that wrap
   * them.
   */
  readonly isDoorShaped: boolean;
}

/** Every named function-ish node in a file, with a `file:name` key. */
function namedFunctions(sf: ts.SourceFile, relative: string): Fn[] {
  const out: Fn[] = [];

  const push = (
    name: string | undefined,
    body: ts.Node | undefined,
    isDoorShaped: boolean,
  ): void => {
    if (name !== undefined && body !== undefined) {
      out.push({ key: `${relative}:${name}`, name, body, isDoorShaped });
    }
  };

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node)) {
      push(node.name?.getText(sf), node.body, isExported(node));
    } else if (ts.isMethodDeclaration(node)) {
      push(node.name.getText(sf), node.body, true);
    } else if (
      (ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      push(node.name.getText(sf), node.initializer.body, true);
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      push(node.name.getText(sf), node.initializer.body, false);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);

  return out;
}

/** Names called from this body — free identifiers and method names alike. */
function callees(body: ts.Node): Set<string> {
  const out = new Set<string>();

  const visit = (node: ts.Node): void => {
    // Stop at a nested function: its calls belong to IT, not to the enclosing
    // one. Without this the factory (`getPluginApi`) inherits every call its
    // members make and reads as a door itself.
    if (
      node !== body &&
      (ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        out.add(node.expression.text);
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        out.add(node.expression.name.getText());
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(body);

  return out;
}

const bodyWritesStore = (body: ts.Node): boolean => {
  let hit = false;

  const visit = (node: ts.Node): void => {
    if (hit) {
      return;
    }

    if (writesStore(node)) {
      hit = true;

      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(body);

  return hit;
};

// ── the scan ────────────────────────────────────────────────────────────────

const relativeOf = (file: string): string =>
  path.relative(SRC_DIR, file).split(path.sep).join("/");

const allFunctions: Fn[] = [];

for (const file of tsFiles(SRC_DIR)) {
  allFunctions.push(...namedFunctions(parse(file), relativeOf(file)));
}

/** Level 0: names that write the store directly. */
const storeWriters = new Set(
  allFunctions
    .filter((f) => f.key.startsWith("namespaces/RoutesNamespace/"))
    .filter((f) => bodyWritesStore(f.body))
    .map((f) => f.name),
);

/** Doors: API-surface members and the facade's own methods. */
const doors = allFunctions.filter(
  (f) =>
    f.isDoorShaped &&
    (f.key.startsWith("api/") || f.key.startsWith("Router.ts:")),
);

/**
 * Doors are TERMINALS, never conduits. Letting their names into the taint set
 * floods the graph: the API members are called `add` / `remove` / `clear` /
 * `update` / `replace`, so every `Set.add` and `Map.clear` in the codebase
 * would inherit the taint and the scan would call half the router a door.
 * The plumbing still carries it — `RoutesNamespace.setRootPath` is what makes
 * the name `setRootPath` tainted for `getPluginApi`.
 */
const doorKeys = new Set(doors.map((d) => d.key));

/** Taint by callee name, to a fixed point. */
const tainted = new Set(storeWriters);

for (;;) {
  const before = tainted.size;

  for (const fn of allFunctions) {
    if (tainted.has(fn.name) || doorKeys.has(fn.key)) {
      continue;
    }

    for (const callee of callees(fn.body)) {
      if (tainted.has(callee)) {
        tainted.add(fn.name);

        break;
      }
    }
  }

  if (tainted.size === before) {
    break;
  }
}

const reachable = doors.filter((d) =>
  [...callees(d.body)].some((c) => tainted.has(c)),
);

const unguarded = reachable
  .filter((d) => !callees(d.body).has(GUARD))
  .map((d) => d.key);

describe("§ #1751: every store-mutating API door carries the reentrancy ban", () => {
  it("the scan reads the write forms that exist in the store today", () => {
    // Positive AND negative control in one in-memory fixture — the store's real
    // shapes, plus reads and a comment that must NOT count. Without this the
    // assertions below are green exactly when the matcher is broken.
    const fixture = parse(
      "__scan_control__.ts",
      [
        "function w(store) {",
        "  store.tree = t;", // 2 — plain
        "  store.matcher ??= m;", // 3 — compound (#1683)
        "  store.config.forwardMap = f;", // 4 — nested chain
        "  store.routeCustomFields[n] = c;", // 5 — element access
        "  delete store.routeCustomFields[n];", // 6 — delete
        "  Object.assign(store.config, next);", // 7 — Object.assign
        "  store.matcher.hasRoute(n);", // 8 — READ, must miss
        "  // applyRootPath rebuilds store.tree", // 9 — comment, must miss
        "  other.tree = t;", // 10 — not the store, must miss
        "  store.depsStore = d;", // 11 — wiring reference, must miss
        "}",
      ].join("\n"),
    );

    const lines: number[] = [];

    const visit = (node: ts.Node): void => {
      if (writesStore(node)) {
        lines.push(
          fixture.getLineAndCharacterOfPosition(node.getStart(fixture)).line +
            1,
        );
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(fixture, visit);

    expect(lines).toStrictEqual([2, 3, 4, 5, 6, 7]);
  });

  it("the scan is not vacuously green — the real store writers are found", () => {
    expect(storeWriters.size).toBeGreaterThanOrEqual(5);
    expect(storeWriters).toContain("applyRootPath"); // the #1751 path itself
    expect(storeWriters).toContain("adoptRouteArtifacts");
    expect(reachable.length).toBeGreaterThanOrEqual(6);
  });

  it("the six public mutators are the ones derived", () => {
    // Fails when a door is ADDED and when one silently disappears — a stale map
    // is a defect of the same kind as a missed door.
    expect(
      reachable
        .map((d) => d.key)
        .filter((k) => k.startsWith("api/"))
        .filter((k) => !(k in EXEMPT))
        .toSorted(byName),
    ).toStrictEqual([
      "api/getPluginApi.ts:setRootPath",
      "api/getRoutesApi.ts:add",
      "api/getRoutesApi.ts:clear",
      "api/getRoutesApi.ts:remove",
      "api/getRoutesApi.ts:replace",
      "api/getRoutesApi.ts:update",
    ]);
  });

  it("every reachable door carries the guard, except the decided exemptions", () => {
    // THE assertion. Red before #1751 (setRootPath), red on any guard deleted
    // from the five, red on a seventh door added without one.
    expect(unguarded.toSorted(byName)).toStrictEqual(
      Object.keys(EXEMPT).toSorted(byName),
    );
  });

  it("a seventh door is caught — simulated, not asserted", () => {
    const seventh = parse(
      "api/__seventh__.ts",
      [
        "const api = {",
        "  setTheme: (t) => {",
        "    throwIfDisposed(ctx.isDisposed);",
        "    ctx.setRootPath(t);", // reaches the store, no guard
        "  },",
        "  guarded: (t) => {",
        "    throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);",
        "    ctx.setRootPath(t);", // reaches the store, guarded
        "  },",
        "};",
      ].join("\n"),
    );

    const found = namedFunctions(seventh, "api/__seventh__.ts")
      .filter((f) => [...callees(f.body)].some((c) => tainted.has(c)))
      .filter((f) => !callees(f.body).has(GUARD))
      .map((f) => f.name);

    expect(found).toStrictEqual(["setTheme"]);
  });
});
