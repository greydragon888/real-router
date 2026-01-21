export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation only changes
        "style", // Changes that do not affect the meaning of the code
        "refactor", // Code change that neither fixes a bug nor adds a feature
        "perf", // Performance improvements
        "test", // Adding missing tests or correcting existing tests
        "build", // Changes that affect the build system or external dependencies
        "ci", // Changes to CI configuration files and scripts
        "chore", // Other changes that don't modify src or test files
        "revert", // Reverts a previous commit
        "release", // Release commit
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "core",
        "core-types",
        "route-tree",
        "search-params",
        "type-guards",
        "helpers",
        "browser-plugin",
        "logger-plugin",
        "persistent-params-plugin",
        "react",
        "benchmarks",
        "deps",
        "config",
        "ci",
      ],
    ],
    "scope-empty": [0], // Allow empty scope
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 100],
  },
};
