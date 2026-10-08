// osv-allowlist.test.mjs — the `allow-ghsas` region of
// `.github/dependency-review-config.yml`, rendered from `scripts/osv-scanner.toml`.
//
// Run:  node --test scripts/tests/osv-allowlist.test.mjs
//
// The cells run `records` and `render` on fixture trees, and the repository
// cell holds the reading of the real file against a scan of its `id` lines.
// Every refusal of the reading is asserted by its message; one of the
// parser, by the file it names.

import assert from "node:assert/strict";
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
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { readClosedYaml } from "../closed-yaml.mjs";
import { withoutGitEnv } from "../git-env.mjs";
import { SOURCE, records, render } from "../osv-allowlist.mjs";
import { isWorkflowFile } from "../runner-labels.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Runs `body` on a tree whose `scripts/osv-scanner.toml` holds `content`. */
function withSource(content, body) {
  const root = mkdtempSync(join(tmpdir(), "osv-allowlist-"));

  try {
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, SOURCE), content);
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const rendered = (content) => withSource(content, render);

const A = "GHSA-aaaa-2222-cccc";
const B = "GHSA-bbbb-3333-dddd";
const BOM = "\uFEFF";

/**
 * The GHSA ids of the lines of `text` that start with an `id` key: a scan of
 * the file beside the parser's reading, so a line in a comment is no record.
 */
const idLines = (text) =>
  [...text.matchAll(/^[ \t]*id[ \t]*=[ \t]*["'](GHSA-[^"']+)["']/gm)].map(
    (match) => match[1],
  );

test("on the repository, the region lists the GHSA ids of the file's id lines, in their order", () => {
  const text = readFileSync(join(repoRoot, SOURCE), "utf8");
  const scanned = idLines(text);

  assert.ok(scanned.length > 0, "the scan found no GHSA id");
  assert.deepEqual(render(repoRoot), [
    "allow-ghsas:",
    ...scanned.map((id) => `  - ${id}`),
  ]);
  assert.ok(
    records(repoRoot).some((record) => record.id.startsWith("RUSTSEC-")),
    "the control needs a record the region leaves out",
  );
});

test("the scan of id lines passes over a record in a comment, as the parser does", () => {
  const content = `# [[IgnoredVulns]]\n# id = "${B}"\n[[IgnoredVulns]]\nid = "${A}"  # id = "${B}"\n`;

  assert.deepEqual(idLines(content), [A]);
  assert.deepEqual(rendered(content), ["allow-ghsas:", `  - ${A}`]);
});

test("the region is a YAML list the action and the closed reader read as one, empty without GHSA ids", () => {
  for (const [content, ids] of [
    [`[[IgnoredVulns]]\nid = "${A}"\n`, [A]],
    ['[[IgnoredVulns]]\nid = "RUSTSEC-2026-0001"\n', []],
    ["", []],
  ]) {
    const text = rendered(content).join("\n");

    assert.deepEqual(parse(text), { "allow-ghsas": ids }, content);
    assert.deepEqual(
      readClosedYaml(`${text}\n`).toJS(),
      { "allow-ghsas": ids },
      content,
    );
  }
});

test("only ids that start with GHSA- enter the region", () => {
  assert.deepEqual(
    rendered(
      [
        "[[IgnoredVulns]]",
        'id = "CVE-2026-0001"',
        "[[IgnoredVulns]]",
        'id = "PYSEC-2026-1"',
        "[[IgnoredVulns]]",
        'id = "ghsa-aaaa-2222-cccc"',
        "[[IgnoredVulns]]",
        `id = "${B}"`,
        "",
      ].join("\n"),
    ),
    ["allow-ghsas:", `  - ${B}`],
  );
});

test("the parser reads comments, quotes and both forms of a record; the order holds", () => {
  for (const content of [
    [
      "# GHSA-zzzz-zzzz-zzzz in a comment is no record",
      "[[IgnoredVulns]]",
      `id = "${B}"  # a trailing comment`,
      'reason = "a # inside quotes is the value\'s"',
      "",
      "[[IgnoredVulns]]",
      `id = '${A}'`,
      "ignoreUntil = 2026-11-09",
      "",
    ].join("\n"),
    `IgnoredVulns = [{ id = "${B}" }, { id = "${A}" }]\n`,
    `${BOM}[[IgnoredVulns]]\r\nid = "${B}"\r\n[[IgnoredVulns]]\r\nid = "${A}"\r\n`,
  ]) {
    assert.deepEqual(
      rendered(content),
      ["allow-ghsas:", `  - ${B}`, `  - ${A}`],
      content,
    );
  }
});

