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
          at: `${path.relative(SRC, source.fileName)} :: ${node
            .getText(source)
            .split("\n", 1)[0]
            .trim()}`,
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
  // ⚑ Keyed by file plus matched TEXT (#1835). Line keys rotted this registry
  // twice — #1971's capture block, then #1835's gates — each time because an
  // edit ABOVE the site moved it, which is what the repository's rule for
  // derived guards warns about. The note #1971 left said the addressing was
  // wrong and that fixing it should not ride in on an unrelated sweep; #1835 IS
  // this guard's subject, so it lands here.
  "createSsrLoaderPlugin.ts :: promises[key] = ensureRegistryPromise(key)":
    "SAFE — the target is `Object.create(null)`, and the line above says so in " +
    "as many words. No chain, nothing to dispatch into.",
  "deferRegistryClient.ts :: scope[REGISTRY_GLOBAL_KEY] = registry":
    "SAFE — the key is a module constant (`REGISTRY_GLOBAL_KEY`), not a name " +
    "any caller chose.",
};

/**
 * Every computed-key READ, with why it may consult that key.
 *
 * ⚑ The mirror of {@link WRITE_REASONS}, and it was missing (#1835). A computed
 * read off a caller-supplied bag reaches the prototype chain exactly as a
 * computed write reaches the setter, and this directory had two of them.
 */
const READ_REASONS: Record<string, string> = {
  "createSsrLoaderPlugin.ts :: hydrated[deferredConfig.keysNamespace]":
    "GATED — the `hasOwn(hydrated, deferredConfig.keysNamespace)` immediately " +
    "above refuses an inherited array before this read happens.",
  "createSsrLoaderPlugin.ts :: context[config.namespace]":
    "GATED — the branch condition proves the context is a non-null object AND " +
    "that `hasOwn` holds for this namespace.",
  "createSsrLoaderPlugin.ts :: bag[key]":
    "GATED — `hasOwn(bag, key)` is the preceding conjunct in the same " +
    "`every` callback, so an inherited key fails before this read (#2060).",
  "createSsrLoaderPlugin.ts :: committed[key]":
    "SAFE — `key` comes from `objectKeys(committed)`, so it is an own key of " +
    "the very object being read.",
  "createSsrLoaderPlugin.ts :: payload[index]":
    "SAFE — a numeric index into a value `Array.isArray` proved, bounded by " +
    "the length equality checked one line above.",
  "defer.ts :: (value as Record<symbol, unknown>)[DEFER_BRAND]":
    "GATED — `hasOwn(value, DEFER_BRAND)` is the preceding conjunct, which is " +
    "what makes an inherited brand fail the check.",
  "deferRegistryClient.ts :: scope[REGISTRY_GLOBAL_KEY]":
    "SAFE — a module constant, not a name any caller chose.",
  "deferRegistryClient.ts :: scope[SETTLE_FN_NAME]":
    "SAFE — a module constant, not a name any caller chose.",
  "deferRegistryClient.ts :: scope[REJECT_FN_NAME]":
    "SAFE — a module constant, not a name any caller chose.",
  "deferWireFormat.ts :: ESCAPE_FOR_SCRIPT_TABLE[char]":
    "SAFE — `char` is one character, taken from a regex class built out of " +
    "this very table's keys, and no inherited name is one character long.",
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

  it("every computed-key read carries a written reason", () => {
    const reads = scan(
      (node) =>
        ts.isElementAccessExpression(node) &&
        !ts.isStringLiteral(node.argumentExpression) &&
        !ts.isNumericLiteral(node.argumentExpression) &&
        // Writes are the sibling registry's subject; this one is about reads.
        !(
          ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          node.parent.left === node
        ),
    );

    expect(
      Object.fromEntries(
        reads.map((s) => [s.at, READ_REASONS[s.at] ?? "UNCLASSIFIED"]),
      ),
    ).toStrictEqual(READ_REASONS);
  });

  // ⚠ NAMED for what it checks, not for what the class is (#1835). It sees the
  // `in` operator and `for…in`; a member read like `obj.loader` walks the chain
  // just as far and is invisible to it. Its old name — "no read consults a
  // prototype chain for a caller-chosen name" — claimed the whole class, and it
  // was GREEN while `compile()` read `obj.loader` and `obj.ssr` off the chain
  // three times. Those are pinned behaviourally, in
  // `proto-chain-reads-1835.test.ts`.
  it("no `in` / `for…in` consults a chain for a caller-chosen name", () => {
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
