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
 * ⚑ **Three is not all of them, and the walk below is not where that is
 * fixed.** A surface also arrives as a class field and as a field of a
 * dependency bag, and no count of idioms closes the list. The typed census
 * further down asks the CHECKER instead, which answers for every idiom at once;
 * this walk stays as it is, and the difference between the two is asserted
 * rather than described (#2383).
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
   * ⚠ **`null` on a bare router is not "flat".** `validator` is empty until a
   * plugin fills it, and the shipped reach this census exists to find —
   * `ctx.validator.options.validateOptions(…)` — happens on exactly that slot. The declaration is what decides; the value on an
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

  /**
   * Every file outside core that could reach a surface — the scope BOTH walks
   * below read, so the idiom census and the typed census can never disagree
   * about what they looked at.
   */
  const consumerFiles = (): string[] =>
    [
      ...globSync("packages/*/src/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("packages/*/tests/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("shared/**/*.ts", { cwd: ROOT }),
    ].filter((f) => !f.startsWith("packages/core/"));

  function scan(): {
    hits: Record<string, Reached>;
    second: Record<string, Reached>;
    calls: Record<string, Called>;
    files: number;
    readers: number;
  } {
    const files = consumerFiles();

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

  /** What each surface CONTAINS, read off the live object. */
  const live = (): Record<string, string[]> => {
    const router = createRouter([{ name: "a", path: "/a" }]);

    const names = (surface: object): string[] =>
      Object.getOwnPropertyNames(surface);

    return {
      getInternals: names(getInternals(router)),
      getPluginApi: names(getPluginApi(router)),
      getRoutesApi: names(getRoutesApi(router)),
      getNavigator: names(getNavigator(router)),
      getDependenciesApi: names(getDependenciesApi(router)),
      getLifecycleApi: names(getLifecycleApi(router)),
    };
  };

  const LIVE = live();

  /**
   * Clause (a) of the `PluginApi` membership rule, asked of the CHECKER (#2383).
   *
   * ⚑ **The idiom walk above answers a narrower question than it looks.** It
   * records reach where it can resolve the owner of an access, so a surface
   * arriving as a class field (`this.#api.x`) or as a field of a dependency bag
   * (`deps.api.x`) is invisible to it — and `membership.test.ts`'s rule turns on
   * "shipped code outside core reaches it", which is exactly what those two
   * idioms are. The checker answers for every idiom at once, because the
   * question it is asked is "what IS this value", not "how was it written".
   *
   * ⚠ **The member NAME is the only pre-filter, and it bounds nothing.** Reach
   * for `X` can be recorded off an `.X` access and nowhere else, so skipping
   * every other access is exact rather than heuristic — unlike a filter on the
   * file's text, which is the bound this walk exists to remove.
   *
   * ⚠ **Two spellings stay outside ANY walk of accesses, and they are watched
   * rather than described:** a computed member name (`api[pick]()`) and a
   * surface taken apart by a binding pattern (`const { navigateToState } = api`).
   * Neither can be attributed to a member, so a cell below keeps the REGISTER of
   * such sites — the residual is something this census watches, not a caveat a
   * reader has to carry. Today it holds one, and it is real reach.
   *
   * ⚠ And the DIFFERENCE cell cannot stand in for that: it compares two walks
   * blind the same way, so a spelling both miss is invisible to it by
   * construction.
   */
  const typedScan = (): {
    reach: Record<string, Reached>;
    accesses: number;
    opaque: string[];
  } => {
    const memberNames = new Set(Object.values(LIVE).flat());
    const paths = consumerFiles().map((f) => path.join(ROOT, f));
    const config = ts.readConfigFile(
      path.join(ROOT, "tsconfig.json"),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
    const program = ts.createProgram(paths, {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
      jsx: ts.JsxEmit.Preserve,
    });
    const checker = program.getTypeChecker();

    const reach: Record<string, Reached> = {};

    for (const factory of FACTORIES) {
      reach[factory] = { src: new Set(), tests: new Set() };
    }

    /** Every surface a value's type is, unions included. */
    const surfacesOf = (type: ts.Type): string[] => {
      const parts = type.isUnionOrIntersection() ? type.types : [type];

      return parts.flatMap((part) => {
        const name = (part.aliasSymbol ?? part.getSymbol())?.getName();
        const factory = name === undefined ? undefined : FACTORY_BY_TYPE[name];

        return factory === undefined ? [] : [factory];
      });
    };

    /**
     * The member a reach is recorded FOR — both spellings of a literal name.
     *
     * ⚠ **`obj["member"]` is the same reach as `obj.member`, and reading only
     * the first makes a live member look unreached.** Measured: rewriting
     * `api.getUrlParams(name)` — the member's only shipped site — into
     * `api["getUrlParams"](name)` made the clause cell below report it as having
     * NO shipped caller, which is a wrong verdict presented as a derivation.
     * `seam-census-authority-2090` counts both spellings for the same reason.
     */
    const memberNameOf = (node: ts.Node): string | undefined => {
      if (ts.isPropertyAccessExpression(node)) {
        return node.name.text;
      }

      return ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : undefined;
    };

    let accesses = 0;
    const opaque: string[] = [];

    for (const file of paths) {
      const source = program.getSourceFile(file);

      if (!source) {
        continue;
      }

      const relative = path.relative(ROOT, file);
      const bucket = file.includes("/tests/") ? "tests" : "src";
      const isSurface = (node: ts.Expression): boolean =>
        surfacesOf(checker.getTypeAtLocation(node)).length > 0;

      const visit = (node: ts.Node): void => {
        const member = memberNameOf(node);

        if (member !== undefined && memberNames.has(member)) {
          accesses += 1;

          for (const factory of surfacesOf(
            checker.getTypeAtLocation(
              (node as ts.PropertyAccessExpression).expression,
            ),
          )) {
            reach[factory][bucket].add(member);
          }
        }

        // The two spellings no walk of ACCESSES can attribute to a member: a
        // computed name, and a surface taken apart by a binding pattern.
        if (
          ts.isElementAccessExpression(node) &&
          !ts.isStringLiteralLike(node.argumentExpression) &&
          isSurface(node.expression)
        ) {
          opaque.push(`${relative}: computed member name`);
        }

        if (
          ts.isVariableDeclaration(node) &&
          ts.isObjectBindingPattern(node.name) &&
          node.initializer !== undefined &&
          isSurface(node.initializer)
        ) {
          opaque.push(`${relative}: destructured surface`);
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    return { reach, accesses, opaque };
  };

  const typed = typedScan();

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
      // ⚠ What is LEFT here: the dependency record the getter walk reads until
      // its door goes (#2386), and the validator slot (#2388).
      getInternals: ["dependenciesGetStore", "validator"],
      getPluginApi: [
        "addCheck",
        "addEventListener",
        "addInterceptor",
        "buildNavigationState",
        "buildPathResolved",
        "claimContextNamespace",
        "extendRouter",
        "forwardState",
        "getAdoptedOrigins",
        "getDeclaredQueryNames",
        "getDependencyKeys",
        "getExternalGuardNames",
        "getForwardMap",
        "getOptions",
        "getResolvedLimits",
        "getRootPath",
        "getRouteConfig",
        "getTree",
        "getUrlParams",
        "logger",
        "makeState",
        "matchPath",
        "setRootPath",
      ],
      getRoutesApi: ["get", "subscribeChanges"],
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
    // function — is invisible on the far side: `validationPlugin` hands what
    // `getRoutesApi.get()` and `getPluginApi.getForwardMap()` return to
    // `validators/retrospective.ts`, which reads route fields and map entries
    // there. An empty or missing `src` for either means "no reach this
    // instrument can see", not "no reach".
    expect(rows).toStrictEqual({
      "getInternals.dependenciesGetStore()": {
        src: ["dependencies"],
        tests: [],
      },
      "getInternals.getCloneState()": { src: [], tests: ["limits"] },
      "getInternals.getOptions()": { src: [], tests: ["queryParams"] },
      "getInternals.routeGetStore()": {
        src: [],
        tests: ["matcherOptions"],
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
      "getPluginApi.getDependencyKeys()": { src: ["length"], tests: [] },
      "getPluginApi.getOptions()": {
        src: ["allowNotFound", "defaultRoute", "limits"],
        tests: [],
      },
      "getPluginApi.getResolvedLimits()": {
        src: ["maxDependencies"],
        tests: [],
      },
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
        "checks",
        "contextClaimRecords",
        "emitTransitionError",
        "forwardState",
        // ⚑ Untouched: their only consumer outside core moved to the `PluginApi`
        // twin — `getAdoptedOrigins` in #2339 slice 1, `getDeclaredQueryNames` and
        // `logger` in slice 2. The internals members are now dead weight, which
        // is the state the door's removal clears.
        "getAdoptedOrigins",
        "getDeclaredQueryNames",
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
      // ⚑ Both plugin-facing surfaces come back EMPTY: no member of
      // `getPluginApi` or of `getRoutesApi` is untouched by shipped code and
      // tests TOGETHER. That is the sharpest single answer this census gives to
      // "did we guard doors nobody uses" — on these two surfaces, nobody is
      // nobody.
      // ⚠ It does NOT say each member has a SHIPPED caller: this column is the
      // union of the two buckets, and separating them is #2383.
      getPluginApi: [],
      getRoutesApi: [],
      getNavigator: ["canNavigateTo", "isLeaveApproved", "subscribeLeave"],
      getDependenciesApi: ["has"],
      getLifecycleApi: ["removeActivateGuard"],
    });
  });

  it("the typed walk reaches the tree — anti-vacuum", () => {
    // ⚠ A program that resolved nothing would type every receiver as `any`,
    // report zero surfaces and leave the two cells below green on an empty set.
    expect(typed.accesses).toBeGreaterThan(100);
    expect(sorted(typed.reach.getPluginApi.src).length).toBeGreaterThan(5);
  });

  it("no file reaches a surface through a spelling no walk can attribute", () => {
    // ⚑ The residual of BOTH walks, kept as an invariant instead of a sentence.
    // A computed member name and a destructured surface carry real reach that
    // neither census can credit to a member, so what is pinned is the REGISTER
    // of such sites — a new one reds and names its file.
    //
    // ⚠ The one entry is real reach, not a false positive:
    // `getRoutesApi(router)[door]([route])` drives `add` and `replace` from one
    // table, so both doors are called and neither census sees it. Rewriting that
    // test to a literal spelling would bend a legitimate test to the census's
    // convenience, which is backwards — the census records what it cannot see.
    expect(typed.opaque).toStrictEqual([
      "packages/validation-plugin/tests/functional/drifting-route-batch-1911.test.ts: computed member name",
    ]);
  });

  it("clause (a): every member of `PluginApi` has a SHIPPED caller (#2383)", () => {
    // ⚑ The narrow question the membership rule asks, and the one the reverse
    // column cannot answer: that column is `src ∪ tests`, so a member only a
    // test reaches counts as reached there. Here shipped code alone does.
    expect(sorted(typed.reach.getPluginApi.src)).toStrictEqual(
      LIVE.getPluginApi.toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("what the idiom walk cannot see, named by derivation rather than prose", () => {
    // ⚑ The bound is a DIFFERENCE, not a caveat: these members are reached by
    // shipped code through an idiom the syntactic census has no owner for — a
    // class field in `memory-plugin`, a dependency-bag field in
    // `shared/browser-env`. A new invisible idiom makes this set grow; teaching
    // the idiom walk one makes it shrink. Either way it is an event, which a
    // sentence in a docblock is not.
    const missed = (factory: string): string[] =>
      sorted(typed.reach[factory].src).filter(
        (member) => !hits[factory].src.has(member),
      );

    expect({
      getInternals: missed("getInternals"),
      getPluginApi: missed("getPluginApi"),
      getRoutesApi: missed("getRoutesApi"),
      getNavigator: missed("getNavigator"),
      getDependenciesApi: missed("getDependenciesApi"),
      getLifecycleApi: missed("getLifecycleApi"),
    }).toStrictEqual({
      getInternals: [],
      getPluginApi: ["emitTransitionError", "navigateToState"],
      getRoutesApi: [],
      getNavigator: [],
      getDependenciesApi: [],
      getLifecycleApi: [],
    });
  });
});
