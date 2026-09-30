// check-semgrep.test.mjs — `lint:security` scans its own checkout from any
// directory, with our rules and the registry's in two scans of their own
// strictness, and a rule set or target that is not there is refused rather
// than reported as a tool error. A delta that changes nothing the scans read
// gets no scan.
//
// Run:  node --test scripts/tests/check-semgrep.test.mjs
//
// Why (#2544): `--config .semgrep/` and the targets `packages shared` were
// relative to the working directory. Run from `packages/`, semgrep exited 7
// for the missing config, and the `exit >= 2` arm (tool and network errors
// only warn in a hook, by design) passed a planted finding the root run
// blocked. The same arm passed a checkout whose `.semgrep/` was gone.
//
// semgrep and uvx are STUBBED, and faithful where it matters. The `semgrep`
// stub appends each call — its directory and argv — to `$STUB_LOG`, answers
// `--version` with `$STUB_VERSION`, answers the count of rules (`--json`) with
// `$STUB_RULES` rules, exits 7 for a local `--config` that does not exist and 2
// for a target that does not, like the real one, and otherwise exits with the
// code set for its rule set. The `uvx` stub records its own arguments, exits
// with `$UVX_EXIT` when set — a package it cannot get — and runs the `semgrep`
// stub with the rest.
//
// ⚠ The harness drops VERIFY_STAGE, GITHUB_ACTIONS, SEMGREP_VERSION and
// SEMGREP_EXCLUDE_NEWER from what it inherits, as it drops GIT_*, and every
// cell names its stage: in CI this suite runs inside `verify --stage ci`, and
// inherited, those would send every cell down the strict path to a real uvx.
// PATH loses each directory that holds a real uvx or semgrep for the same
// reason.
//
// Stdlib node:test/node:assert only (Node 24) — the repo-lints and pre-push
// `node --test scripts/tests/*.test.mjs` steps pick this file up by glob.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = join(repoRoot, "scripts", "check-semgrep.sh");

const DROPPED = new Set([
  "VERIFY_STAGE",
  "GITHUB_ACTIONS",
  "SEMGREP_VERSION",
  "SEMGREP_EXCLUDE_NEWER",
]);

/** PATH without the directories that hold a real uvx or semgrep. */
const PATH = (process.env.PATH ?? "")
  .split(delimiter)
  .filter(
    (dir) =>
      dir && !existsSync(join(dir, "uvx")) && !existsSync(join(dir, "semgrep")),
  )
  .join(delimiter);

/**
 * Hermetic: none of the caller's GIT_* variables and no global/system git
 * config — this suite runs inside pre-push, and a push from a linked worktree
 * exports GIT_DIR to it — and none of the variables that pick semgrep's stage
 * and version.
 */
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_") && !DROPPED.has(key),
    ),
  ),
  PATH,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    env: ENV,
    encoding: "utf8",
  }).trim();

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * A git checkout holding a byte copy of the script, a rule set and both
 * targets. `origin/master` sits one commit behind HEAD, whose commit writes
 * `delta` — by default a file the scans read; `delta: false` puts it at HEAD.
 *
 * @returns {{ root: string, base: string }} the physical root, and the commit
 *   the scan must take as its baseline.
 */
function fixture({ delta = "packages/core/src/a.ts" } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "semgrep-")));
  fixtures.push(root);
  const files = {
    "scripts/check-semgrep.sh": null,
    ".semgrep/rules.yml": "rules: []\n",
    "packages/core/src/a.ts": "export const a = 1;\n",
    "shared/dom-utils/b.ts": "export const b = 2;\n",
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    if (text === null) copyFileSync(SCRIPT, join(root, file));
    else writeFileSync(join(root, file), text);
  }
  git(root, "init", "-q", "-b", "main", ".");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  if (delta) {
    mkdirSync(dirname(join(root, delta)), { recursive: true });
    writeFileSync(join(root, delta), "export const a = 3;\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "branch");
  }
  git(root, "update-ref", "refs/remotes/origin/master", base);
  return { root, base };
}

/**
 * The stubs, each in a directory of its own, so a cell puts on PATH exactly
 * the ones it means. Written once: macOS scans each new executable on its first
 * run, at about 150 ms a time.
 */
