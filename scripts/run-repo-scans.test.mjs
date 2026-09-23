// run-repo-scans.test.mjs — the repository-wide scan runner, run the way the hooks
// and Repo Lints run it, against a fixture tree and a stub `pnpm` (#2542).
//
// Run:  node --test scripts/run-repo-scans.test.mjs
//
// The registered repository-wide scans run out of turbo only through this runner,
// and turbo replays them from cache whenever a change lies outside the packages
// that own them. A runner that miscounts a failure therefore prints ✓ over every
// scan on that path. The cells below pin what it DOES: every registry entry
// reaches vitest, a workspace that fails — by exit code, by signal, or by never
// starting — fails the run, and an empty registry is refused.
//
// The runner derives its root from its own location (`scripts/..`), so each cell
// that runs it uses a byte copy inside a fixture tree: `scripts/` with the
// fixture's own `repo-wide-scans.json`, and one `package.json` per workspace. A
// copy, not a symlink — Node resolves a symlinked module to its real path, which
// would point the runner back at this repository's registry. The copy runs from
// `packages/`, not from the fixture root, so a runner that took its root from the
// working directory fails here. `pnpm` is a stub first on PATH: it logs every
// call, and a cell can make it exit 1 or kill itself for a named workspace.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNNER = join(repoRoot, "scripts", "run-repo-scans.mjs");

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Two workspaces, three scans: alpha owns two, beta one. */
const SCANS = [
  "packages/alpha/tests/functional/one-authority.test.ts",
  "packages/alpha/tests/functional/two-authority.test.ts",
  "packages/beta/tests/functional/three-authority.test.ts",
];

/** The same entries with beta first, so grouping and order are both at stake. */
const SCANS_BETA_FIRST = [SCANS[2], SCANS[0], SCANS[1]];

/** What the stub must receive for {@link SCANS}: one vitest run per workspace. */
const EXPECTED_CALLS = [
  [
    "-F",
    "@fx/alpha",
    "exec",
    "vitest",
    "run",
    "tests/functional/one-authority.test.ts",
    "tests/functional/two-authority.test.ts",
    "--coverage.enabled=false",
  ],
  [
    "-F",
    "@fx/beta",
    "exec",
    "vitest",
    "run",
    "tests/functional/three-authority.test.ts",
    "--coverage.enabled=false",
  ],
];

/**
 * A fixture tree holding a byte copy of the runner.
 *
 * @param {string[]} scans the registry's `file` entries
 * @returns {string} the fixture root
 */
function fixture(scans) {
  const root = mkdtempSync(join(tmpdir(), "repo-scans-"));
  dirs.push(root);

  mkdirSync(join(root, "scripts"));
  copyFileSync(RUNNER, join(root, "scripts", "run-repo-scans.mjs"));
  writeFileSync(
    join(root, "scripts", "repo-wide-scans.json"),
    JSON.stringify({
      scans: scans.map((file) => ({ file, reads: "the fixture" })),
    }),
  );

  for (const dir of ["alpha", "beta"]) {
    mkdirSync(join(root, "packages", dir), { recursive: true });
    writeFileSync(
      join(root, "packages", dir, "package.json"),
      JSON.stringify({ name: `@fx/${dir}` }),
    );
  }

  return root;
}

/**
 * Runs the runner copy from the fixture's `packages/` directory.
 *
 * @param {string} root a {@link fixture} root
 * @param {{ fail?: Record<string, "exit" | "kill">, pnpm?: boolean }} [options]
 *   `fail` maps a workspace name to how its `pnpm -F <name>` fails: exit 1, or
 *   SIGKILL. `pnpm: false` leaves no `pnpm` on PATH at all.
 * @returns {{ status: number | null, output: string, calls: string[][] }}
 */
function run(root, { fail = {}, pnpm = true } = {}) {
  const bin = join(root, "bin");
  const log = join(root, "pnpm-calls.jsonl");

  mkdirSync(bin, { recursive: true });
  writeFileSync(log, "");

  if (pnpm) {
    const stub = join(bin, "pnpm");

    // `process.getBuiltinModule`, not `require` or `import`: an extensionless
    // file is read as CommonJS or as ESM by the nearest package.json.
    writeFileSync(
      stub,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
process.getBuiltinModule("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const how = ${JSON.stringify(fail)}[args[1]];
if (how === "kill") process.kill(process.pid, "SIGKILL");
process.exit(how === "exit" ? 1 : 0);
`,
    );
    chmodSync(stub, 0o755);
  }

  // Without the stub, PATH is the empty `bin/` alone, so no real `pnpm` further
  // down PATH can stand in for it; the runner itself starts by absolute path.
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "run-repo-scans.mjs")],
    {
      cwd: join(root, "packages"),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: pnpm ? `${bin}:${process.env.PATH ?? ""}` : bin,
      },
    },
  );

  const calls = readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
  };
}

test("CONTROL — every workspace passing is a pass, and ✓ counts the registry", () => {
  const result = run(fixture(SCANS));

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.output,
    /✓ repo-wide scans: 3 scan\(s\) across 2 workspace\(s\)/,
  );
  assert.doesNotMatch(result.output, /✗/);
  assert.deepEqual(result.calls, EXPECTED_CALLS);
});

test("every registry entry reaches vitest, grouped under its workspace's filter whatever the registry's order", () => {
  // A runner that skipped an entry would still print ✓: that line counts the
  // registry, not what ran.
  const { calls } = run(fixture(SCANS_BETA_FIRST));

  assert.deepEqual(calls, EXPECTED_CALLS);
});

test("a workspace that exits non-zero fails the run, and the workspaces after it still run", () => {
  const result = run(fixture(SCANS), { fail: { "@fx/alpha": "exit" } });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /✗ repo-wide scans: 1 workspace\(s\) failed/);
  assert.doesNotMatch(result.output, /✓ repo-wide scans/);
  assert.deepEqual(result.calls, EXPECTED_CALLS);
});

test("a workspace killed by a signal is a failure too, and each failure is counted", () => {
  // A killed process has no exit status, so a runner that counted only a
  // non-zero status would pass it.
  const result = run(fixture(SCANS), {
    fail: { "@fx/alpha": "exit", "@fx/beta": "kill" },
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /✗ repo-wide scans: 2 workspace\(s\) failed/);
  assert.deepEqual(result.calls, EXPECTED_CALLS);
});

test("a pnpm that cannot be started fails the run instead of passing it", () => {
  const result = run(fixture(SCANS), { pnpm: false });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /✗ repo-wide scans: 2 workspace\(s\) failed/);
  assert.deepEqual(result.calls, []);
});

test("an empty registry is refused with exit 2, and nothing runs", () => {
  // Exit 0 over an empty list reads exactly like success: the #2241 failure mode.
  const result = run(fixture([]));

  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /lists no scans/);
  assert.deepEqual(result.calls, []);
});

test("`pnpm lint:repo-scans`, the step the hooks and Repo Lints run, is this runner", () => {
  const { scripts } = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );

  assert.equal(scripts["lint:repo-scans"], "node scripts/run-repo-scans.mjs");
});
