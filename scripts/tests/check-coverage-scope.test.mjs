// `lint:coverage-scope` guards a real hole: `shared/` has no test node of its
// own, so each shared dir is measured by exactly ONE consumer package, and a
// dir that loses its owner is measured NOWHERE while every gate stays green
// (#809). This file guards the guard.
//
// ⚠ It exists because that check was VACUOUS for two of the three dirs (#1838).
// It asked `configText.includes("**/shared/<dir>/")` over the whole file, and
// every owner config spells that exact glob in a COMMENT — deliberately, because
// the comment explains that the literal form is grepped by the script. So the
// guard was reading the sentence that describes the include.
//
// Measured on `browser-plugin` before the fix: delete the real
// `coverage.include` entry, keep the comment, and `lint:coverage-scope` exits 0
// while the package's own coverage run goes from 16 files measured to 2, with
// zero `shared/*` rows. Positive control from the same run: remove the comments
// too and the script exits 1, so it was never an always-green script — it was
// testing prose.
//
// Runs in the repo-lints CI job via `node --test scripts/tests/*.test.mjs`.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  coverageArrayEntries,
  coverageIncludeEntries,
  declaresSharedOwner,
  stripComments,
} from "../coverage-owner.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** The three dirs and the package that measures each (#809 / #1086). */
const OWNERS = [
  ["browser-env", "packages/browser-plugin/vitest.config.mts"],
  ["dom-utils", "packages/react/vitest.config.mts"],
  ["ssr", "packages/ssr-data-plugin/vitest.config.mts"],
];

test("the real owner configs are recognised", () => {
  for (const [dir, cfg] of OWNERS) {
    assert.equal(
      declaresSharedOwner(read(cfg), dir),
      true,
      `${cfg} should be recognised as the owner of shared/${dir}`,
    );
  }
});

test("the premise holds — owners DO spell the glob in prose", () => {
  // If a config stops mentioning the glob in a comment, the vacuum cell below
  // stops discriminating, and it would stop SILENTLY. So the premise is pinned:
  // stripping comments must remove at least one mention for at least one owner.
  const withProse = OWNERS.filter(([dir, cfg]) => {
    const raw = read(cfg);
    const code = stripComments(raw);
    const count = (t) => t.split(`shared/${dir}`).length - 1;

    return count(raw) > count(code);
  });

  assert.ok(
    withProse.length >= 2,
    `expected at least two owner configs to mention their glob in prose, got ${withProse.length}`,
  );
});

test("a glob mentioned ONLY in a comment does not make an owner", () => {
  // The defect, as a fixture: the exact shape every owner config has, minus the
  // include entry.
  const commentOnly = `
    // The literal \`**/shared/dom-utils/**\` form is grepped by
    // scripts/check-coverage-scope.mjs to identify react as the dom-utils owner.
    config.test.coverage.allowExternal = true;
    config.test.coverage.include = ["packages/react/src/**/*.ts"];
  `;

  assert.equal(declaresSharedOwner(commentOnly, "dom-utils"), false);
  assert.deepEqual(coverageIncludeEntries(commentOnly), [
    "packages/react/src/**/*.ts",
  ]);
});

test("`allowExternal` in a comment alone does not make an owner either", () => {
  const commentedFlag = `
    // allowExternal is set by the base config
    config.test.coverage.include = ["**/shared/dom-utils/**/*.ts"];
  `;

  assert.equal(declaresSharedOwner(commentedFlag, "dom-utils"), false);
});

test("owner configs measure the SHARED barrel and still skip their own", () => {
  // #1838: the base config excludes `**/index.ts` — package barrels are pure
  // re-exports — and the owner configs replace `include` but INHERIT `exclude`,
  // so all three `shared/*/index.ts` were measured nowhere. Each owner now
  // narrows that one entry to `packages/**/index.ts`.
  //
  // ⚠ Pinned here because nothing else can red it. Measured: dropping the
  // narrowed entry leaves all 850 react tests green — the package's own barrel
  // is a pure re-export today, so the term is load-bearing but INERT against the
  // suite. Planting an uncovered function in `packages/react/src/index.ts`
  // separates the two: exit 0 with the entry, exit 1 without it.
  for (const [, cfg] of OWNERS) {
    const exclude = coverageArrayEntries(read(cfg), "exclude");

    assert.ok(
      exclude.includes("packages/**/index.ts"),
      `${cfg} must keep its OWN barrel excluded`,
    );
    assert.ok(
      !exclude.includes("**/index.ts"),
      `${cfg} must not re-exclude every index.ts — that is what hid the shared barrels`,
    );
  }
});

