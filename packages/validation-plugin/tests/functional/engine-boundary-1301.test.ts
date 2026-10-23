import { globSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The plugin reaches core only through a subpath core's `exports` publishes,
 * so core stays the sole consumer of its routing engine (#1301).
 *
 * An import of `src/` fails when it names `@real-router/core` with a subpath
 * core does not publish, or when any other specifier — a relative path, an
 * absolute one, a path through `node_modules` — resolves into `packages/core/`
 * under this package's own compiler options.
 *
 * What the plugin takes from `@real-router/core/validation` is what `src/`
 * imports from that subpath: this file holds how core is reached, not which
 * names are taken.
 *
 * ⚠ A one-line search for the subpath misses the names of a multi-line import.
 */

const PACKAGE = path.resolve(__dirname, "../..");
const SRC = path.join(PACKAGE, "src");
const CORE = realpathSync(path.resolve(PACKAGE, "../core"));

/**
 * `@real-router/core` and `@real-router/core/<subpath>`, one per key of core's
 * `exports`.
 */
const PUBLISHED: ReadonlySet<string> = new Set(
  Object.keys(
    (
      JSON.parse(readFileSync(path.join(CORE, "package.json"), "utf8")) as {
        exports: Record<string, unknown>;
      }
    ).exports,
  ).map((key) => path.posix.join("@real-router/core", key)),
);

const OPTIONS = ts.parseJsonConfigFileContent(
  ts.readConfigFile(path.join(PACKAGE, "tsconfig.json"), ts.sys.readFile)
    .config,
  ts.sys,
  PACKAGE,
).options;

interface Source {
  /** Where the file sits: a relative specifier resolves from here. */
  readonly fileName: string;
  readonly text: string;
}

interface Crossing {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
}

/** Whether a module named from `fileName` reaches core around its `exports`. */
function bypassesExports(specifier: string, fileName: string): boolean {
  if (
    specifier === "@real-router/core" ||
    specifier.startsWith("@real-router/core/")
  ) {
    return !PUBLISHED.has(specifier);
  }

  const resolved = ts.resolveModuleName(
    specifier,
    fileName,
    OPTIONS,
    ts.sys,
  ).resolvedModule;

  // The resolver follows a symlink only on a `node_modules` lookup, so a
  // relative path through one is followed here.
  return (
    resolved !== undefined &&
    realpathSync(resolved.resolvedFileName).startsWith(`${CORE}${path.sep}`)
  );
}

/** Every import of `sources` that reaches core around its `exports`. */
function crossingsOf(sources: readonly Source[]): Crossing[] {
  return sources.flatMap(({ fileName, text }) =>
    ts
      .preProcessFile(text, true, true)
      .importedFiles.filter((imported) =>
        bypassesExports(imported.fileName, fileName),
      )
      .map((imported) => ({
        file: path.relative(SRC, fileName),
        line: text.slice(0, imported.pos).split("\n").length,
        specifier: imported.fileName,
      })),
  );
}

/** `src/` as the scan reads it — at collection, so no cell waits on the reads. */
const TREE: readonly Source[] = globSync(`${SRC}/**/*.ts`).map((fileName) => ({
  fileName,
  text: readFileSync(fileName, "utf8"),
}));

/** A file planted in `src/`: only its location is real, nothing is written. */
const planted = (text: string): Source[] => [
  { fileName: path.join(SRC, "planted.ts"), text },
];

const ENGINE = "../../core/src/engine";

const REACHES = [
  { reach: "a relative path to the engine", specifier: ENGINE },
  {
    reach: "a relative path to a core file outside the engine",
    specifier: "../../core/src/internals",
  },
  {
    reach: "a path through the package's node_modules",
    specifier: "../node_modules/@real-router/core/src/engine",
  },
  { reach: "an absolute path", specifier: `${CORE}/src/engine` },
  {
    reach: "a subpath core does not publish",
    specifier: "@real-router/core/engine",
  },
  {
    reach: "a deep path into core's sources",
    specifier: "@real-router/core/src/engine",
  },
];

const FORMS = [
  {
    form: "a type-only import",
    text: `import type { RouteTree } from "${ENGINE}";`,
    line: 1,
  },
  {
    form: "a re-export",
    text: `export { validateRoute } from "${ENGINE}";`,
    line: 1,
  },
  {
    form: "a dynamic import",
    text: `const engine = import("${ENGINE}");`,
    line: 1,
  },
  {
    form: "a require call",
    text: `const engine = require("${ENGINE}");`,
    line: 1,
  },
  {
    form: "an import type",
    text: `let tree: import("${ENGINE}").RouteTree;`,
    line: 1,
  },
  {
    form: "a multi-line import",
    text: `import {\n  createRouteTree,\n  validateRoute,\n} from "${ENGINE}";`,
    line: 4,
  },
];

describe("validation-plugin reaches core only through its published subpaths (#1301)", () => {
  it("no import in src/ reaches core around its exports", () => {
    expect(TREE.length).toBeGreaterThan(0);
    expect(crossingsOf(TREE)).toStrictEqual([]);
  });

  it.each(REACHES)("refuses $reach", ({ specifier }) => {
    expect(
      crossingsOf(planted(`import { createRouteTree } from "${specifier}";`)),
    ).toStrictEqual([{ file: "planted.ts", line: 1, specifier }]);
  });

  it.each(FORMS)("refuses the engine named by $form", ({ text, line }) => {
    expect(crossingsOf(planted(text))).toStrictEqual([
      { file: "planted.ts", line, specifier: ENGINE },
    ]);
  });

  it.each([...PUBLISHED, "./helpers"])("admits %s", (specifier) => {
    expect(
      crossingsOf(planted(`import * as module from "${specifier}";`)),
    ).toStrictEqual([]);
  });
});
