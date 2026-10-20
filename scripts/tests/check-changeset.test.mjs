// check-changeset.test.mjs — `lint:changeset` validates the `.changeset/` of
// its own checkout from any directory, refuses a changeset that breaks a rule
// of `.changeset/README.md` § Validation with that rule's error alone, and
// refuses a `patch` whose description labels the change breaking.
//
// Run:  node --test scripts/tests/check-changeset.test.mjs
//
// Why (#2544): the validator took its root from the working directory and read
// a missing `.changeset/` as no changesets. Run from `packages/`, it printed
// "📝 No changesets to validate." and exited 0 over a planted invalid
// changeset the root run blocked. It is the first step of pre-push, and CI's
// `changeset-check.yml` calls its `--json` mode. So each cell runs a byte copy
// of `.changeset/check-changeset.mjs` inside a fixture checkout, from the root
// and from below it.
//
// Stdlib node:test/node:assert only (Node 24) — `scripts/scripts-tests.mjs`,
// which pre-push and Repo Lints run, picks this file up from `scripts/tests/`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = join(repoRoot, ".changeset", "check-changeset.mjs");

const VALID = '---\n"@real-router/core": minor\n---\n\nA change (#1234)\n';
const INVALID = '---\n"@real-router/core": minor\n---\n\nA change\n';

/** A changeset of these frontmatter lines and a valid description. */
const changeset = (...lines) =>
  `---\n${lines.join("\n")}\n---\n\nA change (#1234)\n`;

/** The fixture's public packages by directory, before and after 1.0. */
const PACKAGES = {
  "packages/core": { name: "@real-router/core", version: "0.3.0" },
  "packages/stable": { name: "@real-router/stable", version: "1.2.0" },
};

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * A checkout holding a byte copy of the validator, the packages of `PACKAGES`,
 * and `changesets` (file name → text) beside the validator.
 */
function fixture(changesets = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "changeset-")));
  fixtures.push(root);
  mkdirSync(join(root, ".changeset"));
  copyFileSync(SCRIPT, join(root, ".changeset", "check-changeset.mjs"));
  writeFileSync(join(root, ".changeset", "README.md"), "# Changesets\n");
  for (const [dir, manifest] of Object.entries(PACKAGES)) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify(manifest));
  }
  mkdirSync(join(root, "packages", "core", "src"));
  for (const [file, text] of Object.entries(changesets)) {
    writeFileSync(join(root, ".changeset", file), text);
  }
  return root;
}

/** Runs the copy by a path relative to `cwd`, as a direct call types it. */
function run(root, { cwd = root, args = [] } = {}) {
  const script = relative(cwd, join(root, ".changeset", "check-changeset.mjs"));
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  };
}

/** Where a direct call can stand: at the root, below it, deep in a package. */
const DIRECTORIES = ["", "packages", "packages/core/src"];

test("control: a checkout with no changeset passes", () => {
  const root = fixture();
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.equal(output, "📝 No changesets to validate.\n");
});

test("a valid changeset passes, from any directory", () => {
  const root = fixture({ "a-change.md": VALID });
  for (const cwd of DIRECTORIES) {
    const { status, output } = run(root, { cwd: join(root, cwd) });

    assert.equal(status, 0, `from ${cwd || "the root"}: ${output}`);
    assert.equal(output, "✅ 1 changeset file(s) valid.\n");
  }
});

