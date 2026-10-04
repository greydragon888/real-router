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

test("sourceOf gives a value as the file writes it, quotes included", () => {
  const text = 'a: "1.0"\nb: plain\nc: ${{ x }}\n';
  const doc = readClosedYaml(text);

  assert.equal(sourceOf(text, doc.get("a", true)), '"1.0"');
  assert.equal(sourceOf(text, doc.get("b", true)), "plain");
  assert.equal(sourceOf(text, doc.get("c", true)), "${{ x }}");
});
