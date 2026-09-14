#!/usr/bin/env node
// CodSpeed gate: does a base..head range reach the program the benchmarks
// measure? `codspeed.yml` asks before its two self-hosted jobs start, so a
// "no" never occupies the runner's single slot.
//
// The measured program is DERIVED, not listed:
//   - the harness: the suites' own directories, their workflow and setup
//     action, `.nvmrc` and the root tsconfig;
//   - the workspace packages the suites load: `@real-router/core` plus the
//     workspace dependencies of `benchmarks/package.json`, closed over
//     `dependencies` and `peerDependencies`, and the `shared/` directories
//     their `src` links into;
//   - the third-party closure: every `name@version` in `pnpm-lock.yaml`
//     reachable from a package the harness imports.
//
// A source file counts as changed only when esbuild — the transformer `tsx`
// runs for the core suite — emits different JavaScript for it once whitespace
// and comments are stripped, so a comment or a type annotation never runs the
// suites.
//
// ⚠ Fails OPEN. Any error prints a warning and answers `run=true`: a run that
// need not have happened costs one slot, while a skipped run that should have
// happened hands its shift to the next comparison.
//
// Usage: node scripts/codspeed-gate.mjs --base <sha> --head <sha> [--merge-base]
// IMPLEMENTATION_NOTES "CodSpeed runs only when the measured program changes".

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The suites' own trees: a change here is a change to the measurement. */
export const SUITE_DIRS = [
  "packages/core/tests/benchmarks/",
  "benchmarks/adapter-bench/",
  "benchmarks/plugin-seam/",
];

/** Everything whose change reaches the measurement unconditionally. */
export const HARNESS = [
  ...SUITE_DIRS,
  ".github/workflows/codspeed.yml",
  ".github/actions/setup/",
  ".nvmrc",
];

/** Importers the suites resolve third-party packages from. */
const HARNESS_IMPORTERS = ["benchmarks", "packages/core", "."];

/** A package the harness runs without importing: `node --import tsx`. */
const IMPLICIT_ROOTS = ["tsx"];

/** Manifest fields `pnpm-lock.yaml` already answers for, or that never run. */
const RESOLVED_ELSEWHERE = [
  "version",
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "optionalDependencies",
];

const LOADERS = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
};

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"'./][^"']*)["']/g;

/** The package a bare specifier names: `react-dom/client` → `react-dom`. */
export function packageOf(specifier) {
  if (specifier.startsWith("node:")) {
    return undefined;
  }

  const parts = specifier.split("/");

  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Third-party packages a set of sources imports. Workspace packages excluded. */
export function importedPackages(sources) {
  const names = new Set();

  for (const source of sources) {
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      const name = packageOf(specifier);

      if (name && !name.startsWith("@real-router/")) {
        names.add(name);
      }
    }
  }

  return names;
}

function unquote(value) {
  return value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1)
    : value;
}

/** `'@scope/a@1.0.0': {}` / `a@1.0.0(b@2.0.0):` → the snapshot key. */
function keyOf(content) {
  if (content.startsWith("'")) {
    return content.slice(1, content.indexOf("'", 1));
  }

  return content.replace(/:( \{\})?$/, "");
}

/** `'@scope/a': 1.0.0` / `a: 1.0.0(b@2.0.0)` → [name, version]. */
function entryOf(content) {
  if (content.startsWith("'")) {
    const end = content.indexOf("'", 1);

    return [
      content.slice(1, end),
      unquote(content.slice(end + 1).replace(/^:\s*/, "")),
    ];
  }

  const colon = content.indexOf(":");

  return [content.slice(0, colon), unquote(content.slice(colon + 1).trim())];
}

/**
 * The two parts of a v9 `pnpm-lock.yaml` the closure needs: each importer's
 * resolved versions, and the snapshot graph.
 *
 * ⚠ A line reader for the shape pnpm writes, not a YAML parser. The test file
 * runs it over this repository's own lockfile and pins what it must reach.
 */
