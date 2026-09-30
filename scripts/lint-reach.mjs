// Which workspace packages are linted, in two layers (#2370, #2407):
//
//   - definition — the whole task graph: every package has a lint task, each
//     `shared/<dir>` is named by its consumer's lint command, and the package's
//     own ESLint config lints each tracked file of code that command names;
//   - executor — the turbo entries of a stage of the check registry: the stage
//     reads every package that has a lint task. `verify` runs those entries
//     word for word, so what is checked here is what runs.
//
// Pure functions: `check-lint-reach.mjs` feeds them the registry, turbo's
// dry-run output, the tracked tree and ESLint's answers;
// `check-lint-reach.test.mjs` feeds them fixtures.

import path from "node:path";

import { LINT_TASK_ROLES } from "./lint-tasks.mjs";

/** Tasks that run ESLint over a package. */
export const LINT_TASKS = new Set(Object.keys(LINT_TASK_ROLES));

/**
 * The extensions that hold no code. Every other tracked file is code, whether
 * or not a config addresses its extension, so a language no config reads yet
 * is named rather than skipped (#2556). The list is kept apart from the
 * configs it checks: derived from them, it was blind to `.vue`, which none of
 * them addressed. A new kind of file in a lint target fails the census until
 * it is added here.
 *
 * "" is a file with no extension: a symlink's entry, such as `src/dom-utils`.
 */
export const NOT_CODE = new Set([
  "",
  ".css",
  ".gitignore",
  ".gitkeep",
  ".html",
  ".icns",
  ".ico",
  ".json",
  ".lock",
  ".md",
  ".png",
  ".rs",
  ".sh",
  ".svg",
  ".toml",
]);

/**
 * @param {string} file
 * @returns {string} `.ts` for `a.d.ts`, `.gitignore` for `.gitignore`, "" for `LICENSE`
 */
export function extensionOf(file) {
  return /\.[^./]+$/.exec(path.posix.basename(file))?.[0] ?? "";
}

/** @param {string} file */
export const isCode = (file) => !NOT_CODE.has(extensionOf(file));

/**
 * The turbo entries of a stage of the check registry, split into tasks and
 * flags. The registry holds argv lists, so nothing is parsed out of shell text.
 *
 * ⚠ A flag with a separate value (`--filter pkg`) would read `pkg` as a task;
 * the known-task check then fails it rather than letting it pass unseen.
 *
 * @param {{ id: string, run: string[], stages: string[] }[]} checks
 * @param {string} stage
 * @returns {{ id: string, tasks: string[], flags: string[] }[]}
 */
export function turboEntries(checks, stage) {
  return checks
    .filter(
      ({ run, stages }) =>
        stages.includes(stage) &&
        run[0] === "pnpm" &&
        run[1] === "turbo" &&
        run[2] === "run",
    )
    .map(({ id, run }) => {
      const args = run.slice(3);
      return {
        id,
        tasks: args.filter((arg) => !arg.startsWith("-")),
        flags: args.filter((arg) => arg.startsWith("-")),
      };
    });
}

/**
 * Packages for which a lint task would execute a real command, read from
 * `turbo run … --dry=json`. A package without the script is listed with the
 * command `<NONEXISTENT>` and does not count.
 *
 * @param {{ tasks: { task: string, package: string, command: string }[] }} dryRun
 * @returns {Map<string, string[]>} package name → its lint commands
 */
export function lintedPackages(dryRun) {
  const linted = new Map();

  for (const { task, package: name, command } of dryRun.tasks) {
    if (LINT_TASKS.has(task) && command !== "<NONEXISTENT>") {
      linted.set(name, [...(linted.get(name) ?? []), command]);
    }
  }

  return linted;
}

/**
 * The `shared/<dir>` directories that no linted consumer names.
 *
 * ESLint does not walk into a symlinked directory it was not given, so a
 * consumer whose command lints `src/` alone does not read `src/<alias>`.
 *
 * @param {string[]} sharedDirs
 * @param {{ dir: string, pkg: string, alias: string }[]} aliases
 * @param {Map<string, string[]>} linted
 * @returns {string[]}
 */
