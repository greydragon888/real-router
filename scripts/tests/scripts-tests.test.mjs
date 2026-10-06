// scripts-tests.test.mjs — the split of `scripts/tests/` and the tooling task
// (`scripts/scripts-tests.mjs`).
//
// Run:  node --test scripts/tests/scripts-tests.test.mjs
//
// The copy the tooling task runs in must hold exactly what turbo hashes for
// the task, or a cache hit could replay a verdict over a file the key missed.
// The cells compare the two, show that turbo's key moves with the tools'
// versions and the runner's image, and run a test that reads beyond the
// inputs: it passes in place and fails in the copy. A test `TOOLING` does not
// name runs in place.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  TASK,
  TOOLING,
  runHere,
  runtime,
  taskInputs,
  testsOf,
} from "../scripts-tests.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "scripts-tests.mjs");
const TURBO = join(ROOT, "node_modules", ".bin", "turbo");

/**
 * The environment of a nested `node --test`, without the context this
 * runner hands its children: with it, a nested run exits 0 whatever it found.
 */
const NESTED = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT"),
);

/** The environment without turbo's settings: no remote cache, no telemetry. */
const OFFLINE = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("TURBO_")),
);

/** Hermetic git: none of the caller's GIT_* variables or config. */
const GIT = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

/**
 * The tooling task as `turbo --dry=json` reads it, under `env`.
 *
 * @param {Record<string, string>} env
 * @returns {{ hash: string, inputs: Record<string, string> }}
 */
function dryTask(env) {
  const cache = mkdtempSync(join(tmpdir(), "scripts-tests-cache-"));
  try {
    const dry = JSON.parse(
      execFileSync(
        TURBO,
        [
          "run",
          "test:tooling",
          "--filter=//",
          "--dry=json",
          "--cache-dir",
          cache,
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          env: { ...OFFLINE, ...env },
        },
      ),
    );
    const task = dry.tasks.find((each) => each.taskId === TASK);
    assert.ok(task, `turbo --dry=json lists no ${TASK}`);
    return task;
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

test("TOOLING names only test files that exist", () => {
  for (const name of TOOLING) {
    assert.ok(
      existsSync(join(ROOT, "scripts", "tests", `${name}.test.mjs`)),
      `TOOLING names ${name}, which scripts/tests/ does not hold`,
    );
  }
});

test("the two groups split scripts/tests/ between them", () => {
  const guards = testsOf("guards");
  const tooling = testsOf("tooling");
  const all = readdirSync(join(ROOT, "scripts", "tests"))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => `scripts/tests/${file}`)
    .sort();

  assert.deepEqual([...guards, ...tooling].sort(), all);
  const name = (file) =>
    file.slice("scripts/tests/".length, -".test.mjs".length);
  assert.ok(
    tooling.every((file) => TOOLING.has(name(file))),
    tooling.join(),
  );
  assert.ok(
    guards.every((file) => !TOOLING.has(name(file))),
    guards.join(),
  );
  assert.equal(tooling.length, TOOLING.size);
  assert.ok(tooling.length >= 20, `only ${tooling.length} tooling tests`);
});

test("a test the tooling set does not name lands in the guards group", () => {
  const root = mkdtempSync(join(tmpdir(), "scripts-tests-(new)-"));
  const named = [...TOOLING][0];
  try {
    mkdirSync(join(root, "scripts", "tests"), { recursive: true });
    for (const name of [named, "new-test"]) {
      writeFileSync(join(root, "scripts", "tests", `${name}.test.mjs`), "");
    }

    assert.deepEqual(testsOf("guards", root, new Set([named])), [
      "scripts/tests/new-test.test.mjs",
    ]);
    assert.deepEqual(testsOf("tooling", root, new Set([named])), [
      `scripts/tests/${named}.test.mjs`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the copy holds exactly what turbo hashes for the task", () => {
  // turbo hashes as well what git ignores under an input glob, where a local
  // run left it: such a file moves the key and costs a miss, not a stale
  // verdict, so the copy is held to the files git sees. `path.matchesGlob`
  // matches no dot segment with `*` or `**`, and turbo does: a dotfile under
  // an input glob fails this cell by name.
  const visible = new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: ROOT, encoding: "utf8" },
    ).split("\0"),
  );
  const hashed = Object.keys(dryTask({ TOOLING_RUNTIME: "same" }).inputs)
    .filter((file) => visible.has(file))
    .sort();
  const copied = taskInputs().sort();

  assert.ok(copied.length >= 100, `only ${copied.length} inputs`);
  assert.deepEqual(copied, hashed);
});

test("turbo keys the task on the tools' versions, CI and the runner's image", () => {
  const base = {
    TOOLING_RUNTIME: "node v1; bash 1; git 1; jq 1",
    CI: "true",
    ImageOS: "os1",
    ImageVersion: "1",
  };
  const first = dryTask(base).hash;

  assert.equal(dryTask(base).hash, first);
  for (const [name, value] of [
    ["TOOLING_RUNTIME", "node v2; bash 1; git 1; jq 1"],
    ["CI", "1"],
    ["ImageOS", "os2"],
    ["ImageVersion", "2"],
  ]) {
    assert.notEqual(dryTask({ ...base, [name]: value }).hash, first, name);
  }
});

test("the key names the versions of node, bash, git and jq, and the OS release", () => {
  const parts = runtime().split("; ");

  assert.equal(parts.length, 4);
  assert.match(parts[0], /^node v\d+\.\d+\.\d+ \w+-\w+ \d+\.\d+/);
  for (const [part, tool] of [
    [parts[1], "bash"],
    [parts[2], "git"],
    [parts[3], "jq"],
  ]) {
    assert.match(part, new RegExp(`${tool}.*\\d+\\.\\d+`, "i"));
  }
});

test("the versions in the key do not depend on the caller's locale", () => {
  // A stand-in bash whose banner names the message locale, as a translated
  // bash's does.
  const stubs = mkdtempSync(join(tmpdir(), "scripts-tests-bash-"));
  try {
    writeFileSync(
      join(stubs, "bash"),
      '#!/bin/sh\necho "GNU bash, ${LC_ALL:-${LC_MESSAGES:-${LANG:-C}}} 9.9"\n',
    );
    chmodSync(join(stubs, "bash"), 0o755);
    const tools = (locale) =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then((m) => console.log(m.runtime()))`,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${stubs}${delimiter}${process.env.PATH}`,
            LANG: locale,
            LC_ALL: locale,
            LC_MESSAGES: locale,
          },
        },
      );

    assert.equal(tools("ru_RU.UTF-8"), tools("C.UTF-8"));
    assert.match(tools("C.UTF-8"), /; GNU bash, C 9\.9;/);
  } finally {
    rmSync(stubs, { recursive: true, force: true });
  }
});

