// check-id.mjs — the identifier of the check a command runs.
//
// One home for the rule that pairs a workflow line, or a root script, with a
// command of the check registry (`scripts/checks.mjs`): `checks-registry.test.mjs`
// asks it which check a line runs and which root scripts the registry runs.

/**
 * The prefix that starts a command in an environment of `PATH` and `HOME`
 * alone, so nothing an earlier step exported — `NODE_OPTIONS` among it — reaches
 * it. Repo Lints runs `node:skip-facts` behind it; a line is read as the command
 * after it, and no other form of `env` is.
 */
export const CLEAN_ENV = '/usr/bin/env -i PATH="$PATH" HOME="$HOME" ';

/** A line without the exact `CLEAN_ENV` prefix it may start with. */
export const withoutCleanEnv = (line) =>
  line.startsWith(CLEAN_ENV) ? line.slice(CLEAN_ENV.length) : line;

/**
 * The identifier of a check, or `undefined` for a command that runs none.
 *
 * A check is an npm script whose name starts with `lint` or `test`, or the
 * `node --test` suite. Flags, filters, a surrounding subshell and the
 * `CLEAN_ENV` prefix are stripped, so the hook and the workflow pair by WHAT
 * they run rather than by how the line happens to be written today.
 *
 * `pnpm turbo run <task>` is deliberately not a check here: a turbo line is held
 * by the tasks it names, which `checks-registry.test.mjs` reads, and
 * `check-lint-reach.mjs` asks which workspaces they reach.
 *
 * @param {string} command a single shell command
 * @returns {string | undefined}
 */
export function checkId(command) {
  const text = withoutCleanEnv(
    command
      .trim()
      .replace(/^\(\s*unset \$\([^)]*\);\s*/, "")
      .replace(/\)$/, "")
      .trim(),
  );

  const suite = /^node --test\b(.*)$/.exec(text);
  if (suite) {
    const target = suite[1]
      .split(/\s+/)
      .filter((word) => word && !word.startsWith("-"))
      .join(" ");
    return target ? `node --test ${target}` : undefined;
  }

  const script = /^pnpm ((?:lint|test)[\w:-]*)(?:\s|$)/.exec(text);
  return script ? script[1] : undefined;
}