export function parseLockfile(text) {
  const importers = new Map();
  const snapshots = new Map();
  let section = "";
  let importer;
  let snapshot;
  let group;
  let dependency;

  for (const line of text.split("\n")) {
    const content = line.trim();

    if (content === "" || content.startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      section = content.replace(/:.*$/, "");
    } else if (section === "importers") {
      if (indent === 2) {
        importer = new Map();
        importers.set(keyOf(content), importer);
      } else if (indent === 4) {
        group = content.replace(/:$/, "");
      } else if (indent === 6) {
        dependency = unquote(content.replace(/:$/, ""));
      } else if (
        indent === 8 &&
        group !== "dependenciesMeta" &&
        content.startsWith("version:")
      ) {
        importer.set(dependency, unquote(content.slice(8).trim()));
      }
    } else if (section === "snapshots") {
      if (indent === 2) {
        snapshot = new Map();
        snapshots.set(keyOf(content), snapshot);
        group = "";
      } else if (indent === 4) {
        group = content.replace(/:$/, "");
      } else if (
        indent === 6 &&
        (group === "dependencies" || group === "optionalDependencies")
      ) {
        const [name, version] = entryOf(content);

        snapshot.set(name, version);
      }
    }
  }

  return { importers, snapshots };
}

/** Every snapshot key reachable from `roots` through the harness importers. */
export function closure(lock, roots) {
  const keys = new Set();
  const queue = [];

  for (const name of roots) {
    for (const importer of HARNESS_IMPORTERS) {
      const version = lock.importers.get(importer)?.get(name);

      if (version && !version.startsWith("link:")) {
        queue.push(`${name}@${version}`);
      }
    }
  }

  while (queue.length > 0) {
    const key = queue.pop();

    if (keys.has(key)) {
      continue;
    }

    keys.add(key);

    for (const [name, version] of lock.snapshots.get(key) ?? []) {
      if (!version.startsWith("link:")) {
        queue.push(`${name}@${version}`);
      }
    }
  }

  return keys;
}

/**
 * A closure as package versions: peer suffixes dropped, type-only packages out.
 *
 * ⚠ pnpm keys a snapshot by the versions of its peers and hashes the suffix
 * once it grows long, so a `@types/node` bump renames `vite`'s snapshot
 * without changing a line vite runs. The peers are nodes of the closure in
 * their own right, so a runtime peer that moves is still seen.
 */