test("the tooling command hands turbo the tools' versions", () => {
  const stubs = mkdtempSync(join(tmpdir(), "scripts-tests-pnpm-"));
  try {
    const out = join(stubs, "out");
    writeFileSync(
      join(stubs, "pnpm"),
      '#!/bin/sh\nprintf \'%s\\n%s\\n\' "$*" "$TOOLING_RUNTIME" > "$OUT"\n',
    );
    chmodSync(join(stubs, "pnpm"), 0o755);
    const run = spawnSync(process.execPath, [SCRIPT, "tooling"], {
      encoding: "utf8",
      env: {
        ...process.env,
        OUT: out,
        PATH: `${stubs}${delimiter}${process.env.PATH}`,
        TOOLING_RUNTIME: "stale",
      },
    });

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readFileSync(out, "utf8").split("\n").slice(0, 2), [
      "turbo run test:tooling --filter=//",
      runtime(),
    ]);
  } finally {
    rmSync(stubs, { recursive: true, force: true });
  }
});

test("the tooling command says so when pnpm does not run", () => {
  const empty = mkdtempSync(join(tmpdir(), "scripts-tests-path-"));
  try {
    const run = spawnSync(process.execPath, [SCRIPT, "tooling"], {
      encoding: "utf8",
      env: { ...process.env, PATH: empty },
    });

    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /pnpm ENOENT/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("the task's command refuses a run whose key lacks the tools' versions", () => {
  const otherBash = runtime()
    .split("; ")
    .with(1, "GNU bash, version 0.0")
    .join("; ");
  for (const tools of [undefined, "node v0; bash 0; git 0; jq 0", otherBash]) {
    const env = { ...NESTED };
    delete env.TOOLING_RUNTIME;
    if (tools !== undefined) env.TOOLING_RUNTIME = tools;
    const run = spawnSync(process.execPath, [SCRIPT, "tooling", "--here"], {
      encoding: "utf8",
      env,
    });

    assert.equal(run.status, 2, `${tools}: ${run.stderr}`);
    assert.match(
      run.stderr,
      /runs through `node scripts\/scripts-tests\.mjs tooling`/,
    );
    assert.match(run.stderr, /found: node v/);
  }
});

/**
 * A repository whose tooling task names `scripts/**`, with one test that
 * reads `read` from the root — found through the test's own location, or
 * through `READ_FROM`, which names the root twice as `PATH` does under pnpm —
 * and the file it reads. The root's name holds characters a regular
 * expression would read.
 *
 * @param {string} read the path the test reads, from the root
 * @param {"location" | "env"} through
 * @returns {string}
 */
function fixture(read, through) {
  const root = mkdtempSync(join(tmpdir(), "scripts-tests-(fixture)-"));
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(
    "turbo.json",
    JSON.stringify({ tasks: { [TASK]: { inputs: ["scripts/**"] } } }),
  );
  put(read, "data\n");
  const path =
    through === "env"
      ? `join(process.env.READ_FROM.split(${JSON.stringify(delimiter)})[1], ${JSON.stringify(read)})`
      : `new URL("../../${read}", import.meta.url)`;
  put(
    "scripts/tests/reads.test.mjs",
    [
      'import { readFileSync } from "node:fs";',
      'import { join } from "node:path";',
      'import { test } from "node:test";',
      `test("reads ${read}", () => {`,
      `  readFileSync(${path});`,
      "});",
      "",
    ].join("\n"),
  );
  execFileSync("git", ["init", "-q"], { cwd: root, env: GIT });
  return root;
}

/**
 * The names of every test a fixture holds, so its copy runs each of them: a set
 * written by hand could leave one out.
 *
 * @param {string} root
 * @returns {Set<string>}
 */
const testsIn = (root) =>
  new Set(
    readdirSync(join(root, "scripts", "tests"))
      .filter((file) => file.endsWith(".test.mjs"))
      .map((file) => file.slice(0, -".test.mjs".length)),
  );

test("a test that reads beyond the task's inputs fails in the copy, and passes in place", () => {
  for (const [read, through, inCopy] of [
    ["scripts/data.txt", "location", 0],
    ["other/data.txt", "location", 1],
    ["scripts/data.txt", "env", 0],
    ["other/data.txt", "env", 1],
  ]) {
    const root = fixture(read, through);
    const from = { READ_FROM: [root, root].join(delimiter) };
    try {
      const inPlace = spawnSync(
        process.execPath,
        ["--test", "scripts/tests/reads.test.mjs"],
        { cwd: root, encoding: "utf8", env: { ...NESTED, ...from } },
      );

      assert.equal(
        inPlace.status,
        0,
        `${read} through ${through}, in place: ${inPlace.stdout}`,
      );
      // The copy's run gets this runner's `NODE_TEST_CONTEXT` too, and must
      // drop it.
      assert.equal(
        runHere(root, "ignore", { ...process.env, ...from }, testsIn(root)),
        inCopy,
        `${read} through ${through}, in the copy`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a test that requires a file it lists beyond the task's inputs fails in the copy, and passes in place", () => {
  // A listing in the copy finds only the inputs: a test that requires what it
  // lists fails there, and one that does not can pass having checked nothing.
  const root = fixture("scripts/data.txt", "location");
  mkdirSync(join(root, "other"));
  writeFileSync(join(root, "other", "data.txt"), "data\n");
  writeFileSync(
    join(root, "scripts", "tests", "lists.test.mjs"),
    [
      'import assert from "node:assert/strict";',
      'import { globSync } from "node:fs";',
      'import { test } from "node:test";',
      'import { fileURLToPath } from "node:url";',
      'test("lists other/", () => {',
      '  const cwd = fileURLToPath(new URL("../../", import.meta.url));',
      '  assert.deepEqual(globSync("other/*.txt", { cwd }), ["other/data.txt"]);',
      "});",
      "",
    ].join("\n"),
  );
  try {
    const inPlace = spawnSync(
      process.execPath,
      ["--test", "scripts/tests/lists.test.mjs"],
      { cwd: root, encoding: "utf8", env: NESTED },
    );

    assert.equal(inPlace.status, 0, inPlace.stdout);
    assert.equal(runHere(root, "ignore", process.env, new Set(["lists"])), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a name in the tooling set without a test file is refused", () => {
  const root = fixture("scripts/data.txt", "location");
  try {
    assert.throws(
      () => testsOf("tooling", root, new Set(["reads", "ghost"])),
      /no test file for ghost in scripts\/tests/,
    );
    assert.throws(
      () => runHere(root, "ignore", process.env, new Set(["ghost"])),
      /no test file for ghost/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a group without a test file is refused, not left to node's own search", () => {
  const root = fixture("scripts/data.txt", "location");
  try {
    assert.throws(
      () => runHere(root, "ignore", process.env, new Set()),
      /no test file to run/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the copy's repository takes none of the caller's git config, ignore file or template", () => {
  const scratch = mkdtempSync(join(tmpdir(), "scripts-tests-git-"));
  const signing = join(scratch, "signing.gitconfig");
  writeFileSync(
    signing,
    "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n",
  );
  mkdirSync(join(scratch, "xdg", "git"), { recursive: true });
  writeFileSync(join(scratch, "xdg", "git", "ignore"), "*.txt\n");
  const hook = join(scratch, "template", "hooks", "pre-commit");
  mkdirSync(dirname(hook), { recursive: true });
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  try {
    for (const arm of [
      { GIT_CONFIG_GLOBAL: signing },
      { GIT_CONFIG_SYSTEM: signing },
      { XDG_CONFIG_HOME: join(scratch, "xdg") },
      { GIT_TEMPLATE_DIR: join(scratch, "template") },
    ]) {
      const root = fixture("scripts/data.txt", "location");
      writeFileSync(
        join(root, "scripts", "tests", "listed.test.mjs"),
        [
          'import assert from "node:assert/strict";',
          'import { execFileSync } from "node:child_process";',
          'import { test } from "node:test";',
          'test("the commit holds every input", () => {',
          '  const listed = execFileSync("git", ["ls-files"], { encoding: "utf8" });',
          "  assert.match(listed, /scripts\\/data\\.txt/);",
          "});",
          "",
        ].join("\n"),
      );
      try {
        assert.equal(
          runHere(root, "ignore", { ...process.env, ...arm }, testsIn(root)),
          0,
          Object.keys(arm).join(),
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the copy's run gets the copy as PWD, no CI run's variables and pnpm's install check off", () => {
  const root = fixture("scripts/data.txt", "location");
  const link = `${root}-link`;
  symlinkSync(root, link);
  // A sibling of the root: the root followed by more than a path's boundary.
  const sibling = `${root}-tools/bin`;
  writeFileSync(
    join(root, "scripts", "tests", "env.test.mjs"),
    [
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      'test("the environment of the copy", () => {',
      "  assert.equal(process.env.PWD, process.cwd());",
      "  const ci = Object.keys(process.env).filter((key) => /^(?:GITHUB|RUNNER)_/.test(key));",
      "  assert.deepEqual(ci, []);",
      '  assert.equal(process.env.pnpm_config_verify_deps_before_run, "false");',
      '  assert.equal(process.env.SIBLING, Buffer.from(process.env.SIBLING_B64, "base64").toString());',
      "});",
      "",
    ].join("\n"),
  );
  const env = {
    ...process.env,
    PWD: link,
    GITHUB_SHA: "0",
    RUNNER_OS: "Linux",
    SIBLING: sibling,
    SIBLING_B64: Buffer.from(sibling).toString("base64"),
  };
  delete env.pnpm_config_verify_deps_before_run;
  try {
    assert.equal(runHere(root, "ignore", env, testsIn(root)), 0);
  } finally {
    rmSync(link, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("the inputs leave out a deleted file and refuse a symbolic link", () => {
  const root = fixture("scripts/data.txt", "location");
  const git = (...args) => execFileSync("git", args, { cwd: root, env: GIT });
  try {
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "f");
    rmSync(join(root, "scripts", "data.txt"));

    assert.deepEqual(taskInputs(root), ["scripts/tests/reads.test.mjs"]);

    symlinkSync("tests/reads.test.mjs", join(root, "scripts", "link.mjs"));
    assert.throws(
      () => taskInputs(root),
      /takes no symbolic link as an input: scripts\/link\.mjs/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
