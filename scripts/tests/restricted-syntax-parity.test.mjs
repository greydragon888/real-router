// restricted-syntax-parity.test.mjs — the configs of the workspaces of their
// own carry the root's `no-restricted-syntax` restrictions as the root's text.
//
// `examples/` and `cross-router-bench/` lint with ESLint configs of their own,
// and each holds a copy of the restrictions `COPIES` names for it, comments
// included. No lint run compares a copy with the root's `eslint.config.mjs`: a
// copy that drifts lints its workspace by its own text and stays green. This
// test compares them. A family is what one restriction takes in a config: each
// segment of it is a node found by its code — a declaration, a rule by the
// names it spreads, or the block that holds such a rule — with the run of `//`
// lines right above it, and a copy's segment is the root's, byte for byte.
//
// The set is closed both ways against the configs git tracks: a config that
// holds a family's marks when `COPIES` does not name the family for it fails,
// and so does a config that no longer holds a family `COPIES` names for it.
//
// Run:  node --test scripts/tests/restricted-syntax-parity.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The config the copies are taken from. */
const SOURCE = "eslint.config.mjs";

const GUARD = "isolate(produce())";
const LISTENER = "window rejection listener";

/** The families each config beside the root carries. */
const COPIES = new Map([
  ["examples/eslint.config.mjs", [GUARD, LISTENER]],
  ["cross-router-bench/eslint.config.mjs", [GUARD]],
]);

/**
 * A family's marks say whether a config carries it at all; a mark is text that
 * any form of the restriction holds — its selector, or the name of its entries
 * — so a copy in an older, inline form is found too, and fails on the segments
 * it lacks. Its segments say what the root's text of it is.
 */
const FAMILIES = new Map([
  [
    GUARD,
    {
      marks: ["callee.name='runHook'", "ISOLATE_PRODUCE_RESTRICTIONS"],
      segments: new Map([
        ["the entries", declaring("ISOLATE_PRODUCE_RESTRICTIONS")],
        ["the base rule", ruleSpreading(["ISOLATE_PRODUCE_RESTRICTIONS"])],
      ]),
    },
  ],
  [
    LISTENER,
    {
      marks: ["unhandledrejection'", "WINDOW_REJECTION_LISTENER_"],
      segments: new Map([
        ["the message", declaring("WINDOW_REJECTION_LISTENER_MESSAGE")],
        ["the entries", declaring("WINDOW_REJECTION_LISTENER_RESTRICTIONS")],
        [
          "the test-file block",
          blockOf(
            ruleSpreading([
              "ISOLATE_PRODUCE_RESTRICTIONS",
              "WINDOW_REJECTION_LISTENER_RESTRICTIONS",
            ]),
          ),
        ],
      ]),
    },
  ],
]);

// ─── Reader ──────────────────────────────────────────────────────────────────

/** The top-level statements that declare `name`. */
function declaring(name) {
  return (file) =>
    file.statements.filter(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) && declaration.name.text === name,
        ),
    );
}

/**
 * The settings of `"no-restricted-syntax"` whose spread elements are `names`,
 * in that order and nothing else.
 */
