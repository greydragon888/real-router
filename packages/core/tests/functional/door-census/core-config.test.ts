import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The CONFIGURATION doors: fields an application hands core, derived from the
 * call sites that fill them (#2303).
 *
 * ⚑ The three sibling censuses answer questions about a CALL — what a surface
 * contains, what the manifest publishes, who reaches for a member. A config
 * field is never called; it is filled, so "who consumes it" reads backwards and
 * the derivation has to key on the ARGUMENT POSITION of a known door rather than
 * on a property name. A census keyed on names alone would count every object
 * literal with a `name` field in the repository.
 *
 * ⚠ **The surface is not closed by core, and that is the point of this file.**
 * `Route` declares ten fields here and carries an index signature so plugins
 * merge their own in; measured, the call sites fill SIXTEEN. The extra six
 * belong to `preload-plugin`, `lifecycle-plugin`, `search-schema-plugin` and
 * `ssr-data-plugin` — they are doors into core's config object that core never
 * declared.
 *
 * ⚠ A field appearing here is an EVENT, not a regression: it means a new
 * configuration door exists. The ratchet exists so that event is noticed.
 */
describe("config-door census (#2303)", () => {
  const ROOT = path.resolve(__dirname, "../../../../..");
  const SRC = path.resolve(__dirname, "../../../src");

  /** Which argument of which door carries which config type. */
  const POSITIONS: Record<string, Record<number, string>> = {
    createRouter: { 0: "Route[]", 1: "Options" },
    navigate: { 3: "NavigationOptions" },
    add: { 0: "Route[]" },
    replace: { 0: "Route[]" },
    update: { 1: "RouteConfigUpdate" },
    buildUrl: { 3: "NavigationOptions" },
    buildPath: { 3: "NavigationOptions" },
  };

  const NESTED: Record<string, string> = {
    queryParams: "QueryParamsOptions",
    limits: "LimitsConfig",
    logger: "LoggerConfig",
  };

  type Bucket = "src" | "tests" | "examples";

  const byName = (a: string, b: string): number => a.localeCompare(b);

  /** Fields an interface DECLARES lexically in core's own source. */
  function declaredFields(name: string): string[] {
    for (const file of globSync(`${SRC}/types/*.ts`)) {
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
      );

      for (const st of sf.statements) {
        if (!ts.isInterfaceDeclaration(st) || st.name.text !== name) {
          continue;
        }

        return st.members
          .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
          .map((m) => (m.name as ts.Identifier).text)
          .toSorted(byName);
      }
    }

    return [];
  }

  function scan(): {
    filled: Record<string, Record<Bucket, Set<string>>>;
    files: number;
    calls: number;
  } {
    const files = [
      ...globSync("packages/*/src/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("packages/*/tests/**/*.{ts,tsx}", { cwd: ROOT }),
      ...globSync("shared/**/*.ts", { cwd: ROOT }),
      ...globSync("examples/**/src/**/*.{ts,tsx}", { cwd: ROOT }),
    ].filter((f) => !f.startsWith("packages/core/"));

    const filled: Record<string, Record<Bucket, Set<string>>> = {};
    let calls = 0;

    const bucketOf = (filePath: string): Bucket => {
      if (filePath.startsWith("examples/")) {
        return "examples";
      }

      return filePath.includes("/tests/") ? "tests" : "src";
    };

    const note = (type: string, field: string, filePath: string): void => {
      filled[type] ??= {
        src: new Set(),
        tests: new Set(),
        examples: new Set(),
      };
      filled[type][bucketOf(filePath)].add(field);
    };

    for (const relativePath of files) {
      const text = readFileSync(path.join(ROOT, relativePath), "utf8");

      if (Object.keys(POSITIONS).every((c) => !text.includes(c))) {
        continue;
      }

      const sf = ts.createSourceFile(
        relativePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const readLiteral = (node: ts.Expression, type: string): void => {
        if (!ts.isObjectLiteralExpression(node)) {
          return;
        }

        for (const property of node.properties) {
          if (property.name === undefined || !ts.isIdentifier(property.name)) {
            continue;
          }

          note(type, property.name.text, relativePath);

          const nested =
            type === "Options" ? NESTED[property.name.text] : undefined;

          if (nested && ts.isPropertyAssignment(property)) {
            readLiteral(property.initializer, nested);
          }
        }
      };

      const readArgument = (argument: ts.Expression, type: string): void => {
        if (type !== "Route[]") {
          readLiteral(argument, type);

          return;
        }

        if (ts.isArrayLiteralExpression(argument)) {
          for (const element of argument.elements) {
            readLiteral(element, "Route");
          }
        } else {
          readLiteral(argument, "Route");
        }
      };

      const calleeOf = (node: ts.CallExpression): string | undefined => {
        if (ts.isIdentifier(node.expression)) {
          return node.expression.text;
        }

        return ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : undefined;
      };

      const walk = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const callee = calleeOf(node);
          const map = callee === undefined ? undefined : POSITIONS[callee];

          if (map) {
            calls += 1;

            for (const [index, type] of Object.entries(map)) {
              const argument = node.arguments[Number(index)];

              if (argument) {
                readArgument(argument, type);
              }
            }
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(sf);
    }

    return { filled, files: files.length, calls };
  }

  const { filled, files, calls } = scan();

  const sorted = (s: Set<string>): string[] => [...s].toSorted(byName);
  const all = (type: string): string[] => {
    const row = filled[type];

    return row
      ? [...new Set([...row.src, ...row.tests, ...row.examples])].toSorted(
          byName,
        )
      : [];
  };

  it("the scan reaches the tree — anti-vacuum", () => {
    // ⚠ A scan that matched nothing would leave every set empty and every
    // membership cell green, including the plugin-extension cell below.
    expect(files).toBeGreaterThan(1500);
    expect(calls).toBeGreaterThan(1000);
    // ⚠ Not a COUNT of Route's fields — `route-key-authority-1738` owns that.
    // This only proves the declaration side of the comparison below is non-empty.
    expect(declaredFields("Route").length).toBeGreaterThan(5);
  });

  it("Route is filled with MORE fields than core declares — plugins merge their own", () => {
    const declared = declaredFields("Route");
    const extra = all("Route").filter((f) => !declared.includes(f));

    // ⚑ These six are the measurable form of the index signature on `Route`:
    // config doors that core never declared and cannot refuse.
    expect(extra).toStrictEqual([
      "onEnter",
      "onLeave",
      "onNavigate",
      "onStay",
      "preload",
      "searchSchema",
    ]);

    // Every declared field is filled somewhere — an unfilled one would be a
    // capability nothing exercises.
    expect(declared.filter((f) => !all("Route").includes(f))).toStrictEqual([]);
  });

  it("what an application actually configures — Options and the nested bags", () => {
    expect({
      options: sorted(filled.Options.examples),
      queryParams: all("QueryParamsOptions"),
      limits: all("LimitsConfig"),
      logger: all("LoggerConfig"),
    }).toStrictEqual({
      // ⚠ Examples are the closest thing to a real application in this tree, so
      // this row is what the documented surface is worth in practice: four of
      // the twelve declared options.
      options: [
        "allowNotFound",
        "caseSensitive",
        "defaultRoute",
        "queryParams",
      ],
      queryParams: ["arrayFormat", "numberFormat"],
      limits: [
        "maxDependencies",
        "maxLifecycleHandlers",
        "maxListeners",
        "maxPlugins",
        "warnListeners",
      ],
      logger: ["callback", "level"],
    });
  });

  it("NavigationOptions — the per-call config door", () => {
    expect(all("NavigationOptions")).toStrictEqual([
      "force",
      "hash",
      "hashChange",
      "reload",
      "replace",
      "signal",
    ]);
  });

  it("no shipped code outside core constructs a router", () => {
    // ⚑ Every config door is filled by tests and examples only. A plugin
    // configures nothing — it receives an already-built router — so a shipped
    // entry appearing here later is a change of shape worth noticing.
    for (const type of Object.keys(filled)) {
      expect(
        sorted(filled[type].src),
        `${type} filled from shipped code`,
      ).toStrictEqual([]);
    }

    expect(Object.keys(filled).length).toBeGreaterThan(4);
  });
});
