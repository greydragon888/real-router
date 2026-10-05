// cpd-exclusions.test.mjs — the translation of `.jscpd.json`'s `ignore` into
// `sonar.cpd.exclusions` (`scripts/cpd-exclusions.mjs`), held to the jscpd
// binary file by file, and the forms the generator refuses.
//
// Run:  node --test scripts/tests/cpd-exclusions.test.mjs
//
// The cells of `toRegexp` hold the answers Sonar's `WildcardPattern` class gave
// for the same pairs; the matrix runs jscpd itself as the gate runs it, in a
// directory outside any git repository, where no ignore file of git can leave
// a fixture file out.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DUPLICATES,
  FORMAT,
  JSCPD_KEYS,
  refusedFiles,
  render,
  sonarMatches,
  translate,
} from "../cpd-exclusions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSCPD = join(ROOT, "node_modules", ".bin", "jscpd");

/** Hermetic git: none of the caller's GIT_* variables or config. */
const GIT = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

/** Ten lines of TypeScript, over the thresholds of `.jscpd.json`. */
const { minLines, minTokens } = JSON.parse(
  readFileSync(join(ROOT, ".jscpd.json"), "utf8"),
);

/** Lines of TypeScript, more of them than the thresholds of `.jscpd.json` ask. */
const SOURCE = `${Array.from({ length: Math.max(minLines, Math.ceil(minTokens / 8)) + 1 }, (_, i) => `export const v${i} = ${i} + ${i};`).join("\n")}\n`;

/**
 * The text of the `index`-th file of a fixture. Its size is its own, so a row
 * of jscpd's report names its file by `bytes`.
 *
 * @param {number} index
 * @returns {string}
 */
const source = (index) =>
  `${SOURCE}export const pad = "${"x".repeat(index)}";\n`;

/**
 * A fresh directory holding `files`, each with a few lines of TypeScript.
 *
 * @param {string[]} files
 * @returns {string}
 */
function fixture(files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cpd-exclusions-")));
  files.forEach((file, index) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source(index));
  });
  return root;
}

test("each form translates into the Sonar pattern that leaves out the same files", () => {
  for (const [entry, pattern] of [
    ["packages/preact/src/**", "**/packages/preact/src/**"],
    ["packages/*/src/dom-utils/**", "**/packages/*/**/src/dom-utils/**"],
    [
      "packages/*/src/**/*.react-server.ts",
      "**/packages/*/**/src/**/**.react-server.ts",
    ],
    ["**/*.d.ts", "**/**.d.ts"],
    ["legacy.ts", "**/legacy.ts"],
    ["src/**", "**/src/**"],
    ["/a/b.ts", "**/a/b.ts"],
    ["//a/b.ts", "**/a/b.ts"],
    ["a*b/c", "**/a**b/c"],
    ["**", "**"],
    ["*", "**"],
  ]) {
    assert.equal(translate(entry), pattern, entry);
  }
});

test("a form the translation does not carry is refused by name", () => {
  for (const entry of [
    "{a,b}.ts",
    "a,b",
    "a?.ts",
    "[ab].ts",
    "a b.ts",
    "a**",
    "**a",
    "***",
    "a//b",
    "a/./b",
    "a/../b",
    "a/",
    "",
  ]) {
    assert.throws(
      () => translate(entry),
      (error) => error.message.includes(JSON.stringify(entry)),
      entry,
    );
  }
});

test("the port of toRegexp answers as Sonar's WildcardPattern class did", () => {
  for (const [pattern, path, matches] of [
    ["**/legacy.ts", "legacy.ts", true],
    ["**/legacy.ts", "packages/core/src/sub/legacy.ts", true],
    ["packages/*/legacy.ts", "packages/react/src/legacy.ts", false],
    ["**/packages/*/**/legacy.ts", "packages/react/src/legacy.ts", true],
    ["**/**.d.ts", "packages/core/src/deep/more.d.ts", true],
    ["*.tsx", "packages/core/src/a.tsx", false],
    ["**/**.tsx", "packages/core/src/a.tsx", true],
    ["a.b", "a.b", true],
    ["a.b", "axb", false],
    ["x(y)/**", "x(y)/z", true],
    ["a+b/*.ts", "a+b/c.ts", true],
    ["?.ts", "a.ts", true],
    ["a**b", "axyzb", true],
    ["a**b", "a/x/b", true],
    ["a/**b/c", "a/x/b/c", true],
    ["/packages/react/src/ink.ts", "packages/react/src/ink.ts", true],
    ["/packages/react/src/ink.ts", "/packages/react/src/ink.ts/", true],
    ["//packages/react/src/ink.ts", "packages/react/src/ink.ts", false],
    ["src/**", "packages/preact/src/a.ts", false],
    ["**/src/**", "packages/preact/src/a.ts", true],
  ]) {
    assert.equal(sonarMatches(pattern, path), matches, `${pattern} ~ ${path}`);
  }
});

