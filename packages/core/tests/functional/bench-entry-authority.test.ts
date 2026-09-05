import { globSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `computed-key-write-authority-1852.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every `*.bench.ts` arm reaches the CodSpeed entry (#2116).
 *
 * ⚑ **The entry hand-lists its arms TWICE and the directory bound neither.**
 * `codspeed.ts` names each suite once as an import and once as a `suites` row;
 * `run.ts` reads the directory instead. So an arm can ship, run under a local
 * `pnpm bench`, and be measured by nobody in CI — the two readers disagree and
 * neither says so. Measured: seven `*.bench.ts` on disk against six in the
 * entry, and the arm outside it was the one whose whole purpose was a CI number.
 *
 * ⚠ **Both halves are asserted, because either drifts alone.** An import with no
 * `suites` row type-checks and measures nothing, which is the silent direction.
 * A row with no import does not compile — but that is the compiler's guarantee,
 * not this file's, and a reader who sees one half checked assumes both.
 *
 * ⚠ **The lists come from the AST, never from `includes`.** A substring scan
 * counts a name written in a comment as a wiring, and this file's own docblock
 * names every suite — so a textual predicate would pass on an entry that
 * imports nothing at all.
 *
 * ⚠ **A SET, not a count.** `length` matching would stay green after a rename
 * that dropped one arm and added another, which is the shape a refactor
 * produces. Both directions red: an arm missing from the entry, and an entry row
 * naming a file that no longer exists.
 */
const BENCH_DIR = path.resolve(__dirname, "../benchmarks");

const ENTRY = path.join(BENCH_DIR, "codspeed.ts");

/** The arms on disk — the same reach `run.ts` takes, minus the entry itself. */
const armsOnDisk = (): string[] =>
  globSync("*.bench.ts", { cwd: BENCH_DIR })
    .map((file) => file.replace(/\.bench\.ts$/, ""))
    .toSorted((a, b) => a.localeCompare(b));

const entrySource = (): ts.SourceFile =>
  ts.createSourceFile(
    ENTRY,
    readFileSync(ENTRY, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

/** Suite names taken from `import … from "./<name>.bench"`. */
const importedArms = (source: ts.SourceFile): string[] => {
  const names: string[] = [];

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const specifier = statement.moduleSpecifier.text;

    if (specifier.endsWith(".bench")) {
      names.push(specifier.replace(/^\.\//, "").replace(/\.bench$/, ""));
    }
  }

  return names.toSorted((a, b) => a.localeCompare(b));
};

/** The `suites` array literal, or `undefined` if the entry stops declaring one. */
const suitesArray = (
  source: ts.SourceFile,
): ts.ArrayLiteralExpression | undefined => {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      const { initializer } = declaration;

      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "suites" &&
        initializer !== undefined &&
        ts.isArrayLiteralExpression(initializer)
      ) {
        return initializer;
      }
    }
  }

  return undefined;
};

/** Suite names taken from the first element of each `suites` tuple. */
const listedArms = (source: ts.SourceFile): string[] => {
  const names: string[] = [];

  for (const element of suitesArray(source)?.elements ?? []) {
    if (!ts.isArrayLiteralExpression(element)) {
      continue;
    }

    const first = element.elements[0];

    if (first !== undefined && ts.isStringLiteral(first)) {
      names.push(first.text);
    }
  }

  return names.toSorted((a, b) => a.localeCompare(b));
};

describe("every bench arm reaches the CodSpeed entry (#2116)", () => {
  it("the entry IMPORTS exactly the arms the directory holds", () => {
    const source = entrySource();

    expect(importedArms(source)).toStrictEqual(armsOnDisk());
  });

  it("and RUNS exactly those arms — an import alone measures nothing", () => {
    const source = entrySource();

    expect(listedArms(source)).toStrictEqual(armsOnDisk());
  });

  it("CONTROL — the instrument reads the AST, so a name in prose is not a wiring", () => {
    // ⚑ Without this the two cells above pass on an entry whose docblock merely
    // mentions each suite. The synthetic file names every arm in a comment and
    // wires none; both extractors must come back empty.
    const decoy = ts.createSourceFile(
      "decoy.ts",
      [
        "// default.bench encoding-none.bench ingest-primitive.bench",
        '/** suites = [["default", runDefault], ["ingest-primitive", x]] */',
        'const other = [["default", 1]];',
        "export {};",
      ].join("\n"),
      ts.ScriptTarget.Latest,
      true,
    );

    expect(importedArms(decoy)).toStrictEqual([]);
    expect(listedArms(decoy)).toStrictEqual([]);
  });

  it("CONTROL — the extractors are not vacuous on the real entry", () => {
    // A pair of extractors that silently returned `[]` would make both cells
    // above compare `[]` against an `armsOnDisk()` that had also gone empty
    // — the failure mode `computed-key-write-authority` guards with its own
    // non-emptiness cell.
    const source = entrySource();

    expect(armsOnDisk().length).toBeGreaterThan(0);
    expect(importedArms(source).length).toBeGreaterThan(0);
    expect(listedArms(source).length).toBeGreaterThan(0);
  });
});
