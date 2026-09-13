import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { createRouter, getNavigator } from "@real-router/core";
import {
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

/**
 * Which members of core's handed-out surfaces are actually CALLED from outside
 * `packages/core`, derived from the AST of every other workspace (#2303).
 *
 * ⚑ The fourth column of the door census, and the one no authority answered.
 * `surface-census-authority-2303` pins what a surface contains and
 * `reachability-authority-2303` pins what the manifest publishes; this one
 * answers who reaches for it — the question every "nobody calls this" argument
 * rests on, and the one that has been answered by grep each time it came up.
 *
 * ⚠ **Three idioms reach a surface, and a census that knows two undercounts in
 * silence.** A one-line `getInternals(r).member`; a two-line
 * `const ctx = getInternals(r)` followed by `ctx.member`; and — the one that is
 * easy to forget — the surface arriving as a typed PARAMETER, never through a
 * factory call in that file at all. `validation-plugin`'s `buildValidatorObject`
 * takes `ctx: RouterInternals<D>`, so a census of the first two forms reports
 * zero consumers for `getQueryParams` while a shipped one exists.
 *
 * ⚠ **Membership is pinned, not call counts.** A count moves with every test
 * that happens to touch a door; the SET moves when a consumer starts or stops
 * depending on a member, which is the fact a decision rests on.
 */
describe("consumer census (#2303)", () => {
  const ROOT = path.resolve(__dirname, "../../../..");

  const FACTORY_BY_TYPE: Record<string, string> = {
    RouterInternals: "getInternals",
    PluginApi: "getPluginApi",
    RoutesApi: "getRoutesApi",
    Navigator: "getNavigator",
    DependenciesApi: "getDependenciesApi",
    LifecycleApi: "getLifecycleApi",
  };

  const FACTORIES = [...new Set(Object.values(FACTORY_BY_TYPE))];

  /**
   * Members that hand back an object, so the census can walk one level down.
   * ⚑ This is where the #2255 and #1932 doors actually live: `printedQueryNames`
   * is a member of `port()`, not of any named surface.
   */
  const RETURNS_OBJECT = new Set([
    "port",
    "routeGetStore",
    "dependenciesGetStore",
    "getTree",
    "getOptions",
    "getCloneState",
    "getAdoptedOrigins",
  ]);

  interface Reached {
    src: Set<string>;
    tests: Set<string>;
  }

  /** Local name → factory, for both the value import and the type import. */
  function importsOf(sf: ts.SourceFile): {
    values: Map<string, string>;
    types: Map<string, string>;
  } {
    const values = new Map<string, string>();
    const types = new Map<string, string>();

    for (const st of sf.statements) {
      if (
        !ts.isImportDeclaration(st) ||
        !ts.isStringLiteral(st.moduleSpecifier) ||
        !st.moduleSpecifier.text.startsWith("@real-router/core") ||
        !st.importClause?.namedBindings ||
        !ts.isNamedImports(st.importClause.namedBindings)
      ) {
        continue;
      }

      for (const element of st.importClause.namedBindings.elements) {
        const original = (element.propertyName ?? element.name).text;

        if (FACTORIES.includes(original)) {
          values.set(element.name.text, original);
        }

        if (FACTORY_BY_TYPE[original]) {
          types.set(element.name.text, FACTORY_BY_TYPE[original]);
        }
      }
    }

    return { values, types };
  }

  function scan(): {
    hits: Record<string, Reached>;
    second: Record<string, Reached>;
    files: number;
    readers: number;
  } {
    const files = [
      ...globSync("packages/*/src/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("packages/*/tests/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("shared/**/*.ts", { cwd: ROOT }),
    ].filter((f) => !f.startsWith("packages/core/"));

    const hits: Record<string, Reached> = {};

    for (const factory of FACTORIES) {
      hits[factory] = { src: new Set(), tests: new Set() };
    }

    const second: Record<string, Reached> = {};

    const secondBucket = (key: string): Reached => {
      second[key] ??= { src: new Set(), tests: new Set() };

      return second[key];
    };

    let readers = 0;

    for (const relativePath of files) {
      const text = readFileSync(path.join(ROOT, relativePath), "utf8");

      if (
        Object.keys(FACTORY_BY_TYPE).every((t) => !text.includes(t)) &&
        FACTORIES.every((f) => !text.includes(f))
      ) {
        continue;
      }

      const sf = ts.createSourceFile(
        relativePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const { values: imported, types: typeImported } = importsOf(sf);

      if (imported.size === 0 && typeImported.size === 0) {
        continue;
      }

      readers += 1;

      const bucket = relativePath.includes("/tests/") ? "tests" : "src";
      const alias = new Map<string, string>();
      const aliasDown = new Map<string, string>();

      /** The surface a `<owner>.<member>()` call sits on, if any. */
      const ownerOf = (
        access: ts.PropertyAccessExpression,
      ): string | undefined => {
        if (!RETURNS_OBJECT.has(access.name.text)) {
          return undefined;
        }

        if (ts.isIdentifier(access.expression)) {
          return alias.get(access.expression.text);
        }

        return ts.isCallExpression(access.expression) &&
          ts.isIdentifier(access.expression.expression)
          ? imported.get(access.expression.expression.text)
          : undefined;
      };

      const noteAnnotation = (
        name: ts.BindingName,
        type: ts.TypeNode | undefined,
      ): void => {
        if (!type || !ts.isIdentifier(name) || !ts.isTypeReferenceNode(type)) {
          return;
        }

        const head = type.typeName;

        if (ts.isIdentifier(head) && typeImported.has(head.text)) {
          alias.set(name.text, typeImported.get(head.text)!);
        }
      };

      const noteCall = (node: ts.VariableDeclaration): void => {
        if (
          !ts.isIdentifier(node.name) ||
          !node.initializer ||
          !ts.isCallExpression(node.initializer) ||
          !ts.isIdentifier(node.initializer.expression)
        ) {
          return;
        }

        const factory = imported.get(node.initializer.expression.text);

        if (factory) {
          alias.set(node.name.text, factory);
        }
      };

      /** `const p = ctx.port()` — an alias one level down. */
      const noteCallDown = (node: ts.VariableDeclaration): void => {
        if (
          !ts.isIdentifier(node.name) ||
          !node.initializer ||
          !ts.isCallExpression(node.initializer) ||
          !ts.isPropertyAccessExpression(node.initializer.expression)
        ) {
          return;
        }

        const access = node.initializer.expression;
        const owner = ownerOf(access);

        if (owner) {
          aliasDown.set(node.name.text, `${owner}.${access.name.text}()`);
        }
      };

      const noteAccess = (node: ts.PropertyAccessExpression): void => {
        const target = node.expression;

        if (
          ts.isCallExpression(target) &&
          ts.isIdentifier(target.expression) &&
          imported.has(target.expression.text)
        ) {
          hits[imported.get(target.expression.text)!][bucket].add(
            node.name.text,
          );
        }

        if (ts.isIdentifier(target) && alias.has(target.text)) {
          hits[alias.get(target.text)!][bucket].add(node.name.text);
        }

        // chained: ctx.port().printedQueryNames
        if (
          ts.isCallExpression(target) &&
          ts.isPropertyAccessExpression(target.expression)
        ) {
          const owner = ownerOf(target.expression);

          if (owner) {
            secondBucket(`${owner}.${target.expression.name.text}()`)[
              bucket
            ].add(node.name.text);
          }
        }

        if (ts.isIdentifier(target) && aliasDown.has(target.text)) {
          secondBucket(aliasDown.get(target.text)!)[bucket].add(node.name.text);
        }
      };

      const walk = (node: ts.Node): void => {
        if (ts.isParameter(node)) {
          noteAnnotation(node.name, node.type);
        }

        if (ts.isVariableDeclaration(node)) {
          noteAnnotation(node.name, node.type);
          noteCall(node);
          noteCallDown(node);
        }

        if (ts.isPropertyAccessExpression(node)) {
          noteAccess(node);
        }

        ts.forEachChild(node, walk);
      };

      walk(sf);
    }

    return { hits, second, files: files.length, readers };
  }

  const { hits, second, files, readers } = scan();

  const sorted = (s: Set<string>): string[] =>
    [...s].toSorted((a, b) => a.localeCompare(b));

  it("the scan reaches the tree — anti-vacuum", () => {
    // ⚠ A glob that matches nothing, or a rename of the package scope, would
    // leave every set below empty and every membership cell green.
    expect(files).toBeGreaterThan(800);
    expect(readers).toBeGreaterThan(150);
    expect(sorted(hits.getPluginApi.src).length).toBeGreaterThan(5);
  });

  it("what SHIPPED code outside core reaches for", () => {
    expect({
      getInternals: sorted(hits.getInternals.src),
      getPluginApi: sorted(hits.getPluginApi.src),
      getRoutesApi: sorted(hits.getRoutesApi.src),
      getNavigator: sorted(hits.getNavigator.src),
      getDependenciesApi: sorted(hits.getDependenciesApi.src),
      getLifecycleApi: sorted(hits.getLifecycleApi.src),
    }).toStrictEqual({
      // ⚠ `getQueryParams` is here only because the parameter idiom is counted;
      // it is `validation-plugin`'s, through a lazy callback that re-reads.
      getInternals: [
        "dependenciesGetStore",
        "getAdoptedOrigins",
        "getOptions",
        "getQueryParams",
        "hydrationState",
        "logger",
        "routeGetStore",
        "validator",
      ],
      getPluginApi: [
        "addEventListener",
        "addInterceptor",
        "buildNavigationState",
        "buildPathResolved",
        "claimContextNamespace",
        "extendRouter",
        "forwardState",
        "getOptions",
        "getRootPath",
        "getRouteConfig",
        "getTree",
        "makeState",
        "matchPath",
        "setRootPath",
      ],
      getRoutesApi: ["subscribeChanges"],
      getNavigator: [],
      getDependenciesApi: [],
      getLifecycleApi: [],
    });
  });

  it("one level DOWN — what the members hand back, and who reaches into it", () => {
    const rows = Object.fromEntries(
      Object.entries(second).map(([key, reached]) => [
        key,
        { src: sorted(reached.src), tests: sorted(reached.tests) },
      ]),
    );

    // ⚠ The control for this cell is the presence of `getOptions()`, not the
    // absence of `port()`: a derivation that never walked down would report both
    // as empty and read as "nothing reaches the second level".
    expect(rows).toStrictEqual({
      "getInternals.getOptions()": {
        src: ["defaultRoute", "limits"],
        tests: [],
      },
      "getPluginApi.getOptions()": { src: ["allowNotFound"], tests: [] },
      "getInternals.routeGetStore()": {
        src: [],
        tests: ["config", "matcher", "tree"],
      },
      "getInternals.getCloneState()": { src: [], tests: ["limits"] },
    });
  });

  it("nothing outside core reaches into port() — on either level", () => {
    // ⚑ `port()` is where #1932's `printedQueryNames` and #2255's registries
    // live. The surface census pins its composition and the reachability census
    // says `RouteResolver` is exported from no subpath; this is the third leg —
    // no consumer outside core walks into it, by derivation rather than by grep.
    expect(Object.keys(second)).not.toContain("getInternals.port()");
    expect(Object.keys(second)).not.toContain("getPluginApi.port()");

    // Positive control: the walk DOES reach members that hand back an object,
    // so the two assertions above are not vacuous.
    expect(Object.keys(second).length).toBeGreaterThan(2);
  });

  it("the reverse column — members nothing outside core calls, shipped or tested", () => {
    const router = createRouter([{ name: "a", path: "/a" }]);

    // ⚑ The composition comes from the LIVE object, so this column is a
    // difference rather than a second hand-written list to keep in step.
    const untouched = (surface: object, reached: Reached): string[] =>
      Object.getOwnPropertyNames(surface)
        .filter((m) => !reached.src.has(m) && !reached.tests.has(m))
        .toSorted((a, b) => a.localeCompare(b));

    expect({
      getInternals: untouched(
        getInternals(router) as unknown as object,
        hits.getInternals,
      ),
      getPluginApi: untouched(
        getPluginApi(router) as unknown as object,
        hits.getPluginApi,
      ),
      getRoutesApi: untouched(
        getRoutesApi(router) as unknown as object,
        hits.getRoutesApi,
      ),
      getNavigator: untouched(
        getNavigator(router) as unknown as object,
        hits.getNavigator,
      ),
      getDependenciesApi: untouched(
        getDependenciesApi(router) as unknown as object,
        hits.getDependenciesApi,
      ),
      getLifecycleApi: untouched(
        getLifecycleApi(router) as unknown as object,
        hits.getLifecycleApi,
      ),
    }).toStrictEqual({
      // ⚠ Untouched is NOT unused: core itself is the caller for most of these,
      // and `handed-out-containers-1957` records why the stores are handed out
      // at all. What this column buys is the denominator for any future "nobody
      // reaches for it" argument.
      getInternals: [
        "buildPathResolved",
        "buildStateResolved",
        "contextClaimRecords",
        "emitTransitionError",
        "forwardState",
        "getMetaForState",
        "getRootPath",
        "getStateName",
        "getTree",
        "interceptors",
        "isDisposed",
        "isTransitioning",
        "makeState",
        "matchPath",
        "navigateToNotFound",
        "navigateToState",
        "port",
        "revalidateToNotFound",
        "routerExtensions",
        "setRootPath",
        "start",
        "systemCommit",
        "treeChanged",
      ],
      // ⚑ Both plugin-facing surfaces come back EMPTY: every member of
      // `getPluginApi` and of `getRoutesApi` has a caller outside core. That is
      // the sharpest single answer this census gives to "did we guard doors
      // nobody uses" — on these two surfaces, nobody is nobody.
      getPluginApi: [],
      getRoutesApi: [],
      getNavigator: ["canNavigateTo", "isLeaveApproved", "subscribeLeave"],
      getDependenciesApi: ["has"],
      getLifecycleApi: ["removeActivateGuard"],
    });
  });
});
