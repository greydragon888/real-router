import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching the sibling authority suites.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every writer of the route table sits behind a door that consults `replace()`'s
 * revalidation window (#1758 / #1759).
 *
 * ⚑ This suite exists because a PRODUCTION branch was removed on the strength of
 * it. `commitRevalidated` used to re-read the URL's owner at the commit and
 * refuse when it had moved — a defence against a window actor swapping the tree
 * underneath. The window now refuses those actors at the door, which made that
 * branch unreachable, and an unreachable branch justified by a reachability
 * claim is the shape this repo hunts. Deleting it moved the property here, where
 * it can still FAIL: a new writer that skips the ban reds this file.
 *
 * ⚠ It scans for the WRITE, not for a list of function names. A helper renamed
 * or a fifth writer added arrives without a name anyone remembered to add, which
 * is exactly the event the deleted branch would have caught at runtime.
 */

const SRC_DIR = path.resolve(__dirname, "../../src");

/** Assignments to `store.matcher` / `store.tree` — the route table's two slots. */
const TABLE_SLOTS = new Set(["matcher", "tree"]);

/**
 * The doors a table write must arrive through, each of which consults the
 * window. `clear` and `update` reach the table through the same helpers, so the
 * set is of ENTRY POINTS rather than of writers.
 */
const BANNED_DOORS = ["add", "remove", "update", "clear", "replace"];

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

interface Write {
  readonly file: string;
  readonly fn: string;
  readonly text: string;
}

/** Every `<something>.matcher = …` / `<something>.tree = …` in `src`. */
function tableWrites(): Write[] {
  const found: Write[] = [];

  for (const file of tsFiles(SRC_DIR)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    );

    const visit = (node: ts.Node, fn: string): void => {
      const nextFn =
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
        node.name
          ? node.name.getText(source)
          : fn;

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        TABLE_SLOTS.has(node.left.name.getText(source))
      ) {
        found.push({
          file: path
            .relative(SRC_DIR, source.fileName)
            .split(path.sep)
            .join("/"),
          fn: nextFn,
          text: node.getText(source).split("\n", 1)[0].trim(),
        });
      }

      ts.forEachChild(node, (child) => {
        visit(child, nextFn);
      });
    };

    visit(source, "<module>");
  }

  return found;
}

/**
 * The classification, and it is a TABLE rather than a count: a writer added
 * without a decision changes what the sweep means, and a count with slack in it
 * would let one through.
 */
const CLASSIFIED: Record<string, string> = {
  // ⚠ THREE, and the third is a delegate rather than a door of its own. This
  // table first listed `commitTreeChanges` — it is where `remove` and `update`
  // land — and the scan refused it: that function does not touch the two slots,
  // it calls `rebuildTreeInPlace`. Naming writers from memory is what this
  // suite exists to stop.
  "namespaces/RoutesNamespace/routesStore.ts · rebuildTreeInPlace":
    "DELEGATE — the shared rebuild. Reached from `commitTreeChanges` " +
    "(remove / update, getRoutesApi) and from `clear`; every one of those " +
    "doors consults the window, so it adds no entry point of its own.",
  "namespaces/RoutesNamespace/routesStore.ts · applyRootPath":
    "setRootPath (getPluginApi) — consults the window.",
  "namespaces/RoutesNamespace/routesStore.ts · adoptRouteArtifacts":
    "add / replace (getRoutesApi) — consult the window.",
};

describe("#1758 / #1759 — every route-table writer is behind the window's ban", () => {
  it("the scan sees the writers at all", () => {
    // Non-vacuity: an empty scan satisfies the table below, and an empty scan is
    // what a broken root path or a renamed slot produces.
    const writes = tableWrites();

    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes.some((w) => w.text.includes("matcher"))).toBe(true);
    expect(writes.some((w) => w.text.includes("tree"))).toBe(true);
  });

  it("CONTROL — the scanner finds a synthetic write, so a miss is a miss", () => {
    const probe = ts.createSourceFile(
      "probe.ts",
      "function f(store) { store.matcher = x; }",
      ts.ScriptTarget.ESNext,
      true,
    );
    let hits = 0;

    const visit = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        TABLE_SLOTS.has(node.left.name.getText(probe))
      ) {
        hits += 1;
      }

      ts.forEachChild(node, visit);
    };

    visit(probe);

    expect(hits).toBe(1);
  });

  it("every writer is classified, and the set is the one that was decided", () => {
    const seen = [
      ...new Set(tableWrites().map((w) => `${w.file} · ${w.fn}`)),
    ].toSorted((left, right) => left.localeCompare(right));

    expect(
      Object.fromEntries(
        seen.map((key) => [key, CLASSIFIED[key] ?? "UNCLASSIFIED"]),
      ),
    ).toStrictEqual(CLASSIFIED);
  });

  it("every named door consults the window", () => {
    // The doors are read from `src`, not asserted from memory: a door that
    // stops passing the predicate stops appearing here.
    const routesApi = readFileSync(
      path.join(SRC_DIR, "api/getRoutesApi.ts"),
      "utf8",
    );
    const pluginApi = readFileSync(
      path.join(SRC_DIR, "api/getPluginApi.ts"),
      "utf8",
    );

    for (const door of BANNED_DOORS) {
      const at = routesApi.indexOf(`    ${door}: (`);

      expect(at, `${door} is not a door of getRoutesApi`).toBeGreaterThan(-1);

      // The ban sits in the door's opening statements, before any work.
      const head = routesApi.slice(at, at + 700);

      expect(head, `${door} does not consult the window`).toContain(
        "store.revalidating",
      );
    }

    expect(pluginApi).toContain("routeGetStore().revalidating");
  });

  it("the window's flag is lowered in a finally", () => {
    // Left raised it deadlocks the router against its own next call — the same
    // failure `isPreparing` names. A `try` without the matching `finally` is the
    // one edit that would make the ban worse than the defect.
    const routesApi = readFileSync(
      path.join(SRC_DIR, "api/getRoutesApi.ts"),
      "utf8",
    );

    expect(routesApi).toContain("store.revalidating = true;");
    expect(routesApi).toMatch(
      /\}\s*finally\s*\{\s*store\.revalidating = false;\s*\}/u,
    );
  });
});