test("the parser reads the ARRAY, not the file", () => {
  // ⚠ The three cells below pin defensive terms that no other assertion reaches.
  // Mutation-checked: removing any of them left the rest of this file green.

  // (1) The glob in CODE but outside the include array. Without the slice bound
  // the scan returns literals from the whole file, which is a weaker rerun of
  // the very defect this module exists to fix — a mention, not an entry.
  const elsewhere = `
    const somewhereElse = ["**/shared/dom-utils/**/*.ts"];
    config.test.coverage.allowExternal = true;
    config.test.coverage.include = ["packages/react/src/**/*.ts"];
  `;

  assert.equal(declaresSharedOwner(elsewhere, "dom-utils"), false);

  // (2) No `coverage.include` at all. Without the `-1` guard the bracket search
  // starts at 0 and picks the first array in the file, whatever it is.
  const noInclude = `
    const unrelated = ["**/shared/dom-utils/**/*.ts"];
    config.test.coverage.allowExternal = true;
  `;

  assert.deepEqual(coverageArrayEntries(noInclude, "include"), []);
  assert.equal(declaresSharedOwner(noInclude, "dom-utils"), false);

  // (3) A shape the parser does not understand must yield nothing rather than
  // a partial list — a half-read array is worse than an unread one.
  const malformed = `config.test.coverage.include = buildIncludes();`;

  assert.deepEqual(coverageArrayEntries(malformed, "include"), []);
});

test("every shared owner passes its symlink alias to lint (#1913)", () => {
  // eslint's globs do not descend into a symlinked dir while walking a parent,
  // so `eslint src/` linted the owner's own files and none of the shared ones.
  // Measured before the fix: ssr-data-plugin reported 0 problems over 8 files;
  // rooted at the alias, 49 over 9.
  const sharedDirs = readdirSync(join(ROOT, "shared")).filter(
    (d) =>
      !d.startsWith(".") &&
      d !== "node_modules" &&
      d !== "tests" &&
      d !== "coverage" &&
      lstatSync(join(ROOT, "shared", d)).isDirectory(),
  );

  // Non-vacuity: an empty list would satisfy every assertion in the loop.
  assert.ok(sharedDirs.length >= 3, "expected at least three shared dirs");

  let checked = 0;

  for (const dir of sharedDirs) {
    for (const pkg of readdirSync(join(ROOT, "packages"))) {
      const cfg = join(ROOT, "packages", pkg, "vitest.config.mts");

      if (!existsSync(cfg)) {
        continue;
      }

      if (!declaresSharedOwner(readFileSync(cfg, "utf8"), dir)) {
        continue;
      }

      const srcDir = join(ROOT, "packages", pkg, "src");
      const alias = readdirSync(srcDir).find(
        (entry) =>
          lstatSync(join(srcDir, entry)).isSymbolicLink() &&
          join(srcDir, readlinkSync(join(srcDir, entry))) ===
            join(ROOT, "shared", dir),
      );

      assert.ok(alias, `no src/* symlink to shared/${dir} in ${pkg}`);

      const { scripts } = JSON.parse(
        readFileSync(join(ROOT, "packages", pkg, "package.json"), "utf8"),
      );

      for (const key of ["lint", "lint:fix"]) {
        assert.ok(
          scripts[key].includes(`src/${alias}/`),
          `${pkg} "${key}" does not pass src/${alias}/`,
        );
      }

      checked += 1;
    }
  }

  // The loop above is silent when no owner matches; this is what says it ran.
  assert.equal(checked, sharedDirs.length);
});

