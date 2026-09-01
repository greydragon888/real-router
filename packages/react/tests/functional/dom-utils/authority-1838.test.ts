// CLASS guard for `shared/dom-utils`, the dir this package is the coverage owner
// of (#1065 / #1086) and now the authority owner of too (#1838).
//
// ⚠ This dir feeds SIX packages — five by symlink and Angular by a git-tracked
// copy — so one unguarded site here multiplies by six. And none of core's ten
// scanning authority suites can reach it: `globSync` with a `**` segment does
// not descend into a symlinked directory, so a scan rooted at
// `packages/<pkg>/src` returns zero rows from `src/dom-utils`. Rooting the
// pattern AT the symlink works, which is what this file does.
//
// ⚠ The rows below are all SAFE, and that is a finding rather than an absence of
// one. Before this file the dir was assumed clean because a chain-walk scan
// returned nothing; scanning the OTHER shape found three sites, every one of
// them writing into `Object.create(null)` and every one already carrying a
// written reason in the source. The suite records that classification so a
// future edit that swaps a target for a plain `{}` fails here.

import { globSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching core's authority suites and what
// import-x/no-named-as-default-member expects.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// `__dirname`, not `import.meta.url`: this package builds to CommonJS, where
// `import.meta` is a TS1470 error. Core's authority suites root the same way.
const SRC = path.resolve(__dirname, "../../../src/dom-utils");

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
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

/** Every write under a key the page chose, with why its target is immune. */
const WRITE_REASONS: Record<string, string> = {
  "scroll-restore.ts:151":
    "SAFE — the store is prototype-less (see `loadStore`), so a key from " +
    "a route name has no inherited setter to dispatch into. Chosen over " +
    "`putField` deliberately: this cache is read a few times per navigation, " +
    "not per render.",
  "scroll-restore.ts:575":
    "SAFE — `sorted` is prototype-less, and the comment above it names " +
    "prototype-safety as non-negotiable for the canonical-key path.",
};

/** Every `Object.assign`, which is a `[[Set]]` per key wearing another name. */
const ASSIGN_REASONS: Record<string, string> = {
  // ⚠ Re-keyed a SECOND time, by #2072 / #2073, which added an `objectCreate`
  // capture at the head of `scroll-restore.ts` and moved every line below it by
  // three. No SITE changed either round — which is the whole objection to `:NNN`,
  // and why the repository's rule for derived guards is to address by file plus
  // the matched TEXT.
  //
  // ⚠ Still line-keyed, and the deferral is now COSTED rather than free.
  // Measured this round: of the two sibling registries, browser-plugin's is
  // line-keyed on `shared/browser-env` files this sweep did not touch and
  // ssr-data-plugin's is empty — so converting only this one would split one
  // convention into two while leaving a live landmine next door. All three move
  // together or none does.
  //
  // ⚑ The reasons above no longer SPELL `Object.create(null)`. The targets are
  // still prototype-less; they reach the intrinsic through the module-load
  // capture, and naming a spelling in a reason is how the sibling registry in
  // core went stale on the same rename.
  "scroll-restore.ts:127":
    "SAFE — the TARGET is prototype-less, built on the line below the " +
    "call. `Object.assign` copies with `[[Set]]`, so a live-prototype target " +
    "here would reopen the whole class through a form a `dst[key] = …` scan " +
    "cannot see.",
};

describe("shared/dom-utils authority (#1838)", () => {
  it("the scanner sees the symlinked dir at all", () => {
    // Non-vacuity: an empty scan satisfies every table below, and an empty scan
    // is exactly what a broken root path produces.
    expect(files().length).toBeGreaterThanOrEqual(5);
    expect(files().some((f) => f.endsWith("scroll-restore.ts"))).toBe(true);
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

  it("every Object.assign carries one too", () => {
    const assigns = scan(
      (node) =>
        ts.isCallExpression(node) &&
        node.expression.getText().replaceAll(/\s/gu, "") === "Object.assign",
    );

    expect(
      Object.fromEntries(
        assigns.map((s) => [s.at, ASSIGN_REASONS[s.at] ?? "UNCLASSIFIED"]),
      ),
    ).toStrictEqual(ASSIGN_REASONS);
  });

  it("no read consults a prototype chain for a page-chosen name", () => {
    const walks = scan(
      (node) =>
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword) ||
        ts.isForInStatement(node),
    );

    expect(walks).toStrictEqual([]);
  });
});
