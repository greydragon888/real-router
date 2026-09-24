// The CodSpeed gate must say RUN exactly when the measured program changes.
//
// `scripts/codspeed-gate.mjs` decides whether `codspeed.yml` occupies the
// self-hosted runner. A wrong "skip" hands its shift to the next comparison,
// where it reads as that run's change; a wrong "run" spends a slot. So every
// case below is asserted in the direction that would be wrong, over a small
// repository built for it.
//
// ⚠ The last group reads THIS repository's own lockfile and harness. The
// closure is the part of the gate most able to be vacuous in both directions —
// empty, it skips every dependency bump; unbounded, it runs on all of them —
// so it is pinned against the tree it has to work on, not only a fixture. A
// red there after a real dependency change means re-reading the pin, not
// weakening it.
//
// Runs in the repo-lints CI job via `node --test scripts/tests/*.test.mjs`.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  SUITE_DIRS,
  closure,
  gate,
  importedPackages,
  loadEsbuild,
  manifestChanged,
  packageOf,
  parseLockfile,
  runtimeVersions,
  sameProgram,
} from "../codspeed-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts/codspeed-gate.mjs");
const esbuild = loadEsbuild(ROOT);

function lockfile({ scheduler = "0.28.0", wouter = "3.11.0" } = {}) {
  return `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      tinybench:
        specifier: 6.2.0
        version: 6.2.0

  benchmarks:
    dependencies:
      '@real-router/core':
        specifier: workspace:^
        version: link:../packages/core
      react-dom:
        specifier: ~19.3.0
        version: 19.3.0(react@19.3.0)
      wouter:
        specifier: ${wouter}
        version: ${wouter}

  packages/core: {}

packages:

  react@19.3.0:
    resolution: {integrity: sha512-x}

snapshots:

  react-dom@19.3.0(react@19.3.0):
    dependencies:
      react: 19.3.0
      scheduler: ${scheduler}

  react@19.3.0: {}

  scheduler@${scheduler}: {}

  tinybench@6.2.0: {}

  wouter@${wouter}: {}
`;
}

const CORE_SOURCE = `/** The answer. */
export const answer: number = 42;

export class Box {
  /** Holds it. */
  #value = answer;

  /** Reads it. */
  get value(): number {
    return this.#value;
  }
}
`;

const BASE_FILES = {
  "packages/core/package.json": JSON.stringify({
    name: "@real-router/core",
    version: "1.0.0",
    exports: { ".": "./src/index.ts" },
  }),
  "packages/core/src/index.ts": CORE_SOURCE,
  "packages/core/tests/unit.test.ts": 'it("reads", () => {});\n',
  "packages/core/tests/benchmarks/fixtures.ts":
    'import { Bench } from "tinybench";\n',
  "packages/other/package.json": JSON.stringify({
    name: "@real-router/other",
    version: "1.0.0",
  }),
  "packages/other/src/index.ts": "export const other = 1;\n",
  "benchmarks/package.json": JSON.stringify({
    name: "router-benchmarks",
    dependencies: {
      "@real-router/core": "workspace:^",
      "react-dom": "~19.3.0",
      wouter: "3.11.0",
    },
    scripts: { "prebuild:adapter": "vite build" },
  }),
  "benchmarks/adapter-bench/app.ts":
    'import { createRoot } from "react-dom/client";\n',
  "benchmarks/cross-router/wouter.ts": 'import { Router } from "wouter";\n',
  "pnpm-lock.yaml": lockfile(),
};

