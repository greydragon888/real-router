// self-hosted-triggers.test.mjs — a job on the self-hosted runner runs only
// under triggers a fork cannot fire: `schedule`, `workflow_dispatch`, `push`,
// and `workflow_call`, judged by its callers. Everything the rules cannot read
// counts as the self-hosted runner, or is a finding.
//
// Run:  node --test scripts/tests/self-hosted-triggers.test.mjs
//
// The model is read twice — by the line reader of `scripts/runner-labels.mjs`
// and by the `yaml` parser — and judged only when the readings agree. Each red
// form below names the reason it must fail for; the green forms are the
// control arm.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { judge, readWorkflows, textModel } from "../runner-labels.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REAL = readWorkflows(join(ROOT, ".github", "workflows"));

const workflow = (on, jobs) => `name: x\n${on}jobs:\n${jobs}`;
const job = (id, runsOn) =>
  `  ${id}:\n    runs-on: ${runsOn}\n    steps:\n      - run: echo\n`;
const PR = "on:\n  pull_request:\n";
const VPS_ON_PR = (runsOn) => workflow(PR, job("bench", runsOn));
const callee = workflow("on:\n  workflow_call:\n", job("bench", "self-hosted"));

/** The findings for one added file, which must name it and carry `reason`. */
function assertRed(files, file, reason) {
  const findings = judge({ ...REAL, ...files });
  const own = findings.filter((finding) => finding.startsWith(file));

  assert.ok(own.length > 0, `no finding for ${file}: ${findings.join("\n")}`);
  assert.ok(
    own.some((finding) => finding.includes(reason)),
    `${file} is red, but not for "${reason}":\n${own.join("\n")}`,
  );
}

test("the repository's workflows: no self-hosted job under a trigger a fork controls", () => {
  assert.deepEqual(judge(REAL), []);
});

const RULES = {
  "self-hosted": VPS_ON_PR("self-hosted"),
  "[self-hosted, linux]": VPS_ON_PR("[self-hosted, linux]"),
  "a block list": workflow(
    PR,
    "  bench:\n    runs-on:\n      - self-hosted\n      - linux\n    steps:\n      - run: echo\n",
  ),
  "labels:": workflow(
    PR,
    "  bench:\n    runs-on:\n      labels: self-hosted\n    steps:\n      - run: echo\n",
  ),
  "group:": workflow(
    PR,
    "  bench:\n    runs-on:\n      group: vps\n    steps:\n      - run: echo\n",
  ),
  "[ubuntu-latest, self-hosted]": VPS_ON_PR("[ubuntu-latest, self-hosted]"),
  "an expression": VPS_ON_PR("${{ matrix.os }}"),
  "an expression inside a label": VPS_ON_PR("ubuntu-${{ matrix.version }}"),
  "an expression after codspeed-macro-": VPS_ON_PR(
    "codspeed-macro-${{ matrix.size }}",
  ),
  "an unknown label": VPS_ON_PR("bench-vps"),
  "no runs-on": workflow(PR, "  bench:\n    steps:\n      - run: echo\n"),
  "a job named __proto__": workflow(PR, job("__proto__", "self-hosted")),
};

for (const [name, text] of Object.entries(RULES)) {
  test(`red: ${name} under pull_request`, () => {
    assertRed({ "zz.yml": text }, "zz.yml", "under pull_request");
  });
}

const TRIGGERS = {
  "on: pull_request": "on: pull_request\n",
  "on: [push, pull_request]": "on: [push, pull_request]\n",
  pull_request_target: "on:\n  pull_request_target:\n",
  issue_comment: "on:\n  issue_comment:\n",
  workflow_run: "on:\n  workflow_run:\n",
  pull_request_review: "on:\n  pull_request_review:\n",
};

for (const [name, on] of Object.entries(TRIGGERS)) {
  const event = name.includes("[") ? "pull_request" : name.replace("on: ", "");

  test(`red: a self-hosted job under ${name}`, () => {
    assertRed(
      { "zz.yml": workflow(on, job("bench", "self-hosted")) },
      "zz.yml",
      `under ${event}`,
    );
  });
}

/** Runs `use` on a throwaway workflows directory holding `files`. */
function withWorkflowsDir(files, use) {
  const dir = mkdtempSync(join(tmpdir(), "self-hosted-triggers-"));

  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }

    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("red: a .yaml file is read from the directory too", () => {
  withWorkflowsDir(
    { "zz.yaml": VPS_ON_PR("self-hosted"), "notes.txt": "pull_request\n" },
    (dir) => {
      const files = readWorkflows(dir);

      assert.deepEqual(Object.keys(files), ["zz.yaml"]);
      assertRed(files, "zz.yaml", "under pull_request");
    },
  );
});

test("red: a workflow file that is not valid UTF-8 is refused", () => {
  const bytes = Buffer.concat([
    Buffer.from("name: x\non:\n  push:\n  # note"),
    Buffer.from([0x85]),
    Buffer.from(`  pull_request:\njobs:\n${job("bench", "self-hosted")}`),
  ]);

  withWorkflowsDir({ "zz.yml": bytes }, (dir) => {
    assert.throws(
      () => readWorkflows(dir),
      /^Error: zz\.yml: not valid UTF-8$/,
    );
  });
});

test("red: a reusable self-hosted workflow called from pull_request", () => {
  assertRed(
    {
      "zz-callee.yml": callee,
      "zz-caller.yml": workflow(
        PR,
        "  call:\n    uses: ./.github/workflows/zz-callee.yml\n",
      ),
    },
    "zz-callee.yml",
    "under pull_request (via zz-caller.yml)",
  );
});