function ruleSpreading(names) {
  return (file) => {
    const found = [];
    const visit = (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isStringLiteral(node.name) &&
        node.name.text === "no-restricted-syntax" &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        const spreads = node.initializer.elements
          .filter((element) => ts.isSpreadElement(element))
          .map((element) => element.expression.getText(file));
        if (
          spreads.length === names.length &&
          spreads.every((spread, index) => spread === names[index])
        ) {
          found.push(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  };
}

/** The config blocks whose `rules` hold a setting `rule` finds. */
function blockOf(rule) {
  return (file) =>
    rule(file)
      .map((setting) => setting.parent.parent)
      .filter(
        (rules) =>
          ts.isPropertyAssignment(rules) &&
          ts.isIdentifier(rules.name) &&
          rules.name.text === "rules" &&
          ts.isObjectLiteralExpression(rules.parent),
      )
      .map((rules) => rules.parent);
}

/** A node's lines with the run of `//` lines right above it. */
function segmentOf(file, node) {
  const lines = file.text.split("\n");
  let first = file.getLineAndCharacterOfPosition(node.getStart(file)).line;
  const last = file.getLineAndCharacterOfPosition(node.end).line;
  while (first > 0 && lines[first - 1].trimStart().startsWith("//")) {
    first -= 1;
  }
  return { line: first + 1, lines: lines.slice(first, last + 1) };
}

function parse(path, text) {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
}

/** The one node `find` finds in `file`, or why there is not one. */
function theOne(find, file) {
  const nodes = find(file);
  if (nodes.length === 1) return { node: nodes[0] };
  return {
    why: nodes.length === 0 ? "not found" : `found ${nodes.length} times`,
  };
}

/**
 * Everything wrong with a set of configs.
 *
 * @param {Map<string, string>} texts each tracked config, by path, the root's
 *   among them
 * @param {Map<string, string[]>} copies the families of each config beside
 *   the root
 * @returns {string[]}
 */
function findings(texts, copies) {
  const source = texts.get(SOURCE);
  if (source === undefined) return [`${SOURCE}: not among the tracked configs`];

  const out = [];
  for (const [path, families] of copies) {
    if (!texts.has(path)) {
      out.push(`${path}: COPIES names it, and git does not track it`);
    }
    for (const family of families.filter((name) => !FAMILIES.has(name))) {
      out.push(`${path}: COPIES names ${family}, which is not a family`);
    }
  }

  const rootFile = parse(SOURCE, source);
  const rootSegments = new Map();
  for (const [family, { segments }] of FAMILIES) {
    for (const [name, find] of segments) {
      const { node, why } = theOne(find, rootFile);
      if (node === undefined) out.push(`${SOURCE}: ${family}, ${name}: ${why}`);
      else rootSegments.set(`${family}: ${name}`, segmentOf(rootFile, node));
    }
  }

  for (const [path, text] of texts) {
    if (path === SOURCE) continue;
    const named = copies.get(path) ?? [];
    let file;
    for (const [family, { marks, segments }] of FAMILIES) {
      const carries = marks.some((mark) => text.includes(mark));
      if (!named.includes(family)) {
        if (carries) {
          out.push(
            `${path}: carries ${family}, which COPIES does not name for it`,
          );
        }
        continue;
      }
      if (!carries) {
        out.push(
          `${path}: COPIES names ${family} for it, and it does not carry it`,
        );
        continue;
      }
      file ??= parse(path, text);
      for (const [name, find] of segments) {
        const { node, why } = theOne(find, file);
        if (node === undefined) {
          out.push(`${path}: ${family}, ${name}: ${why}`);
          continue;
        }
        const root = rootSegments.get(`${family}: ${name}`);
        if (root === undefined) continue;
        const copy = segmentOf(file, node);
        const lines = Math.max(root.lines.length, copy.lines.length);
        const at = Array.from({ length: lines }, (_, index) => index).find(
          (index) => root.lines[index] !== copy.lines[index],
        );
        if (at !== undefined) {
          out.push(
            `${path}:${copy.line + at}: ${family}, ${name}: differs from ${SOURCE}:${root.line + at}`,
          );
        }
      }
    }
  }
  return out;
}

// ─── The reader on fixtures: one cell for each finding it gives ──────────────

const FIXTURE_ROOT = `// The guard's entries.
const ISOLATE_PRODUCE_RESTRICTIONS = [
  { selector: "CallExpression[callee.name='runHook']", message: "recipe" },
];

// The listener's message.
const WINDOW_REJECTION_LISTENER_MESSAGE = "dead";
const WINDOW_REJECTION_LISTENER_RESTRICTIONS = [
  {
    selector: "[arguments.0.value='unhandledrejection']",
    message: WINDOW_REJECTION_LISTENER_MESSAGE,
  },
];

export default [
  {
    rules: {
      // The base rule.
      "no-restricted-syntax": ["error", ...ISOLATE_PRODUCE_RESTRICTIONS],
    },
  },

  // The test-file block.
  {
    files: ["**/tests/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ISOLATE_PRODUCE_RESTRICTIONS,
        ...WINDOW_REJECTION_LISTENER_RESTRICTIONS,
      ],
    },
  },
];
`;

/** A copy of the guard alone, as the bench holds it. */
const FIXTURE_GUARD = `// The guard's entries.
const ISOLATE_PRODUCE_RESTRICTIONS = [
  { selector: "CallExpression[callee.name='runHook']", message: "recipe" },
];

export default [
  {
    rules: {
      // The base rule.
      "no-restricted-syntax": ["error", ...ISOLATE_PRODUCE_RESTRICTIONS],
    },
  },
];
`;

/** A config that takes the root's and copies nothing. */
const FIXTURE_IMPORTER = `import config from "../eslint.config.mjs";

export default [...config];
`;

const BOTH = "a/eslint.config.mjs";
const ONE = "b/eslint.config.mjs";
const NONE = "c/eslint.config.mjs";
const FIXTURE_COPIES = new Map([
  [BOTH, [GUARD, LISTENER]],
  [ONE, [GUARD]],
]);

/** The fixture tree, with `edits` applied to the texts they name. */
function fixture(edits = {}) {
  return new Map(
    Object.entries({
      [SOURCE]: FIXTURE_ROOT,
      [BOTH]: FIXTURE_ROOT,
      [ONE]: FIXTURE_GUARD,
      [NONE]: FIXTURE_IMPORTER,
      ...edits,
    }).filter(([, text]) => text !== null),
  );
}

/** `text` with `from`, which it holds once, replaced by `to`. */
function swap(text, from, to) {
  assert.equal(text.split(from).length, 2, `the fixture holds ${from} once`);
  return text.replace(from, () => to);
}

test("fixture: copies equal to the root's text, and a config that copies nothing, give no finding", () => {
  assert.deepEqual(findings(fixture(), FIXTURE_COPIES), []);
});

test("fixture: a byte of an entry that differs is reported at its line in both configs", () => {
  const texts = fixture({
    [BOTH]: swap(FIXTURE_ROOT, '"recipe"', '"recipe."'),
  });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${BOTH}:3: ${GUARD}, the entries: differs from ${SOURCE}:3`,
  ]);
});

test("fixture: a comment line counts — the run of comments above a segment is compared", () => {
  const texts = fixture({
    [ONE]: swap(
      FIXTURE_GUARD,
      "// The base rule.",
      "// The base rule, copied.",
    ),
  });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${ONE}:9: ${GUARD}, the base rule: differs from ${SOURCE}:18`,
  ]);
});

test("fixture: a copy in the inline form lacks both segments of the family", () => {
  const inline = `export default [
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='runHook']", message: "recipe" },
      ],
    },
  },
];
`;

  assert.deepEqual(findings(fixture({ [ONE]: inline }), FIXTURE_COPIES), [
    `${ONE}: ${GUARD}, the entries: not found`,
    `${ONE}: ${GUARD}, the base rule: not found`,
  ]);
});

test("fixture: a test-file block that does not spread the guard's entries is not the family's block", () => {
  const texts = fixture({
    [BOTH]: swap(
      FIXTURE_ROOT,
      `        "error",\n        ...ISOLATE_PRODUCE_RESTRICTIONS,\n`,
      `        "error",\n`,
    ),
  });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${BOTH}: ${LISTENER}, the test-file block: not found`,
  ]);
});

test("fixture: a segment found twice is reported", () => {
  const texts = fixture({
    [ONE]: swap(
      FIXTURE_GUARD,
      "\n  },\n];\n",
      `\n  },\n  {\n    rules: {\n      "no-restricted-syntax": ["error", ...ISOLATE_PRODUCE_RESTRICTIONS],\n    },\n  },\n];\n`,
    ),
  });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${ONE}: ${GUARD}, the base rule: found 2 times`,
  ]);
});

