// check-id.mjs — the identifier of the check a command runs.
//
// One home for the rule that pairs a hook line, a workflow line and a command
// of the check registry (`scripts/checks.mjs`): `ci-hook-parity.test.mjs` pairs
// hooks with workflows by it, and `checks-registry-transition.test.mjs` holds
// the registry to the checks the hooks and Repo Lints ran before it.

/**
 * The identifier of a check, or `undefined` for a command that runs none.
 *
 * A check is an npm script whose name starts with `lint` or `test`, or the
 * `node --test` suite. Flags, filters and a surrounding subshell are stripped,
 * so the hook and the workflow pair by WHAT they run rather than by how the line
 * happens to be written today.
 *
 * `pnpm turbo run <task>` is deliberately not a check here: task-level coverage
 * is `check-lint-reach.mjs`'s axis, and it answers a different question — which
 * workspaces a hook's lint steps read.
 *
 * @param {string} command a single shell command
 * @returns {string | undefined}
 */
export function checkId(command) {
  const text = command
    .trim()
    .replace(/^\(\s*unset \$\([^)]*\);\s*/, "")
    .replace(/\)$/, "")
    .trim();

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