export function runtimeVersions(keys) {
  const versions = new Set();

  for (const key of keys) {
    const bare = key.replace(/\(.*$/, "");

    if (!bare.startsWith("@types/")) {
      versions.add(bare);
    }
  }

  return versions;
}

/** Does a manifest differ in anything the lockfile does not already answer? */
export function manifestChanged(before, after) {
  const strip = (text) => {
    if (text === undefined) {
      return undefined;
    }

    const manifest = JSON.parse(text);

    for (const field of RESOLVED_ELSEWHERE) {
      delete manifest[field];
    }

    return JSON.stringify(manifest);
  };

  return strip(before) !== strip(after);
}

/** Loads the esbuild that `tsx` runs, so the gate transforms as the suite does. */
export function loadEsbuild(root = REPO_ROOT) {
  const fromCore = createRequire(path.join(root, "packages/core/package.json"));
  const tsx = path.dirname(fromCore.resolve("tsx/package.json"));

  return createRequire(path.join(tsx, "package.json"))("esbuild");
}

/**
 * Do two versions of a source file emit the same JavaScript, whitespace and
 * comments aside?
 *
 * ⚠ `minifyWhitespace` is what makes a comment not count. A plain transform
 * keeps a JSDoc block that sits before a class member — measured on
 * `ed3e8947d`, a docblock added above `#navigateToState` — while it drops one
 * before a function. Identifiers and syntax are left as written, and a
 * `@__PURE__` annotation survives, because it changes what a bundler keeps.
 */
export function sameProgram(before, after, loader, esbuild) {
  if (before === undefined || after === undefined) {
    return false;
  }

  const emit = (code) =>
    esbuild.transformSync(code, {
      loader,
      format: "esm",
      target: "esnext",
      legalComments: "none",
      minifyWhitespace: true,
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;

  return emit(before) === emit(after);
}

function workspaceDependencies(manifest, fields) {
  return fields.flatMap((field) =>
    Object.entries(manifest[field] ?? {})
      .filter(([, range]) => String(range).startsWith("workspace:"))
      .map(([name]) => name),
  );
}

/** The workspace packages the suites load at `rev`, and the `shared/` they link. */
function measuredScope(git, show, rev) {
  const byName = new Map();

  for (const dir of git("ls-tree", "--name-only", `${rev}:packages`)
    .split("\n")
    .filter(Boolean)) {
    const text = show(rev, `packages/${dir}/package.json`);

    if (text !== undefined) {
      const manifest = JSON.parse(text);

      byName.set(manifest.name, { dir: `packages/${dir}`, manifest });
    }
  }

  const benchmarks = JSON.parse(show(rev, "benchmarks/package.json") ?? "{}");
  const queue = [
    "@real-router/core",
    ...workspaceDependencies(benchmarks, ["dependencies", "devDependencies"]),
  ];
  const packageDirs = new Set();

  while (queue.length > 0) {
    const entry = byName.get(queue.pop());

    if (entry === undefined || packageDirs.has(entry.dir)) {
      continue;
    }

    packageDirs.add(entry.dir);
    queue.push(
      ...workspaceDependencies(entry.manifest, [
        "dependencies",
        "peerDependencies",
      ]),
    );
  }

  const sharedDirs = new Set();

  for (const dir of packageDirs) {
    let listing = "";

    try {
      listing = git("ls-tree", `${rev}:${dir}/src`);
    } catch {
      continue;
    }

    for (const line of listing.split("\n").filter(Boolean)) {
      const [meta, name] = line.split("\t");

      if (meta.startsWith("120000")) {
        const target = (show(rev, `${dir}/src/${name}`) ?? "").trim();
        const resolved = path.posix.normalize(
          path.posix.join(`${dir}/src`, target),
        );

        if (resolved.startsWith("shared/")) {
          sharedDirs.add(resolved);
        }
      }
    }
  }

  return { packageDirs, sharedDirs };
}

/** What kind of input a changed path is, or `undefined` for none. */
export function classify(file, scope) {
  // Documents live inside `src` here too (`ARCHITECTURE.md`, `CLAUDE.md`), and
  // nothing loads them.
  if (/\.mdx?$/.test(file)) {
    return undefined;
  }

  if (
    HARNESS.some((entry) =>
      entry.endsWith("/") ? file.startsWith(entry) : file === entry,
    ) ||
    /^tsconfig[^/]*\.json$/.test(file)
  ) {
    return "harness";
  }

  if (file === "pnpm-lock.yaml") {
    return "lockfile";
  }

  if (file === "benchmarks/package.json") {
    return "manifest";
  }

  for (const dir of scope.sharedDirs) {
    if (file.startsWith(`${dir}/`)) {
      return "source";
    }
  }

  for (const dir of scope.packageDirs) {
    if (!file.startsWith(`${dir}/`)) {
      continue;
    }

    const rel = file.slice(dir.length + 1);

    if (rel.startsWith("src/")) {
      return "source";
    }

    if (rel === "package.json") {
      return "manifest";
    }

    if (
      rel.startsWith("tests/") ||
      rel.endsWith(".md") ||
      /^(vitest|eslint|stryker)\.config\./.test(rel)
    ) {
      return undefined;
    }

    return "build-config";
  }

  return undefined;
}

function symmetricDifference(a, b) {
  return [
    ...[...a].filter((key) => !b.has(key)).map((key) => `-${key}`),
    ...[...b].filter((key) => !a.has(key)).map((key) => `+${key}`),
  ].toSorted((x, y) => x.slice(1).localeCompare(y.slice(1)));
}

/**
 * The decision for a range. With `mergeBase`, `base` is the target branch and
 * the range starts at their merge base, as a pull request's diff does.
 */
export function gate({
  root = REPO_ROOT,
  base,
  head,
  mergeBase = false,
  esbuild,
}) {
  if (!base) {
    return { run: true, reasons: ["no measured base to compare against"] };
  }

  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const show = (rev, file) => {
    try {
      return git("show", `${rev}:${file}`);
    } catch {
      return undefined;
    }
  };
  const commit = (rev) =>
    git("rev-parse", "--verify", `${rev}^{commit}`).trim();

  const to = commit(head);
  const from = commit(mergeBase ? git("merge-base", base, to).trim() : base);

  try {
    git("merge-base", "--is-ancestor", from, to);
  } catch {
    return {
      run: true,
      reasons: [`base ${from} is not an ancestor of ${to}`],
      from,
      to,
    };
  }

  const changed = git("diff", "--name-only", "--no-renames", from, to)
    .split("\n")
    .filter(Boolean);
  const before = measuredScope(git, show, from);
  const after = measuredScope(git, show, to);
  const scope = {
    packageDirs: new Set([...before.packageDirs, ...after.packageDirs]),
    sharedDirs: new Set([...before.sharedDirs, ...after.sharedDirs]),
  };
  const reasons = [];

  for (const file of changed) {
    const kind = classify(file, scope);

    if (kind === "harness") {
      reasons.push(`harness: ${file}`);
    } else if (kind === "build-config") {
      reasons.push(`build config of a measured package: ${file}`);
    } else if (kind === "manifest") {
      if (manifestChanged(show(from, file), show(to, file))) {
        reasons.push(`manifest: ${file}`);
      }
    } else if (kind === "source") {
      const loader = LOADERS[path.extname(file)];

      if (loader === undefined) {
        reasons.push(`source esbuild cannot compare: ${file}`);
      } else {
        esbuild ??= loadEsbuild();

        if (!sameProgram(show(from, file), show(to, file), loader, esbuild)) {
          reasons.push(`emitted code changed: ${file}`);
        }
      }
    } else if (kind === "lockfile") {
      const roots = importedPackages(
        git("ls-tree", "-r", "--name-only", to, "--", ...SUITE_DIRS)
          .split("\n")
          .filter((name) => /\.(?:[cm]?[jt]sx?|svelte|vue)$/.test(name))
          .map((name) => show(to, name) ?? ""),
      );

      for (const name of IMPLICIT_ROOTS) {
        roots.add(name);
      }

      const drift = symmetricDifference(
        runtimeVersions(closure(parseLockfile(show(from, file) ?? ""), roots)),
        runtimeVersions(closure(parseLockfile(show(to, file) ?? ""), roots)),
      );

      if (drift.length > 0) {
        reasons.push(
          `measured dependencies moved: ${drift.slice(0, 6).join(" ")}${
            drift.length > 6 ? ` (+${String(drift.length - 6)} more)` : ""
          }`,
        );
      }
    }
  }

  return {
    run: reasons.length > 0,
    reasons,
    changed: changed.length,
    from,
    to,
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      base: { type: "string", default: "" },
      head: { type: "string", default: "HEAD" },
      "merge-base": { type: "boolean", default: false },
      root: { type: "string", default: REPO_ROOT },
    },
  });
  let result;

  try {
    result = gate({
      root: values.root,
      base: values.base,
      head: values.head,
      mergeBase: values["merge-base"],
    });
  } catch (error) {
    console.log(`::warning::CodSpeed gate failed open: ${error.message}`);
    result = { run: true, reasons: [`gate error: ${error.message}`] };
  }

  console.log(`CodSpeed: ${result.run ? "RUN" : "skip"}`);

  if (result.from && result.to) {
    console.log(
      `range ${result.from.slice(0, 9)}..${result.to.slice(0, 9)}, ${String(result.changed ?? "?")} changed file(s)`,
    );
  }

  for (const reason of result.reasons.slice(0, 20)) {
    console.log(`  - ${reason}`);
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `run=${String(result.run)}\nreason=${(result.reasons[0] ?? "nothing measured changed").replaceAll("\n", " ")}\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
