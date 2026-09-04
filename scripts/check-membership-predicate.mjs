#!/usr/bin/env node
/**
 * One object, two questions about its own keys — the class #1815 and #2064 are
 * the two instances of.
 *
 * `Object.keys` is own AND enumerable. `hasOwnProperty` is own ONLY, and on a
 * `Proxy` it is whatever the `getOwnPropertyDescriptor` trap answers. `in`
 * walks the prototype chain. A function that COUNTS a record's keys with one of
 * them and tests MEMBERSHIP in that same record with another disagrees with
 * itself on exactly the keys the count refuses to see:
 *
 *   #1815  recordsShallowEqual   Object.keys(right).length … key in right
 *   #2064  shallowEqual          Object.keys(next).length  … hasOwnProperty.call(next, key)
 *
 * Both compare two records with DISJOINT own-enumerable surfaces as equal. Both
 * are fixed the same way: membership comes from the key list the count already
 * produced and threw away.
 *
 * ⚑ **The discriminator is the RECEIVER, not proximity.** Counting `a` and
 * asking `"x" in b` is ordinary code; the defect needs both halves aimed at the
 * SAME object. Proximity was tried and rejected — the two halves may sit in
 * different statements, and a window wide enough to catch that is wide enough
 * to flag every unrelated pair. Measured on the planted battery in
 * `check-membership-predicate.test.mjs`: the distant-but-same-receiver form is
 * caught, the adjacent-but-different-receiver one is not.
 *
 * ⚠ **Not every hit is a defect**, and this script does not pretend otherwise.
 * A size check plus an unrelated feature test on the same options bag is
 * harmless. So a hit must be CLASSIFIED — added to `ALLOWED` with a reason —
 * rather than silently accepted, which is the `chain-walk-authority` contract
 * one level up.
 *
 * ⚠ **Why a root script and not a test per package.** A scan rooted inside a
 * package cannot see `shared/`: `globSync` over a parent returns zero files
 * from a symlinked directory (#1838), and `shared/dom-utils` reaches five
 * adapters that way. From the repo root `shared/` is an ordinary directory. The
 * alternative — one guard per coverage owner — would be four copies of this
 * predicate that must stay identical, which is the class it guards, one level
 * up.
 *
 * ⚑ Files come from `git ls-files`, so each shared source is visited ONCE: git
 * stores `packages/react/src/dom-utils` as a symlink entry, not as its
 * contents. `packages/angular/src/dom-utils` is a real tracked copy and is
 * visited on its own — correctly, since it is the code ng-packagr ships.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Sites where a count and a membership test share a receiver on purpose.
 *
 * EMPTY, and that is a measurement rather than an omission: after #2064 no site
 * in `packages` or `shared` carries the shape. A new entry needs a reason
 * saying why the two questions may differ there.
 */
const ALLOWED = new Map();

/** Own-key counters. `objectKeys` is the module-load capture this repo uses. */
const isKeysCall = (node) =>
  ts.isCallExpression(node) &&
  ["Object.keys", "objectKeys"].includes(node.expression.getText()) &&
  node.arguments.length > 0;

/** `<keysCall>(X).length` — the count half. Returns X's source text. */
const countedReceiver = (node) =>
  ts.isPropertyAccessExpression(node) &&
  node.name.text === "length" &&
  isKeysCall(node.expression)
    ? node.expression.arguments[0].getText()
    : undefined;

export const OWN_PREDICATES = [
  "Object.prototype.hasOwnProperty.call",
  "Object.prototype.propertyIsEnumerable.call",
  "hasOwnProperty.call",
  "propertyIsEnumerable.call",
  "Object.hasOwn",
  "hasOwn",
];

/**
 * The membership half. Two syntactic families, and `in` is here even though it
 * is a chain walk `chain-walk-authority` also classifies: the question this
 * script asks is not "does it walk the chain" but "do the two halves disagree",
 * and #1815 was spelled with `in`.
 */
