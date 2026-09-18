import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Clause (b) of the rule that admits a member to `PluginApi` (#2350).
 *
 * > A member belongs on `PluginApi` when BOTH hold: (a) shipped code outside
 * > core reaches it, and (b) its signature is expressible in already-published
 * > types.
 *
 * ⚑ This file derives (b). What it prevents is a member an application can see
 * and cannot name: the type appears in autocomplete off a published surface
 * while no subpath exports it, so the value can be held and never declared.
 *
 * ⚠ Clause (a) is a different question, and `consumers.test.ts` owns it.
 *
 * ⚠ **The compiler answers, not a parser.** A referenced type is matched by
 * SYMBOL, so a local name equal to a published one is not mistaken for it, and
 * a name published only as a local `export interface` in a barrel counts — a
 * walk that collected `export { … }` clauses alone called `NavigationOptions`
 * and `StateContext` unpublished, which is the census rule "ask the compiler
 * what a shape is" applied to naming.
 */
describe("the membership rule, clause (b) (#2350)", () => {
  // ⚠ This census stays HOME: it reads core's own manifest, core's own tsconfig
  // and the entries they name, so it must not resolve a path through the
  // repository root — `repo-scan-authority-2241` classifies a test by what it
  // reaches, and a file that reaches out has to be registered as a repo-wide
  // scan to keep turbo's per-package cache honest.
  const CORE = path.resolve(__dirname, "../../..");

  /**
   * The surfaces core hands out, seeded by name.
   *
   * ⚠ A seed that stops resolving must EMPTY its bucket rather than pass: a
   * (file, interface) map written by hand reported "0 members, 0 unpublished"
   * for a `Navigator` it was looking for in the wrong file, which reads exactly
   * like a clean surface. The first cell asserts every seed resolved and
   * carries members.
   */
  const SURFACES = [
    "PluginApi",
    "RoutesApi",
    "DependenciesApi",
    "LifecycleApi",
    "Navigator",
    "Router",
    "RouterInternals",
  ] as const;

  type Surface = (typeof SURFACES)[number];

  /** Which of the three answers a referenced name earns; `unnamed` is a refusal. */
  type Verdict =
    "global" | "not a type" | "published" | "type parameter" | "unnamed";

  interface Reference {
    surface: Surface;
    member: string;
    name: string;
    verdict: Verdict;
  }

  const byName = (a: string, b: string): number => a.localeCompare(b);

  /** Entry files of every subpath the manifest publishes. */
  const entries = (): string[] => {
    const manifest = JSON.parse(
      readFileSync(path.join(CORE, "package.json"), "utf8"),
    ) as { exports?: Record<string, Record<string, string> | string> };

    const out: string[] = [];

    for (const conditions of Object.values(manifest.exports ?? {})) {
      const source =
        typeof conditions === "string"
          ? conditions
          : conditions["@real-router/internal-source"];

      if (typeof source === "string") {
        out.push(path.join(CORE, source));
      }
    }

    return out;
  };

  /**
   * The SIGNATURE's type nodes — return type, parameter types, type-parameter
   * constraints and defaults — and nothing else.
   *
   * ⚠ **A method BODY is not the signature, and collecting it produces false
   * offenders.** Measured while this cell was widened: `Router.shouldUpdateNode`
   * calls `RoutesNamespace.shouldUpdateNode` in its body, `subscribe` reaches
   * `EventBusNamespace` in its own — both are classes, so a walk over the whole
   * declaration reported three members as naming an unpublished type when their
   * signatures name nothing of the sort. Clause (b) asks what a caller must be
   * able to DECLARE, which is the signature alone.
   */
  const signatureTypes = (declaration: ts.Declaration): ts.Node[] => {
    const parts = declaration as {
      type?: ts.TypeNode;
      parameters?: readonly ts.ParameterDeclaration[];
      typeParameters?: readonly ts.TypeParameterDeclaration[];
    };

    return [
      parts.type,
      ...(parts.parameters ?? []).map((parameter) => parameter.type),
      ...(parts.typeParameters ?? []).flatMap((parameter) => [
        parameter.constraint,
        parameter.default,
      ]),
    ].filter((node) => node !== undefined);
  };

  /**
   * Every identifier under those type nodes — the position inside a type is not
   * asked.
   *
   * ⚑ **The scope is the compiler's answer too, not just the verdict.** Reading
   * only `TypeReferenceNode` is a PARSER-level predicate that has to be taught
   * each syntax a type can be written in — the defect the census README names one
   * level up. Measured: a member typed
   * `() => import("../namespaces/RoutesNamespace").RoutesStore` passed this cell
   * GREEN while naming a type no subpath publishes. Collecting every identifier
   * and letting the SYMBOL decide what is a type removes that whole class.
   *
   * ⚠ One position stays out of reach and is named rather than implied: a
   * `typeof X` member depends on the type of a VALUE, whose symbol is a variable
   * — nameable or not for reasons this cell does not model. No handed-out
   * surface uses that form today.
   */
  const identifiersIn = (node: ts.Node): ts.Identifier[] => {
    const out: ts.Identifier[] = [];

    const visit = (current: ts.Node): void => {
      if (ts.isIdentifier(current)) {
        out.push(current);
      }

      ts.forEachChild(current, visit);
    };

    visit(node);

    return out;
  };

  /** Symbol kinds that ARE a type an application would have to name. */
  const TYPE_KINDS =
    ts.SymbolFlags.Interface |
    ts.SymbolFlags.TypeAlias |
    ts.SymbolFlags.Class |
    ts.SymbolFlags.Enum;

  /**
   * Can this name be used without importing anything?
   *
   * ⚑ **AMBIENT, not "the file is called lib".** The question clause (b) asks is
   * whether an application can NAME the type, and the answer is whether its
   * declaration is global — a source file that is not a module. `lib.*.d.ts`
   * qualifies and so does `@types/node`, which is correct: `NodeJS.Timeout` is
   * nameable anywhere. A type from a dependency that IS a module does not, which
   * is also correct — that one needs an import the surface never declared.
   */
  const isAmbient = (declaration: ts.Declaration): boolean =>
    !ts.isExternalModule(declaration.getSourceFile());

  interface Analysis {
    references: Reference[];
    /** Seeds that contributed no member — unresolved and resolved-empty alike. */
    missing: Surface[];
    surfaces: Surface[];
    publishedNames: number;
    /** Names waved through as globals whose declaration is core's own source. */
    globalsFromOwnSource: string[];
  }

  /**
   * ⚠ The program is built ONCE, at collection. Inside a cell it would sit
   * under `testTimeout`, which a loaded CI runner can miss under coverage —
   * the shape #2329 recorded for the census's other compiler-backed file.
   */
  const analyse = (): Analysis => {
    const files = entries();
    const config = ts.readConfigFile(
      path.join(CORE, "tsconfig.json"),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, CORE);
    const program = ts.createProgram(files, {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
    });
    const checker = program.getTypeChecker();

    const resolve = (symbol: ts.Symbol): ts.Symbol =>
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;

    const published = new Set<ts.Symbol>();
    const publishedNames = new Set<string>();

    for (const file of files) {
      const source = program.getSourceFile(file);
      const moduleSymbol = source && checker.getSymbolAtLocation(source);

      for (const exported of moduleSymbol
        ? checker.getExportsOfModule(moduleSymbol)
        : []) {
        published.add(resolve(exported));
        publishedNames.add(exported.getName());
      }
    }

    const ownSourceGlobals = new Set<string>();

    const verdictOf = (identifier: ts.Identifier): Verdict => {
      const symbol = checker.getSymbolAtLocation(identifier);

      // Not a type — a member name, a parameter name, a namespace qualifier.
      // Clause (b) has nothing to ask about it.
      if (!symbol) {
        return "not a type";
      }

      if (symbol.flags & ts.SymbolFlags.TypeParameter) {
        return "type parameter";
      }

      const target = resolve(symbol);

      if ((target.flags & TYPE_KINDS) === 0) {
        return "not a type";
      }

      const declarations = target.declarations ?? [];

      if (
        declarations.length > 0 &&
        declarations.every((declaration) => isAmbient(declaration))
      ) {
        for (const declaration of declarations) {
          const file = declaration.getSourceFile().fileName;

          if (file.startsWith(CORE) && !file.includes("node_modules")) {
            ownSourceGlobals.add(identifier.text);
          }
        }

        return "global";
      }

      return published.has(target) ? "published" : "unnamed";
    };

    /**
     * The members an application could hold.
     *
     * ⚑ EVERY published symbol of that name is read, not the first one found.
     * `Router` is published twice — the class from the root and the interface
     * from `./types`, the shadow #1525 documents — and picking one would read
     * half a surface while reporting a whole one.
     *
     * ⚠ A `#private` field is dropped: it is unnameable by construction, so
     * clause (b) has nothing to ask about it.
     */
    const membersOf = (name: Surface): ts.Symbol[] =>
      [...published]
        .filter((symbol) => symbol.getName() === name)
        .flatMap((carrier) =>
          checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(carrier)),
        )
        .filter((member) => !member.getName().startsWith("#"));

    const found = SURFACES.map((name) => ({
      name,
      members: membersOf(name),
    }));

    const references = found.flatMap(({ name, members }) =>
      members.flatMap((member) =>
        (member.declarations ?? []).flatMap((declaration) =>
          signatureTypes(declaration)
            .flatMap((node) => identifiersIn(node))
            .map((identifier) => ({
              surface: name,
              member: member.getName(),
              name: identifier.text,
              verdict: verdictOf(identifier),
            })),
        ),
      ),
    );

    return {
      references,
      missing: found.filter((s) => s.members.length === 0).map((s) => s.name),
      surfaces: found.map((s) => s.name),
      publishedNames: publishedNames.size,
      globalsFromOwnSource: [...ownSourceGlobals].toSorted(byName),
    };
  };

  const analysis = analyse();

  /** `member → Type` lines a surface references and cannot name. */
  const unnamedOn = (surface: Surface): string[] =>
    [
      ...new Set(
        analysis.references
          .filter((r) => r.surface === surface && r.verdict === "unnamed")
          .map((r) => `${r.member} → ${r.name}`),
      ),
    ].toSorted(byName);

  const wavedThrough = (verdict: Verdict): string[] =>
    [
      ...new Set(
        analysis.references
          .filter((r) => r.verdict === verdict)
          .map((r) => r.name),
      ),
    ].toSorted(byName);

  it("every seeded surface resolved, and carries members", () => {
    // ⚠ Anti-vacuum for the seeds. A surface that stopped resolving would
    // contribute no references at all, which is indistinguishable from a clean
    // one — the failure direction that looks like good news.
    expect(analysis.missing).toStrictEqual([]);
    expect(analysis.surfaces.toSorted(byName)).toStrictEqual(
      [...SURFACES].toSorted(byName),
    );
  });

  it("the published set and the walk are both non-empty", () => {
    // ⚠ Anti-vacuum for the derivation itself: an empty published set would
    // report every surface as unnameable, and a walk that matched no type
    // reference would report every surface as clean. Floors, not counts — the
    // sets they bound grow with ordinary work.
    expect(analysis.publishedNames).toBeGreaterThan(50);
    expect(analysis.references.length).toBeGreaterThan(100);
  });

  it("clause (b): the plugin-facing surfaces name only what a subpath publishes", () => {
    expect({
      PluginApi: unnamedOn("PluginApi"),
      RoutesApi: unnamedOn("RoutesApi"),
      DependenciesApi: unnamedOn("DependenciesApi"),
      LifecycleApi: unnamedOn("LifecycleApi"),
      Navigator: unnamedOn("Navigator"),
      Router: unnamedOn("Router"),
    }).toStrictEqual({
      PluginApi: [],
      RoutesApi: [],
      DependenciesApi: [],
      LifecycleApi: [],
      Navigator: [],
      Router: [],
    });
  });

  it("clause (b): `RouterInternals` is the surface the clause excludes", () => {
    // ⚑ The counter-example, and the reason the rule is a rule rather than a
    // description of the current set: these members can be reached and cannot
    // be declared. Moving one onto `PluginApi` is therefore the same work as
    // choosing a published type for it — measured when #2339 slice 1 had to
    // publish `AdoptedOrigins` before `getAdoptedOrigins` could move.
    expect(unnamedOn("RouterInternals")).toStrictEqual([
      "dependenciesGetStore → DependenciesStore",
      "getCloneState → Limits",
      "port → RouteResolver",
      "routeGetStore → RoutesStore",
    ]);
  });

  it("the classifier answers four known references the way the clause needs", () => {
    // ⚑ **The CLASSIFIER is pinned, not the extension of its output.** The set of
    // type parameters and the set of globals grow with ordinary work — a member
    // taking a `Set` or introducing a `T` is not an event — so pinning those
    // sets reds on work that carries no defect, which the folder README forbids
    // ("only the load-bearing side is pinned"). Measured: the previous form of
    // this cell reddened on `<T>(seen: Set<string>) => ReadonlyArray<T>` and did
    // NOT red when the global hatch was widened from TypeScript's own lib to
    // every `node_modules` declaration — noisy in one direction and silent in
    // the other. These four cases move only when the classifier itself breaks.
    const verdictFor = (surface: Surface, member: string, name: string) =>
      analysis.references.find(
        (r) => r.surface === surface && r.member === member && r.name === name,
      )?.verdict;

    expect({
      global: verdictFor("Router", "start", "Promise"),
      published: verdictFor("PluginApi", "makeState", "State"),
      unnamed: verdictFor("RouterInternals", "routeGetStore", "RoutesStore"),
      parameter: verdictFor("PluginApi", "makeState", "P"),
    }).toStrictEqual({
      global: "global",
      published: "published",
      unnamed: "unnamed",
      parameter: "type parameter",
    });
  });

  it("nothing waved through as a global is declared in core's own source", () => {
    // ⚠ The one widening this file CAN catch without a synthetic fixture: a
    // classifier that starts admitting the repository's own types under the
    // name of a global.
    expect(analysis.globalsFromOwnSource).toStrictEqual([]);

    // ⚠ **What it cannot catch, named rather than implied:** a classifier
    // widened to admit a MODULE-scoped dependency type would pass unnoticed,
    // because no handed-out surface references one — there is nothing in the
    // real data for the widening to change. Closing that needs a fixture
    // declaration, which this cell deliberately does not carry.
    expect(wavedThrough("global").length).toBeGreaterThan(0);
  });
});
