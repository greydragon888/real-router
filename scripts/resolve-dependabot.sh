#!/bin/bash
# Resolve a CONFLICTING Dependabot PR with a rebase + squash, keeping master
# linear (no merge commit — see IMPLEMENTATION_NOTES "Squash-resolve …").
#
# Rebases the PR branch onto origin/master, auto-resolves package.json conflicts
# via scripts/resolve-dep-conflicts.mjs (semver-union: newest of each dep),
# regenerates the lockfile, re-applies the updates the PR's Dependabot commits
# name and checks that each survived (scripts/dependabot-updates.mjs), validates,
# then STOPS for review and prints the exact force-push + squash-merge commands.
# Nothing destructive (force-push / merge) happens unless you pass --merge.
#
# Three workspaces, three lockfiles: the root's, examples/'s and
# cross-router-bench/'s. Each step runs in the workspace the PR touches;
# the root validates with `pnpm build`, the examples by building every example
# against the npm releases their manifests pin — what someone who copies an
# example gets — and the cross-router bench by an n=1 smoke of its matrix.
#
# Usage:
#   pnpm resolve:dependabot <PR_NUMBER> [--merge]
#   bash scripts/resolve-dependabot.sh <PR_NUMBER> [--merge]
set -euo pipefail

PR=""
DO_MERGE=0
for arg in "$@"; do
  case "$arg" in
    --merge) DO_MERGE=1 ;;
    ''|*[!0-9]*) echo "❌ Expected a numeric PR number, got: $arg" >&2; exit 2 ;;
    *) PR="$arg" ;;
  esac
done
if [ -z "$PR" ]; then
  echo "Usage: pnpm resolve:dependabot <PR_NUMBER> [--merge]" >&2
  exit 2
fi

for tool in gh pnpm node git; do
  command -v "$tool" >/dev/null 2>&1 || { echo "❌ '$tool' is required but not found." >&2; exit 1; }
done

# Refuse to run on a dirty tree (untracked files are fine).
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "❌ Working tree has uncommitted changes — commit or stash first." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Resolving Dependabot PR #$PR (rebase + squash) ==="
git fetch origin master

BRANCH="$(gh pr view "$PR" --json headRefName --jq .headRefName)"
[ -n "$BRANCH" ] || { echo "❌ Could not resolve head branch for PR #$PR." >&2; exit 1; }
echo "📦 PR head branch: $BRANCH"