const SEMGREP_BIN = mkdtempSync(join(tmpdir(), "semgrep-stub-"));
const UVX_BIN = mkdtempSync(join(tmpdir(), "uvx-stub-"));
fixtures.push(SEMGREP_BIN, UVX_BIN);

writeFileSync(
  join(SEMGREP_BIN, "semgrep"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const env = process.env;
fs.appendFileSync(env.STUB_LOG, JSON.stringify({ via: env.STUB_VIA ?? "semgrep", cwd: process.cwd(), args }) + "\\n");
if (args[0] === "--version") {
  console.log(env.STUB_VERSION ?? "1.178.0");
  process.exit(0);
}
if (args.includes("--json")) {
  const rules = Array.from({ length: Number(env.STUB_RULES ?? "3") }, (_, i) => ({ id: "rule-" + i }));
  console.log(JSON.stringify({ time: { rules } }));
  process.exit(0);
}
let config;
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--config") {
    config = args[++i];
    if (!config.startsWith("p/") && !fs.existsSync(config)) process.exit(7);
  } else if (arg === "--include" || arg === "--baseline-commit") {
    i++;
  } else if (!arg.startsWith("-") && !fs.existsSync(arg)) {
    process.exit(2);
  }
}
const code = config?.startsWith("p/") ? env.STUB_EXIT_REGISTRY : env.STUB_EXIT_OURS;
process.exit(Number(code ?? "0"));
`,
);
writeFileSync(
  join(UVX_BIN, "uvx"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const args = process.argv.slice(2);
const at = args.findIndex((arg) => arg === "semgrep" || arg.startsWith("semgrep=="));
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ via: "uvx-args", args: args.slice(0, at + 1) }) + "\\n");
if (process.env.UVX_EXIT) process.exit(Number(process.env.UVX_EXIT));
const run = spawnSync(${JSON.stringify(join(SEMGREP_BIN, "semgrep"))}, args.slice(at + 1), {
  stdio: "inherit",
  env: { ...process.env, STUB_VIA: "uvx" },
});
process.exit(run.status ?? 1);
`,
);
chmodSync(join(SEMGREP_BIN, "semgrep"), 0o755);
chmodSync(join(UVX_BIN, "uvx"), 0o755);

/** The pins CI sets, for the cells of the ci stage. */
const PINS = {
  SEMGREP_VERSION: "1.178.0",
  SEMGREP_EXCLUDE_NEWER: "2026-09-23T21:14:00Z",
};

/**
 * Runs the copy by a path relative to `cwd`, as a direct call types it.
 *
 * @param {string} root
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {Record<string, string>} [options.env] set on top of the hermetic env
 * @param {string[]} [options.bins] stub directories put first on PATH
 */
function run(root, { cwd = root, env = {}, bins = [SEMGREP_BIN] } = {}) {
  const log = join(root, ".stub-log");
  rmSync(log, { force: true });
  const script = relative(cwd, join(root, "scripts", "check-semgrep.sh"));
  const result = spawnSync("bash", [script], {
    cwd,
    encoding: "utf8",
    env: {
      ...ENV,
      PATH: [...bins, PATH].join(delimiter),
      STUB_LOG: log,
      ...env,
    },
  });
  const calls = existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
    scans: calls.filter(
      ({ via, args }) => via !== "uvx-args" && args[0] === "scan" && !args.includes("--json"),
    ),
  };
}

/** The value that follows `flag` in `argv`, for each time it appears. */
const valuesOf = (argv, flag) =>
  argv.flatMap((arg, i) => (argv[i - 1] === flag ? [arg] : []));

const HOOK = { VERIFY_STAGE: "pre-push" };
const CI = { VERIFY_STAGE: "ci", ...PINS };

// ── A hook ───────────────────────────────────────────────────────────────────

