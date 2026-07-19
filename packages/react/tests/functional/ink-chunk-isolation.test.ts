// Guards the /ink packaging contract (#800): the terminal entry must not drag the
// DOM-feature factories (route-announcer / scroll-restore / scroll-spy /
// view-transitions) into its chunk. Those factories are pure dead weight in a
// terminal target — none can run without a DOM — yet a static import edge from
// `ink.ts` to the module that *calls* them forces the bundler to keep their full
// implementation (IntersectionObserver wiring, view-transitions, aria-live
// announcer, scroll capture) in the chunk reachable from `dist/esm/ink.mjs`.
//
// This is a bundle-shape invariant, so it is asserted on the static module graph —
// which, together with tree-shaking, is what determines chunk membership — rather
// than on runtime behaviour: the runtime output is identical before and after the
// fix, since the DOM effects are gated behind flags `InkRouterProvider` never sets.
//
// The four factories are DEFINED once in shared/dom-utils and imported as live
// values in exactly one place. A pure re-export barrel (dom-utils/index.ts, reached
// via InkLink's `shallowEqual`) is tree-shakeable and does NOT pull the factory
// implementations — only a live *value import* does. Hence the assertion: no module
// reachable from src/ink.ts may value-import any DOM-feature factory.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`); also what import-x/no-named-as-default-member expects now
// that the graph analysis is alive (#1525).
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// `__dirname` (not `import.meta.url`): this package is `type: commonjs` under
// NodeNext, so `import.meta` is a compile error here — Vitest injects `__dirname`.
const SRC_DIR = path.resolve(__dirname, "../../src");
const INK_ENTRY = path.resolve(SRC_DIR, "ink.ts");

// The DOM-feature factories that must never be reachable as live code from /ink.
const DOM_FEATURE_FACTORIES = new Set([
  "createRouteAnnouncer",
  "createScrollRestoration",
  "createScrollSpy",
  "createViewTransitions",
]);

/** Resolve a relative import specifier to an absolute source file, or null if external. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null; // bare specifier — react / ink / @real-router/* are external
  }

  const base = path.resolve(
    path.dirname(fromFile),
    specifier.replace(/\.js$/, ""),
  );

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(candidate)) {
      // realpath so the `src/dom-utils` symlink collapses onto shared/dom-utils.
      return realpathSync(candidate);
    }
  }

  return null;
}

/**
 * Original export names pulled in by a non-type-only value import. Type-only
 * imports are erased and never contribute runtime weight — TS 6 folds whole-clause
 * `import type` into `phaseModifier` (`isTypeOnly` is deprecated), and individual
 * `{ type X }` specifiers keep their own `isTypeOnly`.
 */
function namedValueImports(clause: ts.ImportClause): string[] {
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) {
    return [];
  }

  const bindings = clause.namedBindings;

  if (!bindings || !ts.isNamedImports(bindings)) {
    return [];
  }

  return (
    bindings.elements
      .filter((element) => !element.isTypeOnly)
      // propertyName is the ORIGINAL export name for `{ orig as local }`.
      .map((element) => (element.propertyName ?? element.name).text)
  );
}

interface ModuleInfo {
  /** Every relative import/re-export target — followed for graph reachability. */
  edges: string[];
  /** Original names pulled in by non-type-only value imports. */
  valueImportedNames: string[];
}

function analyze(file: string): ModuleInfo {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const edges: string[] = [];
  const valueImportedNames: string[] = [];

  sf.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push(node.moduleSpecifier.text);

      if (node.importClause) {
        valueImportedNames.push(...namedValueImports(node.importClause));
      }

      return;
    }

    // `export … from "…"` re-export: an edge for reachability, but a re-export is
    // tree-shakeable and does NOT count as a live value import.
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push(node.moduleSpecifier.text);
    }
  });

  return { edges, valueImportedNames };
}

describe("/ink chunk isolation (#800)", () => {
  it("no module reachable from ink.ts value-imports a DOM-feature factory", () => {
    const visited = new Set<string>();
    const queue: string[] = [realpathSync(INK_ENTRY)];
    const offenders: { module: string; factories: string[] }[] = [];

    while (queue.length > 0) {
      const file = queue.pop()!;

      if (visited.has(file)) {
        continue;
      }

      visited.add(file);

      const { edges, valueImportedNames } = analyze(file);

      const leaked = valueImportedNames.filter((name) =>
        DOM_FEATURE_FACTORIES.has(name),
      );

      if (leaked.length > 0) {
        offenders.push({
          module: path.relative(SRC_DIR, file),
          factories: leaked,
        });
      }

      for (const specifier of edges) {
        const target = resolveRelative(file, specifier);

        if (target && !visited.has(target)) {
          queue.push(target);
        }
      }
    }

    expect(offenders).toStrictEqual([]);
  });
});
