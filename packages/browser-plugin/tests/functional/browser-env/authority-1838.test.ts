// CLASS guard for `shared/browser-env`, the dir this package is the coverage
// owner of (#809 / #1086) and now the authority owner of too (#1838).
//
// ⚠ Why it lives here and not in `packages/core`. Core carries ten scanning
// authority suites, and repointing one of them at `shared/` was measured to work
// — that is how this dir's inventory was first taken. It is still wrong: it
// makes `packages/core` the authority over code core does not consume, and puts
// rows in core's table that core reviewers cannot judge. The repo already
// answers this question for coverage — one owner per shared dir — so authority
// follows coverage.
//
// ⚠ And why a scan is needed at all: NONE of core's suites can see this code.
// Measured — `globSync("<parent>/**/*.ts")` returns 5 files for this package and
// ZERO from `src/browser-env`, because `**` does not descend into a symlinked
// directory. Rooting the pattern AT the symlink works and returns all 16, which
// is what this file does; the realpath is not needed.
//
// Two shapes are scanned here, both with a core precedent:
//   · chain walk   (`in` / `for…in`) — `chain-walk-authority.test.ts`
//   · type mirror  (a guard asserting more than it checks) — `type-mirror-authority.test.ts`
//
// The computed-key-write shape (`computed-key-write-authority-1852.test.ts`) is
// scanned too and is EMPTY here, deliberately asserted rather than omitted: an
// empty result is what a broken scanner also returns.
//
// ⚠ The table below has no row for `validation.ts`, and that is the point rather
// than an omission. It carried `key in defaults` — a walk over a plain object
// literal, which answered for every own member of `Object.prototype` and then
// type-checked the inherited method it found. That read is `Object.hasOwn` now
// (#1838), so the site is GONE; re-introducing it fails here as UNCLASSIFIED.
// A row cannot be left behind for it either — `toStrictEqual` rejects a reason
// for a site the scan does not find, which is how a stale classification is
// caught.

import { globSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching core's authority suites and what
// import-x/no-named-as-default-member expects.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// `__dirname`, not `import.meta.url`: this package builds to CommonJS, where
// `import.meta` is a TS1470 error. Core's authority suites root the same way.
const SRC = path.resolve(__dirname, "../../../src/browser-env");

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );

const files = (): string[] =>
  // eslint-disable-next-line unicorn/no-array-sort -- ng-packagr pins a pre-ES2023 lib for the shared sources; `toSorted` is unavailable
  globSync(`${SRC}/**/*.ts`).sort((left, right) => left.localeCompare(right));

interface Site {
  readonly at: string;
  readonly code: string;
}

/**
 * Addressed by repo-relative PATH plus the matched TEXT, in the form the
 * `shared-ssr` and `dom-utils` mirrors use (#1835 / #2072).
 *
 * ⚠ Line keys rotted this registry on an edit that changed nothing about the
 * site: #1971's capture block moved every line in `state-guard.ts`. The text
 * changes only when the read does, which is when the reason beside it wants
 * re-reading anyway.
 */
const site = (source: ts.SourceFile, node: ts.Node): Site => ({
  at: `${path.relative(SRC, source.fileName)} :: ${node
    .getText(source)
    .split("\n", 1)[0]
    .trim()}`,
  code: node.getText(source).split("\n", 1)[0].trim(),
});

