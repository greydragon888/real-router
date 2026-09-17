#!/usr/bin/env node
// Every workspace package is read by a lint step of the pre-push hook, or is
// named in EXEMPT with the issue that tracks it (#2370).
//
// ⚠ "Read" is derived, never listed. The hook's own `turbo run` lines are
// replayed with `--dry=json`, and a package counts only when a lint task would
// execute a real command for it. A package with no lint script and a hook
// filter that drops a workspace glob therefore fail alike.
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateReach } from "./lint-reach.mjs";

const ROOT = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
const HOOK = ".husky/pre-push";
const SHARED_PACKAGE = "@real-router/shared-sources";

/** No lint step reads these yet. An entry that stops being true fails the check. */
const EXEMPT = new Map([["router-benchmarks", "#2390"]]);

const sh = (command, args) =>
  execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 ** 3,
    stdio: ["ignore", "pipe", "pipe"],
  });

const packages = JSON.parse(sh("pnpm", ["ls", "-r", "--depth", "-1", "--json"]))
  .map(({ name, path: dir }) => ({
    name,
    dir: path.relative(ROOT, realpathSync(dir)),
  }))
  .filter(({ dir }) => dir !== "");

const trackedFiles = sh("git", ["ls-files"]).split("\n").filter(Boolean);

const sharedDirs = [
  ...new Set(
    trackedFiles
      .filter((file) => file.startsWith("shared/") && file.split("/").length > 2)
      .map((file) => file.split("/")[1]),
  ),
];

const aliases = [];

for (const entry of readdirSync(path.join(ROOT, "packages"))) {
  const src = path.join(ROOT, "packages", entry, "src");
  let children;

  try {
    children = readdirSync(src);
  } catch {
    continue;
  }

  const { name } = JSON.parse(
    readFileSync(path.join(ROOT, "packages", entry, "package.json"), "utf8"),
  );

  for (const child of children) {
    const link = path.join(src, child);

    if (!lstatSync(link).isSymbolicLink()) {
      continue;
    }

    const target = path.relative(
      path.join(ROOT, "shared"),
      path.resolve(src, readlinkSync(link)),
    );

    if (!target.startsWith("..") && !target.includes(path.sep)) {
      aliases.push({ dir: target, pkg: name, alias: `src/${child}` });
    }
  }
}

const started = Date.now();
const result = evaluateReach({
  hookText: readFileSync(path.join(ROOT, HOOK), "utf8"),
  knownTasks: new Set(
    Object.keys(
      JSON.parse(readFileSync(path.join(ROOT, "turbo.json"), "utf8")).tasks,
    ),
  ),
  dryRun: ({ tasks, flags }) =>
    JSON.parse(sh("pnpm", ["turbo", "run", ...tasks, ...flags, "--dry=json"])),
  packages,
  trackedFiles,
  sharedDirs,
  aliases,
  exempt: EXEMPT,
  sharedPackage: SHARED_PACKAGE,
});

if (result.vacuous) {
  console.error(`lint:reach: refusing to pass over nothing — ${result.vacuous}.`);
  process.exit(2);
}

const failures = [
  ...result.unreached.map(
    (name) =>
      `${name}: no lint step of ${HOOK} reads it — give it a lint script the hook runs, or name it in EXEMPT with an issue`,
  ),
  ...result.staleExemptions.map(
    (name) => `${name}: EXEMPT names it, but it is linted now or no longer exists — drop the entry`,
  ),
  ...result.unreadShared.map(
    (dir) =>
      `shared/${dir}: no linted consumer names its symlink, and ESLint does not follow one it was not given`,
  ),
];

if (failures.length > 0) {
  console.error(`✖ lint:reach — ${String(failures.length)} problem(s):`);

  for (const failure of failures) {
    console.error(`   ${failure}`);
  }

  process.exit(1);
}

console.log(
  `✓ lint:reach: ${String(result.linted.size)} of ${String(packages.length)} workspace packages linted by ${HOOK}` +
    ` (${String(result.runs.length)} turbo run(s), ${String(Date.now() - started)} ms);` +
    ` shared/ read through consumers; exempt: ${[...EXEMPT].map(([name, issue]) => `${name} ${issue}`).join(", ") || "none"}.`,
);