/** The matrix: files under the scan roots, same names in different roots among them. */
const FILES = [
  "packages/preact/src/a.ts",
  "packages/preact/src/deep/b.ts",
  "packages/hash-plugin/src/c.ts",
  "packages/react/src/legacy.ts",
  "packages/react/src/legacy.ssr.ts",
  "packages/react/src/ink.ts",
  "packages/react/src/x.react-server.ts",
  "packages/react/src/deep/y.react-server.ts",
  "packages/react/src/dom-utils/d.ts",
  "packages/react/src/browser-env/e.ts",
  "packages/react/src/shared-ssr/f.ts",
  "packages/validation-plugin/src/type-guards/g.ts",
  "packages/validation-plugin/src/type-guards/deep/h.ts",
  "shared/browser-env/state-guard.ts",
  "shared/browser-env/other.ts",
  "shared/dom-utils/legacy.ts",
  "packages/core/src/types.d.ts",
  "packages/core/src/deep/more.d.ts",
  "packages/core/src/index.ts",
  "packages/core/src/legacy.ts",
  "packages/core/src/legacy.tsx",
  "packages/core/src/a.tsx",
  "packages/core/src/sub/legacy.ts",
  "packages/p/src/deep/legacy.ts",
  "packages/a-b/src/x_y.ts",
  "packages/core/src/src/inner.ts",
  "packages/core/src/ink.ts",
];

/**
 * The files jscpd analyses in a fixture of `FILES`, run as the gate runs it:
 * once over all the scan roots, from the fixture's root, without `--absolute`,
 * so an entry meets each path as walked from a root given on the command line.
 * `ignore` is the list of a configuration of the cell's own, and `undefined`
 * leaves jscpd the fixture's `.jscpd.json`, found as the gate finds it. A row of
 * the report names its file from its scan root, so the same names in two roots
 * are told apart by size.
 *
 * @param {string} root
 * @param {string[]} [ignore]
 * @returns {Set<string>}
 */