test("control: in a hook, semgrep scans both targets, our rules then the registry's", () => {
  const { root, base } = fixture();
  const { status, output, calls, scans } = run(root, { env: HOOK });

  assert.equal(status, 0, output);
  assert.deepEqual(calls[0].args, ["--version"], "semgrep is asked before any scan");
  assert.ok(
    calls.some(({ args }) => args.includes("--json") && valuesOf(args, "--config")[0] === ".semgrep/"),
    "the rules are counted",
  );
  assert.deepEqual(
    scans.map(({ args }) => valuesOf(args, "--config")),
    [[".semgrep/"], ["p/javascript"]],
  );
  for (const { cwd, args } of scans) {
    assert.equal(cwd, root, "semgrep must run at the root");
    assert.deepEqual(valuesOf(args, "--include"), ["**/src/**", "shared/**"]);
    assert.deepEqual(valuesOf(args, "--baseline-commit"), [base]);
    assert.deepEqual(args.slice(-2), ["packages", "shared"]);
  }
  // A clean scan says so, and names the baseline it was scoped to.
  const clean =
    /✓ semgrep: no newly-introduced findings against ([0-9a-f]+)/.exec(output);
  assert.ok(clean, output);
  assert.ok(base.startsWith(clean[1]), `${clean[1]} is not ${base}`);
});

test("a finding blocks, in either rule set, from any directory", () => {
  const { root } = fixture();
  for (const exits of [{ STUB_EXIT_OURS: "1" }, { STUB_EXIT_REGISTRY: "1" }]) {
    for (const cwd of ["", "packages", "packages/core/src", "shared"]) {
      const where = `${Object.keys(exits)[0]} from ${cwd || "the root"}`;
      const { status, output, scans } = run(root, {
        cwd: join(root, cwd),
        env: { ...HOOK, ...exits },
      });

      assert.equal(status, 1, `${where}: ${output}`);
      assert.match(output, /Semgrep found newly-introduced issue/, where);
      assert.doesNotMatch(output, /✓ semgrep/, where);
      assert.ok(scans.every(({ cwd: ran }) => ran === root), `${where}: semgrep must run at the root`);
    }
  }
});

test("refuses a checkout without .semgrep/, before semgrep runs", () => {
  const { root } = fixture();
  rmSync(join(root, ".semgrep"), { recursive: true });
  const { status, output, calls } = run(root, { env: HOOK });

  assert.equal(status, 1, output);
  assert.match(output, /no \.semgrep\/ in the repository/);
  assert.deepEqual(calls, [], "semgrep must not run without its rules");
});

test("refuses a checkout without a target, before semgrep runs", () => {
  for (const target of ["packages", "shared"]) {
    const { root } = fixture();
    rmSync(join(root, target), { recursive: true });
    const { status, output, calls } = run(root, { env: HOOK });

    assert.equal(status, 1, `without ${target}/: ${output}`);
    assert.match(output, new RegExp(`no ${target}/ in the repository`));
    assert.deepEqual(calls, [], `without ${target}/: semgrep must not run`);
  }
});

test("refuses a .semgrep/ that loads no rule, in either stage, coloured or not", () => {
  const { root } = fixture();
  // `node --test` sets FORCE_COLOR=1 for its children under a terminal, and
  // node then colours a number it prints: both values, whatever the runner has.
  for (const colour of ["0", "1"]) {
    for (const env of [HOOK, CI]) {
      const arm = `${env.VERIFY_STAGE}, FORCE_COLOR=${colour}`;
      const { status, output, scans } = run(root, {
        env: { ...env, FORCE_COLOR: colour, STUB_RULES: "0" },
        bins: [SEMGREP_BIN, UVX_BIN],
      });

      assert.equal(status, 1, `${arm}: ${output}`);
      assert.match(output, /\.semgrep\/ loads no rule/);
      assert.deepEqual(scans, [], `${arm}: no scan with an empty set`);
    }
  }
});

