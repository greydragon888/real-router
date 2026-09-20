import { existsSync, globSync, readFileSync } from "node:fs";
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
 * How many doors there are — the one question the six sibling censuses cannot
 * answer separately, because each pins a SET and the number is their sum
 * (#2303).
 *
 * ⚠ **A sum is only meaningful if nothing is counted twice, so that is pinned
 * first.** Every name here is qualified by its owner — `Route.decodeParams` is
 * not `Plugin.onStart` and neither is `getInternals.port` — and the cell below
 * asserts the union is exactly as large as the buckets added up. A door that
 * starts appearing in two buckets reds that assertion before it reaches the
 * total.
 *
 * ⚑ Three boundary decisions are made here rather than measured, and each one
 * changes the number:
 *
 * - **Six adapters count as one `Link`.** The nine router-owned props are
 *   identical in all six, so they are one door in six implementations; counting
 *   per adapter would report 54.
 * - **The provider is counted from React's declaration.** Angular's is a
 *   different door — it takes `plugins` and `deps` and BUILDS a router where
 *   the other five are handed one — and its three construction props are
 *   outside this total.
 * - **Callback CONTRACTS are not counted.** `GuardFn`, `PluginFactory` and the
 *   nine others are the type of what gets attached; the door is the slot it
 *   attaches to, and those slots are already here.
 *
 * ⚠ **Two axes are deliberately absent**, for the reason the folder README
 * states: what core hands out per navigation, and what guards a door, are
 * counted in units that are not places-to-put-something. Adding them to this
 * sum would repeat the category error this census exists to avoid.
 */
describe("door total (#2303)", () => {
  const ROOT = path.resolve(__dirname, "../../../../..");

  const parse = (file: string): ts.SourceFile =>
    ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

  const membersOf = (o: object): string[] => [
    ...Object.getOwnPropertyNames(o),
    ...Object.getOwnPropertySymbols(o).map(String),
  ];

  /** Named members of one interface, wherever it is declared among `files`. */
  function fieldsOf(files: string[], name: string): string[] {
    for (const file of files) {
      for (const st of parse(file).statements) {
        if (ts.isInterfaceDeclaration(st) && st.name.text === name) {
          return st.members
            .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
            .map((m) => (m.name as ts.Identifier).text);
        }
      }
    }

    return [];
  }

  /**
   * Every published shape an application FILLS, by NAME — no paths.
   *
   * ⚑ Which file declares a shape is derivable, and a table of paths is one
   * more hand-written list to go stale. This list says only WHICH shapes are
   * doors; where they live and what fields they carry is read off the tree.
   */
  const CORE_BAGS = new Set([
    // core's own bags
    "Route",
    "Options",
    "NavigationOptions",
    // ⚑ The `to` descriptor an adapter takes as one prop and core takes as one
    // argument. Its FIELDS are what an application fills, and counting the prop
    // alone hid three of them.
    "NavigationTarget",
    "QueryParamsOptions",
    "LimitsConfig",
    "LoggerConfig",
    "RouteConfigUpdate",
    "Plugin",
    "Listener",
    // plugin option bags
    "BrowserPluginOptions",
    "HashPluginOptions",
    "LoggerPluginConfig",
    "MemoryPluginOptions",
    "NavigationPluginOptions",
    "PreloadPluginOptions",
    "SearchSchemaPluginOptions",
    // the shape `rscActionPluginFactory`'s callback RETURNS
    "RscActionResult",
    // what a provider prop carries
    "RouteAnnouncerOptions",
    "ScrollRestorationOptions",
    "ScrollSpyOptions",
    // adapter and utility bags an application hands in
    "ActiveRouteSourceOptions",
    "HydrateRouterOptions",
    "InjectDeferredScriptsOptions",
    "ObservableOptions",
    "SerializeRouterStateOptions",
    "SerializeStateOptions",
    "UseRouteEnterOptions",
    "UseRouteExitOptions",
    "RealRouterOptions",
    "LinkActionParams",
    "LinkDirectiveValue",
    "RouteViewProps",
    "InkLinkProps",
    "InkRouterProviderProps",
    "StaticPathEntry",
    // platform adapters an application may IMPLEMENT and hand over
    "Browser",
    "Observer",
  ]);

  /** The declaration of a shape, found rather than named. */
  function shapeFields(name: string): string[] {
    for (const relative of [
      ...globSync("packages/*/src/**/*.ts", { cwd: ROOT }),
      ...globSync("shared/*/**/*.ts", { cwd: ROOT }),
    ]) {
      for (const st of parse(path.join(ROOT, relative)).statements) {
        if (ts.isInterfaceDeclaration(st) && st.name.text === name) {
          return st.members
            .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
            .map((m) => (m.name as ts.Identifier).text);
        }

        if (
          ts.isTypeAliasDeclaration(st) &&
          st.name.text === name &&
          ts.isTypeLiteralNode(st.type)
        ) {
          return st.type.members
            .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
            .map((m) => (m.name as ts.Identifier).text);
        }
      }
    }

    return [];
  }

  const FACTORIES: Record<string, string> = {
    browserPluginFactory: "browser-plugin/src/factory.ts",
    hashPluginFactory: "hash-plugin/src/factory.ts",
    lifecyclePluginFactory: "lifecycle-plugin/src/factory.ts",
    loggerPluginFactory: "logger-plugin/src/factory.ts",
    memoryPluginFactory: "memory-plugin/src/factory.ts",
    navigationPluginFactory: "navigation-plugin/src/factory.ts",
    persistentParamsPluginFactory: "persistent-params-plugin/src/factory.ts",
    preloadPluginFactory: "preload-plugin/src/factory.ts",
    rscServerPluginFactory: "rsc-server-plugin/src/factory.ts",
    ssrDataPluginFactory: "ssr-data-plugin/src/factory.ts",
    validationPlugin: "validation-plugin/src/validationPlugin.ts",
    searchSchemaPlugin: "search-schema-plugin/src/factory.ts",
    rscActionPluginFactory: "rsc-server-plugin/src/actionFactory.ts",
  };

  /**
   * The `Link` props that belong to the ROUTER, derived rather than listed.
   *
   * ⚑ Angular declares them as directive inputs and is the only adapter
   * without a host-platform prop among them, so its input set IS the
   * router-owned set. Taking it as the source and checking every other adapter
   * declares each one replaces a hand-written list with a derivation plus a
   * cross-check — a copy of a sibling's result is the shape this census exists
   * to refuse.
   */
  function linkProps(): string[] {
    const file = path.join(ROOT, "packages/angular/src/directives/RealLink.ts");
    const sf = parse(file);
    const names: string[] = [];

    const walk = (node: ts.Node): void => {
      if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(sf).split(".", 1)[0] === "input"
      ) {
        names.push(node.name.text);
      }

      ts.forEachChild(node, walk);
    };

    walk(sf);

    return names.toSorted((a, b) => a.localeCompare(b));
  }

  /**
   * Fields a plugin merges into one of core's bags by module augmentation.
   *
   * ⚑ Core declares ten fields on `Route` and carries an index signature so
   * plugins add their own; those additions are doors an application fills and
   * core cannot refuse, and counting only what core declares hides every one of
   * them. Derived from the `declare module` blocks rather than listed, because
   * the list is exactly what goes stale when a plugin grows a field.
   */
  function collectAugmented(body: ts.ModuleBlock, out: string[]): void {
    for (const st of body.statements) {
      if (!ts.isInterfaceDeclaration(st) || !CORE_BAGS.has(st.name.text)) {
        continue;
      }

      for (const m of st.members) {
        if (m.name !== undefined && ts.isIdentifier(m.name)) {
          out.push(`${st.name.text}.${m.name.text}`);
        }
      }
    }
  }

  function augmentedFields(): string[] {
    const out: string[] = [];

    for (const relative of globSync("packages/*/src/**/*.ts", { cwd: ROOT })) {
      if (relative.startsWith("packages/core/")) {
        continue;
      }

      const sf = parse(path.join(ROOT, relative));

      const walk = (node: ts.Node): void => {
        if (
          ts.isModuleDeclaration(node) &&
          ts.isStringLiteral(node.name) &&
          node.name.text.startsWith("@real-router/core") &&
          node.body !== undefined &&
          ts.isModuleBlock(node.body)
        ) {
          collectAugmented(node.body, out);
        }

        ts.forEachChild(node, walk);
      };

      walk(sf);
    }

    return [...new Set(out)];
  }

  function census(inline: Record<string, string[]>): {
    buckets: Record<string, string[]>;
    union: Set<string>;
  } {
    const router = createRouter([{ name: "u", path: "/u/:id?tab" }]);
    const buckets: Record<string, string[]> = {};

    const surfaces: Record<string, object> = {
      getInternals: getInternals(router),
      getPluginApi: getPluginApi(router),
      getRoutesApi: getRoutesApi(router),
      getNavigator: getNavigator(router),
      getDependenciesApi: getDependenciesApi(router),
      getLifecycleApi: getLifecycleApi(router),
    };

    buckets["surface members"] = Object.entries(surfaces).flatMap(([s, o]) =>
      membersOf(o).map((m) => `${s}.${m}`),
    );

    buckets["Router facade"] = [
      ...new Set([
        ...membersOf(router as unknown as object),
        ...membersOf(Object.getPrototypeOf(router) as object),
      ]),
    ]
      .filter((m) => m !== "constructor")
      .map((m) => `Router.${m}`);

    for (const bag of CORE_BAGS) {
      buckets[`bag: ${bag}`] = shapeFields(bag).map((f) => `${bag}.${f}`);
    }

    const params: string[] = [];

    for (const [factory, relative] of Object.entries(FACTORIES)) {
      const sf = parse(path.join(ROOT, "packages", relative));

      for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name?.text === factory) {
          for (const p of st.parameters) {
            params.push(`${factory}.${p.name.getText(sf)}`);
          }
        }
      }
    }

    buckets["plugin factory params"] = params;

    for (const [key, fields] of Object.entries(inline)) {
      buckets[`inline bag: ${key}`] = fields;
    }

    buckets["plugin augmentations"] = augmentedFields();

    buckets["Link props"] = linkProps().map((p) => `Link.${p}`);

    // ⚠ React's declaration by PATH, not by `shapeFields`: five adapters
    // declare `RouteProviderProps`, and a search of the tree would return
    // whichever it met first. The cell below is what makes taking React's
    // sound.
    buckets["provider props"] = fieldsOf(
      [path.join(ROOT, "packages/react/src/RouterProvider.tsx")],
      "RouteProviderProps",
    ).map((p) => `RouterProvider.${p}`);

    return {
      buckets,
      union: new Set(Object.values(buckets).flat()),
    };
  }

  // The file's one program build — `checkerShapes` states what it costs.
  const compiled = checkerShapes();
  const { buckets, union } = census(compiled.inline);
  const sum = Object.values(buckets).reduce((a, b) => a + b.length, 0);

  /**
   * Why a symbol that COULD hold doors does not contribute one.
   *
   * ⚑ The seeds above are hand-written, so the count is exactly as complete as
   * they are — and nothing proved they were until this table. Every exported
   * interface in core's types and every plugin factory in the tree has to be
   * accounted for here; an unclassified one reds rather than being absent from
   * a number nobody re-derives.
   */
  const WHY_NOT: Record<string, string> = {
    // Handed out by core: counted as members of a live surface, not as a bag.
    ContextNamespaceClaim: "surface",
    DependenciesApi: "surface",
    CheckPositionMap: "surface",
    DiagnosticEventMap: "surface",
    InterceptableMethodMap: "surface",
    LifecycleApi: "surface",
    Navigator: "surface",
    PluginApi: "surface",
    Router: "surface",
    RouterError: "surface",
    RouterLogger: "surface",
    RouterValidator: "surface",
    RoutesApi: "surface",
    Subscription: "surface",
    // Built by core and handed out. The handout axis owns these.
    AdoptedOrigins: "output",
    LeaveState: "output",
    RouteTreeState: "output",
    SimpleState: "output",
    State: "output",
    SubscribeState: "output",
    TransitionMeta: "output",
    TreeChangedAdd: "output",
    TreeChangedClear: "output",
    TreeChangedRemove: "output",
    TreeChangedReplace: "output",
    TreeChangedUpdate: "output",
    // Type-level maps with no runtime instance to fill.
    ErrorCodeToValueMap: "type-map",
    EventToNameMap: "type-map",
    EventToPluginMap: "type-map",
    StateContext: "open-record",
    // The two channels a codec is handed and returns — the door is the
    // `Route.decodeParams` / `encodeParams` slot, already counted.
    ParamsSearch: "callback contract",
    // Plugin shapes core or the plugin BUILDS and publishes on `state.context`;
    // an application reads them, and the handout axis owns what that costs.
    BrowserContext: "output",
    MemoryContext: "output",
    NavigationMeta: "output",
    RscPayload: "output",
    // The platform adapter an application MAY implement and hand to a factory.
    // The parameter slot is the door and is counted; the interface is the
    // contract core calls back on, which is the returns axis, not this one.
    NavigationBrowser: "handed-in contract",
    // A function an application attaches to a route — counted as the augmented
    // `Route.preload` slot, not twice as its own type.
    PreloadTarget: "callback contract",
    // The external Standard Schema spec a schema library implements.
    StandardSchemaV1: "external spec",
    StandardSchemaV1Issue: "external spec",
    // Adapter and utility shapes core or an adapter BUILDS and hands out. Each
    // was classified by POSITION — measured, they appear as a return type or as
    // the parameter of a callback the application writes, never as a bag the
    // application fills.
    ActiveNameSelector: "output",
    DeferredPayload: "output",
    DismissableErrorSnapshot: "output",
    ErrorContext: "output",
    HttpStatusSink: "output — `createHttpStatusSink()` mints it",
    RequestScope: "output",
    RouteContext: "output",
    RouteEnterContext: "output — handed TO the handler an application writes",
    RouteExitContext: "output — handed TO the handler an application writes",
    RouteNodeSnapshot: "output",
    RouterContextValue: "output",
    RouterErrorSnapshot: "output",
    RouterTransitionSnapshot: "output",
    RouteSignals: "output",
    RouteSnapshot: "output",
    RouteState: "output",
    SsrLoaderContext: "output — handed TO the loader an application writes",
    // Handed out by core or by `@real-router/sources`, counted as live members.
    RouterInternals: "surface",
    RouterSource: "surface",
    RouteTree: "surface",
    // Already counted, under the name the census uses for it.
    LinkProps: "counted as the `Link props` bucket",
    RealRouterFactoryOptions:
      "Angular's provider — a different door, excluded by decision above",
    // Frozen constant objects a package publishes for reading, not filling.
    DEFAULT_ACTIVE_OPTIONS: "output — a frozen default, read not filled",
    errorCodes: "output — a frozen constant table",
    events: "output — a frozen constant table",
    RouteView: "render plumbing",
    // Render plumbing: a component's own props, which the folder README puts
    // outside the census — none of them carries data into routing state.
    AwaitProps: "render plumbing",
    HttpStatusCodeProps: "render plumbing",
    HttpStatusProviderProps: "render plumbing",
    RouteViewMatchProps: "render plumbing",
    RouteViewSelfProps: "render plumbing",
    RouterErrorBoundaryProps: "render plumbing",
    // The loader map an application supplies — counted as the factory
    // parameter it is passed through, not twice as its own type.
    DataLoaderTarget: "callback contract",
    RscLoaderTarget: "callback contract",
    // Derived views and outputs.
    // ⚠ NOT output: `RouterInternals.matchPath(path, options?: AnyOptions)`
    // takes one from a plugin author. It is `Options<never>` — the SAME door
    // under a second name, so its fields are counted once, as `Options`.
    AnyOptions: "counted as `Options` — the erased view of the same bag",
    ReadonlyRoute: "output — the frozen view of `Route`",
    RouterEvent: "output",
    SerializedRouterState: "output",
    TreeChangedEvent: "output",
    TreeStructuralPatch: "output",
    Matcher: "surface",
    // Shapes of the host platform, not of this library.
    IncomingMessageLike: "external platform shape",
    RequestLike: "external platform shape",
    // Factories the census does not seed, each for its own reason.
    createRouterPlugin: "takes core's own router, not an application value",
  };

  function barrelNames(file: string, seen: Set<string>): string[] {
    if (seen.has(file) || !existsSync(file)) {
      return [];
    }

    seen.add(file);

    const out: string[] = [];

    for (const st of parse(file).statements) {
      if (ts.isExportDeclaration(st)) {
        out.push(...fromExport(st, file, seen));

        continue;
      }

      if (
        ts.canHaveModifiers(st) &&
        (ts.getModifiers(st) ?? []).some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        )
      ) {
        out.push(...declaredName(st));
      }
    }

    return out;
  }

  function fromExport(
    st: ts.ExportDeclaration,
    file: string,
    seen: Set<string>,
  ): string[] {
    if (st.exportClause !== undefined) {
      return ts.isNamedExports(st.exportClause)
        ? st.exportClause.elements.map((element) => element.name.text)
        : [];
    }

    const spec =
      st.moduleSpecifier !== undefined && ts.isStringLiteral(st.moduleSpecifier)
        ? st.moduleSpecifier.text
        : undefined;

    if (!spec?.startsWith(".")) {
      return [];
    }

    const base = path.resolve(path.dirname(file), spec);
    const target = [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ].find((candidate) => existsSync(candidate));

    // ⚠ Anti-vacuum: an unresolvable star would shrink the published set and
    // let every shape behind it pass unclassified.
    if (target === undefined) {
      throw new Error(`${file}: unresolvable export * from "${spec}"`);
    }

    return barrelNames(target, seen);
  }

  function declaredName(st: ts.Statement): string[] {
    if (
      ts.isInterfaceDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isClassDeclaration(st) ||
      ts.isFunctionDeclaration(st)
    ) {
      return st.name ? [st.name.text] : [];
    }

    return ts.isVariableStatement(st)
      ? st.declarationList.declarations
          .filter((d) => ts.isIdentifier(d.name))
          .map((d) => (d.name as ts.Identifier).text)
      : [];
  }

  function sourceEntryOf(
    conditions: Record<string, unknown>,
    directory: string,
  ): string | undefined {
    const declared = conditions["@real-router/internal-source"];

    if (typeof declared === "string") {
      return declared;
    }

    const dist = conditions.import ?? conditions.svelte ?? conditions.default;

    if (typeof dist !== "string") {
      return undefined;
    }

    const stripped = dist
      .replace(/^\.\/dist\/(?:esm\/)?/, "./src/")
      .replace(/\.(?:mjs|cjs|js)$/, "");

    return [`${stripped}.ts`, `${stripped}.tsx`, `${stripped}/index.ts`].find(
      (candidate) => existsSync(path.join(directory, candidate)),
    );
  }

  function publishedNames(): Set<string> {
    const out = new Set<string>();

    for (const relative of globSync("packages/*/package.json", { cwd: ROOT })) {
      const directory = path.dirname(path.join(ROOT, relative));
      const manifest = JSON.parse(
        readFileSync(path.join(ROOT, relative), "utf8"),
      ) as { exports?: Record<string, Record<string, unknown>> };

      for (const conditions of Object.values(manifest.exports ?? {})) {
        const entry = sourceEntryOf(conditions, directory);

        if (entry !== undefined) {
          for (const name of barrelNames(
            path.join(directory, entry),
            new Set(),
          )) {
            out.add(name);
          }
        }
      }
    }

    return out;
  }

  /**
   * Published names whose TYPE has members, asked of the compiler.
   *
   * ⚑ A parser has to be taught every syntax a bag can be written in, and it
   * was taught two before this — an interface and an object type-alias — while
   * a union with an object member and an inline parameter bag slipped past.
   * Widening the recogniser one form at a time is the same defect as widening a
   * list of directories one entry at a time. The checker answers for every
   * form at once, because the question it is asked is "does this type have
   * members", not "what does this declaration look like".
   *
   * ⚠ Two filters keep it honest. Callable types are out — a component or a
   * factory is not a bag. And a member counts only if it is DECLARED IN THIS
   * TREE: a union of string literals reports `String.prototype`'s members, and
   * every enum-shaped type in the repository would otherwise read as a door.
   *
   * ⚠ `checkerShapes()` costs a `ts.createProgram` over every published entry,
   * so the file calls it once, at collection, and every cell reads that answer
   * from `compiled` (#2329). A call inside a test puts the build under
   * `testTimeout`, which it can miss under coverage on a loaded CI runner.
   */
  /**
   * Does this type declare members of its OWN, in this tree?
   *
   * A callable type is a component or a factory, not a bag. And a union of
   * string literals reports `String.prototype`'s members, so every enum-shaped
   * type in the repository would read as a door without the second filter.
   */
  function hasOwnMembers(checker: ts.TypeChecker, type: ts.Type): boolean {
    if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) {
      return false;
    }

    return checker.getPropertiesOfType(type).some((property) =>
      property.declarations?.some((d) => {
        const file = d.getSourceFile().fileName;

        return file.startsWith(ROOT) && !file.includes("node_modules");
      }),
    );
  }

  /**
   * A published FUNCTION can take its bag inline, with no name for a name-keyed
   * scan to find — `defer({ critical, deferred })` is one.
   */
  function collectInlineBags(
    name: string,
    declaration: ts.SignatureDeclaration,
    out: Set<string>,
    inline: Record<string, string[]>,
  ): void {
    for (const parameter of declaration.parameters) {
      if (
        parameter.type === undefined ||
        !ts.isTypeLiteralNode(parameter.type)
      ) {
        continue;
      }

      const key = `${name}(${parameter.name.getText()})`;

      out.add(key);
      inline[key] = parameter.type.members
        .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
        .map((m) => `${name}.${(m.name as ts.Identifier).text}`);
    }
  }

  function noteExport(
    checker: ts.TypeChecker,
    exported: ts.Symbol,
    out: Set<string>,
    inline: Record<string, string[]>,
  ): void {
    const name = exported.getName();
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const declaration = symbol.declarations?.[0];

    if (declaration === undefined) {
      return;
    }

    const signature = callableOf(declaration);

    if (signature !== undefined) {
      collectInlineBags(name, signature, out, inline);

      return;
    }

    // ⚑ No filter on the KIND of declaration. Asking only interfaces, then
    // interfaces and aliases, then those and function declarations, is the same
    // hand-maintained list the scope and the recogniser already were — it just
    // moved into an `if`. A class and a `const` can carry members too, and the
    // checker answers for all of them from the type.
    const type =
      ts.isTypeAliasDeclaration(declaration) ||
      ts.isInterfaceDeclaration(declaration)
        ? checker.getDeclaredTypeOfSymbol(symbol)
        : checker.getTypeOfSymbolAtLocation(symbol, declaration);

    if (hasOwnMembers(checker, type)) {
      out.add(name);
    }
  }

  /** The signature of anything callable, however it was written. */
  function callableOf(
    declaration: ts.Declaration,
  ): ts.SignatureDeclaration | undefined {
    if (ts.isFunctionDeclaration(declaration)) {
      return declaration;
    }

    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer))
    ) {
      return declaration.initializer;
    }

    return undefined;
  }

  /**
   * Which published entry points ACCEPT a value of each name.
   *
   * ⚑ This is the verdict check, and it exists because the ratchet above only
   * forces a classification — it cannot say the classification is RIGHT. A name
   * called `output` that some published signature accepts from the application
   * is the shape of a wrong verdict, and it found one: `AnyOptions` is taken by
   * `RouterInternals.matchPath`.
   */
  /** A published callable, or every callable member of a published surface. */
  function callablesOf(
    checker: ts.TypeChecker,
    label: string,
    type: ts.Type,
  ): [string, ts.Signature][] {
    const own = checker.getSignaturesOfType(type, ts.SignatureKind.Call);

    if (own.length > 0) {
      return own.map((signature) => [label, signature]);
    }

    const out: [string, ts.Signature][] = [];

    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.declarations?.[0];

      if (declaration === undefined) {
        continue;
      }

      const propertyType = checker.getTypeOfSymbolAtLocation(
        property,
        declaration,
      );

      for (const signature of checker.getSignaturesOfType(
        propertyType,
        ts.SignatureKind.Call,
      )) {
        out.push([`${label}.${property.getName()}`, signature]);
      }
    }

    return out;
  }

  /**
   * Every capitalised name a parameter's declaration mentions, against the
   * entry point that accepts it.
   *
   * ⚠ Recorded for EVERY name rather than for the verdicts it can refute: the
   * cell that filters is what knows them, so this walk carries no dependency on
   * a table declared below it.
   */
  function noteParameter(
    label: string,
    parameter: ts.Symbol,
    accepts: Record<string, string[]>,
  ): void {
    const declaration = parameter.declarations?.[0];

    if (declaration === undefined) {
      return;
    }

    for (const match of declaration
      .getText()
      .matchAll(/\b[A-Z][A-Za-z0-9]*\b/g)) {
      const name = match[0];

      accepts[name] ??= [];

      if (!accepts[name].includes(label)) {
        accepts[name].push(label);
      }
    }
  }

  function noteAccepted(
    checker: ts.TypeChecker,
    exported: ts.Symbol,
    accepts: Record<string, string[]>,
  ): void {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const declaration = symbol.declarations?.[0];

    if (declaration === undefined) {
      return;
    }

    const type =
      ts.isTypeAliasDeclaration(declaration) ||
      ts.isInterfaceDeclaration(declaration)
        ? checker.getDeclaredTypeOfSymbol(symbol)
        : checker.getTypeOfSymbolAtLocation(symbol, declaration);

    const callables = callablesOf(checker, exported.getName(), type);

    for (const [label, sig] of callables) {
      for (const parameter of sig.getParameters()) {
        noteParameter(label, parameter, accepts);
      }
    }
  }

  function checkerShapes(): {
    shapes: Set<string>;
    inline: Record<string, string[]>;
    accepts: Record<string, string[]>;
  } {
    const inline: Record<string, string[]> = {};
    const accepts: Record<string, string[]> = {};
    const entries: string[] = [];

    for (const relative of globSync("packages/*/package.json", { cwd: ROOT })) {
      const directory = path.dirname(path.join(ROOT, relative));
      const manifest = JSON.parse(
        readFileSync(path.join(ROOT, relative), "utf8"),
      ) as { exports?: Record<string, Record<string, unknown>> };

      for (const conditions of Object.values(manifest.exports ?? {})) {
        const entry = sourceEntryOf(conditions, directory);

        if (entry !== undefined) {
          entries.push(path.join(directory, entry));
        }
      }
    }

    const config = ts.readConfigFile(
      path.join(ROOT, "tsconfig.json"),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
    const program = ts.createProgram(entries, {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
    });
    const checker = program.getTypeChecker();
    const out = new Set<string>();

    for (const entry of entries) {
      const sf = program.getSourceFile(entry);
      const moduleSymbol = sf && checker.getSymbolAtLocation(sf);

      if (!moduleSymbol) {
        continue;
      }

      for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        noteExport(checker, exported, out, inline);
        noteAccepted(checker, exported, accepts);
      }
    }

    return { shapes: out, inline, accepts };
  }

  /**
   * Every object shape and plugin factory the MANIFESTS publish.
   *
   * ⚑ The scope is the manifests, not a list of directories. Widening a
   * hand-written list of places to look is the same defect one level up, and it
   * failed twice: the plugins' types were outside it, then the adapters' and
   * `shared/` were. What a package publishes is derivable, so a new package, a
   * new subpath or a new adapter enters this set without anyone remembering.
   *
   * ⚠ And REACHABLE is the right filter, not exported: `reachability` measures
   * that a symbol exported from a file no manifest names is a site, not a door,
   * and enumerating every exported interface in the tree would put a hundred
   * internal shapes in front of the classifier for nothing.
   */
  function declaredSymbols(): Set<string> {
    const published = publishedNames();
    // A copy: `compiled` is shared by every cell, and this adds to the set.
    const out = new Set(compiled.shapes);

    for (const name of published) {
      if (/^[a-z][A-Za-z]*(?:PluginFactory|Plugin)$/.test(name)) {
        out.add(name);
      }
    }

    return out;
  }

  it("every symbol that could hold doors is accounted for", () => {
    const declared = declaredSymbols();

    // ⚠ Anti-vacuum: a walk that found nothing would leave this set empty and
    // every symbol trivially accounted for.
    expect(declared.size).toBeGreaterThan(60);

    const accounted = new Set([
      ...CORE_BAGS,
      // The inline bags are doors and already have a bucket each; the labels
      // are where their keys live.
      ...Object.keys(buckets)
        .filter((label) => label.startsWith("inline bag: "))
        .map((label) => label.slice("inline bag: ".length)),
      ...Object.keys(FACTORIES),
      ...Object.keys(WHY_NOT),
    ]);

    expect(
      [...declared]
        .filter((n) => !accounted.has(n))
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([]);

    // The reverse: a classification for a symbol that no longer exists is a
    // dead entry, and it would keep a real omission looking accounted for.
    expect(
      Object.keys(WHY_NOT)
        .filter((n) => !declared.has(n))
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([]);
  });

  /**
   * Why a name classified as NOT a door is still not one, even though some
   * published signature accepts it.
   *
   * ⚑ Five shapes are safe and nothing else is. A CALLBACK the application
   * implements takes its argument FROM core, so accepting it proves nothing. A
   * ROUND-TRIP hands back an object core minted. A HANDED-IN CONTRACT is
   * accepted at a parameter slot that is itself already counted. And one door
   * is excluded by a decision recorded above. And a SECOND NAME for a bag
   * already counted adds no field. Anything else is a bag the application
   * fills, and the verdict on it is wrong.
   */
  const ACCEPTED_ANYWAY: Record<string, string> = {
    LeaveState: "callback — `LeaveFn` is written by the application",
    RouteEnterContext: "callback — `RouteEnterHandler`",
    RouteExitContext: "callback — `RouteExitHandler`",
    SsrLoaderContext: "callback — `DataLoaderFn` / `RscLoaderFn`",
    SubscribeState: "callback — `SubscribeFn`",
    TreeChangedEvent: "callback — the handler `subscribeChanges` takes",
    State: "round-trip — handed back to `serializeRouterState`",
    HttpStatusSink: "round-trip — `createHttpStatusSink()` mints it",
    Router: "round-trip — the instance core built, handed back",
    RouterSource: "round-trip — a source core built",
    RouteTree: "round-trip — the tree core built",
    InterceptableMethodMap: "callback — `InterceptorFn`",
    CheckPositionMap: "callback — `CheckFn`",
    DiagnosticEventMap: "callback — a diagnostic handler",
    ParamsSearch: "callback — a route's `encodeParams` / `decodeParams`",
    PreloadTarget: "callback — `PreloadFn`",
    RouterError: "callback — `onError`, `fallback`, `Plugin.onTransitionError`",
    StandardSchemaV1Issue: "callback — `SearchSchemaPluginOptions.onError`",
    NavigationBrowser:
      "handed-in contract — the slot `navigationPluginFactory.browser` is counted",
    RealRouterFactoryOptions:
      "excluded by decision — Angular builds a router rather than being handed one",
    AnyOptions: "same bag as `Options`, whose fields are counted once",
  };

  it("no verdict of NOT-a-door is refuted by a signature that accepts one", () => {
    const { accepts } = compiled;

    // Positive control: the walk found accepting signatures at all, so an empty
    // map cannot pass this cell by agreeing with everything.
    expect(Object.keys(accepts).length).toBeGreaterThan(50);

    // ⚠ EVERY verdict, not only `output`. A name called a surface, or render
    // plumbing, is just as capable of being a bag somebody fills, and checking
    // one category out of eight is the hand-kept list again.
    const refuted = Object.keys(WHY_NOT)
      .filter((name) => (accepts[name] ?? []).length > 0)
      .filter((name) => !(name in ACCEPTED_ANYWAY))
      .map((name) => `${name} ← ${(accepts[name] ?? []).join(", ")}`)
      .toSorted((a, b) => a.localeCompare(b));

    expect(refuted).toStrictEqual([]);

    // ⚠ And the reverse, for the same reason the classification ratchet has
    // one: an exemption for a name nothing accepts any more is a dead entry,
    // and it would cover a real refutation that arrives later.
    expect(
      Object.keys(ACCEPTED_ANYWAY)
        .filter((name) => (accepts[name] ?? []).length === 0)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([]);
  });

  it("counting the provider from one adapter loses nothing", () => {
    // ⚑ The total takes React's declaration, and that is only sound if no
    // sibling declares a router-owned prop React lacks. Two siblings declare
    // theirs as an interface and are checked here against React's set.
    //
    // ⚠ Vue's is a `defineComponent` props literal and Svelte's is a `$props()`
    // annotation inside markup; both need a shape-specific reader that
    // `door-census/application` already owns and pins per adapter. Re-deriving
    // them here would be a second observer of a set with one owner, so this
    // cell names the limit instead of hiding it. Angular is a DIFFERENT door
    // and stays out by decision — it takes `plugins` and `deps` and builds a
    // router rather than being handed one.
    const react = new Set(
      fieldsOf(
        [path.join(ROOT, "packages/react/src/RouterProvider.tsx")],
        "RouteProviderProps",
      ),
    );

    expect(react.size).toBeGreaterThan(4);

    const beyond: Record<string, string[]> = {};

    for (const adapter of ["preact", "solid"]) {
      const declared = fieldsOf(
        [path.join(ROOT, `packages/${adapter}/src/RouterProvider.tsx`)],
        "RouteProviderProps",
      );

      expect(declared.length, `${adapter} declares a provider`).toBeGreaterThan(
        3,
      );

      const outside = declared.filter((f) => !react.has(f));

      if (outside.length > 0) {
        beyond[adapter] = outside.toSorted((a, b) => a.localeCompare(b));
      }
    }

    expect(beyond).toStrictEqual({});
  });

  it("every bucket reaches its source — anti-vacuum", () => {
    // ⚠ A derivation that matched nothing would leave a bucket empty and the
    // total merely smaller, which reads like a door being removed rather than
    // like a scan that broke.
    expect(
      Object.entries(buckets)
        .filter(([, names]) => names.length === 0)
        .map(([label]) => label),
    ).toStrictEqual([]);

    expect(Object.keys(buckets)).toHaveLength(48);
  });

  it("no door is counted twice — the sum is a union", () => {
    // ⚑ This is what makes a total legitimate at all. Qualifying every name by
    // its owner is the mechanism; this is the check that the mechanism held.
    expect(union.size).toBe(sum);
  });

  it("the count, by bucket", () => {
    expect(
      Object.fromEntries(
        Object.entries(buckets).map(([label, names]) => [label, names.length]),
      ),
    ).toStrictEqual({
      "Link props": 9,
      "Router facade": 19,
      "bag: ActiveRouteSourceOptions": 3,
      "bag: Browser": 1,
      "bag: BrowserPluginOptions": 2,
      "bag: HashPluginOptions": 3,
      "bag: HydrateRouterOptions": 1,
      "bag: InjectDeferredScriptsOptions": 3,
      "bag: InkLinkProps": 16,
      "bag: InkRouterProviderProps": 2,
      "bag: LimitsConfig": 5,
      "bag: LinkActionParams": 3,
      "bag: LinkDirectiveValue": 3,
      "bag: Listener": 3,
      "bag: LoggerConfig": 3,
      "bag: LoggerPluginConfig": 5,
      "bag: MemoryPluginOptions": 1,
      "bag: NavigationOptions": 7,
      "bag: NavigationPluginOptions": 2,
      "bag: NavigationTarget": 3,
      "bag: ObservableOptions": 2,
      "bag: Observer": 3,
      "bag: Options": 12,
      "bag: Plugin": 8,
      "bag: PreloadPluginOptions": 2,
      "bag: QueryParamsOptions": 4,
      "bag: RealRouterOptions": 3,
      "bag: Route": 10,
      "bag: RouteAnnouncerOptions": 2,
      "bag: RouteConfigUpdate": 7,
      "bag: RouteViewProps": 2,
      "bag: RscActionResult": 2,
      "bag: ScrollRestorationOptions": 5,
      "bag: ScrollSpyOptions": 3,
      "bag: SearchSchemaPluginOptions": 3,
      "bag: SerializeRouterStateOptions": 2,
      "bag: SerializeStateOptions": 1,
      "bag: StaticPathEntry": 2,
      "bag: UseRouteEnterOptions": 1,
      "bag: UseRouteExitOptions": 1,
      "inline bag: defer(options)": 2,
      "inline bag: injectIsActiveRoute(options)": 3,
      "inline bag: state$(options)": 1,
      "inline bag: withTimeout(options)": 1,
      "plugin augmentations": 15,
      "plugin factory params": 14,
      "provider props": 6,
      "surface members": 86,
    });
  });

  it("the total", () => {
    // ⚠ The bucket table above is what a reader diffs; this line exists so the
    // headline is a test rather than a sentence somebody wrote down once.
    expect(union.size).toBe(297);
  });
});
