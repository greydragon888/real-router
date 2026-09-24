// Files a package's own ESLint config ignores on purpose, each with its reason
// (#2556). `lint:reach` reads a package-level `ignores` as the defect #2407 was
// — every component of a package hidden by one — unless the file is named
// here. An entry whose file no lint command reaches, or that its config lints
// now, fails the check.
//
// Kept out of `check-lint-reach.mjs` so that the CLI's test fixtures, which run
// byte copies of it, supply their own.

/** @type {Map<string, string>} repository path → why its package ignores it */
export const DELIBERATE = new Map([
  [
    "benchmarks/cross-router/deck/deck-config.js",
    "a deck template, not JavaScript: the build replaces its placeholders (#2390)",
  ],
  [
    "benchmarks/cross-router/deck/deck-render.js",
    "a deck template, not JavaScript: the build replaces its placeholders (#2390)",
  ],
]);