test("the alias is DERIVED from the symlink, not hardcoded", () => {
  // A hardcoded map would pass every cell above and stop being true the moment
  // an alias is renamed — the rename would silently un-lint the dir instead of
  // failing here.
  // ⚠ stripComments, not the raw text. Measured: with the raw file a hardcoded
  // alias map passes both regexes as long as ONE comment line still mentions
  // `readlinkSync(` — i.e. the cell would green-light exactly the thing it
  // exists to refuse. Same defect #1838 found in the coverage-owner predicate.
  const script = stripComments(read("scripts/check-coverage-scope.mjs"));

  assert.match(script, /readlinkSync\(/);
  // The derivation compares against shared/<dir>; a hardcoded map would not.
  assert.match(script, /join\(SHARED_DIR, dir\)/);
});

test("the CLI script delegates to this predicate", () => {
  // Wiring pin: without it the module can be correct while the script keeps its
  // own inline substring match, and every cell above stays green.
  const script = read("scripts/check-coverage-scope.mjs");

  assert.match(script, /from "\.\/coverage-owner\.mjs"/);
  assert.match(script, /declaresSharedOwner\(/);
});

// ── The script, run the way its callers run it (#2541) ──────────────────────
//
// The cells above hold the owner predicate and read the script's text; none of
// them runs it. `pnpm lint:coverage-scope` (both hooks, Repo Lints) and
// `--emit` (the Sonar scope in CI) run the FILE, so these cells do: the real
// script, with `cwd` at a fixture tree, because it takes its root from the
// working directory and `pnpm` hands it the repository root. Each drift cell
// plants ONE departure from a tree the script accepts and expects the one line
// that names it.
//
// ⚠ The fixture carries a public `svelte` package because the script's
// `SIZE_LIMIT_EXCEPTIONS` names it; renaming that exception reds the control.

const SCRIPT = join(ROOT, "scripts/check-coverage-scope.mjs");

/**
 * A tree the script accepts: `a` produces coverage; `b` (private) and `svelte`
 * have no tests and are excluded from Sonar coverage; `b` builds a second
 * entry, `./extra`, from `src/extra/`, as angular builds `./ssr` from
 * `src/ssr/`; `owner` measures `shared/dx` and lints it through the
 * `src/dx-alias` symlink.
 */
const acceptedTree = () => ({
  "packages/a/package.json": JSON.stringify({ name: "@fx/a" }),
  "packages/a/src/index.ts": "export const a = 1;\n",
  "packages/a/tests/a.test.ts": "\n",
  "packages/a/vitest.config.mts":
    "thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }\n",
  "packages/b/package.json": JSON.stringify({
    name: "@fx/b",
    private: true,
    exports: {
      ".": { "@real-router/internal-source": "./src/index.ts" },
      "./extra": { "@real-router/internal-source": "./src/extra/index.ts" },
    },
  }),
  "packages/b/src/index.ts": "export const b = 1;\n",
  "packages/b/src/extra/index.ts": "export const extra = 1;\n",
  "packages/svelte/package.json": JSON.stringify({ name: "@fx/svelte" }),
  "packages/svelte/src/index.ts": "export const svelte = 1;\n",
  "packages/owner/package.json": JSON.stringify({
    name: "@fx/owner",
    scripts: {
      lint: "eslint src/ src/dx-alias/",
      "lint:fix": "eslint --fix src/ src/dx-alias/",
    },
  }),
  "packages/owner/src/index.ts": "export const owner = 1;\n",
  "packages/owner/tests/owner.test.ts": "\n",
  "packages/owner/vitest.config.mts":
    "config.test.coverage.allowExternal = true;\n" +
    'config.test.coverage.include = ["src/**/*.ts", "../../shared/dx/**/*.ts"];\n',
  "shared/dx/index.ts": "export const dx = 1;\n",
  "codecov.yml": [
    "component_management:",
    "  individual_components:",
    "    - component_id: a",
    "      paths:",
    "        - packages/a/**",
    "    - component_id: owner",
    "      paths:",
    "        - packages/owner/**",
    "    - component_id: dx",
    "      paths:",
    "        - shared/dx/**",
    "",
  ].join("\n"),
  "sonar-project.properties":
    "sonar.coverage.exclusions=packages/b/src/**,packages/svelte/src/**\n",
  ".size-limit.js":
    'export default [esm("a", "1 kB"), esm("owner", "1 kB")];\n',
  "turbo.json": JSON.stringify({
    tasks: Object.fromEntries(
      ["bundle", "lint", "test", "type-check"].map((task) => [
        task,
        { inputs: ["src/**/*.ts"] },
      ]),
    ),
  }),
  "packages/owner/turbo.json": JSON.stringify({
    extends: ["//"],
    tasks: Object.fromEntries(
      ["bundle", "lint", "test", "type-check"].map((task) => [
        task,
        { inputs: ["$TURBO_EXTENDS$", "../../shared/dx/**/*.ts"] },
      ]),
    ),
  }),
});

const ALIAS_PATH = "packages/owner/src/dx-alias";
const ALIAS_TARGET = "../../../shared/dx";
const LCOV = "TN:\nend_of_record\n";

/**
 * Builds the accepted tree, lets `plant` depart from it, and runs the script
 * there. `alias` is the symlink's target, or `null` for no symlink; `links`
 * plants further symlinks as `[path, target]` pairs.
 */
function runScript({
  plant = () => {},
  alias = ALIAS_TARGET,
  links = [],
  args = [],
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "coverage-scope-"));

  try {
    const tree = acceptedTree();

    plant(tree);

    for (const [file, text] of Object.entries(tree)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }

    if (alias !== null) {
      symlinkSync(alias, join(root, ALIAS_PATH));
    }

    for (const [path, target] of links) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      symlinkSync(target, join(root, path));
    }

    const run = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
    });

    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The report's drift lines: `  - <what drifted>`. */