test("in a hook an error of either scan only warns, and is not a clean scan", () => {
  const { root } = fixture();
  for (const exits of [{ STUB_EXIT_OURS: "2" }, { STUB_EXIT_REGISTRY: "2" }]) {
    const { status, output, scans } = run(root, { env: { ...HOOK, ...exits } });

    assert.equal(status, 0, output);
    assert.match(output, /semgrep (errored on our rules|p\/javascript errored) \(exit 2/);
    assert.doesNotMatch(output, /✓ semgrep/);
    assert.equal(scans.length, 2, "the other scan still runs");
  }
});

test("control: with no branch delta nothing is asked of semgrep, in either stage", () => {
  const { root } = fixture({ delta: false });
  for (const env of [HOOK, CI]) {
    const { status, output, calls } = run(root, {
      cwd: join(root, "packages"),
      env,
      bins: [SEMGREP_BIN, UVX_BIN],
    });

    assert.equal(status, 0, output);
    assert.match(output, /No branch delta against origin\/master/);
    assert.doesNotMatch(output, /✓ semgrep/);
    assert.deepEqual(calls, [], `${env.VERIFY_STAGE}: not even --version`);
  }
});

test("a delta that changes no file the scans read gets no scan, after the version and the rules", () => {
  for (const delta of [
    "README.md",
    "packages/core/package.json",
    "packages/core/tests/a.test.ts",
    "scripts/build.mjs",
  ]) {
    const { root, base } = fixture({ delta });
    for (const env of [HOOK, CI]) {
      const arm = `${delta}, ${env.VERIFY_STAGE}`;
      const { status, output, calls, scans } = run(root, {
        env,
        bins: [SEMGREP_BIN, UVX_BIN],
      });

      assert.equal(status, 0, `${arm}: ${output}`);
      assert.deepEqual(scans, [], `${arm}: no scan`);
      assert.ok(calls.some(({ args }) => args[0] === "--version"), `${arm}: the version is checked`);
      assert.ok(calls.some(({ args }) => args.includes("--json")), `${arm}: the rules are counted`);
      const skipped = /✓ semgrep: no file it scans changed against ([0-9a-f]+)/.exec(output);
      assert.ok(skipped && base.startsWith(skipped[1]), `${arm}: ${output}`);
    }
  }
});

test("a delta that changes a file the scans read, or a rule, gets both scans", () => {
  for (const delta of [
    "packages/core/src/deep/b.ts",
    "packages/core/tests/fixtures/src/c.ts",
    "shared/new-area/c.ts",
    ".semgrep/more.yml",
  ]) {
    const { root } = fixture({ delta });
    const { status, output, scans } = run(root, { env: HOOK });

    assert.equal(status, 0, `${delta}: ${output}`);
    assert.equal(scans.length, 2, `${delta}: ${output}`);
    assert.match(output, /✓ semgrep: no newly-introduced findings/, delta);
  }
});

test("a hook without a semgrep binary runs uvx at the version ci.yml pins", () => {
  const floor = /^SEMGREP_FLOOR="([^"]+)"$/m.exec(readFileSync(SCRIPT, "utf8"))?.[1];
  const pinned = /^\s*SEMGREP_VERSION: "([^"]+)"$/m.exec(
    readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8"),
  )?.[1];
  assert.ok(floor, "SEMGREP_FLOOR is in the script");
  assert.equal(floor, pinned, "the floor is the version CI pins");

  const { root } = fixture();
  const { status, output, calls } = run(root, { env: HOOK, bins: [UVX_BIN] });

  assert.equal(status, 0, output);
  const uvx = calls.filter(({ via }) => via === "uvx-args");
  assert.ok(uvx.length > 0, "uvx was asked");
  for (const { args } of uvx) {
    assert.deepEqual(args, ["--quiet", "--with", "setuptools<81", `semgrep==${floor}`]);
  }
});

test("a hook refuses a semgrep below the floor with 3, and compares versions as numbers", () => {
  const { root } = fixture();
  for (const version of ["1.177.9", "1.99.0", "0.200.0"]) {
    const { status, output, scans } = run(root, {
      env: { ...HOOK, STUB_VERSION: version },
    });

    assert.equal(status, 3, `${version}: ${output}`);
    assert.match(output, /below 1\.178\.0/);
    assert.deepEqual(scans, []);
  }
  for (const version of ["1.178.0", "1.200.0", "2.0.0"]) {
    const { status } = run(root, { env: { ...HOOK, STUB_VERSION: version } });
    assert.equal(status, 0, version);
  }
});

// ── The ci stage ─────────────────────────────────────────────────────────────

