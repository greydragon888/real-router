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
  type Verdict = "global" | "published" | "type parameter" | "unnamed";

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

  /** Every type-reference identifier under a declaration. */
  const referencedNames = (node: ts.Node): ts.Identifier[] => {
    const out: ts.Identifier[] = [];

    const visit = (current: ts.Node): void => {
      if (ts.isTypeReferenceNode(current)) {
        const { typeName } = current;
        const identifier = ts.isIdentifier(typeName) ? typeName : typeName.left;

        if (ts.isIdentifier(identifier)) {
          out.push(identifier);
        }
      }

      ts.forEachChild(current, visit);
    };

    visit(node);

    return out;
  };

  const declaredByLibrary = (declaration: ts.Declaration): boolean => {
    const file = declaration.getSourceFile().fileName;

    return (
      file.includes("/typescript/lib/") || /\/lib\.[\w.]*d\.ts$/.test(file)
    );
  };

  interface Analysis {
    references: Reference[];
    /** Seeds that contributed no member — unresolved and resolved-empty alike. */
    missing: Surface[];
    surfaces: Surface[];
    publishedNames: number;
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

    const verdictOf = (identifier: ts.Identifier): Verdict => {
      const symbol = checker.getSymbolAtLocation(identifier);

      // ⚠ A name the checker cannot resolve is REFUSED rather than skipped:
      // "could not tell" must not read as "nothing to see".
      if (!symbol) {
        return "unnamed";
      }

      if (symbol.flags & ts.SymbolFlags.TypeParameter) {
        return "type parameter";
      }

      const target = resolve(symbol);
      const declarations = target.declarations ?? [];

      if (
        declarations.length > 0 &&
        declarations.every((declaration) => declaredByLibrary(declaration))
      ) {
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
          referencedNames(declaration).map((identifier) => ({
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

  it("the two escape hatches are pinned, so widening one cannot pass a real type", () => {
    // ⚠ A type reference is waved through on exactly two grounds. Both sets are
    // asserted rather than counted: a hatch that silently grew would let an
    // unpublished type through under the name of a type parameter or a global.
    expect({
      typeParameters: wavedThrough("type parameter"),
      globals: wavedThrough("global"),
    }).toStrictEqual({
      typeParameters: ["D", "Dependencies", "E", "K", "M", "P", "S"],
      globals: ["Error", "Map", "Partial", "Promise", "Readonly", "Record"],
    });
  });
});