function write(dir, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = join(dir, file);

    if (content === null) {
      rmSync(target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
}

/** Builds a repository from BASE_FILES, applies `changes` as a second commit. */
function withRepository(changes, use) {
  const dir = mkdtempSync(join(tmpdir(), "codspeed-gate-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    git("init", "-q");
    git("config", "user.email", "gate@example.invalid");
    git("config", "user.name", "gate");
    git("config", "commit.gpgsign", "false");
    write(dir, BASE_FILES);
    git("add", "-A");
    git("commit", "-q", "-m", "base");

    const base = git("rev-parse", "HEAD").trim();

    write(dir, changes);
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", "head");

    return use({ dir, base });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verdict(changes) {
  return withRepository(changes, ({ dir, base }) =>
    gate({ root: dir, base, head: "HEAD", esbuild }),
  );
}

test("a docblock edit is not a change to the measured program", () => {
  const result = verdict({
    "packages/core/src/index.ts": CORE_SOURCE.replace(
      "/** Reads it. */",
      "/**\n   * Reads it, and says so at length.\n   */",
    ),
  });

  assert.equal(result.run, false, result.reasons.join("; "));
});

test("a type annotation is not a change to the measured program", () => {
  const result = verdict({
    "packages/core/src/index.ts": CORE_SOURCE.replace(": number = 42", " = 42"),
  });

  assert.equal(result.run, false, result.reasons.join("; "));
});

test("a code edit in a measured package is", () => {
  const result = verdict({
    "packages/core/src/index.ts": CORE_SOURCE.replace("= 42", "= 43"),
  });

  assert.equal(result.run, true);
  assert.match(
    result.reasons.join("; "),
    /emitted code changed: packages\/core\/src\/index\.ts/,
  );
});

test("a new source file in a measured package is", () => {
  const result = verdict({
    "packages/core/src/extra.ts": "export const extra = 1;\n",
  });

  assert.equal(result.run, true);
});

test("tests of a measured package are not measured", () => {
  const result = verdict({
    "packages/core/tests/unit.test.ts": 'it("reads twice", () => {});\n',
  });

  assert.equal(result.run, false, result.reasons.join("; "));
});

test("a document inside a measured src is not measured", () => {
  const result = verdict({
    "packages/core/src/ARCHITECTURE.md": "# Architecture\n",
  });

  assert.equal(result.run, false, result.reasons.join("; "));
});

test("a package the suites never load is not measured", () => {
  const result = verdict({
    "packages/other/src/index.ts": "export const other = 2;\n",
  });

  assert.equal(result.run, false, result.reasons.join("; "));
});

test("the harness always is", () => {
  const result = verdict({
    "packages/core/tests/benchmarks/fixtures.ts":
      'import { Bench } from "tinybench";\nexport const k = 2;\n',
  });

  assert.equal(result.run, true);
  assert.match(result.reasons.join("; "), /harness: /);
});

test("a moved transitive dependency of a harness import is", () => {
  const result = verdict({
    "pnpm-lock.yaml": lockfile({ scheduler: "0.29.0" }),
  });

  assert.equal(result.run, true);
  assert.match(result.reasons.join("; "), /\+scheduler@0\.29\.0/);
});

test("a dependency only the cross-router bench imports is not", () => {
  const result = verdict({
    "benchmarks/package.json": BASE_FILES["benchmarks/package.json"].replace(
      '"wouter":"3.11.0"',
      '"wouter":"3.12.0"',
    ),
    "pnpm-lock.yaml": lockfile({ wouter: "3.12.0" }),
  });

  assert.equal(result.run, false, result.reasons.join("; "));
});

test("a release version bump is not; an exports change is", () => {
  const bump = verdict({
    "packages/core/package.json": BASE_FILES[
      "packages/core/package.json"
    ].replace('"1.0.0"', '"1.0.1"'),
  });
  const exportsMoved = verdict({
    "packages/core/package.json": BASE_FILES[
      "packages/core/package.json"
    ].replace("./src/index.ts", "./src/main.ts"),
  });

  assert.equal(bump.run, false, bump.reasons.join("; "));
  assert.equal(exportsMoved.run, true);
});

test("no base measures, and the CLI fails open on a base it cannot read", () => {
  assert.equal(gate({ base: "", head: "HEAD" }).run, true);

  withRepository({}, ({ dir }) => {
    const output = execFileSync(
      process.execPath,
      [SCRIPT, "--root", dir, "--base", "0000000", "--head", "HEAD"],
      { encoding: "utf8" },
    );

    assert.match(output, /CodSpeed: RUN/);
    assert.match(output, /failed open/);
  });
});

test("packageOf and importedPackages read bare specifiers only", () => {
  assert.equal(packageOf("react-dom/client"), "react-dom");
  assert.equal(packageOf("@angular/core/testing"), "@angular/core");
  assert.equal(packageOf("node:fs"), undefined);

  assert.deepEqual(
    [
      ...importedPackages([
        'import { x } from "vite";\nimport "jsdom";\nconst z = await import("zod");',
        'import { y } from "./local";\nimport { core } from "@real-router/core";',
        'export { w } from "@scope/pkg/deep";\nconst t = require("tinybench");',
      ]),
    ].toSorted(),
    ["@scope/pkg", "jsdom", "tinybench", "vite", "zod"],
  );
});

test("runtimeVersions drops peer suffixes and type-only packages", () => {
  assert.deepEqual(
    [
      ...runtimeVersions([
        "vite@8.2.2(@types/node@24.13.4)(esbuild@0.28.2)",
        "@angular/build@22.1.8(aeefea8c7dcb3dba10d86118054df06a)",
        "@types/node@24.13.4",
        "react@19.3.0",
      ]),
    ].toSorted(),
    ["@angular/build@22.1.8", "react@19.3.0", "vite@8.2.2"],
  );
});

test("manifestChanged ignores what the lockfile answers", () => {
  const base = { name: "a", version: "1.0.0", dependencies: { b: "1" } };

  assert.equal(
    manifestChanged(
      JSON.stringify(base),
      JSON.stringify({ ...base, version: "2.0.0", dependencies: { b: "2" } }),
    ),
    false,
  );
  assert.equal(
    manifestChanged(
      JSON.stringify(base),
      JSON.stringify({ ...base, sideEffects: false }),
    ),
    true,
  );
});

test("sameProgram: a docblock above a private method does not count", () => {
  // The shape of `ed3e8947d`: a plain transform keeps this block.
  const before = "export class A {\n  #go(x) {\n    return x;\n  }\n}\n";
  const after =
    "export class A {\n  /**\n   * Goes.\n   */\n  #go(x) {\n    return x;\n  }\n}\n";

  assert.equal(sameProgram(before, after, "ts", esbuild), true);
  assert.equal(
    sameProgram(
      before,
      after.replace("return x", "return x + 1"),
      "ts",
      esbuild,
    ),
    false,
  );
  assert.equal(sameProgram(undefined, after, "ts", esbuild), false);
});

test("over this repository, the closure reaches what the suites run and stops at the cross-router bench", () => {
  const files = execFileSync("git", ["ls-files", "--", ...SUITE_DIRS], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => /\.(?:[cm]?[jt]sx?|svelte|vue)$/.test(file));
  const roots = importedPackages(
    files.map((file) => readFileSync(join(ROOT, file), "utf8")),
  );

  roots.add("tsx");

  const names = new Set(
    [
      ...runtimeVersions(
        closure(
          parseLockfile(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8")),
          roots,
        ),
      ),
    ].map((key) => key.slice(0, key.lastIndexOf("@"))),
  );

  for (const reached of [
    "react",
    "react-dom",
    "scheduler",
    "vue",
    "svelte",
    "solid-js",
    "preact",
    "@angular/core",
    "vite",
    "esbuild",
    "jsdom",
    "zod",
    "tinybench",
    "@codspeed/tinybench-plugin",
  ]) {
    assert.ok(names.has(reached), `expected the closure to reach ${reached}`);
  }

  for (const absent of [
    "wouter",
    "vue-router",
    "sv-router",
    "playwright",
    "@types/node",
  ]) {
    assert.ok(
      !names.has(absent),
      `expected the closure to stop before ${absent}`,
    );
  }
});
