// closed-yaml.test.mjs — the closed reading of YAML the workflow readers share
// (`scripts/closed-yaml.mjs`).
//
// Run:  node --test scripts/tests/closed-yaml.test.mjs
//
// Each form the module refuses has a cell, and so do neighbours it must still
// read: plain values GitHub's reader types by the YAML 1.2 core schema, as
// `yaml` does, the word `on` as a key, CRLF line ends. The characters the
// module refuses are built from their code points, so no file of the
// repository has to hold one.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isMap, isScalar } from "yaml";

import { ClosedYamlError, readClosedYaml, sourceOf } from "../closed-yaml.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const char = (code) => String.fromCharCode(code);
const CHARACTER = /a character the readers here refuse/;
const INVISIBLE = /an invisible character/;

test("CONTROL — every tracked YAML file of .github reads closed", () => {
  const files = execFileSync("git", ["ls-files", "-z", "--", ".github"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => /\.ya?ml$/.test(file));

  assert.ok(
    files.length >= 15,
    `only ${files.length} YAML files under .github`,
  );
  for (const file of files) {
    readClosedYaml(readFileSync(join(ROOT, file), "utf8"));
  }
});

const REFUSED = {
  "a lone CR": ["a: 1\r# x\rb: 2\n", CHARACTER],
  "a NEL": [`a: 1 # x${char(0x85)}b: 2\n`, CHARACTER],
  "an LS": [`a: 1 # x${char(0x2028)}b: 2\n`, CHARACTER],
  "a PS": [`a: 1 # x${char(0x2029)}b: 2\n`, CHARACTER],
  "a tab": ["a:\t1\n", CHARACTER],
  "a control character": [`a: 1${char(0x07)}\n`, CHARACTER],
  "a BOM": [`${char(0xfeff)}a: 1\n`, INVISIBLE],
  "a no-break space": [`a:${char(0xa0)}1\n`, INVISIBLE],
  "a %YAML directive": ["%YAML 1.1\n---\na: 1\n", /a directive/],
  "a %TAG directive": [
    "%TAG ! tag:example.com,2000:\n---\na: 1\n",
    /a directive/,
  ],
  "two documents": ["a: 1\n---\nb: 2\n", /not exactly one document/],
  "an empty text": ["", /not exactly one document/],
  "a comment alone": ["# a\n", /not exactly one document/],
  "a parse error": ["a: [1, 2\n", /line \d+/],
  "a parse warning": ["a: !local 1\n", /Unresolved tag: !local/],
  "a duplicate key": ["a: 1\na: 2\n", /Map keys must be unique/],
  "an alias": ["a: *x\n", /an alias at a$/],
  "an anchor on a scalar": ["a: &x 1\n", /an anchor at a$/],
  "an anchor on a mapping": ["a: &x\n  b: 1\n", /an anchor at a$/],
  "an anchor on a key": ["&x a: 1\n", /an anchor at a$/],
  "a tag on a scalar": ["a: !!str yes\n", /a tag at a$/],
  "a tag on a sequence": ["a: !!seq [1]\n", /a tag at a$/],
  "a tag on a key": ["!!str a: 1\n", /a tag at a$/],
  "a merge key": ["a:\n  <<: {b: 1}\n", /a merge key at a/],
  "a key that is not a scalar": ["? [a]\n: 1\n", /a key that is not a scalar/],
};

for (const [name, [text, refusal]] of Object.entries(REFUSED)) {
  test(`${name} is refused`, () => {
    assert.throws(
      () => readClosedYaml(text),
      (error) => {
        assert.ok(error instanceof ClosedYamlError, String(error));
        assert.match(error.message, refusal);
        return true;
      },
    );
  });
}

const READ = {
  "a plain yes, a string as GitHub's reader types it": [
    "a: yes\n",
    { a: "yes" },
  ],
  "a leading zero, a decimal number as GitHub's reader types it": [
    "a: 0777\n",
    { a: 777 },
  ],
  "a date, a string": ["a: 2026-10-04\n", { a: "2026-10-04" }],
  "on as a key": ["on: push\n", { on: "push" }],
  "yes as a key": ["yes: 1\n", { yes: 1 }],
  "CRLF line ends": ["a: 1\r\nb: 2\r\n", { a: 1, b: 2 }],
  "flow collections and comments": [
    "a: [b, c] # d\ne: {f: g}\n",
    { a: ["b", "c"], e: { f: "g" } },
  ],
  "a literal block": ["a: |\n  x\n  y\n", { a: "x\ny\n" }],
  "the numbers, booleans and null of the core schema": [
    "a: 10\nb: 0\nc: true\nd: false\ne: null\nf: 1.5\n",
    { a: 10, b: 0, c: true, d: false, e: null, f: 1.5 },
  ],
};

for (const [name, [text, value]] of Object.entries(READ)) {
  test(`${name} is read`, () => {
    assert.deepEqual(readClosedYaml(text).toJS(), value);
  });
}

test("a literal block with a comment after its indicator, a blank line and a quote inside quotes reads to exactly its text", () => {
  // Forms the gate's block uses, on a fixture; every block of the workflows
  // themselves is held against its own bytes below.
  const text = [
    "jobs:",
    "  ci:",
    "    steps:",
    "      - name: Determine result",
    "        env:",
    "          NEEDS: ${{ toJSON(needs) }}",
    "        run: | # a comment after the indicator",
    "          # a comment line",
    '          A="${{ needs.check.result }}"',
    "",
    '          if [[ "$A" != "success" ]]; then',
    "            echo \"❌ unknown mode '$A'\"",
    "            exit 1",
    "          fi",
    "      - run: echo",
    "",
  ].join("\n");

  assert.equal(
    readClosedYaml(text).getIn(["jobs", "ci", "steps", 0, "run"]),
    [
      "# a comment line",
      'A="${{ needs.check.result }}"',
      "",
      'if [[ "$A" != "success" ]]; then',
      "  echo \"❌ unknown mode '$A'\"",
      "  exit 1",
      "fi",
      "",
    ].join("\n"),
  );
});

/**
 * A block scalar read from its own bytes rather than by the parser: `|` with
 * clip chomping, and `>-` of one plain paragraph — the headers the workflows
 * use. Any other header or shape throws.
 *
 * @param {string} source the block as the file writes it, from its header
 * @returns {string}
 */
function fromBytes(source) {
  const [header, ...rest] = source.split("\n");
  const lines = rest.at(-1) === "" ? rest.slice(0, -1) : rest;
  const content = lines.find((line) => line.trim() !== "");

  if (content === undefined) throw new Error("an empty block");

  const indent = /^ */.exec(content)[0].length;
  const body = lines.map((line) => {
    if (/^ *$/.test(line) && line.length <= indent) return "";
    if (!line.startsWith(" ".repeat(indent))) {
      throw new Error(`a line outside the block's indentation: ${line}`);
    }
    return line.slice(indent);
  });

  while (body.length > 0 && body.at(-1) === "") body.pop();
  if (/^\|(?: +#.*)?$/.test(header)) return `${body.join("\n")}\n`;
  if (/^>-(?: +#.*)?$/.test(header)) {
    if (body.some((line) => line === "" || line.startsWith(" "))) {
      throw new Error("a folded block of more than one plain paragraph");
    }
    return body.join(" ");
  }
  throw new Error(`a block header the reading does not take: ${header}`);
}

test("every block run: of the workflows reads the same through the parser and through its own bytes", () => {
  // The gate's script, Repo Lints' step and every test that reads a workflow
  // through the parser take a `run:` from `yaml` alone; a version that reads
  // one of these blocks otherwise disagrees with its bytes here.
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--", ".github/workflows"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => /\.ya?ml$/.test(file));
  const headers = new Set();
  let blocks = 0;

  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const jobs = readClosedYaml(text).get("jobs", true);

    for (const { value: job } of jobs?.items ?? []) {
      for (const step of job.get("steps", true)?.items ?? []) {
        const run = isMap(step) ? step.get("run", true) : undefined;

        if (!isScalar(run) || !run.type.startsWith("BLOCK")) continue;

        const source = sourceOf(text, run);

        headers.add(source.split("\n")[0].replace(/ +#.*$/, ""));
        assert.equal(fromBytes(source), run.value, `${file}: ${source}`);
        blocks++;
      }
    }
  }

  // Each branch of the byte reading meets a block of the real tree.
  for (const header of ["|", ">-"]) {
    assert.ok(headers.has(header), `no ${header} block read`);
  }
  assert.ok(blocks >= 50, `only ${blocks} blocks`);
});

test("the byte reading refuses a header and a shape it does not read", () => {
  for (const [source, refusal] of [
    ["|-\n  a\n", /a block header the reading does not take: \|-/],
    ["|2\n  a\n", /a block header the reading does not take/],
    [">\n  a\n", /a block header the reading does not take/],
    [">-\n  a\n\n  b\n", /a folded block of more than one plain paragraph/],
    [">-\n  a\n    b\n", /a folded block of more than one plain paragraph/],
    ["|\n  a\n b\n", /a line outside the block's indentation/],
    ["|\n\n", /an empty block/],
  ]) {
    assert.throws(() => fromBytes(source), refusal, JSON.stringify(source));
  }
});

test("sourceOf gives a value as the file writes it, quotes included", () => {
  const text = 'a: "1.0"\nb: plain\nc: ${{ x }}\n';
  const doc = readClosedYaml(text);

  assert.equal(sourceOf(text, doc.get("a", true)), '"1.0"');
  assert.equal(sourceOf(text, doc.get("b", true)), "plain");
  assert.equal(sourceOf(text, doc.get("c", true)), "${{ x }}");
});
