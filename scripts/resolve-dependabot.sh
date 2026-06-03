#!/bin/bash
# Resolve a CONFLICTING Dependabot PR with a rebase + squash, keeping master
# linear (no merge commit — see IMPLEMENTATION_NOTES "Squash-resolve …").
#
# Rebases the PR branch onto origin/master, auto-resolves package.json conflicts
# via scripts/resolve-dep-conflicts.mjs (semver-union: newest of each dep),
# regenerates the lockfile, validates with `pnpm build`, then STOPS for review
# and prints the exact force-push + squash-merge commands. Nothing destructive
# (force-push / merge) happens unless you pass --merge.
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

git fetch origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"

rebase_in_progress() {
  [ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ] || \
  [ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]
}

echo "🔁 Rebasing $BRANCH onto origin/master ..."
git rebase origin/master || true

while rebase_in_progress; do
  CONFLICTED="$(git diff --name-only --diff-filter=U || true)"
  OTHER="$(echo "$CONFLICTED" | grep -vE '(^|/)package\.json$|^pnpm-lock\.yaml$' || true)"
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

  if echo "$CONFLICTED" | grep -q '^pnpm-lock.yaml$'; then
    echo "🔒 Regenerating pnpm-lock.yaml from merged manifests ..."
    git checkout origin/master -- pnpm-lock.yaml
    pnpm install
    pnpm dedupe
  fi

  git add -A
  GIT_EDITOR=true git rebase --continue || true
done

# Normalize lockfile to the final rebased manifests (covers clean-rebase case and
# any residual dedupe), folding the result into the (single) dep-bump commit.
echo "🔒 Reconciling lockfile ..."
pnpm install
pnpm dedupe
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git add -A
  git commit --amend --no-edit >/dev/null
fi

echo "✅ Verifying dedupe ..."
pnpm dedupe --check

echo "🏗️  Validating (pnpm build) ..."
pnpm build

echo
echo "=== Resolved. Version changes vs origin/master: ==="
git diff origin/master -- '**/package.json' | grep -E '^[+-]\s+"' | grep -vE '^[+-]{3}' || echo "  (none)"
echo

PUSH_CMD="git push --force-with-lease origin $BRANCH"
MERGE_CMD="gh pr merge $PR --squash --delete-branch"

if [ "$DO_MERGE" -eq 1 ]; then
  echo "🚀 --merge: force-pushing and squash-merging ..."
  eval "$PUSH_CMD"
  eval "$MERGE_CMD"
  echo "✅ PR #$PR squash-merged."
else
  echo "🛑 Stopping for review (no force-push, no merge)."
  echo "   Inspect the rebased branch, then run:"
  echo "     $PUSH_CMD"
  echo "     $MERGE_CMD"
fi