function analysed(root, ignore) {
  const out = mkdtempSync(join(tmpdir(), "cpd-exclusions-report-"));
  try {
    const args = [];
    if (ignore !== undefined) {
      const config = join(out, "config.json");
      writeFileSync(
        config,
        JSON.stringify({
          ignore,
          format: ["typescript", "tsx"],
          absolute: false,
          gitignore: true,
          minLines: 2,
          minTokens: 5,
        }),
      );
      args.push("-c", config);
    }
    const roots = [
      ...readdirSync(join(root, "packages")).map(
        (name) => `packages/${name}/src/`,
      ),
      "shared/",
    ].filter((dir) => existsSync(join(root, dir)));
    // The `threshold` of `.jscpd.json` fails the run on the fixture's clones,
    // after the report is written.
    const run = spawnSync(
      JSCPD,
      [
        ...roots,
        ...args,
        "--summary",
        "--summary-top",
        "1000",
        "-r",
        "json",
        "-o",
        out,
        "--no-tips",
      ],
      { cwd: root, stdio: "ignore" },
    );
    assert.ok(run.status === 0 || run.status === 1, `jscpd: ${run.status}`);
    const report = JSON.parse(
      readFileSync(join(out, "jscpd-report.json"), "utf8"),
    );
    const bySize = new Map(
      FILES.map((file, index) => [Buffer.byteLength(source(index)), file]),
    );
    return new Set(
      report.summary.files.map((row) => {
        const file = bySize.get(row.bytes);
        assert.ok(
          file?.endsWith(`/${row.path}`),
          `report row ${row.path} of ${row.bytes} bytes`,
        );
        return file;
      }),
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

test("by each translated entry, Sonar leaves out the files jscpd does", () => {
  assert.ok(existsSync(JSCPD), `no jscpd binary at ${JSCPD}`);
  const { ignore } = JSON.parse(
    readFileSync(join(ROOT, ".jscpd.json"), "utf8"),
  );
  const entries = [
    ...ignore,
    "legacy.ts",
    "src/**",
    "packages/*/legacy.ts",
    "/packages/react/src/ink.ts",
    "//packages/react/src/ink.ts",
    "*.tsx",
    "packages/*/src/*.ts",
    "packages/*",
    "shared/**",
    "**/deep/**",
    "packages/**/legacy.ts",
    "**",
    "*",
    "packages/react/src/*-server.ts",
    "**/legacy.*",
    "packages/*/src/*/legacy.ts",
    "packages/*/src/**",
    // The fixture's own directory has a `-` in its name: an absolute path
    // would meet this entry in every file.
    "*-*",
  ];
  const root = fixture(FILES);
  try {
    // With no `ignore`, jscpd analyses every file, each under its own path.
    assert.deepEqual([...analysed(root, [])].sort(), [...FILES].sort());

    let otherwise = 0;
    for (const entry of entries) {
      const kept = analysed(root, [entry]);
      const jscpd = FILES.filter((file) => !kept.has(file));
      const pattern = translate(entry);
      const sonar = FILES.filter((file) => sonarMatches(pattern, file));
      assert.deepEqual(sonar, jscpd, `${entry} -> ${pattern}`);
      const untranslated = FILES.filter((file) => sonarMatches(entry, file));
      if (untranslated.join() !== jscpd.join()) otherwise++;
    }
    // Entries Sonar reads otherwise untranslated keep the matrix from passing
    // a translation that changes nothing.
    assert.ok(
      otherwise >= 5,
      `${otherwise} entries read otherwise untranslated`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given the repository's .jscpd.json, jscpd leaves out what the translated list does", () => {
  const { ignore } = JSON.parse(
    readFileSync(join(ROOT, ".jscpd.json"), "utf8"),
  );
  const patterns = ignore.map(translate);
  const kept = FILES.filter(
    (file) => !patterns.some((pattern) => sonarMatches(pattern, file)),
  );
  assert.ok(kept.length > 0 && kept.length < FILES.length, kept.join());
  const root = fixture(FILES);
  try {
    copyFileSync(join(ROOT, ".jscpd.json"), join(root, ".jscpd.json"));

    assert.deepEqual([...analysed(root)].sort(), kept.sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A git repository with the files `render` reads, as the repository holds them
 * unless `change` says otherwise, and `files` under its roots.
 *
 * @param {{ jscpd?: (config: object) => object, raw?: string, bytes?: (text: string) => string | Buffer, duplicates?: string, properties?: string, files?: string[], extra?: (root: string) => void, after?: (root: string) => void }} [change]
 * @returns {string}
 */
function repository(change = {}) {
  const root = fixture(
    change.files ?? ["packages/p/src/a.ts", "shared/d/b.ts"],
  );
  const config = Object.fromEntries(JSCPD_KEYS.map((key) => [key, null]));
  Object.assign(config, {
    "//": ["reasons"],
    format: FORMAT,
    absolute: false,
    gitignore: true,
    ignore: ["packages/p/src/x.ts"],
  });
  const text =
    change.raw ?? JSON.stringify(change.jscpd ? change.jscpd(config) : config);
  writeFileSync(
    join(root, ".jscpd.json"),
    change.bytes ? change.bytes(text) : text,
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      scripts: { "lint:duplicates": change.duplicates ?? DUPLICATES },
    }),
  );
  writeFileSync(
    join(root, "sonar-project.properties"),
    change.properties ??
      "# Sonar\nsonar.projectKey=x\n\nsonar.exclusions=**/scripts/**,**/dist/**\n",
  );
  change.extra?.(root);
  const git = (...args) =>
    execFileSync("git", ["-c", "core.excludesFile=/dev/null", ...args], {
      cwd: root,
      env: GIT,
      stdio: "ignore",
    });
  git("init", "-q", "--template=");
  git("add", "-A");
  change.after?.(root);
  return root;
}

test("render translates the entries of a repository it knows", () => {
  const root = repository();
  try {
    assert.deepEqual(render(root), [
      "sonar.cpd.exclusions=**/packages/p/src/x.ts",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a key, a value, a line or a lint:duplicates command render does not know is refused by name", () => {
  const exclusions = "sonar.exclusions=**/dist/**";
  for (const [change, message] of [
    [{ jscpd: (c) => ({ ...c, pattern: "**/*.ts" }) }, /pattern/],
    [{ jscpd: (c) => ({ ...c, maxSize: "1kb" }) }, /maxSize/],
    [{ jscpd: (c) => ({ ...c, noGitignore: true }) }, /noGitignore/],
    [{ jscpd: ({ "//": _, ...c }) => c }, /holds the keys/],
    [
      { jscpd: (c) => ({ ...c, format: [...FORMAT, "markdown"] }) },
      /format is/,
    ],
    [{ jscpd: (c) => ({ ...c, absolute: true }) }, /absolute is true/],
    [{ jscpd: (c) => ({ ...c, "no-gitignore": true }) }, /no-gitignore/],
    [{ jscpd: (c) => ({ ...c, ignore: ["a,b"] }) }, /"a,b"/],
    [
      { jscpd: (c) => ({ ...c, ignore: [] }) },
      /ignore is not a non-empty array/,
    ],
    [{ files: ["packages/p/src/a.js"] }, /packages\/p\/src\/a\.js/],
    [{ raw: '{\n  // a comment\n  "ignore": []\n}\n' }, /\.jscpd\.json/],
    [{ bytes: (text) => `\ufeff${text}` }, /\.jscpd\.json: /],
    [
      {
        bytes: (text) =>
          Buffer.from(text.replace("reasons", "caf\xe9"), "latin1"),
      },
      /\.jscpd\.json: .*not valid/,
    ],
    [
      { bytes: (text) => text.replace("reasons", "\\ud800") },
      /a string jscpd does not read/,
    ],
    [
      { properties: `${exclusions}\nsonar.typescript.exclusions=**/gen/**\n` },
      /sonar\.typescript\.exclusions/,
    ],
    [
      { properties: `${exclusions}\nsonar.exclusions=**/x/**\n` },
      /"sonar\.exclusions=\*\*\/x\/\*\*"/,
    ],
    [
      {
        properties: `${exclusions}\nsonar.projectName=x\\\nsonar.organization=y\n`,
      },
      /not a line this reads/,
    ],
    [{ properties: ` ${exclusions}\n` }, /not a line this reads/],
    [{ properties: "sonar.exclusions=**/a b/**\n" }, /"\*\*\/a b\/\*\*"/],
    [
      {
        properties: "sonar.exclusions=**/dist/**,**/*.bench.ts\n",
        files: ["packages/p/src/a.ts", "packages/p/src/x.bench.ts"],
      },
      /x\.bench\.ts: under \*\*\/\*\.bench\.ts/,
    ],
    [{ duplicates: `${DUPLICATES} -i x` }, /lint:duplicates is/],
    [{ duplicates: `${DUPLICATES} --pattern x` }, /lint:duplicates is/],
    [{ duplicates: `${DUPLICATES} --max-size 1kb` }, /lint:duplicates is/],
    [{ duplicates: `${DUPLICATES} --no-gitignore` }, /lint:duplicates is/],
    [{ duplicates: `${DUPLICATES} -c other.json` }, /lint:duplicates is/],
    [{ duplicates: "jscpd packages/*/src/ --no-tips" }, /lint:duplicates is/],
    [{ duplicates: `${DUPLICATES} && true` }, /lint:duplicates is/],
  ]) {
    const root = repository(change);
    try {
      assert.throws(
        () => render(root),
        message,
        JSON.stringify(change, (k, v) =>
          typeof v === "function" ? String(v) : v,
        ),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("render hands the translated entries to the refusals", () => {
  const files = ["packages/p/src/a.ts", "packages/p/src/t.d.ts"];
  const covered = repository({
    files,
    jscpd: (c) => ({ ...c, ignore: ["**/*.d.ts"] }),
  });
  try {
    assert.deepEqual(render(covered), ["sonar.cpd.exclusions=**/**.d.ts"]);
  } finally {
    rmSync(covered, { recursive: true, force: true });
  }
  const bare = repository({ files });
  try {
    assert.throws(() => render(bare), /t\.d\.ts: a declaration file/);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test("a form the two tools read differently is refused by name, and the others are not", () => {
  const big = "packages/p/src/big.ts";
  const latin1 = "packages/p/src/latin1.ts";
  const bundle = "packages/p/src/bundle.ts";
  const banner = "packages/p/src/banner.ts";
  const late = "packages/p/src/late.ts";
  const root = repository({
    files: [
      "packages/p/src/a.ts",
      "packages/p/src/a.tsx",
      "packages/p/src/a.svelte",
      "packages/p/src/README.md",
      "packages/p/src/a.json",
      "packages/p/src/a.js",
      "packages/p/src/a.vue",
      "packages/p/src/.h.ts",
      "packages/p/src/sub/.ignore",
      "packages/p/src/vendor/a.ts",
      "packages/p/src/scripts/a.ts",
      "packages/p/src/b.d.ts",
      "packages/p/src/covered/c.d.ts",
      "packages/p/src/up/Vendor/a.ts",
      "packages/p/src/up/b.D.ts",
      "packages/p/src/gone.ts",
      "shared/d/a.ts",
      "shared/d/a.js",
      "shared/package.json",
    ],
    extra: (dir) => {
      writeFileSync(join(dir, big), "x".repeat(1_000_001));
      writeFileSync(join(dir, latin1), Buffer.from("caf\xe9\n", "latin1"));
      writeFileSync(join(dir, bundle), "/* built */\n(function () {})();\n");
      writeFileSync(
        join(dir, banner),
        "/*!\n * built\n */\n!function(e){}(this);\n",
      );
      writeFileSync(
        join(dir, late),
        `${"// x\n".repeat(600)}/* built */\n(function () {})();\n`,
      );
      for (const above of [".", "packages", "packages/p"]) {
        writeFileSync(join(dir, above, ".ignore"), "a.ts\n");
      }
      symlinkSync("a.ts", join(dir, "packages/p/src/link.ts"));
      symlinkSync("missing.ts", join(dir, "packages/p/src/nowhere.ts"));
      symlinkSync("a.ts", join(dir, "packages/p/src/gone-link.ts"));
      symlinkSync("../../../shared/d", join(dir, "packages/p/src/alias"));
      mkdirSync(join(dir, "packages", "q"));
      symlinkSync("../p/src", join(dir, "packages/q/src"));
      symlinkSync("p", join(dir, "packages/r"));
    },
    after: (dir) => {
      for (const gone of ["gone.ts", "gone-link.ts"]) {
        rmSync(join(dir, "packages/p/src", gone));
      }
    },
  });
  try {
    const refused = refusedFiles(
      root,
      ["**/scripts/**", "**/dist/**"],
      ["**/packages/p/src/covered/**"],
    );
    const named = (path) =>
      refused.filter((reason) => reason.startsWith(`${path}:`));
    for (const [path, reason] of [
      ["packages/p/src/a.js", /do not read alike/],
      ["packages/p/src/a.vue", /do not read alike/],
      ["packages/p/src/.h.ts", /hidden path/],
      ["packages/p/src/sub/.ignore", /\.ignore file/],
      ["packages/p/src/vendor/a.ts", /vendor\//],
      ["packages/p/src/scripts/a.ts", /\*\*\/scripts\/\*\*/],
      ["packages/p/src/b.d.ts", /declaration file/],
      ["packages/p/src/link.ts", /symbolic link to a file/],
      ["packages/p/src/nowhere.ts", /leads nowhere/],
      ["packages/p/src/up/Vendor/a.ts", /Vendor\//],
      ["packages/p/src/up/b.D.ts", /declaration file/],
      ["packages/q/src", /at or above a scan root/],
      ["packages/r", /at or above a scan root/],
      ["shared/d/a.js", /do not read alike/],
      [".ignore", /\.ignore file/],
      ["packages/.ignore", /\.ignore file/],
      ["packages/p/.ignore", /\.ignore file/],
      [big, /1,000,000 bytes/],
      [latin1, /UTF-8/],
      [bundle, /bundle/],
      [banner, /bundle/],
    ]) {
      assert.equal(named(path).length, 1, `${path} in ${refused.join(" | ")}`);
      assert.match(named(path)[0], reason, path);
    }
    for (const path of [
      "packages/p/src/a.ts",
      "packages/p/src/a.tsx",
      "packages/p/src/a.svelte",
      "packages/p/src/README.md",
      "packages/p/src/a.json",
      "packages/p/src/covered/c.d.ts",
      "packages/p/src/alias",
      "packages/p/src/gone.ts",
      "packages/p/src/gone-link.ts",
      late,
      "shared/d/a.ts",
      "shared/package.json",
    ]) {
      assert.deepEqual(named(path), [], path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("on the repository, render refuses nothing", () => {
  assert.match(render(ROOT)[0], /^sonar\.cpd\.exclusions=\*\*\//);
});
