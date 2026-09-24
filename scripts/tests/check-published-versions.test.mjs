// check-published-versions.test.mjs — the stranded-release watch, run the way
// stranded-release.yml runs it, against a fixture tree and a stub `npm` (#2540).
//
// Run:  node --test scripts/tests/check-published-versions.test.mjs
//
// The watch compares every CHANGELOG heading with two halves of evidence — the
// versions npm lists and the git tags. A run that could not read them for a
// package has not made the comparison it reports on, and must refuse rather
// than print ✅: "nothing is stranded" means something only when npm answered.
//
// `npm` is a stub first on PATH that answers per package from a JSON file, so
// no cell touches the network. The fixture has two public packages, one
// private package the watch must skip, a baseline and a tagged git history.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = join(repoRoot, "scripts", "check-published-versions.mjs");
const BASELINE = join("scripts", "published-versions-baseline.json");

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Hermetic git: no global/system config, so a user's signing setup cannot leak in. */
function git(cwd, args, input) {
  return execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
    {
      cwd,
      input,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    },
  );
}

/**
 * `@fx/alpha` has three CHANGELOG versions: 1.0.0 is tagged (unless `tagged`
 * is false), 1.1.0 is the baselined stranded one, 1.2.0 is neither tagged nor
 * baselined. `@fx/beta` has one untagged version, and `@fx/secret` is private:
 * the stub has no entry for it, so a watch that did not skip it would fail on
 * asking.
 */
function fixture({
  fillerTags = 50,
  tagged = true,
  baseline = { "@fx/alpha": ["1.1.0"] },
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "published-versions-"));
  dirs.push(root);
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };

  write(
    "packages/alpha/package.json",
    JSON.stringify({ name: "@fx/alpha", version: "1.2.0" }),
  );
  write(
    "packages/alpha/CHANGELOG.md",
    "# @fx/alpha\n\n## 1.2.0\n\n- c\n\n## 1.1.0\n\n- b\n\n## 1.0.0\n\n- a\n",
  );
  write(
    "packages/beta/package.json",
    JSON.stringify({ name: "@fx/beta", version: "0.1.0" }),
  );
  write("packages/beta/CHANGELOG.md", "# @fx/beta\n\n## 0.1.0\n\n- a\n");
  write(
    "packages/secret/package.json",
    JSON.stringify({ name: "@fx/secret", version: "9.9.9", private: true }),
  );
  write("packages/secret/CHANGELOG.md", "# @fx/secret\n\n## 9.9.9\n\n- a\n");
  write(BASELINE, `${JSON.stringify(baseline, undefined, 2)}\n`);

  git(root, ["init", "-q", "-b", "main", "."]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "fixture"]);
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const names = [
    ...(tagged ? ["@fx/alpha@1.0.0"] : []),
    ...Array.from({ length: fillerTags }, (_, i) => `filler-${String(i)}`),
  ];
  git(
    root,
    ["update-ref", "--stdin"],
    names.map((name) => `create refs/tags/${name} ${head}\n`).join(""),
  );

  return root;
}

/**
 * A stub `npm` answering `npm view <name> versions --json` per package:
 * `{ versions }` lists them, `{ status }` fails the way npm fails (its error
 * JSON on stdout, the code on stderr), `{ stdoutOnly }` and `{ stderrOnly }`
 * put the failure on one stream alone — npm with `loglevel=silent` keeps only
 * the stdout half — `{ raw }` prints text as-is, and `{ silent: true }` exits 1
 * with no output at all. A name with no entry fails loudly rather than
 * answering 404, so a package a cell forgot to describe cannot pass as never
 * published.
 */