const membershipReceiver = (node) => {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InKeyword
  ) {
    return node.right.getText();
  }

  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    const callee = node.expression.getText();

    if (OWN_PREDICATES.includes(callee)) {
      return node.arguments[0].getText();
    }

    // `bag.hasOwnProperty(key)` — the unbound form.
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ["hasOwnProperty", "propertyIsEnumerable"].includes(
        node.expression.name.text,
      )
    ) {
      return node.expression.expression.getText();
    }
  }

  return undefined;
};

const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node);

/**
 * The scope is the nearest enclosing FUNCTION, not the file: two halves in two
 * unrelated functions are two unrelated questions. A nested arrow inherits its
 * parent's counts, which is what `for (const k of keys) …` inside a callback
 * needs.
 */
export function findSites(file, code) {
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
  const hits = [];

  const visit = (node, counted) => {
    let scope = counted;

    if (isFunctionLike(node)) {
      scope = new Set(counted);
      collectCounts(node, scope);
    }

    const receiver = membershipReceiver(node);

    if (receiver !== undefined && scope.has(receiver)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());

      hits.push({ line: line + 1, receiver, text: node.getText() });
    }

    ts.forEachChild(node, (child) => {
      visit(child, scope);
    });
  };

  /**
   * ⚠ Stops at NESTED function boundaries, and a control cell is what put it
   * there: a file-wide pre-pass leaked one function's count into another's
   * scope and reported two unrelated halves as a site. A nested function builds
   * its own scope from this one when it is visited, so its counts are not lost
   * — they are just not lent upward.
   */
  const collectCounts = (node, into) => {
    const walk = (n) => {
      const counted = countedReceiver(n);

      if (counted !== undefined) {
        into.add(counted);
      }

      ts.forEachChild(n, (child) => {
        if (!isFunctionLike(child)) {
          walk(child);
        }
      });
    };

    walk(node);
  };

  const top = new Set();

  collectCounts(source, top);
  ts.forEachChild(source, (child) => {
    visit(child, top);
  });

  return hits;
}

export const trackedSources = () =>
  execFileSync("git", ["ls-files", "packages", "shared"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(
      (file) =>
        /\.(ts|tsx|mts|mjs)$/.test(file) &&
        !/(^|\/)(dist|node_modules|coverage)\//.test(file) &&
        !/(^|\/)tests?\//.test(file) &&
        !/\.(test|spec|properties|bench)\.[cm]?tsx?$/.test(file),
    );

export function scan(files = trackedSources()) {
  const found = [];

  for (const file of files) {
    let code;

    try {
      code = readFileSync(join(ROOT, file), "utf8");
    } catch {
      // A symlink entry git tracks as a link, or a file removed since the
      // listing — neither is a source this scan owns.
      continue;
    }

    for (const hit of findSites(file, code)) {
      const key = `${file}:${hit.receiver}`;

      if (!ALLOWED.has(key)) {
        found.push({ ...hit, file, key });
      }
    }
  }

  return found;
}

/* v8 ignore start -- @preserve: CLI arm, exercised by the gate rather than by a test */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = scan();

  if (found.length > 0) {
    for (const hit of found) {
      console.error(`  ${hit.file}:${hit.line}  ${hit.text.slice(0, 90)}`);
      console.error(
        `    counts \`${hit.receiver}\` with Object.keys and then asks a DIFFERENT question about it`,
      );
    }

    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(
        `::error::${found.length} site(s) count a record's keys with one predicate and test membership with another — see scripts/check-membership-predicate.mjs`,
      );
    }

    console.error(
      `\n✖ ${found.length} site(s) ask two different questions about one record's own keys.\n` +
        `  Decide membership from the list the count produced (#1815, #2064) — or, if the two\n` +
        `  questions differ on purpose here, add the site to ALLOWED with the reason.`,
    );
    process.exit(1);
  }

  console.error(
    "✓ no site counts a record's own keys with one predicate and tests membership with another",
  );
}
/* v8 ignore stop */
