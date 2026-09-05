#!/bin/bash

# Prose linting for the Markdown corpus, via Vale.
#
# ⚑ WHY only `.md`. The source tree already has better guards than a word list:
# `comment-historiography-authority` calibrates "used to" against the
# instrumental sense, and its count table excludes framework versions and
# distances by lookbehind. Vale has neither lookbehind nor that calibration, so
# pointing it at `packages/*/src` would replace a precise ratchet with a blunt
# one. What `.md` has is the opposite problem: the #2111 census READ those 29
# files, but no FORM ratchet reaches them at all.
#
# Scope comes from `.vale.ini`, and gitignored trees — `.claude/**` above all —
# are out of it by owner decision.
#
# Skips gracefully when Vale is absent, matching lint:audit and lint:security:
# a fresh clone is never wedged. Install with:
#   brew install vale
#
# Usage: ./scripts/check-prose.sh [path ...]

set -e

if ! command -v vale >/dev/null 2>&1; then
  echo "⚠️  vale not found — skipping prose lint."
  echo "    Install with: brew install vale"
  echo "    (Hook stays non-blocking.)"
  exit 0
fi

# Tracked Markdown only: `git ls-files` excludes every ignored tree structurally,
# rather than by a list of directory names that is always one entry short.
#
# ⚠ CHANGELOG.md is excluded because changesets generate it — its prose is a
# record of what shipped, which is exactly the place history BELONGS.
if [ "$#" -gt 0 ]; then
  TARGETS=("$@")
else
  # shellcheck disable=SC2207 # paths in this repository carry no spaces
  TARGETS=($(git ls-files '*.md' | grep -v 'CHANGELOG\.md$'))
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
  echo "No Markdown to lint."
  exit 0
fi

echo "Linting ${#TARGETS[@]} Markdown file(s) with Vale…"
vale "${TARGETS[@]}"
