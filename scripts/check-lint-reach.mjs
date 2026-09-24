#!/usr/bin/env node
// Every workspace package is read by a lint step of the pre-push hook, or is
// named in EXEMPT with the issue that tracks it (#2370). The package's own
// ESLint config also lints each tracked file of code its lint command names
// (#2407), in every workspace package that has one (#2556).
//
// ⚠ "Read" is derived, never listed. The hook's own `turbo run` lines are
// replayed with `--dry=json`, and a package counts only when a lint task would
// execute a real command for it. A package with no lint script and a hook
// filter that drops a workspace glob therefore fail alike.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

import { DELIBERATE } from "./lint-reach-deliberate.mjs";
import {
  evaluateReach,
  lintTargets,
  staleDeliberate,
  unlintedFiles,
} from "./lint-reach.mjs";

const ROOT = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
const HOOK = ".husky/pre-push";
const SHARED_PACKAGE = "@real-router/shared-sources";

/** No lint step reads these yet. An entry that stops being true fails the check. */
const EXEMPT = new Map();

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
      .filter(
        (file) => file.startsWith("shared/") && file.split("/").length > 2,
      )
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
  console.error(
    `lint:reach: refusing to pass over nothing — ${result.vacuous}.`,
  );
  process.exit(2);
}

// The file census (#2407): each tracked file a package's lint command names,
// asked of that package's own config. One ESLint instance answers for every
// package, since ESLint 10 looks the config up from the file. A file the root
// config's global ignores cover is the repository's policy, not the package's,
// so it is left out. The `shared/` files behind a consumer's symlink are
// outside it: the census sees the symlink's entry, which is not code.
const rootConfig = path.join(ROOT, "eslint.config.mjs");
const policy = new ESLint({ cwd: ROOT, overrideConfigFile: rootConfig });
const policyAddressing = new ESLint({
  cwd: ROOT,
  overrideConfigFile: rootConfig,
  ignore: false,
});
// `isPathIgnored` also answers true for a file no block addresses, so the
// root's policy is a file the root ignores and would lint with ignores off.
const policyIgnores = async (file) =>
  (await policy.isPathIgnored(file)) &&
  !(await policyAddressing.isPathIgnored(file));
const linting = new ESLint({ cwd: ROOT });
const census = [];
const countless = [];
let scoped = 0;

for (const { name, dir } of packages) {
  const commands = result.linted.get(name);

  if (commands === undefined) {
    continue;
  }

  scoped += 1;
  const home = path.join(ROOT, dir);
  const targets = lintTargets(commands, (target) =>
    existsSync(path.join(home, target)),
  );
  let counted = 0;

  for (const file of trackedFiles) {
    const own = file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : null;
    const named =
      own !== null &&
      targets.some(
        (target) =>
          target === "." || own === target || own.startsWith(`${target}/`),
      );

    if (named && !(await policyIgnores(path.join(ROOT, file)))) {
      counted += 1;
      census.push({
        pkg: name,
        file: own,
        repoPath: file,
        linted: (await linting.calculateConfigForFile(file)) !== undefined,
      });
    }
  }

  if (counted === 0) {
    countless.push(name);
  }
}

if (census.length > 0 && !census.some(({ linted }) => linted)) {
  console.error(
    "lint:reach: refusing to pass over nothing — no config lints any file of the census.",
  );
  process.exit(2);
}

const unlinted = unlintedFiles(census, DELIBERATE);

const failures = [
  ...result.unreached.map(
    (name) =>
      `${name}: no lint step of ${HOOK} reads it — give it a lint script the hook runs, or name it in EXEMPT with an issue`,
  ),
  ...result.staleExemptions.map(
    (name) =>
      `${name}: EXEMPT names it, but it is linted now or no longer exists — drop the entry`,
  ),
  ...result.unreadShared.map(
    (dir) =>
      `shared/${dir}: no linted consumer names its symlink, and ESLint does not follow one it was not given`,
  ),
  ...countless.map(
    (name) =>
      `${name}: its lint command names no tracked file, so none of it is counted`,
  ),
  ...[...unlinted].map(
    ([name, files]) =>
      `${name}: ${String(files.length)} file(s) its lint command reaches, and no block of its ESLint config lints — ${files.slice(0, 3).join(", ")}${files.length > 3 ? ", …" : ""}; a global \`ignores\` or a missing \`files\` block hides them — or, for a kind of file that is not code, add its extension to NOT_CODE`,
  ),
  ...staleDeliberate(census, DELIBERATE).map(
    (repoPath) =>
      `${repoPath}: DELIBERATE names it, but no lint command reaches it or its config lints it now — drop the entry`,
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
    ` shared/ read through consumers; exempt: ${[...EXEMPT].map(([name, issue]) => `${name} ${issue}`).join(", ") || "none"};` +
    ` ${String(census.filter(({ linted }) => linted).length)} of ${String(census.length)} tracked files in ${String(scoped)} packages linted by their own config, the rest not code or named in DELIBERATE.`,
);