const driftLines = (stderr) =>
  stderr.split("\n").filter((line) => line.startsWith("  - "));

test("CONTROL — the script accepts the tree every drift cell departs from", () => {
  const run = runScript();

  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stderr,
    /✓ Coverage scope in sync: 2 components, 2 Sonar coverage-exclusions \(b, svelte\); 3 public packages size-tracked \(exceptions: svelte\); shared\/ consumers keyed on their dir: 1; code outside src\/: none \(4 packages, 1 src\/ links into shared\/\)\./,
  );
});

test("CONTROL — on the repository, check 6 walks every package and every src/ link", () => {
  // Check 6 passes by finding nothing when its walk stops reaching the tree,
  // and the fixture above cannot tell. The repository can: the counts the
  // script prints must be the ones the manifests and git's index give.
  const packages = readdirSync(join(ROOT, "packages")).filter((name) =>
    existsSync(join(ROOT, "packages", name, "package.json")),
  ).length;
  const links = spawnSync("git", ["ls-files", "-s", "--", "packages"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .stdout.split("\n")
    .filter(
      (line) => line.startsWith("120000 ") && line.includes("/src/"),
    ).length;
  const run = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
  });

  assert.ok(packages > 0 && links > 0, "nothing to compare the walk against");
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stderr,
    new RegExp(
      `code outside src/: none \\(${packages} packages, ${links} src/ links into shared/\\)\\.$`,
      "m",
    ),
  );
});

test("generated and dot-directories are not walked", () => {
  const run = runScript({
    plant: (tree) => {
      tree["packages/a/dist/index.js"] = "\n";
      tree["packages/a/coverage/lcov-report/prettify.js"] = "\n";
      tree["packages/a/node_modules/x/index.js"] = "\n";
      tree["packages/a/.turbo/cache.js"] = "\n";
    },
  });

  assert.equal(run.status, 0, run.stderr);
});

test("a package without src/ is walked without error", () => {
  const run = runScript({
    plant: (tree) => {
      tree["packages/c/package.json"] = JSON.stringify({
        name: "@fx/c",
        private: true,
      });
    },
  });

  assert.equal(run.status, 0, run.stderr);
});

test("package-root config files and scripts/ hold code legitimately", () => {
  const run = runScript({
    plant: (tree) => {
      for (const file of [
        "eslint.config.mjs",
        "rollup.config.mjs",
        "rollup.external.d.mts",
        "stryker.config.mjs",
        "svelte.config.js",
        "tsdown.config.mts",
        "vitest.config.properties.mts",
        "vitest.stryker.config.mts",
        "scripts/build.mjs",
      ]) {
        tree[`packages/a/${file}`] = "\n";
      }
    },
  });

  assert.equal(run.status, 0, run.stderr);
});

const withoutLine = (text, line) => {
  assert.ok(text.includes(line), `fixture has no line ${JSON.stringify(line)}`);

  return text.replace(line, "");
};