function stubNpm(registry) {
  const dir = mkdtempSync(join(tmpdir(), "npm-stub-"));
  dirs.push(dir);
  const data = join(dir, "registry.json");
  writeFileSync(data, JSON.stringify(registry));
  writeFileSync(
    join(dir, "npm"),
    [
      `#!${process.execPath}`,
      `const registry = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(data)}, "utf8"));`,
      "const name = process.argv[3];",
      "const entry = registry[name];",
      "if (entry === undefined) { process.stderr.write(`stub: no entry for ${name}\\n`); process.exit(2); }",
      "if (entry.versions) { process.stdout.write(JSON.stringify(entry.versions)); process.exit(0); }",
      "if (entry.raw !== undefined) { process.stdout.write(entry.raw); process.exit(0); }",
      "if (entry.silent) process.exit(1);",
      "if (entry.stderrOnly) { process.stderr.write(`npm error code E${String(entry.stderrOnly)}\\n`); process.exit(1); }",
      "if (entry.stdoutOnly) { process.stdout.write(JSON.stringify({ error: { code: `E${String(entry.stdoutOnly)}` } })); process.exit(1); }",
      "const code = `E${String(entry.status)}`;",
      "const summary = entry.status === 404 ? `Not Found - GET https://registry.npmjs.org/${name} - Not found` : `${String(entry.status)} Service Unavailable`;",
      "process.stdout.write(JSON.stringify({ error: { code, summary } }));",
      "process.stderr.write(`npm error code ${code}\\n`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(join(dir, "npm"), 0o755);
  return dir;
}

/** Runs the watch with exactly `args` — no `--root=` added. */
function runArgs(args, registry) {
  const npm = stubNpm(registry);
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${npm}:${process.env.PATH}` },
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function run(root, registry, ...args) {
  return runArgs([`--root=${root}`, ...args], registry);
}

/** The same run with no `npm` anywhere on PATH — only the `git` the watch needs. */
function runWithoutNpm(root) {
  const dir = mkdtempSync(join(tmpdir(), "no-npm-"));
  dirs.push(dir);
  const gitBinary = (process.env.PATH ?? "")
    .split(":")
    .map((entry) => join(entry, "git"))
    .find((candidate) => existsSync(candidate));
  assert.ok(gitBinary, "no git on PATH to hand the watch");
  symlinkSync(gitBinary, join(dir, "git"));
  const result = spawnSync(process.execPath, [SCRIPT, `--root=${root}`], {
    encoding: "utf8",
    env: { ...process.env, PATH: dir },
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

/**
 * npm lists 1.2.0 for `@fx/alpha` but not 1.0.0, so only the tag keeps 1.0.0
 * off the stranded list — the tag half decides a heading in every cell built
 * on this. 1.1.0 is stranded and baselined.
 */
const HEALTHY = {
  "@fx/alpha": { versions: ["1.2.0"] },
  "@fx/beta": { versions: ["0.1.0"] },
};

/** A refusal names what failed and never reports the run as clean. */
function assertRefused(result, pattern) {
  assert.notEqual(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /✅/);
  assert.match(result.output, pattern);
}

test("CONTROL — a registry that answers: the baselined version is on record and nothing is new", () => {
  const result = run(fixture(), HEALTHY);

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.output,
    /^1 stranded version\(s\) on record, 1 baselined/m,
  );
  assert.match(result.output, /✅/);
});

test("CONTROL — npm listing every version leaves nothing stranded, and the run passes", () => {
  const result = run(fixture(), {
    ...HEALTHY,
    "@fx/alpha": { versions: ["1.0.0", "1.1.0", "1.2.0"] },
  });

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.output,
    /^0 stranded version\(s\) on record, 1 baselined/m,
  );
  assert.match(result.output, /✅/);
});

test("CONTROL — a CHANGELOG version on neither npm nor a tag is reported", () => {
  const result = run(fixture(), {
    ...HEALTHY,
    "@fx/alpha": { versions: ["1.0.0"] },
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /@fx\/alpha@1\.2\.0/);
  assert.doesNotMatch(result.output, /✅/);
});

test("CONTROL — a package the registry does not have is not the watch's subject", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/beta": { status: 404 } });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /✅/);
});

test("CONTROL — a not-found on stderr alone is still not the watch's subject", () => {
  const result = run(fixture(), {
    ...HEALTHY,
    "@fx/beta": { stderrOnly: 404 },
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /✅/);
});

test("CONTROL — a not-found on stdout alone is still not the watch's subject", () => {
  const result = run(fixture(), {
    ...HEALTHY,
    "@fx/beta": { stdoutOnly: 404 },
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /✅/);
});

test("a not-found for a package with release tags is a refusal — the two halves disagree", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/alpha": { status: 404 } });

  assertRefused(
    result,
    /npm view @fx\/alpha says it was never published, but it has release tags/,
  );
});

test("npm failing for every package is a refusal, not a pass", () => {
  const result = run(fixture(), {
    "@fx/alpha": { status: 503 },
    "@fx/beta": { status: 503 },
  });

  assertRefused(result, /npm view @fx\/(alpha|beta) failed/);
  // The failures are the cause, so the refusal does not guess at another one.
  assert.doesNotMatch(result.output, /the registry has none of them/);
});

test("npm failing for one package is a refusal — the others answering does not cover it", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/beta": { status: 503 } });

  assertRefused(result, /npm view @fx\/beta failed/);
});

test("an auth failure is a refusal, not a package that never published", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/beta": { status: 403 } });

  assertRefused(result, /npm view @fx\/beta failed — .*E403/);
});

test("npm failing for one package does not hide another package's stranded version", () => {
  const result = run(fixture(), {
    "@fx/alpha": { versions: ["1.0.0"] },
    "@fx/beta": { status: 503 },
  });

  assertRefused(result, /npm view @fx\/beta failed/);
  assert.match(result.output, /@fx\/alpha@1\.2\.0/);
});

test("a package that could not be compared is not reported as healed", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/alpha": { status: 503 } });

  assertRefused(result, /npm view @fx\/alpha failed/);
  assert.doesNotMatch(result.output, /run --update/);
});

test("no answer at all — exit 1 and empty output — is a refusal", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/alpha": { silent: true } });

  assertRefused(result, /npm view @fx\/alpha failed — .*versions --json/);
});

test("an npm that cannot be started is a refusal", () => {
  const result = runWithoutNpm(fixture());

  assertRefused(result, /npm view @fx\/(alpha|beta) failed — .*ENOENT/);
});

test("an empty answer with a success exit is a refusal", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/alpha": { raw: "" } });

  assertRefused(
    result,
    /npm view @fx\/alpha answered with something other than a JSON list of versions: \(nothing\)/,
  );
});

test("an answer that is not JSON is a refusal", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/alpha": { raw: "0.1.0" } });

  assertRefused(
    result,
    /npm view @fx\/alpha answered with something other than a JSON list/,
  );
});

test("a JSON answer that is not a list is a refusal", () => {
  const result = run(fixture(), {
    ...HEALTHY,
    "@fx/alpha": { raw: '"1.2.0"' },
  });

  assertRefused(
    result,
    /npm view @fx\/alpha answered with something other than a JSON list/,
  );
});

test("a JSON null is a refusal, not a package with no versions", () => {
  const result = run(fixture(), { ...HEALTHY, "@fx/alpha": { raw: "null" } });

  assertRefused(
    result,
    /npm view @fx\/alpha answered with something other than a JSON list of versions: null/,
  );
});

test("a registry that has none of the packages is a refusal — nothing was compared", () => {
  const result = run(fixture({ tagged: false }), {
    "@fx/alpha": { status: 404 },
    "@fx/beta": { status: 404 },
  });

  assertRefused(
    result,
    /compared no public package against npm — the registry has none of them/,
  );
});

test("a tree with no CHANGELOG to compare is a refusal", () => {
  const root = fixture();
  rmSync(join(root, "packages/alpha/CHANGELOG.md"));
  rmSync(join(root, "packages/beta/CHANGELOG.md"));
  const result = run(root, HEALTHY);

  assertRefused(
    result,
    /compared no public package against npm — the registry has none of them, or none has a CHANGELOG/,
  );
});

test("--update refuses to record what a failed run read, and leaves the baseline as it was", () => {
  const root = fixture({
    baseline: { "@fx/alpha": ["1.1.0"], "@fx/beta": ["0.0.9"] },
  });
  const before = readFileSync(join(root, BASELINE), "utf8");
  const result = run(
    root,
    { ...HEALTHY, "@fx/beta": { status: 503 } },
    "--update",
  );

  assertRefused(result, /npm view @fx\/beta failed/);
  assert.equal(readFileSync(join(root, BASELINE), "utf8"), before);
});

test("--update refuses when nothing was compared, and leaves the baseline as it was", () => {
  const root = fixture({ tagged: false });
  const before = readFileSync(join(root, BASELINE), "utf8");
  const result = run(
    root,
    { "@fx/alpha": { status: 404 }, "@fx/beta": { status: 404 } },
    "--update",
  );

  assertRefused(
    result,
    /compared no public package against npm — the registry has none of them/,
  );
  assert.equal(readFileSync(join(root, BASELINE), "utf8"), before);
});

test("CONTROL — --update records what a run that could read found", () => {
  const root = fixture({
    baseline: { "@fx/alpha": ["1.1.0"], "@fx/beta": ["0.0.9"] },
  });
  const result = run(root, HEALTHY, "--update");

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(JSON.parse(readFileSync(join(root, BASELINE), "utf8")), {
    "@fx/alpha": ["1.1.0"],
  });
});

test("CONTROL — a public package without a CHANGELOG has no history to check", () => {
  const root = fixture();
  rmSync(join(root, "packages/beta/CHANGELOG.md"));
  const result = run(root, HEALTHY);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /✅/);
});

test("a CHANGELOG the watch cannot read is a refusal, not a package without history", () => {
  const root = fixture();
  rmSync(join(root, "packages/beta/CHANGELOG.md"));
  mkdirSync(join(root, "packages/beta/CHANGELOG.md"));
  const result = run(root, HEALTHY);

  assertRefused(result, /EISDIR/);
});

test("CONTROL — a checkout without its tags is refused rather than read as untagged", () => {
  const result = run(fixture({ fillerTags: 0 }), HEALTHY);

  assertRefused(result, /git fetch --tags/);
});

test("49 tags are fewer than the 50 the watch needs — the empty line after them is not a tag", () => {
  const result = run(fixture({ fillerTags: 48 }), HEALTHY);

  assertRefused(result, /only 49 tags in the checkout/);
});

test("an argument the watch does not know is a refusal — `--root D` does not read the repository", () => {
  const result = runArgs(["--root", fixture()], HEALTHY);

  assertRefused(result, /unknown argument/);
});

test("an empty --root= is a refusal", () => {
  const result = runArgs(["--root="], HEALTHY);

  assertRefused(result, /unknown argument/);
});
