// Every CLI in the repository decides "was I run?" with `import.meta.main`
// (#2539).
//
// A hand-written comparison of `process.argv[1]` with the module's own URL or
// file name fails through a symlinked or space-carrying path: Node resolves a
// main module's symlinks and escapes a space in its URL, so the comparison is
// false, main() never runs, and the script exits 0 without a word. Every caller
// reads that as "nothing to do" — no source in the diff, no examples to lint,
// no benchmark to run. Two nets hold the class:
//
//   - a scan of the tracked scripts refuses any hand-written comparison, and
//     every file that uses `import.meta.main` must be in `CLIS` below;
//   - every CLI in `CLIS` runs through a symlinked directory whose name holds a
//     space and must show what its main() prints, and importing it must print
//     nothing.
//
// Runs in pre-push and Repo Lints via `node --test scripts/tests/*.test.mjs`.

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import assert from "node:assert/strict";

import { stripComments } from "../coverage-owner.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = "scripts/tests/cli-entry.test.mjs";

/**
 * Every tracked file that runs as a CLI, with a fast, offline run and a line
 * only its main() prints. `null` means the file is held by the scan alone, for
 * the reason given.
 */
const CLIS = {
  "scripts/build-matrix.mjs": { args: [], ran: /turbo \d+\.\d+/ },
  "scripts/bundle-size-base.mjs": {
    args: [],
    ran: /Base bundle sizes unavailable/,
  },
  // The `gh` stub fails, so the scan prints and then skips the network.
  "scripts/check-issue-refs.mjs": {
    args: [],
    ran: /Scanned \d+ distinct issue references/,
  },
  "scripts/check-membership-predicate.mjs": {
    args: [],
    ran: /✓ no site counts a record's own keys/,
  },
  "scripts/check-sarif-paths.mjs": {
    args: [],
    ran: /usage: check-sarif-paths\.mjs/,
  },
  "scripts/codspeed-base-age.mjs": {
    args: [],
    ran: /GITHUB_REPOSITORY is unset/,
  },
  "scripts/codspeed-gate.mjs": { args: [], ran: /CodSpeed: / },
  "scripts/diff-carries-no-source.mjs": {
    args: [],
    ran: /no changed paths/,
  },
  "scripts/examples-lint-filter.mjs": {
    args: [],
    ran: /usage: examples-lint-filter\.mjs <base> <head>/,
  },
  // Any of three proves main() ran: the comparison, its refusal of an empty
  // file set, or a throw from inside main() where no `origin/master` exists
  // (a shallow CI checkout). Which one depends on the branch and the clone.
  "scripts/raiser-text-equality.mjs": {
    args: [],
    ran: /lost: \d+|nothing to compare|at main \(/,
  },
  "scripts/refusal-census.mjs": {
    args: [],
    ran: /REFUSALS with a bracketed head: \d+/,
  },
  ".changeset/changelog-notes.mjs": {
    args: [],
    ran: /usage: changelog-notes\.mjs/,
  },
  ".changeset/check-changeset.mjs": {
    args: [],
    ran: /No changesets to validate|changeset file\(s\) (valid|invalid)/,
  },
  // Reads `.changeset/` under the working directory: the cell plants one.
  ".changeset/extract-pr-refs.mjs": {
    args: [],
    changeset: "A planted change (#1234)\n",
    ran: /^ \(#1234\)$/,
  },
  ".changeset/unpublished-packages.mjs": {
    args: ["--published-version", ""],
    ran: /--published-version needs a <name@version>/,
  },
  "benchmarks/plugin-seam/bench.mts": null, // runs the whole benchmark over built dist
};

/**
 * Lines that compare `argv[1]` with the module by hand: its URL through
 * `import.meta.url`, `fileURLToPath` or `pathToFileURL`, or its name through
 * `endsWith`. Comments are stripped first, so prose that names the old form
 * does not count.
 */
function handWrittenGuards(source) {
  return stripComments(source)
    .split("\n")
    .filter(
      (line) =>
        line.includes("argv[1]") &&
        /import\.meta\.url|fileURLToPath|pathToFileURL|\.endsWith\(/.test(line),
    )
    .map((line) => line.trim());
}

/** The tracked JavaScript and TypeScript sources a CLI can live in. */
const trackedSources = () =>
  execFileSync(
    "git",
    ["ls-files", "-z", "--", "scripts", ".changeset", "benchmarks"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (file) =>
        /\.(?:[cm]?js|[cm]?ts)$/.test(file) &&
        !file.endsWith(".d.ts") &&
        file !== SELF,
    );

const read = (file) => readFileSync(join(ROOT, file), "utf8");

test("the detector sees each retired spelling, and neither the new one nor prose", () => {
  const argv1 = "process.argv[1]";

  assert.equal(
    handWrittenGuards(
      `if (${argv1} && import.meta.url === \`file://\${${argv1}}\`) {}`,
    ).length,
    1,
  );
  assert.equal(
    handWrittenGuards(`if (${argv1} === fileURLToPath(import.meta.url)) {}`)
      .length,
    1,
  );
  assert.equal(
    handWrittenGuards(
      `if (import.meta.url === pathToFileURL(${argv1} ?? "").href) {}`,
    ).length,
    1,
  );
  assert.equal(
    handWrittenGuards(`if (${argv1}?.endsWith("bench.mts")) {}`).length,
    1,
  );
  assert.deepEqual(handWrittenGuards("if (import.meta.main) {}"), []);
  assert.deepEqual(
    handWrittenGuards(`// ${argv1} === fileURLToPath(import.meta.url)\n`),
    [],
  );
});

test("no tracked script compares argv[1] with itself by hand", () => {
  const files = trackedSources();

  // Positive control: the scan reads the tree it claims to read.
  assert.ok(files.includes("scripts/build-matrix.mjs"));
  assert.ok(files.includes(".changeset/check-changeset.mjs"));
  assert.ok(files.includes("benchmarks/plugin-seam/bench.mts"));

  const found = files.flatMap((file) =>
    handWrittenGuards(read(file)).map((line) => `${file}: ${line}`),
  );

  assert.deepEqual(found, []);
});

test("every file that asks import.meta.main is a registered CLI", () => {
  const asking = trackedSources()
    .filter((file) => stripComments(read(file)).includes("import.meta.main"))
    .toSorted((a, b) => a.localeCompare(b));

  assert.deepEqual(
    asking,
    Object.keys(CLIS).toSorted((a, b) => a.localeCompare(b)),
  );
});

// ── Runs ─────────────────────────────────────────────────────────────────────

const scratch = mkdtempSync(join(tmpdir(), "cli-entry-"));
/** A symlinked directory whose name holds a space, pointing at the repo root. */
const LINKED_ROOT = join(scratch, "linked tree");
const BIN = join(scratch, "bin");

symlinkSync(ROOT, LINKED_ROOT);
mkdirSync(BIN);
writeFileSync(join(BIN, "gh"), '#!/bin/sh\necho "gh: offline" >&2\nexit 1\n');
chmodSync(join(BIN, "gh"), 0o755);

after(() => {
  // The link first, on its own: removing the scratch dir must never reach
  // through it into the repository.
  unlinkSync(LINKED_ROOT);
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * No `GITHUB_*` and no `CI`: under Actions a script would append to the job's
 * own `$GITHUB_OUTPUT` or reach the network. `gh` fails on the spot.
 */
const OFFLINE_ENV = {
  PATH: `${BIN}${delimiter}${process.env.PATH ?? ""}`,
  HOME: process.env.HOME ?? "",
};

const nodeRun = (args, cwd) =>
  spawnSync(process.execPath, args, {
    cwd,
    env: OFFLINE_ENV,
    encoding: "utf8",
    input: "",
    timeout: 60_000,
  });

test("import.meta.main answers through a symlink and a space, and not on import", () => {
  const dir = join(scratch, "platform probe");
  const link = join(scratch, "platform link");

  mkdirSync(dir);
  writeFileSync(
    join(dir, "entry.mjs"),
    'if (import.meta.main) console.log("main ran");\n',
  );
  writeFileSync(join(dir, "importer.mjs"), 'import "./entry.mjs";\n');
  symlinkSync(dir, link);

  assert.equal(
    nodeRun([join(link, "entry.mjs")], scratch).stdout,
    "main ran\n",
  );
  assert.equal(nodeRun([join(dir, "importer.mjs")], scratch).stdout, "");
});

for (const [file, spec] of Object.entries(CLIS)) {
  if (spec === null) continue;

  test(`${file} runs through a symlinked path with a space`, () => {
    let cwd = ROOT;

    if (spec.changeset !== undefined) {
      cwd = mkdtempSync(join(scratch, "changeset-"));
      mkdirSync(join(cwd, ".changeset"));
      writeFileSync(join(cwd, ".changeset", "planted.md"), spec.changeset);
    }

    const run = nodeRun([join(LINKED_ROOT, file), ...spec.args], cwd);

    assert.match(`${run.stdout}${run.stderr}`, spec.ran, run.stderr);
  });

  test(`${file} runs nothing when imported`, () => {
    const run = nodeRun(
      [
        "--input-type=module",
        "-e",
        "await import(process.argv[1]);",
        pathToFileURL(join(ROOT, file)).href,
      ],
      ROOT,
    );

    assert.equal(run.status, 0, run.stderr);
    assert.equal(`${run.stdout}${run.stderr}`, "");
  });
}