/** One planted departure per line the report can print. */
const DRIFTS = [
  {
    name: "a package with tests but no codecov component",
    plant: (tree) => {
      tree["codecov.yml"] = withoutLine(
        tree["codecov.yml"],
        "    - component_id: a\n      paths:\n        - packages/a/**\n",
      );
    },
    line: /codecov\.yml: package "a" has tests\/ \(produces coverage\) but has no entry/,
  },
  {
    name: "a codecov component nothing produces coverage for",
    plant: (tree) => {
      tree["codecov.yml"] +=
        "    - component_id: ghost\n      paths:\n        - packages/ghost/**\n";
    },
    line: /codecov\.yml: component "ghost" has no coverage-producing package/,
  },
  {
    name: "a package without tests missing from the Sonar coverage exclusions",
    plant: (tree) => {
      tree["sonar-project.properties"] =
        "sonar.coverage.exclusions=packages/svelte/src/**\n";
    },
    line: /"packages\/b\/src\/\*\*" missing from sonar\.coverage\.exclusions \(no tests\/ → no lcov\)/,
  },
  {
    name: "a package below 100 % thresholds missing from the Sonar coverage exclusions",
    plant: (tree) => {
      tree["packages/a/vitest.config.mts"] =
        "thresholds: { statements: 100, branches: 90, functions: 100, lines: 100 }\n";
    },
    line: /"packages\/a\/src\/\*\*" missing from sonar\.coverage\.exclusions \(phantom code \(lowered vitest threshold\)\)/,
  },
  {
    name: "a Sonar coverage exclusion of a package that measures clean",
    plant: (tree) => {
      tree["sonar-project.properties"] =
        "sonar.coverage.exclusions=packages/b/src/**,packages/svelte/src/**,packages/a/src/**\n";
    },
    line: /stale coverage exclusion "packages\/a\/src\/\*\*" — "a" has tests and 100% vitest thresholds/,
  },
  {
    name: "a Sonar coverage exclusion of shared sources",
    plant: (tree) => {
      tree["sonar-project.properties"] =
        "sonar.coverage.exclusions=packages/b/src/**,packages/svelte/src/**,shared/dx/**\n";
    },
    line: /stale coverage exclusion "shared\/dx\/\*\*" — shared sources are owner-measured/,
  },
  {
    // The #1838 shape through the CLI: the include glob survives only in a
    // comment, which is what the text match this script delegates away from
    // would have accepted.
    name: "an owner that names the shared dir only in a comment",
    plant: (tree) => {
      tree["packages/owner/vitest.config.mts"] =
        "config.test.coverage.allowExternal = true;\n" +
        '// "../../shared/dx/**/*.ts" is measured here\n' +
        'config.test.coverage.include = ["src/**/*.ts"];\n';
    },
    line: /shared\/dx: no measuring owner/,
  },
  {
    name: "a shared dir no codecov component path routes",
    plant: (tree) => {
      tree["codecov.yml"] = tree["codecov.yml"].replace(
        "        - shared/dx/**\n",
        "        - shared/other/**\n",
      );
    },
    line: /codecov\.yml: no component path "shared\/dx\/\*\*"/,
  },
  {
    // Without the symlink the owner links no shared dir, so its turbo.json goes
    // too: kept, its inputs are what check 5 reports as stale.
    name: "an owner with no src/* symlink",
    alias: null,
    plant: (tree) => {
      delete tree["packages/owner/turbo.json"];
    },
    line: /packages\/owner: measures shared\/dx for coverage but has no src\/\* symlink pointing at it/,
  },
  {
    name: "an owner whose src/* symlink points at another dir",
    alias: "../../../shared/other",
    plant: (tree) => {
      delete tree["packages/owner/turbo.json"];
    },
    line: /packages\/owner: measures shared\/dx for coverage but has no src\/\* symlink pointing at it/,
  },
  {
    name: "an owner whose lint script does not pass the alias",
    plant: (tree) => {
      const pkg = JSON.parse(tree["packages/owner/package.json"]);

      pkg.scripts.lint = "eslint src/";
      tree["packages/owner/package.json"] = JSON.stringify(pkg);
    },
    line: /packages\/owner: "lint" does not pass src\/dx-alias\//,
  },
  {
    name: "an owner whose lint:fix script does not pass the alias",
    plant: (tree) => {
      const pkg = JSON.parse(tree["packages/owner/package.json"]);

      pkg.scripts["lint:fix"] = "eslint --fix src/";
      tree["packages/owner/package.json"] = JSON.stringify(pkg);
    },
    line: /packages\/owner: "lint:fix" does not pass src\/dx-alias\//,
  },
  {
    name: "a package with tests but no vitest.config.mts",
    plant: (tree) => {
      delete tree["packages/a/vitest.config.mts"];
    },
    line: /packages\/a: has tests\/ but no vitest\.config\.mts/,
  },
  {
    name: "a public package with no bundle-size entry",
    plant: (tree) => {
      tree[".size-limit.js"] = 'export default [esm("owner", "1 kB")];\n';
    },
    line: /\.size-limit\.js: npm-public package "a" has no bundle-size entry/,
  },
  {
    name: "a size-limit exception that also has a size entry",
    plant: (tree) => {
      tree[".size-limit.js"] =
        'export default [esm("a", "1 kB"), esm("owner", "1 kB"), esm("svelte", "1 kB")];\n';
    },
    line: /\.size-limit\.js: "svelte" has a size entry yet is also in SIZE_LIMIT_EXCEPTIONS/,
  },
  {
    name: "a size-limit exception that is not a package",
    plant: (tree) => {
      delete tree["packages/svelte/package.json"];
      delete tree["packages/svelte/src/index.ts"];
      tree["sonar-project.properties"] =
        "sonar.coverage.exclusions=packages/b/src/**\n";
    },
    line: /SIZE_LIMIT_EXCEPTIONS lists "svelte" which is not a package/,
  },
  {
    name: "a shared consumer with no turbo.json",
    plant: (tree) => {
      delete tree["packages/owner/turbo.json"];
    },
    line: /packages\/owner: src\/ links shared\/dx but the package has no turbo\.json/,
  },
  {
    name: "a shared consumer whose task does not list the dir",
    plant: (tree) => {
      const turbo = JSON.parse(tree["packages/owner/turbo.json"]);

      turbo.tasks.lint.inputs = ["$TURBO_EXTENDS$"];
      tree["packages/owner/turbo.json"] = JSON.stringify(turbo);
    },
    line: /packages\/owner\/turbo\.json: task "lint" does not list \.\.\/\.\.\/shared\/dx\//,
  },
  {
    // `type-check:tests` is keyed only where the package has the script.
    name: "a shared consumer with a type-check:tests task that does not list the dir",
    plant: (tree) => {
      const pkg = JSON.parse(tree["packages/owner/package.json"]);

      pkg.scripts["type-check:tests"] = "tsc --noEmit";
      tree["packages/owner/package.json"] = JSON.stringify(pkg);
    },
    line: /packages\/owner\/turbo\.json: task "type-check:tests" does not list \.\.\/\.\.\/shared\/dx\//,
  },
  {
    name: "a package that lists a shared dir its src/ does not link",
    plant: (tree) => {
      tree["packages/a/turbo.json"] = JSON.stringify({
        extends: ["//"],
        tasks: {
          test: { inputs: ["$TURBO_EXTENDS$", "../../shared/dx/**/*.ts"] },
        },
      });
    },
    line: /packages\/a\/turbo\.json: task "test" lists \.\.\/\.\.\/shared\/dx\/\*\*\/\*\.ts, but src\/ links no shared\/dx/,
  },
  {
    name: "a root task that lists shared/ for every package",
    plant: (tree) => {
      const turbo = JSON.parse(tree["turbo.json"]);

      turbo.tasks.test.inputs.push("../../shared/**/*.ts");
      tree["turbo.json"] = JSON.stringify(turbo);
    },
    line: /turbo\.json: task "test" lists \.\.\/\.\.\/shared\/\*\*\/\*\.ts for every package/,
  },
  {
    // The #2627 shape: an entry point built from a directory beside `src/`.
    name: "an entry point built from outside src/",
    plant: (tree) => {
      const pkg = JSON.parse(tree["packages/b/package.json"]);

      pkg.exports["./extra"]["@real-router/internal-source"] = "./lib/index.ts";
      tree["packages/b/package.json"] = JSON.stringify(pkg);
    },
    line: /packages\/b\/package\.json: exports "\.\/extra" is built from \.\/lib\/index\.ts, outside src\//,
  },
  {
    // The condition can sit under another one; the walk still finds it.
    name: "an entry point built from outside src/, named by a nested condition",
    plant: (tree) => {
      const pkg = JSON.parse(tree["packages/b/package.json"]);

      pkg.exports["./extra"] = {
        import: {
          "@real-router/internal-source": "./lib/index.ts",
          default: "./dist/extra.js",
        },
      };
      tree["packages/b/package.json"] = JSON.stringify(pkg);
    },
    line: /packages\/b\/package\.json: exports "\.\/extra" is built from \.\/lib\/index\.ts, outside src\//,
  },
  {
    // Nested, as angular's `ssr/components/*` was: the walk must descend.
    name: "code in a directory that is not src/, tests/ or scripts/",
    plant: (tree) => {
      tree["packages/b/lib/deep/helper.ts"] = "export const helper = 1;\n";
    },
    line: /packages\/b\/lib\/deep\/helper\.ts: code outside src\/, tests\/ and scripts\//,
  },
  {
    name: "a Svelte component outside src/",
    plant: (tree) => {
      tree["packages/b/lib/Widget.svelte"] = "<p>widget</p>\n";
    },
    line: /packages\/b\/lib\/Widget\.svelte: code outside src\/, tests\/ and scripts\//,
  },
  {
    name: "a code file at the package root that is not a config file",
    plant: (tree) => {
      tree["packages/b/index.ts"] = "export const b = 1;\n";
    },
    line: /packages\/b\/index\.ts: code outside src\/, tests\/ and scripts\//,
  },
  {
    name: "a symlink under src/ that leads outside shared/",
    links: [["packages/b/src/sibling", "../../a/src"]],
    line: /packages\/b\/src\/sibling: a symlink under src\/ that leads to packages\/a\/src, not into shared\//,
  },
  {
    name: "a symlink under src/ that leads to shared/ itself",
    links: [["packages/b/src/everything", "../../../shared"]],
    line: /packages\/b\/src\/everything: a symlink under src\/ that leads to shared, not into shared\//,
  },
  {
    name: "a symlink at the package root",
    links: [["packages/b/vendor", "../a/src"]],
    line: /packages\/b\/vendor: a symlink outside src\//,
  },
  {
    name: "a size-limit exception that is private",
    plant: (tree) => {
      tree["packages/svelte/package.json"] = JSON.stringify({
        name: "@fx/svelte",
        private: true,
      });
    },
    line: /SIZE_LIMIT_EXCEPTIONS lists "svelte" which is private/,
  },
];

