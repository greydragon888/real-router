import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The doors that run the other way: functions the APPLICATION supplies and core
 * CALLS, and what core takes back from them (#2303).
 *
 * ⚑ The five sibling censuses all ask what an application HANDS IN — a member,
 * a subpath, a config field, a prop. A callback reverses that: the application
 * hands over code, core runs it, and the RETURN enters core. Nothing else here
 * has a row for a return value.
 *
 * ⚠ **This is the door `packages/core/CLAUDE.md` calls the one that bites.**
 * Supported-input-shapes says of a class instance that the rule "applies to what
 * a route's codecs RETURN, the one source that reaches the matcher without
 * passing through the normaliser". The cells below name that source.
 */
describe("return-door census (#2303)", () => {
  const SRC = path.resolve(__dirname, "../../../src");

  const byName = (a: string, b: string): number => a.localeCompare(b);

  const parse = (file: string): ts.SourceFile =>
    ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

  const flat = (node: ts.Node, sf: ts.SourceFile): string =>
    node.getText(sf).replaceAll(/\s+/g, " ");

  /**
   * Interfaces core HANDS OUT. A function-typed member of one of these is
   * core's own, so it belongs to `door-census/surface` rather than
   * here — the two censuses partition the function types between them.
   */
  const HANDED_OUT = new Set([
    "ContextNamespaceClaim",
    "DependenciesApi",
    "InterceptableMethodMap",
    "LifecycleApi",
    "Navigator",
    "PluginApi",
    "Router",
    "RouterError",
    "RouterInternals",
    "RouterLogger",
    "RoutesApi",
    "Subscription",
  ]);

  const TYPE_FILES = globSync(`${SRC}/types/*.ts`).toSorted(byName);

  /** Every exported `type X = (…) => R` in the type barrel, by declared return. */
  function aliases(): Record<string, string> {
    const out: Record<string, string> = {};

    for (const file of TYPE_FILES) {
      const sf = parse(file);

      for (const st of sf.statements) {
        if (
          ts.isTypeAliasDeclaration(st) &&
          ts.isFunctionTypeNode(st.type) &&
          st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          out[st.name.text] = flat(st.type.type, sf);
        }
      }
    }

    return out;
  }

  const ALIASES = aliases();

  interface Field {
    readonly owner: string;
    readonly name: string;
    readonly type: ts.TypeNode;
    readonly sf: ts.SourceFile;
  }

  /** Every named property of every interface in the type barrel. */
  function fieldsOfInterfaces(): Field[] {
    const out: Field[] = [];

    for (const file of TYPE_FILES) {
      const sf = parse(file);

      for (const st of sf.statements) {
        if (!ts.isInterfaceDeclaration(st)) {
          continue;
        }

        for (const m of st.members) {
          if (
            ts.isPropertySignature(m) &&
            m.type !== undefined &&
            m.name !== undefined &&
            ts.isIdentifier(m.name)
          ) {
            out.push({
              owner: st.name.text,
              name: m.name.text,
              type: m.type,
              sf,
            });
          }
        }
      }
    }

    return out;
  }

  const FIELDS = fieldsOfInterfaces();

  /** Aliases a handed-out surface RETURNS — core supplies those, not the app. */
  function suppliedByCore(): string[] {
    const out = new Set<string>();

    for (const f of FIELDS) {
      if (!HANDED_OUT.has(f.owner) || !ts.isFunctionTypeNode(f.type)) {
        continue;
      }

      const returns = f.type.type.getText(f.sf);

      for (const name of Object.keys(ALIASES)) {
        if (returns.includes(name)) {
          out.add(name);
        }
      }
    }

    return [...out].toSorted(byName);
  }

  const CORE_SUPPLIED = suppliedByCore();

  /** Where an application ATTACHES a callback: a field of a bag core reads. */
  function attachPoints(): Record<string, string> {
    const out: Record<string, string> = {};

    for (const f of FIELDS) {
      if (HANDED_OUT.has(f.owner)) {
        continue;
      }

      const key = `${f.owner}.${f.name}`;

      if (ts.isFunctionTypeNode(f.type)) {
        out[key] = flat(f.type.type, f.sf);

        continue;
      }

      const text = flat(f.type, f.sf);

      if (Object.keys(ALIASES).some((n) => text.includes(n))) {
        out[key] = text;
      }
    }

    return out;
  }

  /** Every `f(…) ?? fallback` in core — a call whose RETURN core distrusts. */
  function coalescedCalls(): string[] {
    const sites: string[] = [];

    for (const file of globSync(`${SRC}/**/*.ts`)) {
      const sf = parse(file);
      const relative = path.relative(SRC, file);

      const walk = (node: ts.Node): void => {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
          ts.isCallExpression(node.left)
        ) {
          sites.push(`${relative} :: ${flat(node, sf)}`);
        }

        ts.forEachChild(node, walk);
      };

      walk(sf);
    }

    return sites.toSorted(byName);
  }

  it("the derivation reaches the type barrel — anti-vacuum", () => {
    expect(TYPE_FILES.length).toBeGreaterThan(3);
    expect(Object.keys(ALIASES).length).toBeGreaterThan(8);

    // Positive control on both sides of the partition: one alias the
    // application supplies, one a handed-out surface returns.
    expect(ALIASES).toHaveProperty("GuardFn");
    expect(CORE_SUPPLIED).toContain("Unsubscribe");
  });

  it("every function the application can hand core, by declared return", () => {
    const supplied = Object.fromEntries(
      Object.entries(ALIASES).filter(([name]) => !CORE_SUPPLIED.includes(name)),
    );

    expect(supplied).toStrictEqual({
      CheckFn: "void",
      DefaultParamsCallback: "Params",
      DefaultRouteCallback: "string",
      DefaultSearchCallback: "SearchParams",
      ForwardToCallback: "string",
      GuardFn: "boolean | Promise<boolean>",
      GuardFnFactory: "GuardFn",
      InterceptorFn: "ReturnType<InterceptableMethodMap[M]>",
      LeaveFn: "void | Promise<void>",
      LogCallback: "void",
      PluginFactory: "Plugin",
      SubscribeFn: "void",
    });
  });

  it("`Unsubscribe` is the one that runs the other way", () => {
    // ⚑ Derived from POSITION, not assigned: it is the only function type a
    // handed-out surface RETURNS, so it is core's code the application calls
    // rather than the application's code core calls. The direction is what
    // decides membership of this census, and it is read off the types.
    expect(CORE_SUPPLIED).toStrictEqual(["Unsubscribe"]);
    expect(ALIASES.Unsubscribe).toBe("void");
  });

  it("where an application attaches one — the bags core reads it out of", () => {
    expect(attachPoints()).toStrictEqual({
      // The rx-style observer handed to `subscribe`.
      "Listener.complete": "void",
      "Listener.error": "void",
      "Listener.next": "void",
      "LoggerConfig.callback": "LogCallback | undefined",
      // Per-router: a value or a callback resolved against the dependency map.
      "Options.defaultParams": "Params | DefaultParamsCallback<Dependencies>",
      "Options.defaultRoute": "string | DefaultRouteCallback<Dependencies>",
      "Options.defaultSearch":
        "SearchParams | DefaultSearchCallback<Dependencies>",
      "Plugin.onStart": "void",
      "Plugin.onStop": "void",
      "Plugin.onTransitionCancel": "void",
      "Plugin.onTransitionError": "void",
      "Plugin.onTransitionLeaveApprove": "void",
      "Plugin.onTransitionStart": "void",
      "Plugin.onTransitionSuccess": "void",
      "Plugin.teardown": "void",
      // Per-route. The two codecs are the cell below.
      "Route.canActivate": "GuardFnFactory<Dependencies>",
      "Route.canDeactivate": "GuardFnFactory<Dependencies>",
      "Route.decodeParams": "ParamsSearch",
      "Route.encodeParams": "ParamsSearch",
      "Route.forwardTo": "string | ForwardToCallback<Dependencies>",
      "RouteConfigUpdate.canActivate": "GuardFnFactory<Dependencies> | null",
      "RouteConfigUpdate.canDeactivate": "GuardFnFactory<Dependencies> | null",
      "RouteConfigUpdate.forwardTo":
        "string | ForwardToCallback<Dependencies> | null",
    });
  });

  it("core distrusts eight returns, and four of them are the application's", () => {
    // ⚠ Not derived from the NAME, and that is the whole cell. No core file
    // CALLS `decodeParams`; the codec is captured at registration and reached
    // through a stored wrapper, so a scan keyed on the name finds the matcher's
    // own same-named private method instead — a different function entirely.
    // What is derivable is the SHAPE: a call whose return core coalesces.
    expect(coalescedCalls()).toStrictEqual([
      "engine/path-matcher/percentEncoding.ts :: value.codePointAt(i + 1) ?? 0",
      "engine/path-matcher/percentEncoding.ts :: value.codePointAt(i + 2) ?? 0",
      "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts :: compiled.external.get(name) ?? compiled.definition.get(name)",
      "namespaces/RoutesNamespace/helpers.ts :: matcher.getDeclaredQueryParams(name) ?? NO_QUERY_NAMES",
      "namespaces/RoutesNamespace/routesStore.ts :: decode(channels) ?? channels",
      "namespaces/RoutesNamespace/routesStore.ts :: decoder(channels) ?? channels",
      "namespaces/RoutesNamespace/routesStore.ts :: encode(channels) ?? channels",
      "namespaces/RoutesNamespace/routesStore.ts :: encoder(channels) ?? channels",
    ]);

    // ⚑ The four in `routesStore` are the door: `decode`/`encode` at
    // registration and `decoder`/`encoder` at update are the application's own
    // functions, and `?? channels` is the only thing between a return that
    // violates its declared `ParamsSearch` and the matcher. The other four call
    // core's own code, where the fallback is an ordinary default.
    const codecs = coalescedCalls().filter((s) => s.includes("?? channels"));

    expect(codecs).toHaveLength(4);
  });

  it("eleven returns are declared `void` and core still reads `.then`", () => {
    const emitter = readFileSync(
      path.join(SRC, "utils/event-emitter/EventEmitter.ts"),
      "utf8",
    );

    // ⚑ Every `Plugin` hook and every `Listener` member declares `void`, and
    // `#invokeIsolated` reads `.then` off whatever comes back and adopts it. So
    // the DECLARED return understates the door: an application returning a
    // thenable from a hook has its rejection routed to the listener-error sink
    // rather than escaping, and `void` says none of that.
    expect(emitter).toContain("?.then");
    expect(emitter).toContain('typeof then === "function"');

    const voids = Object.entries(attachPoints())
      .filter(
        ([name, returns]) =>
          returns === "void" && /^(?:Plugin|Listener)\./.test(name),
      )
      .map(([name]) => name);

    expect(voids).toHaveLength(11);
  });
});
