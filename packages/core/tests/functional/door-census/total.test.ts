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
  const SRC = path.resolve(__dirname, "../../../src");

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

  const TYPE_FILES = globSync(`${SRC}/types/*.ts`);

  /** Core's own bags, and the two callback-bearing interfaces beside them. */
  const CORE_BAGS = new Set([
    "Route",
    "Options",
    "NavigationOptions",
    "QueryParamsOptions",
    "LimitsConfig",
    "LoggerConfig",
    "RouteConfigUpdate",
    "Plugin",
    "Listener",
    // ⚑ The `to` descriptor an adapter takes as one prop and core takes as one
    // argument. Its FIELDS are what an application fills, and counting the prop
    // alone hid three of them.
    "NavigationTarget",
  ]);

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

  const PLUGIN_BAGS: Record<string, string> = {
    BrowserPluginOptions: "browser-plugin",
    HashPluginOptions: "hash-plugin",
    LoggerPluginConfig: "logger-plugin",
    MemoryPluginOptions: "memory-plugin",
    NavigationPluginOptions: "navigation-plugin",
    PreloadPluginOptions: "preload-plugin",
    SearchSchemaPluginOptions: "search-schema-plugin",
    // The shape `rscActionPluginFactory`'s callback RETURNS — an application
    // fills it and core reads it back.
    RscActionResult: "rsc-server-plugin",
  };

  const PROVIDER_BAGS: Record<string, string> = {
    RouteAnnouncerOptions: "shared/dom-utils/route-announcer.ts",
    ScrollRestorationOptions: "shared/dom-utils/scroll-restore.ts",
    ScrollSpyOptions: "shared/dom-utils/scroll-spy.ts",
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

  function census(): { buckets: Record<string, string[]>; union: Set<string> } {
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
      buckets[`core bag: ${bag}`] = fieldsOf(TYPE_FILES, bag).map(
        (f) => `${bag}.${f}`,
      );
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

    for (const [bag, workspace] of Object.entries(PLUGIN_BAGS)) {
      buckets[`plugin bag: ${bag}`] = fieldsOf(
        [path.join(ROOT, `packages/${workspace}/src/types.ts`)],
        bag,
      ).map((f) => `${bag}.${f}`);
    }

    buckets["plugin augmentations"] = augmentedFields();

    buckets["Link props"] = linkProps().map((p) => `Link.${p}`);

    buckets["provider props"] = fieldsOf(
      [path.join(ROOT, "packages/react/src/RouterProvider.tsx")],
      "RouteProviderProps",
    ).map((p) => `RouterProvider.${p}`);

    for (const [bag, file] of Object.entries(PROVIDER_BAGS)) {
      buckets[`provider bag: ${bag}`] = fieldsOf(
        [path.join(ROOT, file)],
        bag,
      ).map((f) => `${bag}.${f}`);
    }

    return {
      buckets,
      union: new Set(Object.values(buckets).flat()),
    };
  }

  const { buckets, union } = census();
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
    // An index signature: an application fills the VALUES, and the door is
    // wherever the bag is handed in, which is already counted there.
    Params: "open-record",
    ParamsSearch: "open-record",
    RouteParams: "open-record",
    StateContext: "open-record",
    // Plugin shapes core or the plugin BUILDS and publishes on `state.context`;
    // an application reads them, and the handout axis owns what that costs.
    BrowserContext: "output",
    MemoryContext: "output",
    NavigationMeta: "output",
    RscPayload: "output",
    NavigationSharedState: "output — plugin-internal, no barrel publishes it",
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
    // A type-level map keyed by event name; no runtime instance to fill.
    RouterEventMap: "type-map",
    // Factories the census does not seed, each for its own reason.
    createRouterPlugin: "takes core's own router, not an application value",
    validatePlugin: "core-internal — no package publishes it",
  };

  /** Every interface and object type-alias a shipped package exports. */
  function declaredSymbols(): Set<string> {
    const out = new Set<string>();

    const exported = (st: ts.Statement): boolean =>
      ts.canHaveModifiers(st) &&
      (ts.getModifiers(st) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );

    // ⚠ Interfaces AND object type-aliases. A scan that knew only the first
    // would let an `export type X = { … }` carry doors past it in silence, and
    // core's types already declare two of that shape.
    const typeFiles = [
      ...TYPE_FILES,
      ...globSync("packages/*-plugin/src/types.ts", { cwd: ROOT }).map((f) =>
        path.join(ROOT, f),
      ),
    ];

    for (const file of typeFiles) {
      for (const st of parse(file).statements) {
        if (
          exported(st) &&
          (ts.isInterfaceDeclaration(st) ||
            (ts.isTypeAliasDeclaration(st) && ts.isTypeLiteralNode(st.type)))
        ) {
          out.add(st.name.text);
        }
      }
    }

    for (const relative of globSync("packages/*/src/**/*.ts", { cwd: ROOT })) {
      const text = readFileSync(path.join(ROOT, relative), "utf8");

      for (const m of text.matchAll(
        /^export function ([a-z][A-Za-z]*(?:PluginFactory|Plugin))\b/gm,
      )) {
        out.add(m[1]);
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
      ...Object.keys(FACTORIES),
      ...Object.keys(PLUGIN_BAGS),
      ...Object.keys(PROVIDER_BAGS),
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

    expect(Object.keys(buckets)).toHaveLength(27);
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
      "surface members": 75,
      "Router facade": 19,
      "core bag: Route": 10,
      "core bag: Options": 12,
      "core bag: NavigationOptions": 7,
      "core bag: QueryParamsOptions": 4,
      "core bag: LimitsConfig": 5,
      "core bag: LoggerConfig": 3,
      "core bag: RouteConfigUpdate": 7,
      "core bag: Plugin": 8,
      "core bag: Listener": 3,
      "core bag: NavigationTarget": 3,
      "plugin augmentations": 15,
      "plugin factory params": 14,
      "plugin bag: BrowserPluginOptions": 2,
      "plugin bag: HashPluginOptions": 3,
      "plugin bag: LoggerPluginConfig": 5,
      "plugin bag: MemoryPluginOptions": 1,
      "plugin bag: NavigationPluginOptions": 2,
      "plugin bag: PreloadPluginOptions": 2,
      "plugin bag: RscActionResult": 2,
      "plugin bag: SearchSchemaPluginOptions": 3,
      "Link props": 9,
      "provider props": 6,
      "provider bag: RouteAnnouncerOptions": 2,
      "provider bag: ScrollRestorationOptions": 5,
      "provider bag: ScrollSpyOptions": 3,
    });
  });

  it("the total", () => {
    // ⚠ The bucket table above is what a reader diffs; this line exists so the
    // headline is a test rather than a sentence somebody wrote down once.
    expect(union.size).toBe(230);
  });
});