test("a key, a type or an id this does not read is refused by name", () => {
  for (const [content, message] of [
    [
      'GoVersionOverride = "1.22"\n',
      `${SOURCE}: GoVersionOverride — a key this does not read; it reads \`[[IgnoredVulns]]\` alone`,
    ],
    [
      '[[PackageOverrides]]\nname = "x"\nignore = true\n',
      `${SOURCE}: PackageOverrides — a key this does not read; it reads \`[[IgnoredVulns]]\` alone`,
    ],
    [
      `IgnoredVulns = "${A}"\n`,
      `${SOURCE}: IgnoredVulns is not an array of tables`,
    ],
    [`IgnoredVulns = ["${A}"]\n`, `${SOURCE}: record 1 is not a table`],
    [`IgnoredVulns = [["${A}"]]\n`, `${SOURCE}: record 1 is not a table`],
    [
      `[[IgnoredVulns]]\nid = "${A}"\nwhy = "x"\n`,
      `${SOURCE}: record 1 (${A}): "why", a key this does not read`,
    ],
    [
      '[[IgnoredVulns]]\nreason = "x"\n',
      `${SOURCE}: record 1: no \`id\` string`,
    ],
    ['[[IgnoredVulns]]\nid = ""\n', `${SOURCE}: record 1: no \`id\` string`],
    ["[[IgnoredVulns]]\nid = 1\n", `${SOURCE}: record 1: no \`id\` string`],
    [
      `[[IgnoredVulns]]\nid = "${A}"\nreason = 1\n`,
      `${SOURCE}: record 1 (${A}): \`reason\` is not a string`,
    ],
    [
      `[[IgnoredVulns]]\nid = "${A}"\n[[IgnoredVulns]]\nid = "${A}"\n`,
      `${SOURCE}: record 2 (${A}): an \`id\` an earlier record holds`,
    ],
  ]) {
    assert.throws(() => rendered(content), { message }, content);
  }
});

test("a GHSA id YAML would read as another value is refused", () => {
  // The region writes each id as a plain YAML scalar. Whitespace at its end,
  // ` #` or `: ` inside it would be read as a shorter id or a mapping, while
  // osv-scanner matches the id as written.
  for (const id of [
    `${A} `,
    `${A} #x`,
    "GHSA-a: b",
    "GHSA-AAAA-2222-CCCC",
    "GHSA-aaaa-2222",
  ]) {
    assert.throws(
      () => rendered(`[[IgnoredVulns]]\nid = "${id}"\n`),
      {
        message: `${SOURCE}: record 1 (${id}): not a GHSA id of the form GHSA-xxxx-xxxx-xxxx, which YAML would read as itself`,
      },
      JSON.stringify(id),
    );
  }
});

test("ignoreUntil is read as a TOML local date and nothing else", () => {
  assert.deepEqual(
    rendered(`[[IgnoredVulns]]\nid = "${A}"\nignoreUntil = 2026-11-09\n`),
    ["allow-ghsas:", `  - ${A}`],
  );
  for (const value of [
    '"2026-11-09"',
    "2026-11-09T10:00:00Z",
    "2026-11-09T10:00:00",
    "10:00:00",
  ]) {
    assert.throws(
      () => rendered(`[[IgnoredVulns]]\nid = "${A}"\nignoreUntil = ${value}\n`),
      {
        message: `${SOURCE}: record 1 (${A}): \`ignoreUntil\` is not a TOML local date such as 2026-11-09`,
      },
      value,
    );
  }
});

test("a byte not in UTF-8 is refused by the decoder, even inside a value nothing else checks", () => {
  assert.throws(
    () =>
      rendered(
        Buffer.concat([
          Buffer.from(`[[IgnoredVulns]]\nid = "${A}"\nreason = "caf`),
          Buffer.from([0xe9]),
          Buffer.from('"\n'),
        ]),
      ),
    {
      message: `${SOURCE}: The encoded data was not valid for encoding utf-8`,
    },
  );
});

