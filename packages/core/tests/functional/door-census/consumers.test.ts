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
 * `door-census/surface` pins what a surface contains and
 * `door-census/reachability` pins what the manifest publishes; this one
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
  const ROOT = path.resolve(__dirname, "../../../../..");

  const FACTORY_BY_TYPE: Record<string, string> = {
    RouterInternals: "getInternals",
    PluginApi: "getPluginApi",
    RoutesApi: "getRoutesApi",
    Navigator: "getNavigator",
    DependenciesApi: "getDependenciesApi",
    LifecycleApi: "getLifecycleApi",
  };

  const FACTORIES = [...new Set(Object.values(FACTORY_BY_TYPE))];

  /** Where each surface's interface is declared, for the derivation below. */
  const SURFACE_DECL: readonly [file: string, iface: string][] = [
    ["src/internals.ts", "RouterInternals"],
    ["src/types/api.ts", "PluginApi"],
    ["src/types/api.ts", "RoutesApi"],
    ["src/types/api.ts", "DependenciesApi"],
    ["src/types/api.ts", "LifecycleApi"],
    ["src/types/router.ts", "Navigator"],
  ];

  /** A type that cannot carry members, so nothing is one level down from it. */
  const FLAT = new Set([
    ts.SyntaxKind.StringKeyword,
    ts.SyntaxKind.NumberKeyword,
    ts.SyntaxKind.BooleanKeyword,
    ts.SyntaxKind.VoidKeyword,
    ts.SyntaxKind.UndefinedKeyword,
    ts.SyntaxKind.NeverKeyword,
    ts.SyntaxKind.SymbolKeyword,
    ts.SyntaxKind.AnyKeyword,
    ts.SyntaxKind.UnknownKeyword,
  ]);

  /**
   * Members whose value can carry members of its own — the set the census walks
   * one level down.
   *
   * ⚑ **Derived from the DECLARATIONS, and it has to be.** The live-value form
   * is unsafe here: `RouterInternals.start` is a zero-argument member, so a
   * derivation that called each member to see what comes back would start the
   * router. Reading the types answers the same question without running
   * anything.
   *
   * ⚠ **`null` on a bare router is not "flat".** `validator` and
   * `hydrationState` are empty until a plugin fills them, and the shipped reach
   * this census exists to find — `ctx.validator.options.validateOptions(…)` —
   * happens on exactly those. The declaration is what decides; the value on an
   * unconfigured router is not evidence.
   */
  /**
   * Type aliases whose right-hand side is a FUNCTION — derived, because a member
   * handing one back has nothing one level down. `addEventListener` returns
   * `Unsubscribe`, and without this the walk counts
   * `ctx.addEventListener.bind(ctx)` as a reach into a door.
   */
  const functionAliases = (): Set<string> => {
    const out = new Set<string>();

    for (const file of globSync("src/types/*.ts", {
      cwd: path.join(ROOT, "packages/core"),
    })) {
      const source = ts.createSourceFile(
        file,
        readFileSync(path.join(ROOT, "packages/core", file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const visit = (node: ts.Node): void => {
        if (
          ts.isTypeAliasDeclaration(node) &&
          ts.isFunctionTypeNode(node.type)
        ) {
          out.add(node.name.text);
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    return out;
  };

  /**
   * Can a value of this type carry members of its own?
   *
   * ⚠ **An ARRAY answers no, and that is a classification rather than a live
   * filter.** It removes exactly one member — `RouterInternals.routerExtensions`
   * (`{ keys: string[] }[]`) — which #2343 item 4 names among the six the old
   * hand list hid. Measured: deleting this arm leaves every cell GREEN, because
   * nothing outside core reaches into that array today. It is kept for the shape
   * the function arm below was added for: the next access off an array is
   * `length` or `map`, which is `Array.prototype`, not a door.
   */
  const carries = (
    type: ts.TypeNode | undefined,
    flatAliases: ReadonlySet<string>,
  ): boolean => {
    if (!type) {
      return false;
    }

    if (ts.isFunctionTypeNode(type)) {
      return carries(type.type, flatAliases);
    }

    if (ts.isUnionTypeNode(type)) {
      return type.types.some((one) => carries(one, flatAliases));
    }

    if (ts.isArrayTypeNode(type) || ts.isLiteralTypeNode(type)) {
      return false;
    }

    if (
      ts.isTypeReferenceNode(type) &&
      ts.isIdentifier(type.typeName) &&
      flatAliases.has(type.typeName.text)
    ) {
      return false;
    }

    return !FLAT.has(type.kind);
  };

  const objectValuedMembers = (): Set<string> => {
    const out = new Set<string>();
    const flatAliases = functionAliases();

    for (const [file, iface] of SURFACE_DECL) {
      const source = ts.createSourceFile(
        file,
        readFileSync(path.join(ROOT, "packages/core", file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const visit = (node: ts.Node): void => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === iface) {
          for (const member of node.members) {
            const declared =
              ts.isPropertySignature(member) || ts.isMethodSignature(member)
                ? member.type
                : undefined;

            if (member.name && carries(declared, flatAliases)) {
              out.add(member.name.getText());
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    return out;
  };

  const RETURNS_OBJECT = objectValuedMembers();

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

  interface Called {
    src: number;
    tests: number;
  }

  function scan(): {
    hits: Record<string, Reached>;
    second: Record<string, Reached>;
    calls: Record<string, Called>;
    files: number;
    readers: number;
  } {
    const files = [
      ...globSync("packages/*/src/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("packages/*/tests/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("shared/**/*.ts", { cwd: ROOT }),
    ].filter((f) => !f.startsWith("packages/core/"));

    const hits: Record<string, Reached> = {};
    const calls: Record<string, Called> = {};

    for (const factory of FACTORIES) {
      hits[factory] = { src: new Set(), tests: new Set() };
      calls[factory] = { src: 0, tests: 0 };
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

        // chained through a PROPERTY: `ctx.validator.options`. The key keeps the
        // shape — `<factory>.<member>` without parentheses — because a property
        // and a call are different doors even when they hand back the same kind
        // of object.
        if (ts.isPropertyAccessExpression(target)) {
          const owner = ownerOf(target);

          if (owner) {
            secondBucket(`${owner}.${target.name.text}`)[bucket].add(
              node.name.text,
            );
          }
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

        // The factory CALL itself, wherever it stands — including the forms the
        // member walk above cannot see, because they read no member here.
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          Object.hasOwn(calls, node.expression.text) &&
          imported.has(node.expression.text)
        ) {
          calls[node.expression.text][bucket] += 1;
        }

        ts.forEachChild(node, walk);
      };

      walk(sf);
    }

    return { hits, second, calls, files: files.length, readers };
  }

  const { hits, second, calls, files, readers } = scan();

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
        "getAdoptedOrigins",
        "getOptions",
        "getRootPath",
        "getRouteConfig",
        "getTree",
        "makeState",
        "matchPath",
        "setRootPath",
      ],
      getRoutesApi: ["subscribeChanges"],
      // ⚠ An empty row here is NOT an unused surface — see the cell below.
      getNavigator: [],
      getDependenciesApi: [],
      getLifecycleApi: [],
    });
  });

  it("an empty member row means HANDED ON, not unwanted", () => {
    const invoked = Object.entries(calls)
      .filter(([, n]) => n.src > 0)
      .map(([factory]) => factory)
      .toSorted((a, b) => a.localeCompare(b));

    // ⚑ `getNavigator` reads no member in shipped code and is CALLED there
    // regardless, and that is what this cell exists to separate. The adapter
    // invokes the factory and hands the object straight to its framework —
    // Angular's DI, a React context — so the members are read by the
    // application, one layer past anything this repository can walk. Without
    // this column an empty row above is indistinguishable from a surface
    // nobody wants, and that reading has already been made out loud.
    //
    // ⚠ Membership, not volume: a call COUNT moves when an adapter is
    // refactored, which is not an event about the door.
    expect(invoked).toStrictEqual([
      "getInternals",
      "getNavigator",
      "getPluginApi",
      "getRoutesApi",
    ]);

    // ⚑ The two absent here are not unreached either — they are reached from
    // the example APPS, which are the closest thing in this tree to a real
    // application and which this scan deliberately does not walk. Naming them
    // is what keeps their absence from reading as disuse.
    expect(
      Object.keys(calls)
        .filter((f) => !invoked.includes(f))
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual(["getDependenciesApi", "getLifecycleApi"]);
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
    //
    // ⚠ **What this walk still cannot see, recorded rather than left to read as
    // absence (#2343).** It is syntactic: it follows a value while the value
    // stays in the expression. A value that LEAVES — passed whole into a
    // function — is invisible on the far side, and two shipped channels do
    // exactly that with the route store. `validationPlugin` hands
    // `ctx.routeGetStore()` to `validators/retrospective.ts`, whose functions
    // take `store: unknown` and read `definitions` / `config` / `tree` there;
    // and core itself passes the live store to validator methods as an
    // ARGUMENT, so those reads never pass through `routeGetStore()` in the
    // plugin at all. `routeGetStore`'s empty `src` therefore means "no reach
    // this instrument can see", not "no reach" — #2339 §4 question 4 owns that
    // channel and prices closing it.
    expect(rows).toStrictEqual({
      "getInternals.getCloneState()": { src: [], tests: ["limits"] },
      "getInternals.getOptions()": {
        src: ["defaultRoute", "limits"],
        tests: ["queryParams"],
      },
      "getInternals.routeGetStore()": {
        src: [],
        tests: ["config", "matcher", "matcherOptions", "tree"],
      },
      "getInternals.validator": { src: ["options"], tests: ["dependencies"] },
      "getNavigator.getState()": { src: [], tests: ["name"] },
      "getPluginApi.buildNavigationState()": {
        src: ["name", "params", "path", "search"],
        tests: ["name"],
      },
      "getPluginApi.claimContextNamespace()": {
        src: ["release", "write"],
        tests: ["release", "write"],
      },
      "getPluginApi.forwardState()": {
        src: ["name", "params", "search"],
        tests: ["name"],
      },
      "getPluginApi.getOptions()": { src: ["allowNotFound"], tests: [] },
      "getPluginApi.makeState()": {
        src: [],
        tests: ["name", "params", "path"],
      },
      "getPluginApi.matchPath()": { src: [], tests: ["params", "search"] },
      "getRoutesApi.get()": { src: [], tests: ["forwardTo"] },
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
        // ⚑ Untouched from 09-15: its only consumer outside core moved to the
        // `PluginApi` twin (#2339 slice 1). The internals member is now dead
        // weight, which is the state slice 7 removes.
        "getAdoptedOrigins",
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