test("red: the same call behind a trailing comment", () => {
  assertRed(
    {
      "zz-callee.yml": callee,
      "zz-caller.yml": workflow(
        PR,
        "  call:\n    uses: ./.github/workflows/zz-callee.yml # bench\n",
      ),
    },
    "zz-callee.yml",
    "under pull_request (via zz-caller.yml)",
  );
});

test("red: a local uses: that names no workflow file", () => {
  assertRed(
    {
      "zz.yml": workflow(
        "on:\n  push:\n",
        "  call:\n    uses: ./.github/workflows/missing.yml\n",
      ),
    },
    "zz.yml#call",
    "names no workflow file",
  );
});

test("red: a workflow of another repository called from pull_request", () => {
  assertRed(
    {
      "zz.yml": workflow(
        PR,
        "  call:\n    uses: octo-org/bench/.github/workflows/run.yml@v1\n",
      ),
    },
    "zz.yml",
    "under pull_request",
  );
});

test("red: pull_request added to cross-router-bench.yml", () => {
  const text = REAL["cross-router-bench.yml"].replace(
    /^on:\n/m,
    "on:\n  pull_request:\n",
  );

  assert.notEqual(text, REAL["cross-router-bench.yml"]);
  assertRed(
    { "cross-router-bench.yml": text },
    "cross-router-bench.yml",
    "under pull_request",
  );
});

for (const [name, insert] of Object.entries({
  "": "  pull_request:\n",
  ", after a comment in column 0":
    "# compare against master\n  pull_request:\n",
})) {
  test(`red: pull_request back in codspeed.yml while its jobs are self-hosted${name}`, () => {
    const text = REAL["codspeed.yml"].replace(
      "  # Manual re-seed / backtest",
      `${insert}  # Manual re-seed / backtest`,
    );

    assert.notEqual(text, REAL["codspeed.yml"]);
    assertRed({ "codspeed.yml": text }, "codspeed.yml", "under pull_request");
  });
}

const READINGS = {
  "indent 4": [
    "name: x\non:\n    pull_request:\njobs:\n    bench:\n        runs-on: self-hosted\n",
    "line reader: a job body before any job key",
  ],
  "a quoted event key": [
    workflow('on:\n  "pull_request":\n', job("bench", "self-hosted")),
    "line reader: a line under on: not read",
  ],
  "a quoted job key after a hosted job": [
    workflow(
      PR,
      job("lint", "ubuntu-latest") +
        '  "bench":\n    runs-on: self-hosted\n    steps:\n      - run: echo\n',
    ),
    "line reader: a line under jobs: not read",
  ],
  "jobs: as a flow mapping": [
    "name: x\non:\n  pull_request:\njobs: {bench: {runs-on: self-hosted}}\n",
    "line reader: jobs: not read",
  ],
  'a quoted "on":': [
    `name: x\n"on":\n  pull_request:\njobs:\n${job("bench", "self-hosted")}`,
    "line reader: on: not read",
  ],
  "a second YAML document": [
    `${workflow("on:\n  push:\n", job("lint", "ubuntu-latest"))}---\non:\n  pull_request:\n`,
    "yaml parser: 2 YAML documents",
  ],
  "a duplicate on: key": [
    workflow(
      "on:\n  push:\non:\n  pull_request:\n",
      job("bench", "self-hosted"),
    ),
    "yaml parser: Map keys must be unique",
  ],
};

for (const [name, [text, reason]] of Object.entries(READINGS)) {
  test(`red: ${name}`, () => {
    assertRed({ "zz.yml": text }, "zz.yml", reason);
  });
}

for (const [name, separator] of Object.entries({
  "a lone CR": "\r",
  "a tab": "\t",
  NEL: "\u0085",
  LS: "\u2028",
  PS: "\u2029",
})) {
  test(`red: ${name} in a comment before pull_request: is refused`, () => {
    const text = workflow(
      `on:\n  push:\n  # note${separator}  pull_request:\n`,
      job("bench", "self-hosted"),
    );

    assertRed(
      { "zz.yml": text },
      "zz.yml",
      "line reader: a control character or a line separator",
    );
  });
}

test("red: a line reader that loses an event disagrees with the parser", () => {
  const reader = (text) => {
    const model = textModel(text);

    return {
      ...model,
      events: model.events.filter((event) => event !== "pull_request"),
    };
  };
  const findings = judge(
    { ...REAL, "zz.yml": VPS_ON_PR("self-hosted") },
    { reader },
  );

  assert.ok(
    findings.some((finding) =>
      finding.startsWith("zz.yml: the readings disagree"),
    ),
    findings.join("\n"),
  );
});

const GREEN = {
  "a GitHub-hosted job on pull_request": VPS_ON_PR("ubuntu-latest"),
  "a hosted label with a trailing comment": VPS_ON_PR("ubuntu-latest # hosted"),
  "codspeed-macro-* on pull_request": VPS_ON_PR("codspeed-macro-8cpu"),
  "comments in column 0 and emoji in comments": workflow(
    "on: # triggers 🚀\n# between keys\n  pull_request:\n",
    `${job("lint", "ubuntu-latest")}# after a job ✅\n`,
  ),
};

for (const [name, text] of Object.entries(GREEN)) {
  test(`green: ${name}`, () => {
    assert.deepEqual(judge({ ...REAL, "zz.yml": text }), []);
  });
}
