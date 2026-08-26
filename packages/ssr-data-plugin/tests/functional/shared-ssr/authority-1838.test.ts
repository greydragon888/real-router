// CLASS guard for `shared/ssr`, the dir this package is the coverage owner of
// (#809) and now the authority owner of too (#1838).
//
// ⚠ None of core's ten scanning authority suites can see this code: `globSync`
// with a `**` segment does not descend into a symlinked directory, so a scan
// rooted at `packages/<pkg>/src` returns zero rows from `src/shared-ssr`.
// Rooting the pattern AT the symlink works — that is what this file does.
//
// The inventory this file was written from, taken by running core's two
// shape-scanners against the dir: three sites, two safe by construction and one
// live defect (`config.namespace in hydrationState.context`, fixed with it).

import { globSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching core's authority suites and what
// import-x/no-named-as-default-member expects.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// `__dirname`, not `import.meta.url`: this package builds to CommonJS, where
// `import.meta` is a TS1470 error. Core's authority suites root the same way.
const SRC = path.resolve(__dirname, "../../../src/shared-ssr");

const files = (): string[] =>
  // eslint-disable-next-line unicorn/no-array-sort -- ng-packagr pins a pre-ES2023 lib for the shared sources; `toSorted` is unavailable
  globSync(`${SRC}/**/*.ts`).sort((left, right) => left.localeCompare(right));

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );

interface Site {
  readonly at: string;
  readonly code: string;
}

function scan(pick: (node: ts.Node) => boolean): Site[] {
  const found: Site[] = [];

  for (const file of files()) {
    const source = parse(file);
    const visit = (node: ts.Node): void => {
      if (pick(node)) {
        found.push({
          at: `${path.relative(SRC, source.fileName)}:${
            source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
          }`,
          code: node.getText(source).split("\n", 1)[0].trim(),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

/** Every computed-key write, with why its target cannot be hijacked. */
const WRITE_REASONS: Record<string, string> = {
  "createSsrLoaderPlugin.ts:305":
    "SAFE — the target is `Object.create(null)`, and the line above says so in " +
    "as many words. No chain, nothing to dispatch into.",
  "deferRegistryClient.ts:63":
    "SAFE — the key is a module constant (`REGISTRY_GLOBAL_KEY`), not a name " +
    "any caller chose.",
};

/** Every chain-walking read, with why it must consult the chain. */
const CHAIN_WALK_REASONS: Record<string, string> = {};

describe("shared/ssr authority (#1838)", () => {
  it("the scanner sees the symlinked dir at all", () => {
    // Non-vacuity: every assertion below is satisfied by an empty scan, and an
    // empty scan is what a broken root path also produces.
    expect(files().length).toBeGreaterThanOrEqual(5);
    expect(files().some((f) => f.endsWith("createSsrLoaderPlugin.ts"))).toBe(
      true,
    );
  });

  it("every computed-key write carries a written reason", () => {
    const writes = scan(
      (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left) &&
        !ts.isStringLiteral(node.left.argumentExpression) &&
        !ts.isNumericLiteral(node.left.argumentExpression),
    );

    expect(
      Object.fromEntries(
        writes.map((s) => [s.at, WRITE_REASONS[s.at] ?? "UNCLASSIFIED"]),
      ),
    ).toStrictEqual(WRITE_REASONS);
  });

  it("no read consults a prototype chain for a caller-chosen name", () => {
    // ⚠ Empty on purpose, and it was NOT empty when this file was written:
    // `createSsrLoaderPlugin.ts` asked `config.namespace in hydrationState.context`.
    // The context arrives from `JSON.parse` of the SSR payload, so its prototype
    // is `Object.prototype`, and the namespace is a developer-chosen string core
    // accepts as long as it is non-empty. Measured on a parsed context:
    // `"toString" in context` is true, `Object.hasOwn` is false, and the value is
    // a FUNCTION — so a plugin with that namespace would read the native method
    // as the server's answer and skip re-running its loader.
    const walks = scan(
      (node) =>
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword) ||
        ts.isForInStatement(node),
    );

    expect(
      Object.fromEntries(
        walks.map((s) => [s.at, CHAIN_WALK_REASONS[s.at] ?? "UNCLASSIFIED"]),
      ),
    ).toStrictEqual(CHAIN_WALK_REASONS);
  });
});