export function unreadSharedDirs(sharedDirs, aliases, linted) {
  const names = (command, alias) =>
    command.split(/\s+/).some((word) => word.replace(/\/+$/, "") === alias);

  return sharedDirs.filter(
    (dir) =>
      !aliases.some(
        ({ dir: target, pkg, alias }) =>
          target === dir &&
          (linted.get(pkg) ?? []).some((command) => names(command, alias)),
      ),
  );
}

/**
 * The tracked files of this workspace: every file less those under a
 * directory that holds a `pnpm-workspace.yaml` of its own. Such a directory
 * is a separate workspace (`examples/`, `cross-router-bench/`), so no
 * package of this one owns its files — not even the package whose directory
 * holds it, and whose lint command names it by path.
 *
 * @param {string[]} trackedFiles
 * @returns {string[]}
 */
export function ownTrackedFiles(trackedFiles) {
  const roots = trackedFiles
    .filter((file) => path.posix.basename(file) === "pnpm-workspace.yaml")
    .map((file) => path.posix.dirname(file))
    .filter((dir) => dir !== ".");

  return trackedFiles.filter(
    (file) => !roots.some((root) => file.startsWith(`${root}/`)),
  );
}

/**
 * Workspace packages whose own tracked files hold no code: every file is of a
 * kind `NOT_CODE` lists. A file under a nested workspace package belongs to
 * that package.
 *
 * @param {{ name: string, dir: string }[]} packages
 * @param {string[]} trackedFiles
 * @returns {Set<string>}
 */
export function packagesWithNothingToRead(packages, trackedFiles) {
  const byDepth = [...packages].sort((a, b) => b.dir.length - a.dir.length);
  const reading = new Set();

  for (const file of trackedFiles) {
    if (!isCode(file)) {
      continue;
    }

    const owner = byDepth.find(({ dir }) => file.startsWith(`${dir}/`));

    if (owner !== undefined) {
      reading.add(owner.name);
    }
  }

  return new Set(
    packages.filter(({ name }) => !reading.has(name)).map(({ name }) => name),
  );
}

/**
 * The paths a package's lint commands name: each word after `eslint` that
 * names a path in the package, spelled as git spells it (`./src/` → `src`).
 * A flag and the usual flag values (`--cache`, `--ext .ts`, `--max-warnings
 * 0`) name none, so no list of flags is kept.
 *
 * ⚠ A flag's value that does name a path in the package (`-c
 * eslint.config.mjs`) is read as a target.
 *
 * ⚠ A command that is not an `eslint` invocation throws instead of being
 * skipped: a skipped command is a package whose files nobody counts.
 *
 * @param {string[]} commands
 * @param {(target: string) => boolean} exists whether a path is in the package
 * @returns {string[]} in first-named order
 */
export function lintTargets(commands, exists) {
  const targets = new Set();

  for (const command of commands) {
    const words = command.split(/\s+/);
    const at = words.indexOf("eslint");

    if (at === -1) {
      throw new Error(`a lint command this guard cannot read: ${command}`);
    }

    for (const word of words.slice(at + 1)) {
      const target = path.posix.normalize(word).replace(/\/+$/, "");

      if (word !== "" && exists(target)) {
        targets.add(target);
      }
    }
  }

  return [...targets];
}

/**
 * Code files a lint command reaches that no block of the package's own ESLint
 * config lints — a global `ignores`, or no `files` block for the extension —
 * less the ones `deliberate` names.
 *
 * @param {{ pkg: string, file: string, repoPath: string, linted: boolean }[]} census
 *   `file` from the package's directory, `repoPath` from the repository's
 * @param {Map<string, string>} deliberate repository path → why its package's
 *   config ignores it
 * @returns {Map<string, string[]>} package → its unlinted files
 */
export function unlintedFiles(census, deliberate) {
  const unlinted = new Map();

  for (const { pkg, file, repoPath, linted } of census) {
    if (!linted && isCode(file) && !deliberate.has(repoPath)) {
      unlinted.set(pkg, [...(unlinted.get(pkg) ?? []), file]);
    }
  }

  return unlinted;
}