# Guard: only operate on Dependabot branches (#814). The branch name comes from
# `gh pr view` on an arbitrary PR number and is attacker-controlled — git-refs
# permit shell metacharacters (; | & $ ( )), which `dependabot/*` never carries.
# Restricting here both closes the injection vector and refuses a wrong-PR run
# before anything is fetched or checked out.
case "$BRANCH" in
  dependabot/*) ;;
  *) echo "❌ PR #$PR head branch is '$BRANCH', not a dependabot/* branch — refusing." >&2; exit 1 ;;
esac

git fetch origin "$BRANCH"

# The updates the PR carries, off Dependabot's commit metadata. A bump inside a
# `~` range changes no manifest, so a lockfile rebuilt from the manifests drops
# it: each rebuild below re-applies them, and the run ends by checking them.
UPDATES=()
while IFS= read -r spec; do
  if [ -n "$spec" ]; then UPDATES+=("$spec"); fi
done < <(git log --format=%B "origin/master..origin/$BRANCH" | node "$SCRIPT_DIR/dependabot-updates.mjs")
if [ "${#UPDATES[@]}" -gt 0 ]; then
  echo "📋 The PR's updates: ${UPDATES[*]}"
fi

git checkout -B "$BRANCH" "origin/$BRANCH"

rebase_in_progress() {
  [ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ] || \
  [ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]
}

echo "🔁 Rebasing $BRANCH onto origin/master ..."
git rebase origin/master || true

while rebase_in_progress; do
  CONFLICTED="$(git diff --name-only --diff-filter=U || true)"
  OTHER="$(echo "$CONFLICTED" | grep -vE '(^|/)package\.json$|^(examples/|cross-router-bench/)?pnpm-lock\.yaml$' || true)"
  if [ -n "$OTHER" ]; then
    echo "❌ Non-dependency conflicts need manual resolution:" >&2
    echo "$OTHER" | sed 's/^/    /' >&2
    echo "   The rebase is left in progress. Resolve, then \`git rebase --continue\`." >&2
    exit 1
  fi

  echo "🧩 Auto-resolving package.json conflicts (newest-of-each) ..."
  if ! node "$SCRIPT_DIR/resolve-dep-conflicts.mjs"; then
    echo "❌ Resolver could not safely resolve every conflict (see above)." >&2
    echo "   The rebase is left in progress for manual resolution." >&2
    exit 1
  fi

  for lock in pnpm-lock.yaml examples/pnpm-lock.yaml cross-router-bench/pnpm-lock.yaml; do
    if echo "$CONFLICTED" | grep -qx "$lock"; then
      echo "🔒 Regenerating $lock from merged manifests ..."
      git checkout origin/master -- "$lock"
      pnpm --dir "$(dirname "$lock")" install
      if [ "${#UPDATES[@]}" -gt 0 ]; then
        echo "↻ Re-applying the PR's updates in $(dirname "$lock") ..."
        pnpm --dir "$(dirname "$lock")" update -r "${UPDATES[@]}" --no-save
      fi
      pnpm --dir "$(dirname "$lock")" dedupe
    fi
  done

  git add -u  # tracked changes only — never sweep in untracked files
  GIT_EDITOR=true git rebase --continue || true
done

# The workspaces this PR touches: examples/ or cross-router-bench/ when a
# changed path is under it, the root when one is under neither. A Dependabot
# block covers one directory.
CHANGED="$(git diff --name-only origin/master...HEAD)"
WORKSPACES=""
if echo "$CHANGED" | grep -qvE '^(examples|cross-router-bench)/'; then WORKSPACES="."; fi
if echo "$CHANGED" | grep -q '^examples/'; then WORKSPACES="$WORKSPACES examples"; fi
if echo "$CHANGED" | grep -q '^cross-router-bench/'; then WORKSPACES="$WORKSPACES cross-router-bench"; fi
[ -n "$WORKSPACES" ] || WORKSPACES="."

# Normalize each lockfile to the final rebased manifests (covers clean-rebase case
# and any residual dedupe), folding the result into the (single) dep-bump commit.
for dir in $WORKSPACES; do
  echo "🔒 Reconciling the lockfile in $dir ..."
  pnpm --dir "$dir" install
  pnpm --dir "$dir" dedupe
done
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git add -u  # tracked changes only — never sweep in untracked files
  git commit --amend --no-edit >/dev/null
fi

for dir in $WORKSPACES; do
  echo "✅ Verifying dedupe in $dir ..."
  pnpm --dir "$dir" dedupe --check
done
if [ "${#UPDATES[@]}" -gt 0 ]; then
  for dir in $WORKSPACES; do
    echo "✅ Verifying the PR's updates in $dir ..."
    git log --format=%B "origin/master..origin/$BRANCH" |
      node "$SCRIPT_DIR/dependabot-updates.mjs" --check "$dir/pnpm-lock.yaml"
  done
fi

for dir in $WORKSPACES; do
  case "$dir" in
    examples)
      echo "🏗️  Validating (every example against the npm releases) ..."
      pnpm --dir examples -r --no-bail run --if-present build
      ;;
    cross-router-bench)
      # Builds and drives every app once, and writes nothing to results/.
      echo "🏗️  Validating (an n=1 smoke of the cross-router matrix) ..."
      pnpm --dir cross-router-bench exec playwright install chromium
      (cd cross-router-bench && BENCH_SMOKE=1 node run-all.mjs 1)
      ;;
    *)
      echo "🏗️  Validating (pnpm build) ..."
      pnpm build
      ;;
  esac
done

echo
echo "=== Resolved. Version changes vs origin/master: ==="
git diff origin/master -- '**/package.json' | grep -E '^[+-]\s+"' | grep -vE '^[+-]{3}' || echo "  (none)"
echo

# Printed as copy-paste hints in the review path below; in --merge they're run
# directly with quoted args, never via eval (#814).
PUSH_CMD="git push --force-with-lease origin \"$BRANCH\""
MERGE_CMD="gh pr merge $PR --squash --delete-branch"

if [ "$DO_MERGE" -eq 1 ]; then
  echo "🚀 --merge: force-pushing and squash-merging ..."
  git push --force-with-lease origin "$BRANCH"
  gh pr merge "$PR" --squash --delete-branch
  echo "✅ PR #$PR squash-merged."
else
  echo "🛑 Stopping for review (no force-push, no merge)."
  echo "   Inspect the rebased branch, then run:"
  echo "     $PUSH_CMD"
  echo "     $MERGE_CMD"
fi