function scan(pick: (node: ts.Node) => boolean): Site[] {
  const found: Site[] = [];

  for (const file of files()) {
    const source = parse(file);
    const visit = (node: ts.Node): void => {
      if (pick(node)) {
        found.push(site(source, node));
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

/**
 * Every chain-walking read, with the reason it is one.
 *
 * A row here is a CLASSIFICATION, not a permission: adding one means writing why
 * this read must consult the prototype chain. Deleting a row without deleting
 * the read fails the test.
 */
const CHAIN_WALK_REASONS: Record<string, string> = {
  'popstate-utils.ts :: "state" in evt':
    "REQUIRED. `evt` is a PopStateEvent, and `state` is an accessor on its " +
    "prototype — measured in jsdom, `Object.hasOwn(new PopStateEvent('popstate'), " +
    '"state")` is false while `"state" in evt` is true. Own-only would break every ' +
    "popstate restore.",
  "state-guard.ts :: for (const key in value) {":
    "SAFE. `for…in` over a caller's object, guarded by the CAPTURED `hasOwn` on " +
    "the next line — the own-ness question is answered, not skipped, and since " +
    "#1971 it is answered by an intrinsic read at module load rather than off " +
    "the live global.",
};

/**
 * The verdict map, with the key COLLISION a text address makes possible refused
 * rather than merged.
 *
 * ⚠ A line number identifies one site by construction; the matched text does
 * not. Two sites whose first line is identical produce one key,
 * `Object.fromEntries` keeps the last, and an UNCLASSIFIED twin disappears
 * behind a classified one. Measured on this suite: a second multi-line
 * `Object.assign(` planted in the scanned source left it GREEN, while a site
 * with different text reds it — so the hole is invisible in exactly the case a
 * registry exists for.
 */
function verdicts(
  sites: readonly Site[],
  reasons: Record<string, string>,
): Record<string, string> {
  const seen = new Set<string>();

  for (const site of sites) {
    if (seen.has(site.at)) {
      throw new Error(
        `two scanned sites share the key \`${site.at}\` — a text address must ` +
          "identify ONE site, so widen it (or the code) until each is " +
          "classified on its own",
      );
    }

    seen.add(site.at);
  }

  return Object.fromEntries(
    sites.map((site) => [site.at, reasons[site.at] ?? "UNCLASSIFIED"]),
  );
}

describe("shared/browser-env authority (#1838)", () => {
  it("CONTROL — two sites sharing one text key are REFUSED, not merged", () => {
    // Without this the key-collision hole re-opens silently: the suite that
    // merges a duplicate is green, and green is what a clean scan looks like.
    const twin: Site[] = [
      { at: "x.ts :: dup" } as Site,
      { at: "x.ts :: dup" } as Site,
    ];

    expect(() => verdicts(twin, { "x.ts :: dup": "classified" })).toThrow(
      /share the key/u,
    );

    // …and a distinct pair still builds, so the check is not refusing everything.
    expect(
      verdicts([{ at: "x.ts :: a" } as Site, { at: "x.ts :: b" } as Site], {
        "x.ts :: a": "one",
      }),
    ).toStrictEqual({ "x.ts :: a": "one", "x.ts :: b": "UNCLASSIFIED" });
  });

  it("the scanner sees the symlinked dir at all", () => {
    // Non-vacuity. Every assertion below is satisfied by an empty scan, and an
    // empty scan is exactly what this file existed to prevent: `**` does not
    // descend into a symlink, so a future refactor of the root path would make
    // the whole suite pass while scanning nothing.
    expect(files().length).toBeGreaterThanOrEqual(10);
    expect(files().some((f) => f.endsWith("validation.ts"))).toBe(true);
  });

  it("every chain-walking read carries a written reason", () => {
    const walks = scan(
      (node) =>
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword) ||
        ts.isForInStatement(node),
    );

    expect(verdicts(walks, CHAIN_WALK_REASONS)).toStrictEqual(
      CHAIN_WALK_REASONS,
    );
  });

  it("no computed-key write reaches a live-prototype target", () => {
    // Empty today. Asserted rather than omitted, and paired with the
    // non-vacuity cell above, because "no sites" and "scanner broken" print the
    // same result.
    const writes = scan(
      (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left) &&
        !ts.isStringLiteral(node.left.argumentExpression) &&
        !ts.isNumericLiteral(node.left.argumentExpression),
    );

    expect(writes).toStrictEqual([]);
  });

  it("every member `RestorableEntry` declares is actually validated (#1837)", () => {
    // The recurrence guard for the class #1838 and #1837 are both instances of:
    // the guard declares a shape and checks a SUBSET of it.
    //
    //   #1838 — declared `value is State`, checked three of `State`'s six.
    //   #1837 — checked `search`'s SHAPE and not its values, while the twin
    //           channel `params` was screened by value.
    //
    // The next instance is a member added to `RestorableEntry` and not to the
    // guard, and neither the type checker nor any behavioural test would say
    // so: an unvalidated member is simply believed.
    //
    // Derived from the source, never listed — a hand-written member list is the
    // thing that goes stale, and that is what let #1838 sit as long as it did.
    const file = path.join(SRC, "state-guard.ts");
    const source = parse(file);

    const declared: string[] = [];
    const validated = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (
        ts.isInterfaceDeclaration(node) &&
        node.name.text === "RestorableEntry"
      ) {
        for (const member of node.members) {
          if (member.name !== undefined && ts.isIdentifier(member.name)) {
            declared.push(member.name.text);
          }
        }
      }

      // Every `obj.<member>` read, wherever it happens: `isStateStrict` reads
      // some directly and delegates the rest to `isRequiredFields`, whose
      // parameter carries the same name.
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "obj"
      ) {
        validated.add(node.name.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);

    // Anti-vacuity on BOTH derivations: an empty `declared` makes the subset
    // check trivially true, and an empty `validated` makes it trivially false
    // in a way a reader might "fix" by shrinking the interface.
    expect(declared.length).toBeGreaterThan(3);
    expect(validated.size).toBeGreaterThan(3);

    expect(declared.filter((member) => !validated.has(member))).toStrictEqual(
      [],
    );
  });
});
