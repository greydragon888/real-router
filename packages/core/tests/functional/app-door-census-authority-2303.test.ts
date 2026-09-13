import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The doors an application reaches that are NOT on core (#2303).
 *
 * ⚑ The four sibling censuses stop at core's package boundary: they walk core's
 * handed-out surfaces, core's manifest, core's consumers and the seven core
 * call sites that take a config bag. An application spends most of its contact
 * with this router somewhere else — installing a plugin and writing a `<Link>`
 * — and that contact has no row anywhere until this file.
 *
 * ⚠ **A plugin's options and a component's props are both "config", and they
 * are derived differently on purpose.** A factory's bag is an ARGUMENT, so its
 * fields could be read off call sites the way `config-door-census-authority-2303`
 * reads core's; measured, that yields test fixtures — `foo`, `unknownKey`,
 * `__proto__` from the tests that prove unknown keys are refused. A prop is
 * checked by the compiler against a declaration, so for both the DECLARATION is
 * the honest source and the call sites serve as the anti-vacuum.
 */
describe("application-door census (#2303)", () => {
  const ROOT = path.resolve(__dirname, "../../../..");

  const byName = (a: string, b: string): number => a.localeCompare(b);

  const parse = (file: string, text: string): ts.SourceFile =>
    ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

  const read = (relative: string): string =>
    readFileSync(path.join(ROOT, relative), "utf8");

  /**
   * Factory → the package that ships it, and the file it is declared in.
   *
   * ⚠ Only the LOCATION is written here. What each one accepts is read off its
   * signature below, so a factory that grows an options bag moves the derived
   * table rather than passing because this one still describes the old shape.
   */
  const FACTORY_DOORS: Record<
    string,
    { readonly package: string; readonly file: string }
  > = {
    browserPluginFactory: { package: "browser-plugin", file: "factory" },
    hashPluginFactory: { package: "hash-plugin", file: "factory" },
    lifecyclePluginFactory: { package: "lifecycle-plugin", file: "factory" },
    loggerPluginFactory: { package: "logger-plugin", file: "factory" },
    memoryPluginFactory: { package: "memory-plugin", file: "factory" },
    navigationPluginFactory: { package: "navigation-plugin", file: "factory" },
    persistentParamsPluginFactory: {
      package: "persistent-params-plugin",
      file: "factory",
    },
    preloadPluginFactory: { package: "preload-plugin", file: "factory" },
    rscServerPluginFactory: { package: "rsc-server-plugin", file: "factory" },
    ssrDataPluginFactory: { package: "ssr-data-plugin", file: "factory" },
    validationPlugin: {
      package: "validation-plugin",
      file: "validationPlugin",
    },
  };

  /** `name: Type` for every parameter a factory declares, from its source. */
  function parametersOf(factory: string): string[] {
    const { package: name, file } = FACTORY_DOORS[factory];
    const relative = `packages/${name}/src/${file}.ts`;
    const sf = parse(relative, read(relative));

    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === factory) {
        return st.parameters.map(
          (p) =>
            `${p.name.getText(sf)}: ${p.type === undefined ? "?" : p.type.getText(sf)}`,
        );
      }
    }

    // ⚠ Anti-vacuum: a renamed factory would otherwise report "no parameters",
    // which reads exactly like a door that takes nothing.
    throw new Error(`${factory} is not declared in ${relative}`);
  }

  const SIGNATURES: Record<string, string[]> = Object.fromEntries(
    Object.keys(FACTORY_DOORS).map((f) => [f, parametersOf(f)]),
  );

  /** The interface behind `Partial<X>` / `X = {}`, when the package declares one. */
  function optionsInterfaceOf(factory: string): string | null {
    const first = SIGNATURES[factory][0];

    if (first === undefined) {
      return null;
    }

    const type = first.slice(first.indexOf(":") + 1).trim();
    const base = /^(?:Partial<)?(\w+)>?$/.exec(type)?.[1];

    if (base === undefined) {
      return null;
    }

    return declaredFields(FACTORY_DOORS[factory].package, base).length > 0
      ? base
      : null;
  }

  /** Fields an interface declares lexically in one package's `types.ts`. */
  function declaredFields(packageName: string, typeName: string): string[] {
    for (const st of parse(
      `${packageName}/types.ts`,
      read(`packages/${packageName}/src/types.ts`),
    ).statements) {
      if (ts.isInterfaceDeclaration(st) && st.name.text === typeName) {
        return st.members
          .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
          .map((m) => (m.name as ts.Identifier).text)
          .toSorted(byName);
      }
    }

    return [];
  }

  /** How often each factory is CALLED, anywhere outside its own package. */
  function callSites(): Record<string, number> {
    const counts: Record<string, number> = Object.fromEntries(
      Object.keys(FACTORY_DOORS).map((name) => [name, 0]),
    );

    const files = [
      ...globSync("packages/*/tests/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("examples/**/src/**/*.{ts,tsx}", { cwd: ROOT }),
    ];

    for (const relative of files) {
      const text = read(relative);

      if (Object.keys(counts).every((name) => !text.includes(name))) {
        continue;
      }

      const walk = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const name = node.expression.text;

          if (name in counts) {
            counts[name] += 1;
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(parse(relative, text));
    }

    return counts;
  }

  const CALLS = callSites();

  it("every factory door is reached by the scan — anti-vacuum", () => {
    // ⚠ The table above is written by hand, so this cell is what keeps it
    // honest: a name nothing calls is a name that no longer exists, and a
    // walk that matched nothing would leave every count at zero.
    expect(
      Object.entries(CALLS)
        .filter(([, n]) => n === 0)
        .map(([name]) => name),
    ).toStrictEqual([]);

    let total = 0;

    for (const n of Object.values(CALLS)) {
      total += n;
    }

    expect(total).toBeGreaterThan(200);
  });

  it("every parameter every factory accepts, read off its signature", () => {
    expect(SIGNATURES).toStrictEqual({
      browserPluginFactory: [
        "opts: Partial<BrowserPluginOptions>",
        "browser: Browser",
      ],
      hashPluginFactory: [
        "opts: Partial<HashPluginOptions>",
        "browser: Browser",
      ],
      // Takes nothing — the one factory with no configuration door at all.
      lifecyclePluginFactory: [],
      loggerPluginFactory: ["options: Partial<LoggerPluginConfig>"],
      memoryPluginFactory: ["options: MemoryPluginOptions"],
      navigationPluginFactory: [
        "opts: Partial<NavigationPluginOptions>",
        "browser: NavigationBrowser",
      ],
      // ⚑ A LIST of param names or a map of defaults, and for the two loader
      // maps a key per ROUTE: application data in the key position, so these
      // three carry no field set for the cell below to pin.
      persistentParamsPluginFactory: ["params: PersistentParamsConfig"],
      preloadPluginFactory: ["opts: Partial<PreloadPluginOptions>"],
      rscServerPluginFactory: ["loaders: RscLoaderFactoryMap<Dependencies>"],
      ssrDataPluginFactory: ["loaders: DataLoaderFactoryMap<Dependencies>"],
      // Installed rather than configured — it reads the router, not a bag.
      validationPlugin: [],
    });
  });

  it("the fixed-field option bags, as each plugin declares them", () => {
    const bags: Record<string, string[]> = {};

    for (const factory of Object.keys(FACTORY_DOORS)) {
      const options = optionsInterfaceOf(factory);

      if (options !== null) {
        bags[factory] = declaredFields(FACTORY_DOORS[factory].package, options);
      }
    }

    // ⚠ Membership derived from the signature, not from a list beside it: a
    // factory that grows an options interface appears here on its own.
    expect(bags).toStrictEqual({
      browserPluginFactory: ["base", "forceDeactivate"],
      hashPluginFactory: ["base", "forceDeactivate", "hashPrefix"],
      loggerPluginFactory: [
        "context",
        "level",
        "showParamsDiff",
        "showTiming",
        "usePerformanceMarks",
      ],
      memoryPluginFactory: ["maxHistoryLength"],
      navigationPluginFactory: ["base", "forceDeactivate"],
      preloadPluginFactory: ["delay", "networkAware"],
    });
  });

  it("three factories take a SECOND door, and it is not a config bag", () => {
    const handedIn: Record<string, string> = {};

    for (const [factory, parameters] of Object.entries(SIGNATURES)) {
      const second = parameters[1];

      if (second !== undefined) {
        handedIn[factory] = second.slice(second.indexOf(":") + 1).trim();
      }
    }

    // ⚑ The application may hand over the platform adapter the plugin drives —
    // an object it IMPLEMENTS rather than fills, so it belongs to the handed-in
    // class rather than the configured one. Three of the eleven factories, not
    // one: the second parameter is easy to read as a quirk of whichever plugin
    // you happen to open.
    expect(handedIn).toStrictEqual({
      browserPluginFactory: "Browser",
      hashPluginFactory: "Browser",
      navigationPluginFactory: "NavigationBrowser",
    });
  });

  /** Prop names a component declares, and the types the walk cannot open. */
  interface Surface {
    props: string[];
    opaque: string[];
  }

  function linkSurface(adapter: string): Surface {
    const file = `packages/${adapter}/src/types.ts`;
    const sf = parse(file, read(file));
    const declarations = new Map<
      string,
      ts.InterfaceDeclaration | ts.TypeAliasDeclaration
    >();

    for (const st of sf.statements) {
      if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
        declarations.set(st.name.text, st);
      }
    }

    const props = new Set<string>();
    const opaque = new Set<string>();
    const seen = new Set<string>();
    // Type PARAMETERS are not props — without this the generic `P` reads as a
    // member of every adapter's surface.
    const parameters = new Set<string>();

    for (const st of declarations.values()) {
      for (const p of st.typeParameters ?? []) {
        parameters.add(p.name.text);
      }
    }

    const collect = (members: ts.NodeArray<ts.TypeElement>): void => {
      for (const m of members) {
        if (m.name !== undefined && ts.isIdentifier(m.name)) {
          props.add(m.name.text);
        }
      }
    };

    const fromType = (node: ts.Node): void => {
      if (ts.isTypeLiteralNode(node)) {
        collect(node.members);
      }

      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        expand(node.typeName.text);
      }

      ts.forEachChild(node, fromType);
    };

    function expand(name: string): void {
      if (seen.has(name) || parameters.has(name)) {
        return;
      }

      seen.add(name);

      const st = declarations.get(name);

      // ⚠ Not an error: a name declared elsewhere is the HOST element's
      // attribute surface, which the component spreads into. It is recorded
      // rather than skipped, because "the walk stopped here" and "there is
      // nothing here" must not look the same.
      if (st === undefined) {
        opaque.add(name);

        return;
      }

      if (ts.isInterfaceDeclaration(st)) {
        collect(st.members);

        for (const h of st.heritageClauses ?? []) {
          for (const t of h.types) {
            fromType(t);
          }
        }

        return;
      }

      fromType(st.type);
    }

    expand("LinkProps");

    return {
      props: [...props].toSorted(byName),
      opaque: [...opaque].toSorted(byName),
    };
  }

  /** Angular has no props bag — the door is a directive's signal inputs. */
  function angularLinkSurface(): Surface {
    const file = "packages/angular/src/directives/RealLink.ts";
    const sf = parse(file, read(file));
    const props: string[] = [];

    const walk = (node: ts.Node): void => {
      if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(sf).split(".", 1)[0] === "input"
      ) {
        props.push(node.name.text);
      }

      ts.forEachChild(node, walk);
    };

    walk(sf);

    return { props: props.toSorted(byName), opaque: [] };
  }

  const ADAPTERS = ["angular", "preact", "react", "solid", "svelte", "vue"];

  const LINK: Record<string, Surface> = Object.fromEntries(
    ADAPTERS.map((a) => [
      a,
      a === "angular" ? angularLinkSurface() : linkSurface(a),
    ]),
  );

  it("Link offers the same nine router-owned props in every adapter", () => {
    let shared = LINK[ADAPTERS[0]].props;

    for (const adapter of ADAPTERS.slice(1)) {
      shared = shared.filter((p) => LINK[adapter].props.includes(p));
    }

    // ⚑ Six adapters, five declaration shapes — an interface, a type alias
    // intersected with a union of two mutually exclusive forms, and a class of
    // signal inputs. The nine names below are what survives all of them, and
    // they are the door: everything else on the list is the host platform.
    expect(shared.toSorted(byName)).toStrictEqual([
      "activeClassName",
      "activeStrict",
      "hash",
      "ignoreQueryParams",
      "routeName",
      "routeOptions",
      "routeParams",
      "routeSearch",
      "to",
    ]);

    // Anti-vacuum: an empty surface would make the intersection above vacuous.
    for (const adapter of ADAPTERS) {
      expect(
        LINK[adapter].props.length,
        `${adapter} declares props`,
      ).toBeGreaterThan(8);
    }
  });

  it("what differs between adapters is the host platform, not the router", () => {
    const shared = new Set([
      "activeClassName",
      "activeStrict",
      "hash",
      "ignoreQueryParams",
      "routeName",
      "routeOptions",
      "routeParams",
      "routeSearch",
      "to",
    ]);

    const extra: Record<string, { props: string[]; opaque: string[] }> =
      Object.fromEntries(
        ADAPTERS.map((a) => [
          a,
          {
            props: LINK[a].props.filter((p) => !shared.has(p)),
            opaque: LINK[a].opaque,
          },
        ]),
      );

    // ⚠ `target` is on five of the six and absent from Angular, which takes it
    // as an ordinary attribute on the host anchor rather than a directive
    // input. That is why the shared set above is nine rather than ten.
    expect(extra).toStrictEqual({
      angular: { props: [], opaque: [] },
      preact: {
        props: ["className", "target"],
        opaque: ["HTMLAnchorElement", "HTMLAttributes"],
      },
      react: {
        props: ["onClick", "onMouseOver", "target"],
        opaque: ["HTMLAnchorElement"],
      },
      solid: { props: ["onClick", "target"], opaque: ["HTMLAnchorElement"] },
      svelte: {
        props: ["children", "class", "onclick", "target"],
        opaque: [],
      },
      vue: { props: ["class", "target"], opaque: [] },
    });
  });
});