test("ci: semgrep comes from uvx at the pinned version, and a binary on PATH is not used", () => {
  const { root } = fixture();
  const { status, output, calls } = run(root, {
    env: CI,
    bins: [SEMGREP_BIN, UVX_BIN],
  });

  assert.equal(status, 0, output);
  const uvx = calls.filter(({ via }) => via === "uvx-args");
  assert.ok(uvx.length > 0, "uvx was asked");
  for (const { args } of uvx) {
    assert.deepEqual(args, [
      "--quiet",
      "--exclude-newer",
      PINS.SEMGREP_EXCLUDE_NEWER,
      "--with",
      "setuptools<81",
      `semgrep==${PINS.SEMGREP_VERSION}`,
    ]);
  }
  assert.deepEqual(
    calls.filter(({ via }) => via === "semgrep"),
    [],
    "the semgrep binary on PATH must not run",
  );
});

test("ci: a missing pin or a missing uvx fails, each with its own message", () => {
  const { root } = fixture();
  for (const [cause, env, bins] of [
    ["SEMGREP_VERSION", { ...CI, SEMGREP_VERSION: "" }, [SEMGREP_BIN, UVX_BIN]],
    ["SEMGREP_EXCLUDE_NEWER", { ...CI, SEMGREP_EXCLUDE_NEWER: "" }, [SEMGREP_BIN, UVX_BIN]],
    ["uvx", CI, [SEMGREP_BIN]],
  ]) {
    const { status, output, calls } = run(root, { env, bins });

    assert.equal(status, 3, `${cause}: ${output}`);
    assert.equal(/missing: (.+?) —/.exec(output)?.[1], cause, `${cause}: ${output}`);
    assert.deepEqual(calls, [], `${cause}: nothing runs`);
  }
});

test("ci is the stage when GITHUB_ACTIONS is true and VERIFY_STAGE is unset", () => {
  const { root } = fixture();
  const { status, output } = run(root, {
    env: { GITHUB_ACTIONS: "true" },
    bins: [SEMGREP_BIN, UVX_BIN],
  });

  assert.equal(status, 3, output);
  assert.match(output, /semgrep in CI needs SEMGREP_VERSION/);
});

test("ci: semgrep that cannot be fetched is red, and never read as findings", () => {
  const { root } = fixture();
  for (const code of ["1", "2"]) {
    const { status, output, scans } = run(root, {
      env: { ...CI, UVX_EXIT: code },
      bins: [SEMGREP_BIN, UVX_BIN],
    });

    assert.equal(status, 3, `uvx exit ${code}: ${output}`);
    assert.match(output, new RegExp(`semgrep could not be fetched \\(exit ${code}\\)`));
    assert.doesNotMatch(output, /found newly-introduced/);
    assert.deepEqual(scans, []);
  }
});

test("a hook: semgrep that cannot be fetched only warns", () => {
  const { root } = fixture();
  for (const code of ["1", "2"]) {
    const { status, output, scans } = run(root, {
      env: { ...HOOK, UVX_EXIT: code },
      bins: [UVX_BIN],
    });

    assert.equal(status, 0, `uvx exit ${code}: ${output}`);
    assert.match(output, /semgrep could not be fetched/);
    assert.doesNotMatch(output, /found newly-introduced/);
    assert.deepEqual(scans, []);
  }
});

test("ci: an error of our rules is red; an error of the registry's only warns", () => {
  const { root } = fixture();

  const ours = run(root, {
    env: { ...CI, STUB_EXIT_OURS: "7" },
    bins: [SEMGREP_BIN, UVX_BIN],
  });
  assert.equal(ours.status, 3, ours.output);
  assert.match(ours.output, /semgrep errored on our rules, \.semgrep\/ \(exit 7\)/);

  const registry = run(root, {
    env: { ...CI, STUB_EXIT_REGISTRY: "2" },
    bins: [SEMGREP_BIN, UVX_BIN],
  });
  assert.equal(registry.status, 0, registry.output);
  assert.match(registry.output, /^::warning::semgrep p\/javascript errored \(exit 2/m);
  assert.doesNotMatch(registry.output, /✓ semgrep/);
  assert.equal(registry.scans.length, 2);
});