test("an invalid changeset blocks, from any directory", () => {
  const root = fixture({ "a-change.md": INVALID });
  for (const cwd of DIRECTORIES) {
    const { status, output } = run(root, { cwd: join(root, cwd) });

    assert.equal(status, 1, `from ${cwd || "the root"}: ${output}`);
    assert.match(
      output,
      /^❌ \.changeset\/a-change\.md: missing PR\/issue reference \(#NN\) in the description$/m,
    );
  }
});

/**
 * A changeset for each rule of `.changeset/README.md` § Validation that breaks
 * that rule alone, and the error it draws. The `#NN` and `Breaking` rules have
 * tests of their own.
 */
const REFUSED = [
  {
    name: "a file without frontmatter",
    text: "A change (#1234)\n",
    error: /^missing or unterminated YAML frontmatter/,
  },
  {
    name: "a frontmatter left open",
    text: '---\n"@real-router/core": minor\n\nA change (#1234)\n',
    error: /^missing or unterminated YAML frontmatter/,
  },
  {
    name: "an unquoted package name, given the quoted line to write",
    text: changeset("@real-router/core: minor"),
    error: /^package name must be quoted: `"@real-router\/core": minor`$/,
  },
  {
    name: "a frontmatter line that is no entry",
    text: changeset('"@real-router/core" minor'),
    error: /^unparseable frontmatter line: `"@real-router\/core" minor`$/,
  },
  {
    name: "two packages in one file",
    text: changeset(
      '"@real-router/core": minor',
      '"@real-router/stable": minor',
    ),
    error: /^2 packages in one file/,
  },
  {
    name: "a misspelt bump level",
    text: changeset('"@real-router/core": mihor'),
    error: /^invalid bump level "mihor" for "@real-router\/core"/,
  },
  {
    name: "a misspelt package name",
    text: changeset('"@real-router/cor": minor'),
    error: /^unknown package "@real-router\/cor"/,
  },
  {
    name: "a major on a package before 1.0",
    text: changeset('"@real-router/core": major'),
    error: /^"@real-router\/core" is pre-1\.0 \(0\.3\.0\) — use "minor"/,
  },
];

for (const { name, text, error } of REFUSED) {
  test(`refused by its own rule's error alone: ${name}`, () => {
    const root = fixture({ "a-change.md": text });
    const { status, stdout, output } = run(root, { args: ["--json"] });

    assert.equal(status, 1, output);
    const [{ errors }] = JSON.parse(stdout);
    assert.equal(errors.length, 1, output);
    assert.match(errors[0], error);
  });
}

test("control: CRLF, blank frontmatter lines and a major after 1.0 pass", () => {
  const root = fixture({
    "crlf.md": VALID.replaceAll("\n", "\r\n"),
    "blank-lines.md":
      '---\n\n"@real-router/core": minor\n\n---\n\nA change (#1234)\n',
    "stable-major.md": changeset('"@real-router/stable": major'),
  });
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.equal(output, "✅ 3 changeset file(s) valid.\n");
});

test("a file name off kebab-case warns and does not block", () => {
  const root = fixture({ "A_Change.md": VALID });
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.match(
    output,
    /^⚠️ {2}\.changeset\/A_Change\.md: file name is not kebab-case/m,
  );
  assert.match(
    output,
    /^✅ 1 changeset file\(s\) valid \(1 warning\(s\)\)\.$/m,
  );
});

test("a patch whose description labels the change breaking blocks", () => {
  const head = '---\n"@real-router/core": patch\n---\n\nA change (#1234)\n\n';
  const root = fixture({
    "emphasis.md": `${head}⚠ **Breaking for anyone matching on messages**\n`,
    "heading.md": `${head}**Breaking Change:** a field is removed\n`,
    "plain.md": `${head}Breaking for read-modify-write on a config.\n`,
  });
  const { status, output } = run(root);

  assert.equal(status, 1, output);
  for (const file of ["emphasis", "heading", "plain"]) {
    assert.match(
      output,
      new RegExp(
        `^❌ \\.changeset/${file}\\.md: "patch" beside a description that calls the change breaking`,
        "m",
      ),
    );
  }
});

test("control: the label on a minor, and the word in passing on a patch, pass", () => {
  const root = fixture({
    "labelled-minor.md":
      '---\n"@real-router/core": minor\n---\n\nA change (#1234)\n\n**Breaking Change:** a field is removed\n',
    "word-in-prose.md":
      '---\n"@real-router/core": patch\n---\n\nA change (#1234)\n\nThe codec kept\nbreaking the round-trip; a breaking change stays tracked in #1235.\n',
  });
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.equal(output, "✅ 2 changeset file(s) valid.\n");
});

test("--json reports the same files from any directory", () => {
  const root = fixture({ "a-change.md": INVALID });
  for (const cwd of DIRECTORIES) {
    const { status, stdout } = run(root, {
      cwd: join(root, cwd),
      args: ["--json"],
    });
    const results = JSON.parse(stdout);

    assert.equal(status, 1, `from ${cwd || "the root"}`);
    assert.deepEqual(
      results.map(({ file }) => file),
      [".changeset/a-change.md"],
    );
    assert.equal(results[0].errors.length, 1);
  }
});
