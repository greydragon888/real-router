// Guards the client-bundle packaging contract (#761): the `.` entry of an SSR
// loader plugin must not drag the **server-only** defer wire-format
// (`getDeferBootstrapScript` / `escapeForScript` / `formatSettleScript`) into the
// client bundle. That code — plus its module-level `new RegExp()` / `Object.fromEntries()`
// initialisers, which the bundler can't prove pure and therefore can't tree-shake —
// is dead weight in a browser bundle: only the streaming server (`./server`) ever
// runs it. Both `ssr-data-plugin` and `rsc-server-plugin` consume the same
// `shared/ssr` factory, so the leak (and this fix) is shared.
//
// Like the /ink chunk guard (#800), this is a bundle-shape invariant asserted on
// the static module graph — the runtime output is identical, the win is bytes.
// The client-needed `ensureRegistryPromise` (hydration) and the server-only
// wire-format used to live in ONE module (`deferRegistry.ts`); `createSsrLoaderPlugin`
// imports only the former, but co-location forced the whole module — impure
// module-level code and all — into the client chunk. The fix splits them, so the
// wire-format's DEFINING module is no longer reachable from `src/index.ts`.
//
// The walk models tree-shaking of pure re-export barrels: `shared/ssr/index.ts`
// re-exports the wire-format, and the client entry reaches that barrel (for
// `defer` / `isDeferred`), but a re-export is tree-shakeable — only the SPECIFIC
// names imported from a barrel are followed to their origin, never the whole barrel.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`); also what import-x/no-named-as-default-member expects now
// that the graph analysis is alive (#1525).
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");
const CLIENT_ENTRY = path.resolve(SRC_DIR, "index.ts");

// Server-only wire-format functions that must never be DEFINED in a module
// reachable from the client `.` entry.
const SERVER_WIRE_FORMAT = new Set([
  "getDeferBootstrapScript",
  "escapeForScript",
  "formatSettleScript",
]);

/** Resolve a relative import specifier to an absolute source file, or null if external. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null; // bare specifier — @real-router/* / react / node are external
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
      // realpath so the `src/shared-ssr` symlink collapses onto shared/ssr.
      return realpathSync(candidate);
    }
  }

  return null;
}

interface Edge {
  specifier: string;
  /** Imported/re-exported original names, or "*" for namespace/whole-module pulls. */
  names: string[] | "*";
}

interface ModuleInfo {
  /** Value edges (imports + re-exports), skipping type-only. */
  edges: Edge[];
  /** true iff every top-level statement is a re-export or a type-only import. */
  isPureBarrel: boolean;
  /** For a pure barrel: exported name → source specifier it is re-exported from. */
  reExportMap: Map<string, string>;
  /** Names of wire-format functions this module DEFINES (export function/const). */
  definedWireFormat: string[];
}

/** A statement that carries no runtime weight of its own — a re-export or `import type`. */
function isReExportOrTypeImport(node: ts.Statement): boolean {
  if (ts.isExportDeclaration(node)) {
    return node.moduleSpecifier !== undefined;
  }

  if (ts.isImportDeclaration(node)) {
    // TS 6 folds type-only into `phaseModifier` (`isTypeOnly` is deprecated).
    return node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
  }

  return false;
}

/** Value-imported original names, or "*" for a default/namespace/whole pull. */
function importedNames(clause: ts.ImportClause): string[] | "*" {
  // A default or namespace import pulls the whole target module.
  if (
    clause.name ||
    clause.namedBindings?.kind === ts.SyntaxKind.NamespaceImport
  ) {
    return "*";
  }

  const bindings = clause.namedBindings;

  if (!bindings || !ts.isNamedImports(bindings)) {
    return [];
  }

  return bindings.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => (element.propertyName ?? element.name).text);
}

