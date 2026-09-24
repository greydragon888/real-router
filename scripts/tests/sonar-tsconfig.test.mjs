// `tsconfig.sonar.json` is the TypeScript program Sonar's JS/TS sensor builds.
// It is not compiled by anything, so nothing reds when it drifts from what
// `sonar.sources` analyses — the scan simply gets slower, or quietly stops
// serving type information for the files that fell out.
//
// Two ways it drifts, and this file refuses both:
//
//   1. a source directory appears that no `include` glob reaches. The analysed
//      set is derived from the filesystem (`check-coverage-scope.mjs`), so a new
//      package or a new `shared/` dir joins it without anyone editing a list.
//   2. a symlink alias under `packages/*/src` loses its `exclude` entry.
//      TypeScript keeps ONE path per real file and the alias wins, so including
//      the aliases drops the whole of `shared/` from the program — measured on
//      #2440, 0 of 32 real `shared/` paths with them, 32 of 32 without, and
//      Sonar then falls back to `merged compiler options` for those files.
//
// Runs in the repo-lints CI job via `node --test scripts/tests/*.test.mjs`.

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const CONFIG = "tsconfig.sonar.json";
const tsconfig = JSON.parse(read(CONFIG));
const properties = read("sonar-project.properties");

const isRealDir = (p) => existsSync(p) && lstatSync(p).isDirectory();

const packageNames = readdirSync(join(ROOT, "packages")).filter((n) =>
  isRealDir(join(ROOT, "packages", n, "src")),
);

/** `shared/<dir>` as `check-coverage-scope.mjs` derives it: real dirs only. */
const sharedDirs = readdirSync(join(ROOT, "shared")).filter(
  (n) =>
    !n.startsWith(".") &&
    n !== "node_modules" &&
    n !== "tests" &&
    n !== "coverage" &&
    isRealDir(join(ROOT, "shared", n)),
);

// Every `packages/*/src/<name>` that is a symlink into `shared/`.
const aliases = packageNames.flatMap((pkg) =>
  readdirSync(join(ROOT, "packages", pkg, "src"))
    .filter((n) =>
      lstatSync(join(ROOT, "packages", pkg, "src", n)).isSymbolicLink(),
    )
    .map((n) => ({ pkg, name: n })),
);

/** A tsconfig glob matches a directory when its literal prefix reaches it. */
const reaches = (glob, dir) => {
  const prefix = glob.slice(
    0,
    glob.indexOf("*") === -1 ? glob.length : glob.indexOf("*"),
  );
  const parts = prefix.split("/").filter(Boolean);
  const dirParts = dir.split("/");
  return parts.every((part, i) => part === "" || part === dirParts[i]);
};

test("the premise holds — the repository still has sources and aliases to guard", () => {
  assert.ok(
    packageNames.length > 10,
    "expected the package set to be non-trivial",
  );
  assert.ok(sharedDirs.length > 0, "expected at least one shared/ source dir");
  assert.ok(aliases.length > 0, "expected at least one symlink alias to guard");
  assert.ok(tsconfig.include?.length > 0, "expected include globs to read");
  assert.ok(tsconfig.exclude?.length > 0, "expected exclude globs to read");
});

test("sonar.typescript.tsconfigPath names this file, and it exists", () => {
  const line = properties
    .split("\n")
    .find((l) => l.startsWith("sonar.typescript.tsconfigPath="));
  assert.ok(line, "sonar-project.properties declares no tsconfigPath");
  const named = line.split("=")[1].trim();
  assert.equal(named, CONFIG);
  assert.ok(existsSync(join(ROOT, named)), `${named} does not exist`);
});

test("every analysed source directory is reached by an include glob", () => {
  const dirs = [
    ...packageNames.map((n) => `packages/${n}/src`),
    ...sharedDirs.map((n) => `shared/${n}`),
  ];
  const unreached = dirs.filter(
    (d) => !tsconfig.include.some((glob) => reaches(glob, d)),
  );
  assert.deepEqual(
    unreached,
    [],
    "these directories are analysed by Sonar but seed no file into its TypeScript program",
  );
});

test("every symlink alias is excluded, or shared/ falls out of the program", () => {
  const names = [...new Set(aliases.map((a) => a.name))].sort();
  const missing = names.filter(
    (n) => !tsconfig.exclude.includes(`packages/*/src/${n}/**`),
  );
  assert.deepEqual(
    missing,
    [],
    "an alias left in the program takes the real shared/ path's place (#2440)",
  );
});

test("the aliases are not ALSO reachable as their own include entry", () => {
  // Excluding them is pointless if something adds them back explicitly.
  const names = [...new Set(aliases.map((a) => a.name))];
  for (const glob of tsconfig.include) {
    for (const n of names) {
      assert.ok(
        !glob.includes(`/src/${n}/`),
        `include glob ${glob} re-adds the alias ${n} that exclude removes`,
      );
    }
  }
});

test("it extends the root config rather than restating compiler options", () => {
  assert.equal(tsconfig.extends, "./tsconfig.json");
  assert.equal(
    tsconfig.compilerOptions,
    undefined,
    "compiler options here would diverge from the repository's own silently",
  );
});
