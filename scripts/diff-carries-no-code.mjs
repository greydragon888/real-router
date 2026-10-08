#!/usr/bin/env node
// diff-carries-no-code.mjs — does this diff hold anything the pipeline checks?
//
//   git diff --no-renames --name-only <base> <head> | node scripts/diff-carries-no-code.mjs
//   NO_CODE on stdout, exit 0 = Markdown and CI configuration alone
//   anything else, exit 1     = code, or no changed paths
//
// `ci.yml`'s `check` job answers `should_run` with it, and with `should_run` not
// `true` the gate requires no job of the pipeline to have run, so a wrong "no
// code" passes a pull request no build or test ran on. The step takes "no code"
// only from the NO_CODE line: a crash before that line, a run that never
// answers and an empty diff all run the pipeline.
//
// CI configuration is `.github/` outside `.github/actions/`. The composite
// actions run in every build job, so a change there is code the pipeline
// exercises; a workflow file has Repo Lints on every pull request and
// actionlint on every one but Dependabot's for a package, and Markdown has
// prose-lint.
//
// A path is taken as git prints it: a name with a space at either end is that
// name, not a shorter one.

/** The line that answers "no code". */
export const NO_CODE = "no code in this diff";

/**
 * A path the pipeline does not check: Markdown anywhere, or a file under
 * `.github/` outside `.github/actions/`.
 *
 * @param {string} path a changed path, repository-relative
 * @returns {boolean}
 */
export const isNotCode = (path) =>
  path.endsWith(".md") ||
  (path.startsWith(".github/") && !path.startsWith(".github/actions/"));

const cleaned = (paths) => paths.filter((p) => p !== "");

/**
 * Whether the diff holds nothing the pipeline checks.
 *
 * An empty list answers `false`: nothing changed is not an answer, and running
 * the pipeline is the safe side.
 *
 * @param {string[]} paths changed paths, repository-relative
 * @returns {boolean}
 */
export function carriesNoCode(paths) {
  const changed = cleaned(paths);

  return changed.length > 0 && changed.every(isNotCode);
}

/** The paths that make it a diff with code in it — what the step reports. */
export function codePaths(paths) {
  return cleaned(paths).filter((p) => !isNotCode(p));
}

export function main(stdin) {
  const paths = stdin.split("\n");

  if (carriesNoCode(paths)) {
    process.stdout.write(`${NO_CODE}\n`);
    return 0;
  }

  const found = codePaths(paths);

  process.stdout.write(
    found.length > 0
      ? `code in this diff: ${found.slice(0, 5).join(", ")}${found.length > 5 ? ` (+${String(found.length - 5)} more)` : ""}\n`
      : "no changed paths\n",
  );
  return 1;
}

if (import.meta.main) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.exit(main(Buffer.concat(chunks).toString("utf8")));
}
