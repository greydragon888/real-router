import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every route-name rule carries the tier its CALL SITES give it (#2035).
 *
 * `engine/validation/route-name.ts` owns the rules, one named predicate each.
 * Two layers apply them and apply different subsets: bare-core registration
 * applies some on every door, and `validateRoute` — which core exports for
 * `@real-router/validation-plugin` — applies all of them.
 *
 * ⚑ The tier is DERIVED, never declared: a predicate called from anywhere
 * outside the plugin-gated composer is `core`, one called only from it is
 * `plugin`. {@link TIERS} records what that derivation answers today, so
 * lifting a rule onto the live path cannot ship as a silent one-line change —
 * it reds this file until the table agrees.
 *
 * ⚠ `plugin` means "reachable only through `validateRoute`", which holds only
 * while nothing inside core calls `validateRoute`. That is asserted below
 * rather than assumed.
 */

const CORE_SRC = path.resolve(__dirname, "../../src");

/** The file that owns the rules — one exported predicate per rule. */
const OWNER = path.join(CORE_SRC, "engine/validation/route-name.ts");

/**
 * The composer core ships but never calls: `validateRoute` reaches it only
 * from the validation plugin.
 */
const PLUGIN_GATED = path.join(CORE_SRC, "engine/validation/route-batch.ts");

/**
 * What the derivation answers today. A rule lifted onto the live path, a rule
 * added, and a rule deleted each move a row here.
 */
const TIERS: Record<string, "core" | "plugin" | "unused"> = {
  assertNoDottedRouteName: "core",
  assertRouteNameMatchesPattern: "plugin",
  assertRouteNameNotEmpty: "plugin",
  assertRouteNameNotWhitespaceOnly: "plugin",
  assertRouteNameWithinLength: "plugin",
};

function sourceOf(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
}

/** The exported predicates {@link OWNER} declares. */
function ownedPredicates(): string[] {
  const names: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.push(node.name.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceOf(OWNER));

  return names.toSorted((left, right) => left.localeCompare(right));
}

/** Files under `core/src` that CALL `name`, excluding the file declaring it. */
function callersOf(name: string): string[] {
  const files: string[] = [];

  for (const file of globSync(`${CORE_SRC}/**/*.ts`)) {
    if (file === OWNER) {
      continue;
    }

    let calls = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === name
      ) {
        calls = true;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceOf(file));

    if (calls) {
      files.push(file);
    }
  }

  return files;
}

/** A caller outside the plugin-gated composer is what makes a rule `core`. */
function tierOf(callers: readonly string[]): "core" | "plugin" | "unused" {
  if (callers.some((file) => file !== PLUGIN_GATED)) {
    return "core";
  }

  return callers.length > 0 ? "plugin" : "unused";
}

describe("route-name rule authority (#2035)", () => {
  it("gives every rule the tier its call sites derive", () => {
    const derived: Record<string, string> = {};

    for (const name of ownedPredicates()) {
      derived[name] = tierOf(callersOf(name));
    }

    expect(derived).toStrictEqual(TIERS);
  });

  it("keeps the plugin tier meaningful — nothing in core reaches validateRoute", () => {
    // ⚠ Without this, "only the composer applies it" would stop implying "only
    // the plugin reaches it", and every `plugin` row above would quietly become
    // wrong instead of red.
    //
    // The composer itself is excluded because `validateRoute` recurses into
    // children; a caller ANYWHERE else is the wiring this asserts against.
    const outside = callersOf("validateRoute").filter(
      (file) => file !== PLUGIN_GATED,
    );

    expect(outside).toStrictEqual([]);
  });

  it("CONTROL — the scan reaches core's source and the owning file", () => {
    // A derivation that silently found nothing would agree with an empty
    // table; both halves are pinned by count here rather than by colour.
    expect(globSync(`${CORE_SRC}/**/*.ts`).length).toBeGreaterThan(50);
    expect(ownedPredicates()).toHaveLength(Object.keys(TIERS).length);
  });

  it("CONTROL — the scanner counts a call, and neither an import nor a mention", () => {
    const probe = ts.createSourceFile(
      "probe.ts",
      `import { assertRouteNameNotEmpty } from "./route-name";
       // assertRouteNameWithinLength(name, m) in a comment is not a call
       const s = "assertNoDottedRouteName(name, m)";
       function f(name: string, m: string) { assertRouteNameNotEmpty(name, m); }`,
      ts.ScriptTarget.ESNext,
      true,
    );

    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        hits.push(node.expression.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(probe);

    expect(hits).toStrictEqual(["assertRouteNameNotEmpty"]);
  });
});