for (const drift of DRIFTS) {
  test(`drift: ${drift.name} — exit 1, and that one line names it`, () => {
    const run = runScript({
      plant: drift.plant,
      alias: drift.alias,
      links: drift.links,
    });

    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /✖ Coverage-scope drift detected/);
    assert.match(run.stderr, drift.line);
    // ONE departure, ONE line: a second would mean the plant drifted the tree
    // in a way the cell does not name.
    assert.equal(driftLines(run.stderr).length, 1, run.stderr);
    // `process.exitCode = 1` in place of `process.exit(1)` reports AND then
    // prints the success line.
    assert.doesNotMatch(run.stderr, /✓/);
  });
}

test("--emit refuses a run that found no coverage report, and emits nothing", () => {
  const run = runScript({ args: ["--emit"] });

  assert.equal(run.status, 1, run.stderr);
  assert.match(
    run.stderr,
    /✖ --emit: no coverage lcov\.info files found — coverage artifacts missing\?/,
  );
  // The step appends stdout to `$GITHUB_OUTPUT`: a refused run leaves it empty.
  assert.equal(run.stdout, "");
});

test("--emit prints the three lines CI reads into $GITHUB_OUTPUT", () => {
  const run = runScript({
    args: ["--emit"],
    plant: (tree) => {
      tree["packages/a/coverage/lcov.info"] = LCOV;
      tree["packages/owner/coverage/lcov.info"] = LCOV;
    },
  });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.trimEnd().split("\n"), [
    "sources=packages/a/src,packages/b/src,packages/owner/src,packages/svelte/src,shared/dx",
    "tests=packages/a/tests,packages/owner/tests",
    "reports=packages/a/coverage/lcov.info,packages/owner/coverage/lcov.info",
  ]);
});
