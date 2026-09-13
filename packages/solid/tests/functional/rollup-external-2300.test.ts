import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { externalFrom } from "../../rollup.external.mjs";

/**
 * Every package the Solid bundle reaches for stays an import (#2300).
 *
 * Rollup copies into `dist` whatever its `external` rule does not cover, and
 * says nothing: a specifier the rule misses — a new subpath of a dependency,
 * typically — ships that dependency's built code inside this package, sized by
 * however the dependency chunks itself. So does a bundle entry that forgets
 * `external` altogether.
 *
 * The walk reads the tree rollup compiles: `src/`, including the `dom-utils`
 * symlink, which node's recursive `readdirSync` follows.
 */

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PACKAGE_ROOT, "src");
const ROLLUP_CONFIG = path.join(PACKAGE_ROOT, "rollup.config.mjs");

const manifest = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const isExternal = externalFrom(manifest);

const isSourceFile = (file: string): boolean => /\.tsx?$/u.test(file);
const isBareSpecifier = (specifier: string): boolean =>
  !specifier.startsWith(".") && !specifier.startsWith("/");

/** The specifier a declaration names, unless the whole declaration is a type. */
function runtimeSpecifier(statement: ts.Statement): string | undefined {
  if (
    ts.isImportDeclaration(statement) &&
    statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword &&
    ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return statement.moduleSpecifier.text;
  }

  if (
    ts.isExportDeclaration(statement) &&
    !statement.isTypeOnly &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return statement.moduleSpecifier.text;
  }

  return undefined;
}

/** `import("x")` anywhere in the file, not only at the top level. */
function collectDynamic(node: ts.Node, into: string[]): void {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    into.push(node.arguments[0].text);
  }

  ts.forEachChild(node, (child) => {
    collectDynamic(child, into);
  });
}

function specifiersOf(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = source.statements
    .map((statement) => runtimeSpecifier(statement))
    .filter((specifier) => specifier !== undefined);

  collectDynamic(source, found);

  return found;
}

/** The source text of a property's value — a shorthand `external` reads as its name. */
function valueText(
  property: ts.ObjectLiteralElementLike,
  source: ts.SourceFile,
): string {
  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name.text;
  }

  if (ts.isPropertyAssignment(property)) {
    return ts.isStringLiteral(property.initializer)
      ? property.initializer.text
      : property.initializer.getText(source);
  }

  return property.getText(source);
}

interface RollupEntry {
  input: string;
  external: string | undefined;
}

/** Every object in `rollup.config.mjs` that names an `input`, and what it passes as `external`. */
function rollupEntries(source: ts.SourceFile): RollupEntry[] {
  const entries: RollupEntry[] = [];
  const propertyNamed = (
    node: ts.ObjectLiteralExpression,
    name: string,
  ): ts.ObjectLiteralElementLike | undefined =>
    node.properties.find((property) => property.name?.getText(source) === name);

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const input = propertyNamed(node, "input");
      const external = propertyNamed(node, "external");

      if (input !== undefined) {
        entries.push({
          input: valueText(input, source),
          external:
            external === undefined ? undefined : valueText(external, source),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return entries;
}

/** What `const external = …` is initialised with in `rollup.config.mjs`. */
function externalInitializer(source: ts.SourceFile): string | undefined {
  let found: string | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "external" &&
      node.initializer !== undefined
    ) {
      found = node.initializer.getText(source);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((file) => isSourceFile(file))
  .map((file) => path.join(SRC, file));

const bareSpecifiers = [
  ...new Set(
    sourceFiles
      .flatMap((file) => specifiersOf(file))
      .filter((specifier) => isBareSpecifier(specifier)),
  ),
].toSorted((left, right) => left.localeCompare(right));

describe("every bare specifier in solid's source is external to its bundle (#2300)", () => {
  it("rollup copies none of them into dist", () => {
    expect(
      bareSpecifiers.filter((specifier) => !isExternal(specifier)),
    ).toStrictEqual([]);
  });

  it("CONTROL — the walk reaches the dom-utils symlink, where the core subpath is imported", () => {
    // `link-utils.ts` is the one file in this graph that imports
    // `@real-router/core/utils`. A walk that stopped at the symlink would
    // satisfy the cell above without ever meeting it.
    expect(
      sourceFiles.some((file) =>
        file.includes(`${path.sep}dom-utils${path.sep}`),
      ),
    ).toBe(true);
    expect(bareSpecifiers).toContain("@real-router/core/utils");
  });

  it("every dependency and peer the manifest declares is external, subpaths included", () => {
    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    });

    expect(declared.length).toBeGreaterThan(0);
    expect(
      declared.filter(
        (name) => !isExternal(name) || !isExternal(`${name}/any`),
      ),
    ).toStrictEqual([]);
  });

  it("CONTROL — the rule is not a blanket: local paths and look-alike names stay bundled", () => {
    expect(isExternal("./components/Link")).toBe(false);
    // A prefix test without the `/` boundary would admit both of these.
    expect(isExternal("solid-jsx")).toBe(false);
    expect(isExternal("@real-router/core-extra")).toBe(false);
  });
});

describe("every rollup entry hands rollup that rule (#2300)", () => {
  const source = ts.createSourceFile(
    ROLLUP_CONFIG,
    readFileSync(ROLLUP_CONFIG, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const entries = rollupEntries(source);

  it("no entry bundles with a rule of its own, or with none", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries
        .filter((entry) => entry.external !== "external")
        .map((entry) => entry.input),
    ).toStrictEqual([]);
  });

  it("the shared `external` is the manifest rule", () => {
    expect(externalInitializer(source)).toMatch(/^externalFrom\(/u);
  });
});