test("fixture: a config that carries a family COPIES does not name for it is reported", () => {
  const texts = fixture({ [ONE]: FIXTURE_ROOT, [NONE]: FIXTURE_GUARD });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${ONE}: carries ${LISTENER}, which COPIES does not name for it`,
    `${NONE}: carries ${GUARD}, which COPIES does not name for it`,
  ]);
});

test("fixture: a config that no longer carries a family COPIES names for it is reported", () => {
  const texts = fixture({ [BOTH]: FIXTURE_GUARD });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${BOTH}: COPIES names ${LISTENER} for it, and it does not carry it`,
  ]);
});

test("fixture: COPIES naming a config git does not track, or a family that does not exist, is reported", () => {
  const copies = new Map([...FIXTURE_COPIES, [ONE, [GUARD, "no such family"]]]);

  assert.deepEqual(findings(fixture({ [BOTH]: null }), copies), [
    `${BOTH}: COPIES names it, and git does not track it`,
    `${ONE}: COPIES names no such family, which is not a family`,
  ]);
});

test("fixture: a root without a segment is reported, and no copy of that segment is compared", () => {
  const texts = fixture({
    [SOURCE]: swap(
      FIXTURE_ROOT,
      `// The listener's message.\nconst WINDOW_REJECTION_LISTENER_MESSAGE = "dead";\n`,
      "",
    ),
    [BOTH]: swap(FIXTURE_ROOT, '"dead"', '"live"'),
  });

  assert.deepEqual(findings(texts, FIXTURE_COPIES), [
    `${SOURCE}: ${LISTENER}, the message: not found`,
  ]);
});

test("fixture: without the root's config among the texts, nothing else is read", () => {
  assert.deepEqual(findings(fixture({ [SOURCE]: null }), FIXTURE_COPIES), [
    `${SOURCE}: not among the tracked configs`,
  ]);
});

// ─── The tree ────────────────────────────────────────────────────────────────

/** Every ESLint config git tracks, with its text. */
const TRACKED = new Map(
  execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => /(?:^|\/)eslint\.config\.[cm]?[jt]s$/u.test(path))
    .map((path) => [path, readFileSync(join(ROOT, path), "utf8")]),
);

test("the tree: the listing holds the root's config, every copy, and a config that copies nothing", () => {
  assert.ok(TRACKED.has(SOURCE), `${SOURCE} is tracked`);
  for (const path of COPIES.keys())
    assert.ok(TRACKED.has(path), `${path} is tracked`);
  assert.ok(
    [...TRACKED.keys()].some((path) => path !== SOURCE && !COPIES.has(path)),
    "the listing holds a config beside the copies, so the closed set reads one",
  );
});

test("the tree: every copy is the root's text, and no other config carries a family", () => {
  assert.deepEqual(findings(TRACKED, COPIES), []);
});