test("a file the parser cannot read and one with two BOMs are refused naming the file", () => {
  for (const content of [
    `[[IgnoredVulns]]\nid = "${A}"\nid = "${B}"\n`,
    "[[IgnoredVulns]\n",
    `${BOM}${BOM}[[IgnoredVulns]]\nid = "${A}"\n`,
  ]) {
    assert.throws(
      () => rendered(content),
      (error) => {
        assert.ok(error.message.startsWith(`${SOURCE}: `), error.message);
        return true;
      },
      String(content),
    );
  }
});

/** The keys of `object` that name `name` in any letter case. */
const keysNaming = (object, name) =>
  Object.keys(object ?? {}).filter((key) => key.toLowerCase() === name);

/**
 * The Dependency Review steps of `files`, workflows and composite actions by
 * path, and where each departs from the wiring the region rests on.
 * dependency-review-action v5 merges `{...file, ...inputs}`: an `allow-ghsas`
 * input — `with:` in any letter case, or `INPUT_ALLOW-GHSAS` in an `env:` —
 * would replace the generated list, and a step without `config-file` would not
 * read it. The rule is v5's, so another version departs. A step is found by its
 * `uses` in any letter case, as GitHub resolves an action, and one in a
 * composite action departs: the rule is read off a workflow's step.
 *
 * @param {Record<string, string>} files
 * @returns {{ steps: number, departures: string[] }}
 */
function wiring(files) {
  const departures = [];
  let steps = 0;

  for (const [file, text] of Object.entries(files)) {
    const parsed = readClosedYaml(text).toJS();
    const action = !file.startsWith(".github/workflows/");
    const jobs = action
      ? [{ steps: parsed.runs?.steps }]
      : Object.values(parsed.jobs ?? {});

    for (const job of jobs) {
      for (const step of job.steps ?? []) {
        if (
          typeof step.uses !== "string" ||
          !step.uses
            .toLowerCase()
            .startsWith("actions/dependency-review-action@")
        ) {
          continue;
        }
        steps++;
        if (action) {
          departures.push(
            `${file}: a Dependency Review step in a composite action`,
          );
          continue;
        }
        if (step.uses !== "actions/dependency-review-action@v5") {
          departures.push(`${file}: uses ${step.uses}`);
        }
        if (
          keysNaming(step.with, "config-file").join() !== "config-file" ||
          step.with["config-file"] !== "./.github/dependency-review-config.yml"
        ) {
          departures.push(`${file}: config-file`);
        }
        if (keysNaming(step.with, "allow-ghsas").length > 0) {
          departures.push(`${file}: allow-ghsas in with:`);
        }
        for (const env of [parsed.env, job.env, step.env]) {
          if (keysNaming(env, "input_allow-ghsas").length > 0) {
            departures.push(`${file}: INPUT_ALLOW-GHSAS in an env:`);
          }
        }
      }
    }
  }

  return { steps, departures };
}

test("every Dependency Review step reads the region's file and nothing replaces its list", () => {
  const files = Object.fromEntries(
    execFileSync(
      "git",
      ["ls-files", "-z", "--", ".github/workflows", ".github/actions"],
      { cwd: repoRoot, encoding: "utf8", env: withoutGitEnv(process.env) },
    )
      .split("\0")
      .filter((file) =>
        file.startsWith(".github/workflows/")
          ? isWorkflowFile(file)
          : /\/action\.ya?ml$/i.test(file),
      )
      .map((file) => [file, readFileSync(join(repoRoot, file), "utf8")]),
  );
  const { steps, departures } = wiring(files);

  assert.ok(steps > 0, "no Dependency Review step found");
  assert.ok(
    Object.keys(files).includes(".github/actions/setup/action.yml"),
    "the composite actions were not read",
  );
  assert.deepEqual(departures, []);

  // Forms the tree does not hold, each beside the step it holds: a step in
  // another letter case, and one in a composite action.
  for (const [path, text] of [
    [
      ".github/workflows/review.yml",
      "on: pull_request\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: Actions/Dependency-Review-Action@v5\n",
    ],
    [
      ".github/actions/review/action.yml",
      "runs:\n  using: composite\n  steps:\n    - uses: actions/dependency-review-action@v5\n      with:\n        config-file: ./.github/dependency-review-config.yml\n",
    ],
  ]) {
    assert.equal(
      wiring({ ...files, [path]: text }).departures.length > 0,
      true,
      path,
    );
  }
});