/** The value-edge(s) of an import/re-export statement — 0 or 1 (empty = type-only / none). */
function edgesOf(node: ts.Statement): Edge[] {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;

    if (
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !clause ||
      clause.phaseModifier === ts.SyntaxKind.TypeKeyword
    ) {
      return [];
    }

    const names = importedNames(clause);
    const specifier = node.moduleSpecifier.text;

    return names === "*" || names.length > 0 ? [{ specifier, names }] : [];
  }

  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    !node.isTypeOnly
  ) {
    const specifier = node.moduleSpecifier.text;
    const clause = node.exportClause;

    if (clause && ts.isNamedExports(clause)) {
      const names = clause.elements
        .filter((element) => !element.isTypeOnly)
        .map((element) => (element.propertyName ?? element.name).text);

      return [{ specifier, names }];
    }

    return [{ specifier, names: "*" }]; // `export * from`
  }

  return [];
}

/** Named re-export pairs (name → specifier) contributed by a statement. */
function reExportPairs(node: ts.Statement): [string, string][] {
  if (!ts.isExportDeclaration(node)) {
    return [];
  }

  // edgesOf yields 0 or 1 edge for a re-export; flatMap avoids an
  // index-access whose non-null type would trip no-unnecessary-condition.
  return edgesOf(node).flatMap((edge) =>
    edge.names === "*"
      ? []
      : edge.names.map((name): [string, string] => [name, edge.specifier]),
  );
}

function isExported(
  node: ts.FunctionDeclaration | ts.VariableStatement,
): boolean {
  const flags = ts.getCombinedModifierFlags(node as ts.Declaration);

  return (flags & ts.ModifierFlags.Export) !== 0;
}

/** Wire-format function names DEFINED (exported) by a declaration statement. */
function definedWireFormatNames(node: ts.Statement): string[] {
  const declared: string[] = [];

  if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
    declared.push(node.name.text);
  } else if (ts.isVariableStatement(node) && isExported(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declared.push(declaration.name.text);
      }
    }
  }

  return declared.filter((name) => SERVER_WIRE_FORMAT.has(name));
}

function analyze(file: string): ModuleInfo {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Iterate `statements` (not `forEachChild`, which also visits the trailing
  // EndOfFileToken — a non-statement node that would falsely flip isPureBarrel).
  const statements = [...sf.statements];

  return {
    edges: statements.flatMap((node) => edgesOf(node)),
    isPureBarrel: statements.every((node) => isReExportOrTypeImport(node)),
    reExportMap: new Map(statements.flatMap((node) => reExportPairs(node))),
    definedWireFormat: statements.flatMap((node) =>
      definedWireFormatNames(node),
    ),
  };
}

describe("client bundle isolation (#761)", () => {
  it("no module reachable from the `.` entry defines server-only defer wire-format", () => {
    const cache = new Map<string, ModuleInfo>();
    const info = (file: string): ModuleInfo => {
      let cached = cache.get(file);

      if (!cached) {
        cached = analyze(file);
        cache.set(file, cached);
      }

      return cached;
    };

    const visited = new Set<string>();
    const queue: string[] = [realpathSync(CLIENT_ENTRY)];
    const enqueue = (file: string | null): void => {
      if (file && !visited.has(file)) {
        queue.push(file);
      }
    };

    // Follow one value edge, modelling barrel tree-shaking: importing SPECIFIC
    // names from a pure re-export barrel follows only those names' origin
    // modules, never the whole barrel.
    const follow = (fromFile: string, edge: Edge): void => {
      const target = resolveRelative(fromFile, edge.specifier);

      if (!target) {
        return;
      }

      const targetInfo = info(target);

      if (targetInfo.isPureBarrel && edge.names !== "*") {
        for (const name of edge.names) {
          const origin = targetInfo.reExportMap.get(name);

          // Unknown name (a local barrel export) → fall back to the barrel.
          enqueue(origin ? resolveRelative(target, origin) : target);
        }
      } else {
        enqueue(target);
      }
    };

    const offenders: { module: string; defines: string[] }[] = [];

    while (queue.length > 0) {
      const file = queue.pop()!;

      if (visited.has(file)) {
        continue;
      }

      visited.add(file);

      const moduleInfo = info(file);

      if (moduleInfo.definedWireFormat.length > 0) {
        offenders.push({
          module: path.relative(SRC_DIR, file),
          defines: moduleInfo.definedWireFormat,
        });
      }

      for (const edge of moduleInfo.edges) {
        follow(file, edge);
      }
    }

    expect(offenders).toStrictEqual([]);
  });
});
