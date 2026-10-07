// code-roots-authority.test.mjs — every list that names the package src root
// repo-wide also names shared/ (#2627).
//
// Run:  node --test scripts/tests/code-roots-authority.test.mjs
//
// The code roots are `packages/<pkg>/src` and `shared/<dir>`, and check 6 of
// `scripts/check-coverage-scope.mjs` holds that there are no others. A glob,
// regex or path prefix that names the src root across packages — or the
// `packages/` root that holds it — does not reach `shared/`: the
// shared dirs enter a package's `src/` only through symlinks. Node's `globSync`,
// CodeQL's extractor and jscpd do not follow them, and `tsconfig.sonar.json`,
// whose tool does, excludes the aliases so each file is read once. So a file
// that names the src root repo-wide must name the shared root in CODE as well —
// a comment does not count — or carry a named exemption below that says why
// shared/ is not its business. A new list is held to this the day it lands.
//
// What counts as naming the root is the shapes in SRC_ROOT and SHARED_ROOT.
// Lists that name one package's `src/` (`src/**` in a turbo input, a vitest
// include) are out of scope: those reach shared/ through the per-consumer
// mechanisms checks 2b, 2c and 5 of `check-coverage-scope.mjs` hold.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The shapes a repo-wide src root, or the packages root above it, is written in. */
const SRC_ROOT = [
  /packages\/\*\/src\b/u,
  /\}\/\*\/src\b/u,
  /packages\\?\/\[\^\/\]\+\\?\/src/u,
  /packages\\?\/\.\*\\?\/src/u,
  /packages\/\(\$[A-Za-z_]+\)\/src/u,
  /\*\*\/src\/\*\*/u,
  /["']packages["'],\s*["']\*["'],\s*["']src["']/u,
  /startsWith\(\s*["'`]packages\/["'`]\s*\)/u,
  /\^packages\\?\/(?=["'`\s)\]|/]|$)/mu,
];

/** The shapes the shared root is written in. */
const SHARED_ROOT = [
  /\bshared\/(?:\*|\{|\[|[a-z-]+\/|(?=[\s"'`,\]]|$))/mu,
  /\bSHARED\b/u,
  /["'`]shared["'`]/u,
  /\bshared\\\//u,
];

/** Files whose list is not a code scope that must reach shared/. */
const EXEMPT = new Map([
  [
    "eslint.config.mjs",
    "its `**/src/**` blocks reach shared/ through the owners' `src/<alias>/` lint paths, which check 2c holds",
  ],
  [
    "packages/core/eslint.config.mjs",
    "layering rules inside core's own src/, which links no shared dir",
  ],
  [
    "packages/core/tests/functional/computed-key-write-authority-1852.test.ts",
    "leaves shared/ to the per-owner authority-1838 suites by design",
  ],
  ["scripts/add-package-paths.sh", "a manual codemod that enforces nothing"],
  [
    "scripts/git-diff-report.sh",
    "a manual diff report that no hook or workflow runs",
  ],
  [
    "scripts/refusal-census.mjs",
    "counts refusals in core and validation-plugin, neither of which links a shared dir",
  ],
  [
    "scripts/tests/workflow-path-filters.test.mjs",
    "holds a src glob as fixture data for its path-filter parser",
  ],
]);

const SCRIPT_KINDS = new Map([
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
]);

const printer = ts.createPrinter({ removeComments: true });

/**
 * The text of `file` without its comments. JS and TS go through the TypeScript
 * printer, which tells a regex literal ending in `\//` from a line comment;
 * YAML, shell and properties lose their `#` comments; JSON has none.
 *
 * @param {string} file
 * @param {string} text
 * @returns {string}
 */
export function codeOf(file, text) {
  const extension = /\.[^./]+$/u.exec(file)?.[0] ?? "";
  const kind = SCRIPT_KINDS.get(extension);

  if (kind !== undefined) {
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      false,
      kind,
    );

    return printer.printFile(source);
  }

  if (extension === ".json") return text;

  return text.replaceAll(/(^|\s)#.*$/gmu, "$1");
}

/** @param {string} code */
export const namesSrcRoot = (code) => SRC_ROOT.some((re) => re.test(code));

/** @param {string} code */
export const namesSharedRoot = (code) =>
  SHARED_ROOT.some((re) => re.test(code));

/**
 * The extensions of a file that could hold a list, in any case of letters: a
 * workflow is a list's file too, and T9 takes one named `.YML`.
 */
const LIST_FILE = /\.(?:[cm]?[jt]sx?|json|ya?ml|sh|properties|toml)$/iu;

/** Tracked files that could hold a list, with their text. */
function candidates() {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  return tracked
    .filter(
      (file) =>
        !/^(?:examples|cross-router-bench)\//u.test(file) &&
        !/(?:\.md|pnpm-lock\.yaml|-baseline\.json|claim-census-ledger\.json)$/u.test(
          file,
        ) &&
        (LIST_FILE.test(file) || /^\.husky\/[^_/][^/]*$/u.test(file)),
    )
    .filter((file) => !lstatSync(join(ROOT, file)).isSymbolicLink())
    .map((file) => [file, readFileSync(join(ROOT, file), "utf8")])
    .filter(([, text]) => namesSrcRoot(text));
}

const census = candidates()
  .map(([file, text]) => [file, codeOf(file, text)])
  .filter(([, code]) => namesSrcRoot(code));
const blind = census
  .filter(([, code]) => !namesSharedRoot(code))
  .map(([file]) => file);

test("every list that names the src root repo-wide names shared/ too", () => {
  const offenders = blind.filter((file) => !EXEMPT.has(file));

  assert.deepEqual(
    offenders,
    [],
    `these name the src root and not shared/ — add the shared root, or an exemption with its reason:\n${offenders.join("\n")}`,
  );
});

test("every exemption still names the src root without shared/", () => {
  const stale = [...EXEMPT.keys()].filter((file) => !blind.includes(file));

  assert.deepEqual(stale, [], `stale exemptions:\n${stale.join("\n")}`);
});

test("CONTROL — the census finds the lists known to name both roots", () => {
  const found = census.map(([file]) => file);

  for (const file of [
    ".github/codeql/codeql-config.yml",
    "scripts/check-semgrep.sh",
    "tsconfig.sonar.json",
    "packages/core/tests/functional/captured-intrinsics-authority-1971.test.ts",
    "scripts/raiser-text-equality.mjs",
  ]) {
    assert.ok(found.includes(file), `the census does not reach ${file}`);
  }
});

test("the census reads a file by its extension in any case of letters", () => {
  for (const file of [
    ".github/workflows/zz.YML",
    ".github/workflows/zz.Yaml",
    "scripts/x.mjs",
  ]) {
    assert.ok(LIST_FILE.test(file), file);
  }
  assert.ok(!LIST_FILE.test("docs/x.txt"), "an extension outside the list");
});

test("fixture: a src glob without shared/ is blind, with shared/ it is not", () => {
  const blindGlob = codeOf("x.mjs", 'globSync("packages/*/src/**/*.ts");\n');
  const both = codeOf(
    "x.mjs",
    'globSync("packages/*/src/**/*.ts"); globSync("shared/*/**/*.ts");\n',
  );

  assert.equal(namesSrcRoot(blindGlob), true);
  assert.equal(namesSharedRoot(blindGlob), false);
  assert.equal(namesSharedRoot(both), true);
});

test("fixture: a root named only in a comment does not count", () => {
  const commentedSrc = codeOf("x.ts", '// scans "packages/*/src/**"\nf();\n');
  const commentedShared = codeOf(
    "x.ts",
    'g("packages/*/src/**"); // and shared/**\n',
  );

  assert.equal(namesSrcRoot(commentedSrc), false);
  assert.equal(namesSharedRoot(commentedShared), false);
});

test("fixture: a regex literal ending in \\// keeps the rest of its line", () => {
  // dangerfile.ts writes both roots on one line, the first regex ending in
  // `\//` — a line-comment stripper would drop the shared one.
  const code = codeOf(
    "x.ts",
    "const P = [/^packages\\/.*\\/src\\//, /^shared\\/[^/]+\\//];\n",
  );

  assert.equal(namesSrcRoot(code), true);
  assert.equal(namesSharedRoot(code), true);
});

test("fixture: the template, join and shell spellings are read", () => {
  assert.equal(
    namesSrcRoot(codeOf("x.ts", "globSync(`${PACKAGES}/*/src/**/*.ts`);\n")),
    true,
  );
  assert.equal(
    namesSrcRoot(codeOf("x.mjs", 'join(ROOT, "packages", "*", "src");\n')),
    true,
  );
  assert.equal(
    namesSrcRoot(codeOf("x.sh", 'grep -E "^packages/($PUBLIC)/src/"\n')),
    true,
  );
  assert.equal(
    namesSrcRoot(codeOf("x.yml", '# was "packages/*/src/**"\nkey: 1\n')),
    false,
  );
});

test("fixture: a prefix filter on the packages root is read", () => {
  assert.equal(
    namesSrcRoot(
      codeOf("x.mjs", 'files.filter((f) => f.startsWith("packages/"));\n'),
    ),
    true,
  );
  assert.equal(
    namesSrcRoot(codeOf("x.sh", 'git ls-files | grep "^packages/"\n')),
    true,
  );
  assert.equal(
    namesSrcRoot(codeOf("x.sh", "awk '$1 ~ /^packages\\// { print }'\n")),
    true,
  );
  // One package's directory is out of scope, like one package's `src/`.
  assert.equal(
    namesSrcRoot(codeOf("x.mjs", 'f.startsWith("packages/core/");\n')),
    false,
  );
});
