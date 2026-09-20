import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * What a consumer can REACH, derived from `package.json`'s `exports` map rather
 * than from a list (#2303).
 *
 * ⚑ No other authority answers this axis. Eight of them carve the doors up by
 * what a member DOES — which seam it runs, whether it commits, whether it writes
 * the store — and `door-census/surface` pins what each handed-out
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
 *
 * ⚑ **The last three cells are the reachability COLUMN, and their subject is the
 * whole repository rather than core.** A door census names a symbol per row, and
 * the row is only a door if an application can NAME that symbol; asked by hand,
 * that question gets the answer of whoever asked it. The column derives it:
 * every published entry point of every package, resolved through its manifest,
 * against every name `shared/` exports. `shared/dom-utils` and
 * `shared/browser-env` are the shape it is aimed at — symlinked into their
 * consumers, so a helper there reads like a package member while no manifest
 * names it.
 */
describe("reachability census (#2303)", () => {
  const PKG_DIR = path.resolve(__dirname, "../../..");

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
      "AdoptedOrigins",
      "AnyOptions",
      "CheckFn",
      "CheckPositionMap",
      "ContextNamespaceClaim",
      "DefaultDependencies",
      "DefaultParamsCallback",
      "DefaultRouteCallback",
      "DefaultSearchCallback",
      "DependenciesApi",
      "DiagnosticEventMap",
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

  const REPO_ROOT = path.resolve(PKG_DIR, "../..");

  /** `exportsOf`, with `export * from` RESOLVED rather than recorded. */
  function namesOf(file: string, seen = new Set<string>()): string[] {
    if (seen.has(file) || !existsSync(file)) {
      return [];
    }

    seen.add(file);

    const { values, types, stars } = exportsOf(file);
    const names = [...values, ...types];

    for (const star of stars) {
      const spec = star.replace(/^type /, "");

      // A bare specifier names another workspace, walked in its own turn.
      if (!spec.startsWith(".")) {
        continue;
      }

      const base = path.resolve(path.dirname(file), spec);
      const target = [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
      ].find((candidate) => existsSync(candidate));

      // ⚠ Anti-vacuum: an unresolvable star shrinks the published set in
      // silence, and every row of the column would then read as a site.
      if (target === undefined) {
        throw new Error(`${file}: unresolvable export * from "${spec}"`);
      }

      names.push(...namesOf(target, seen));
    }

    return names;
  }

  /** Subpaths resolved through their dist entry — see the cell that pins them. */
  const FALLBACK: string[] = [];

  /**
   * The source file behind one subpath.
   *
   * ⚠ The condition is a CONVENTION, and nothing compiles `package.json` to
   * enforce it, so a subpath without it resolves through the dist entry
   * instead. The fallback SET is pinned below and is empty — a package leaving
   * the convention has to move that pin, because dropping out of the walk in
   * silence is how a whole package reads as unreachable.
   */
  function sourceEntryOf(
    conditions: Record<string, unknown>,
    directory: string,
    label: string,
  ): string {
    const declared = conditions["@real-router/internal-source"];

    if (typeof declared === "string") {
      return declared;
    }

    const dist = conditions.import ?? conditions.svelte ?? conditions.default;

    if (typeof dist !== "string") {
      throw new TypeError(`${label} publishes no resolvable entry`);
    }

    const stripped = dist
      .replace(/^\.\/dist\/(?:esm\/)?/, "./src/")
      .replace(/\.(?:mjs|cjs|js)$/, "");

    const entry = [
      `${stripped}.ts`,
      `${stripped}.tsx`,
      `${stripped}/index.ts`,
    ].find((candidate) => existsSync(path.join(directory, candidate)));

    if (entry === undefined) {
      throw new TypeError(`${label} has no source behind ${dist}`);
    }

    FALLBACK.push(`${label} → ${entry}`);

    return entry;
  }

  function publishedBy(): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const relative of globSync("packages/*/package.json", {
      cwd: REPO_ROOT,
    })) {
      const directory = path.dirname(path.join(REPO_ROOT, relative));
      const manifestJson = JSON.parse(
        readFileSync(path.join(REPO_ROOT, relative), "utf8"),
      ) as { name: string; exports?: Record<string, Record<string, unknown>> };

      for (const [sub, conditions] of Object.entries(
        manifestJson.exports ?? {},
      )) {
        const label =
          sub === "."
            ? manifestJson.name
            : `${manifestJson.name}${sub.slice(1)}`;
        const entry = sourceEntryOf(conditions, directory, label);

        for (const name of namesOf(path.join(directory, entry))) {
          const at = map.get(name) ?? [];

          if (!at.includes(label)) {
            at.push(label);
          }

          map.set(name, at);
        }
      }
    }

    return map;
  }

  const PUBLISHED = publishedBy();

  /** Every name `shared/` exports, against the file that exports it. */
  const SHARED = new Map<string, string>();

  for (const relative of globSync("shared/*/**/*.ts", {
    cwd: REPO_ROOT,
    exclude: (f) => /(?:node_modules|\.(?:test|spec|properties)\.ts$)/.test(f),
  })) {
    for (const name of namesOf(path.join(REPO_ROOT, relative))) {
      if (!SHARED.has(name)) {
        SHARED.set(name, relative);
      }
    }
  }

  it("the repository-wide walk reaches every package — anti-vacuum", () => {
    expect(PUBLISHED.size).toBeGreaterThan(250);
    expect(SHARED.size).toBeGreaterThan(90);

    // Positive controls: three surfaces in three packages, one of them a
    // subpath, so neither an empty walk nor a root-only walk passes this cell.
    expect(PUBLISHED.get("createRouter")).toStrictEqual(["@real-router/core"]);
    expect(PUBLISHED.get("getInternals")).toStrictEqual([
      "@real-router/core/validation",
    ]);
    expect(PUBLISHED.get("defer")).toStrictEqual([
      "@real-router/ssr-data-plugin",
    ]);

    // ⚑ The negative control is the one the cell above states in prose:
    // `RouteResolver` is reachable in CODE through `internals.port()` and
    // nameable from no manifest. The column reports the manifest.
    expect(PUBLISHED.has("RouteResolver")).toBe(false);

    // ⚑ Every published subpath declares the condition (#2303), so the walk
    // reads source for all of them and this set is empty. It is asserted
    // rather than omitted: an entry appearing here is a package resolving
    // through its dist, which a worktree without a build resolves to nothing.
    expect(FALLBACK.toSorted(byName)).toStrictEqual([]);
  });

  it("the column over `shared/` — which of its names an application can reach", () => {
    const doors: Record<string, string[]> = {};

    for (const name of [...SHARED.keys()].toSorted(byName)) {
      const at = PUBLISHED.get(name);

      if (at) {
        doors[name] = at.toSorted(byName);
      }
    }

    // ⚠ Only the REACHABLE side is pinned. The other side is every other name
    // `shared/` exports, and pinning it would redden on each helper added —
    // an event that carries nothing, since a new helper is a site by default.
    // A site becoming reachable is the event, and it moves this table.
    expect(doors).toStrictEqual({
      Browser: ["@real-router/browser-plugin", "@real-router/hash-plugin"],
      DeferredPayload: ["@real-router/ssr-data-plugin"],
      LoaderNotFound: [
        "@real-router/rsc-server-plugin/errors",
        "@real-router/ssr-data-plugin/errors",
      ],
      LoaderRedirect: [
        "@real-router/rsc-server-plugin/errors",
        "@real-router/ssr-data-plugin/errors",
      ],
      LoaderTimeout: [
        "@real-router/rsc-server-plugin/errors",
        "@real-router/ssr-data-plugin/errors",
      ],
      SsrLoaderContext: [
        "@real-router/rsc-server-plugin",
        "@real-router/ssr-data-plugin",
      ],
      SsrMode: ["@real-router/ssr-data-plugin"],
      defer: ["@real-router/ssr-data-plugin"],
      getDeferBootstrapScript: ["@real-router/ssr-data-plugin/server"],
      isDeferred: ["@real-router/ssr-data-plugin"],
      withTimeout: [
        "@real-router/rsc-server-plugin/errors",
        "@real-router/ssr-data-plugin/errors",
      ],
    });
  });

  it("a symlinked helper is a SITE — the door is the entry point above it", () => {
    // ⚑ These eight read like package members: `shared/dom-utils` and
    // `shared/browser-env` are symlinked into their consumers as
    // `src/dom-utils` and `src/browser-env`, and a caller's bag genuinely
    // arrives at each one. No manifest names any of them, so the row a door
    // census owns is the entry point ABOVE — `<Link to params search>`, the
    // popstate listener a plugin installs, `invalidate(router, …)`, the plugin
    // factory — and a row named after the helper describes a site instead.
    for (const site of [
      "buildHref",
      "canSkipPopstateHistoryWrite",
      "createPluginBuildUrl",
      "createReplaceHistoryState",
      "createSsrLoaderPlugin",
      "getRouteFromEvent",
      "markStale",
      "navigateWithHash",
    ]) {
      expect(SHARED.has(site), `${site} is exported by shared/`).toBe(true);
      expect(PUBLISHED.has(site), `${site} is nameable by a consumer`).toBe(
        false,
      );
    }

    // The control on the same axis: a `shared/` name that IS published, so a
    // walk finding nothing cannot pass this cell.
    expect(PUBLISHED.has("defer")).toBe(true);
  });
});