/**
 * The `deliberate` entries that excuse nothing: no lint command reaches the
 * file, or its package's config lints it now.
 *
 * @param {{ repoPath: string, file: string, linted: boolean }[]} census
 * @param {Map<string, string>} deliberate
 * @returns {string[]}
 */
export function staleDeliberate(census, deliberate) {
  const excusable = new Set(
    census
      .filter(({ file, linted }) => !linted && isCode(file))
      .map(({ repoPath }) => repoPath),
  );

  return [...deliberate.keys()].filter((repoPath) => !excusable.has(repoPath));
}

/**
 * @param {object} input
 * @param {string[]} input.workspace package names, the root excluded
 * @param {Map<string, string[]>} input.linted
 * @param {Set<string>} input.nothingToRead
 * @param {Map<string, string>} input.exempt name → the issue that tracks it
 * @param {string} input.sharedPackage read through consumers instead
 * @param {string[]} input.unreadShared
 */
export function reachVerdict({
  workspace,
  linted,
  nothingToRead,
  exempt,
  sharedPackage,
  unreadShared,
}) {
  return {
    unreached: workspace.filter(
      (name) =>
        !linted.has(name) &&
        !nothingToRead.has(name) &&
        !exempt.has(name) &&
        name !== sharedPackage,
    ),
    staleExemptions: [...exempt.keys()].filter(
      (name) => !workspace.includes(name) || linted.has(name),
    ),
    unreadShared,
  };
}

/**
 * Both layers, with turbo injected.
 *
 * @param {object} input
 * @param {{ id: string, tasks: string[], flags: string[] }[]} input.runs the
 *   turbo entries of the stage, from {@link turboEntries}
 * @param {Set<string>} input.knownTasks the task names in turbo.json
 * @param {(run: { tasks: string[], flags: string[] }) => { tasks: object[] }} input.dryRun
 * @param {{ name: string, dir: string }[]} input.packages the root excluded
 * @param {string[]} input.trackedFiles
 * @param {string[]} input.sharedDirs
 * @param {{ dir: string, pkg: string, alias: string }[]} input.aliases
 * @param {Map<string, string>} input.exempt
 * @param {string} input.sharedPackage
 */
export function evaluateReach({
  runs,
  knownTasks,
  dryRun,
  packages,
  trackedFiles,
  sharedDirs,
  aliases,
  exempt,
  sharedPackage,
}) {
  for (const { id, tasks } of runs) {
    for (const task of tasks) {
      if (!knownTasks.has(task)) {
        throw new Error(`${id}: \`${task}\` is not a task in turbo.json`);
      }
    }
  }

  const workspace = packages.map(({ name }) => name);
  const linted = lintedPackages(dryRun({ tasks: [...LINT_TASKS], flags: [] }));
  const byStage = new Map();

  for (const run of runs) {
    for (const [name, commands] of lintedPackages(dryRun(run))) {
      byStage.set(name, [...(byStage.get(name) ?? []), ...commands]);
    }
  }

  let vacuous = null;

  if (runs.length === 0) {
    vacuous = "the stage has no `pnpm turbo run` entry in the registry";
  } else if (workspace.length === 0) {
    vacuous = "the workspace lists no packages";
  } else if (linted.size === 0) {
    vacuous = "no lint task lints any package";
  } else if (byStage.size === 0) {
    vacuous = "no turbo entry of the stage lints any package";
  } else if (workspace.includes(sharedPackage) && sharedDirs.length === 0) {
    vacuous = `${sharedPackage} is in the workspace but no shared/<dir> was found`;
  }

  return {
    runs,
    linted,
    byStage,
    vacuous,
    unrun: [...linted.keys()].filter(
      (name) => !byStage.has(name) && !exempt.has(name),
    ),
    ...reachVerdict({
      workspace,
      linted,
      nothingToRead: packagesWithNothingToRead(packages, trackedFiles),
      exempt,
      sharedPackage,
      unreadShared: unreadSharedDirs(sharedDirs, aliases, linted),
    }),
  };
}
