import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * What a consumer can REACH, derived from `package.json`'s `exports` map rather
 * than from a list (#2303).
 *
 * ⚑ No other authority answers this axis. Eight of them carve the doors up by
 * what a member DOES — which seam it runs, whether it commits, whether it writes
 * the store — and `surface-census-authority-2303` pins what each handed-out
 * surface CONTAINS. None reads the manifest, so "is this symbol reachable from an
 * application" has been answered by hand every time it was asked.
 *
 * ⚠ **Reachability is not the same as visibility in the type.** `RouteResolver`
 * is exported from no subpath, yet `internals.port()` types structurally through
 * `RouterInternals`, so its members are reachable in code. The cells below pin
 * the manifest surface; they do not claim it is the boundary.
 *
 * ⚠ **A subpath is added by editing `package.json`, which no test compiles.**
 * That is the drift this file exists for: an export added to a barrel shows up
 * in review as one line, and an export REMOVED is a breaking change that nothing
 * announces until a consumer's build fails.
 */
describe("reachability census (#2303)", () => {
  const PKG_DIR = path.resolve(__dirname, "../..");

  interface Exported {
    values: string[];
    types: string[];
    /** `export * from` / `export type * from`, by module specifier. */
    stars: string[];
  }

  const parse = (file: string): ts.SourceFile =>
    ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      // `false`: nothing here reads `.parent` or a position — the sibling
      // `route-key-authority-1738` states the reason for the idiom.
      /* setParentNodes */ false,
      ts.ScriptKind.TS,
    );

  const byName = (a: string, b: string): number => a.localeCompare(b);

  /** `export { … } from`, `export type { … } from`, and the star form. */
  function readExportDeclaration(
    st: ts.ExportDeclaration,
    into: Exported,
  ): void {
    // ⚠ A star re-export is RECORDED, never silently skipped — skipping it is
    // how a derivation goes partial while staying green. The root carries one
    // (`export type * from "./types"`), and the cell below pins it as a fact
    // rather than copying the 71 names it brings.
    if (st.exportClause === undefined) {
      const from =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? st.moduleSpecifier.text
          : "?";

      into.stars.push(`${st.isTypeOnly ? "type " : ""}${from}`);

      return;
    }

    if (!ts.isNamedExports(st.exportClause)) {
      return;
    }

    for (const element of st.exportClause.elements) {
      // Both spellings count: `export type { T }` and `export { type T }`.
      const bucket = st.isTypeOnly || element.isTypeOnly ? "types" : "values";

      into[bucket].push(element.name.text);
    }
  }

  /** `export interface` / `export type` / `export class|function|const`. */
  function readDeclaration(st: ts.Statement, into: Exported): void {
    const modifiers = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;

    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return;
    }

    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      into.types.push(st.name.text);

      return;
    }

    if (ts.isClassDeclaration(st) || ts.isFunctionDeclaration(st)) {
      if (st.name) {
        into.values.push(st.name.text);
      }

      return;
    }

    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          into.values.push(d.name.text);
        }
      }
    }
  }

  function exportsOf(file: string): Exported {
    const acc: Exported = { values: [], types: [], stars: [] };

    for (const st of parse(file).statements) {
      if (ts.isExportDeclaration(st)) {
        readExportDeclaration(st, acc);
      } else {
        readDeclaration(st, acc);
      }
    }

    const { values, types, stars } = acc;

    return {
      values: values.toSorted(byName),
      types: types.toSorted(byName),
      stars: stars.toSorted(byName),
    };
  }

  const manifest = JSON.parse(
    readFileSync(path.join(PKG_DIR, "package.json"), "utf8"),
  ) as { exports: Record<string, Record<string, unknown>> };

  const SUBPATHS = Object.entries(manifest.exports).map(([sub, conditions]) => {
    const entry = conditions["@real-router/internal-source"];

    // ⚠ Anti-vacuum: a renamed condition would leave every list below empty and
    // every cell green. The derivation refuses instead of degrading.
    if (typeof entry !== "string") {
      throw new TypeError(`${sub} has no @real-router/internal-source entry`);
    }

    return { sub, file: path.join(PKG_DIR, entry) };
  });

  it("the manifest publishes exactly five subpaths, each with a source entry", () => {
    expect(SUBPATHS.map((s) => s.sub)).toStrictEqual([
      ".",
      "./types",
      "./api",
      "./utils",
      "./validation",
    ]);
  });

  it("the root subpath", () => {
    expect(exportsOf(SUBPATHS[0].file)).toStrictEqual({
      values: [
        "constants",
        "createRouter",
        "errorCodes",
        "events",
        "getNavigator",
        "resolveForwardChain",
        "Router",
        "RouterError",
        "UNKNOWN_ROUTE",
      ].toSorted(byName),
      types: [
        "Constants",
        "ErrorCodes",
        "RouterValidator",
        "RouteTree",
      ].toSorted(byName),
      // ⚑ The root re-exports every type of `/types` by star, so the two
      // subpaths are one type surface. The names are pinned once, in the
      // `/types` cell below — a second copy here would drift from it.
      // ⚠ `Router` and `RouterError` are named CLASS exports above and shadow
      // the same-named interfaces the star brings; `packages/core/CLAUDE.md`
      // § Type Locations owns that precedence.
      stars: ["type ./types"],
    });
  });

  it("/api — the four factories plus cloneRouter", () => {
    expect(exportsOf(SUBPATHS[2].file)).toStrictEqual({
      values: [
        "cloneRouter",
        "getDependenciesApi",
        "getLifecycleApi",
        "getPluginApi",
        "getRoutesApi",
      ],
      types: ["DependenciesApi", "LifecycleApi", "PluginApi", "RoutesApi"],
      stars: [],
    });
  });

  it("/utils — four ingestion primitives, no types", () => {
    expect(exportsOf(SUBPATHS[3].file)).toStrictEqual({
      values: ["adoptChannel", "copyFields", "freezeThrownError", "putField"],
      types: [],
      stars: [],
    });
  });

  it("/validation — the plugin-facing surface", () => {
    expect(exportsOf(SUBPATHS[4].file)).toStrictEqual({
      values: ["findMisChanneledKey", "getInternals", "validateRoute"],
      types: ["Matcher", "RouterInternals", "RouterValidator", "RouteTree"],
      stars: [],
    });
  });

  it("/types — type-only, and the augmentation declaration-site", () => {
    const { values, types, stars } = exportsOf(SUBPATHS[1].file);

    expect(
      stars,
      "the type barrel names everything it publishes",
    ).toStrictEqual([]);

    // ⚠ Zero values is the load-bearing half: this barrel IS the `/types`
    // subpath and the declaration-site a `declare module` augmentation merges
    // against, so a value landing here would change what consumers import.
    expect(values).toStrictEqual([]);
    expect(types).toStrictEqual([
      "AnyOptions",
      "ContextNamespaceClaim",
      "DefaultDependencies",
      "DefaultParamsCallback",
      "DefaultRouteCallback",
      "DefaultSearchCallback",
      "DependenciesApi",
      "ErrorCodeKeys",
      "ErrorCodeToValueMap",
      "ErrorCodeValues",
      "EventMethodMap",
      "EventName",
      "EventsKeys",
      "EventToNameMap",
      "EventToPluginMap",
      "ForwardToCallback",
      "GuardFn",
      "GuardFnFactory",
      "InterceptableMethodMap",
      "InterceptorFn",
      "LeaveFn",
      "LeaveState",
      "LifecycleApi",
      "LimitsConfig",
      "Listener",
      "LogCallback",
      "LoggerConfig",
      "LogLevel",
      "LogLevelConfig",
      "NavigationOptions",
      "NavigationTarget",
      "Navigator",
      "Options",
      "Params",
      "ParamsSearch",
      "Plugin",
      "PluginApi",
      "PluginFactory",
      "PluginMethod",
      "QueryParamsMode",
      "QueryParamsOptions",
      "ReadonlyRoute",
      "Route",
      "RouteConfigUpdate",
      "RouteParams",
      "Router",
      "RouterError",
      "RouterLogger",
      "RoutesApi",
      "RouteTreeState",
      "SearchParamPrimitive",
      "SearchParams",
      "SearchParamValue",
      "SerializedRouterState",
      "SimpleState",
      "State",
      "StateContext",
      "SubscribeFn",
      "SubscribeState",
      "Subscription",
      "TransitionMeta",
      "TransitionPhase",
      "TransitionReason",
      "TreeChangedAdd",
      "TreeChangedClear",
      "TreeChangedEvent",
      "TreeChangedRemove",
      "TreeChangedReplace",
      "TreeChangedUpdate",
      "TreeStructuralPatch",
      "Unsubscribe",
    ]);
  });

  it("the internal types stay internal — none of them is published", () => {
    const published = new Set(
      SUBPATHS.flatMap(({ file }) => {
        const { values, types } = exportsOf(file);

        return [...values, ...types];
      }),
    );

    // The positive control: the derivation finds things at all, so an empty
    // `published` cannot pass this cell by accident.
    expect(published.has("getInternals")).toBe(true);

    // ⚑ `RouteResolver` is the one that matters: the pipeline's read-model is
    // reachable in CODE through `internals.port()`, and pinning it here records
    // that the manifest never made it a published name.
    for (const internal of [
      "RouteResolver",
      "Canonical",
      "RoutesStore",
      "DependenciesStore",
      "RouterInternalsContext",
    ]) {
      expect(published.has(internal), `${internal} is not published`).toBe(
        false,
      );
    }
  });
});
