// @ts-check

/** @type {import("syncpack").RcFile} */
export default {
  lintFormatting: false,
  lintSemverRanges: true,
  lintVersions: true,
  sortFirst: ["name", "version", "type", "description", "main", "module", "types", "exports"],
  source: ["package.json", "packages/*/package.json"],
  semverGroups: [
    {
      label: "Ignore root package version (private, no version field)",
      packages: ["real-router"],
      dependencyTypes: ["local"],
      isIgnored: true,
    },
    {
      label: "Workspace packages use workspace:^",
      packages: ["**"],
      dependencies: ["@real-router/*", "core-types", "route-tree", "type-guards", "search-params"],
      dependencyTypes: ["prod", "dev", "peer"],
      range: "workspace:^",
    },
    {
      label: "Peer dependencies use >= ranges",
      packages: ["**"],
      dependencyTypes: ["peer"],
      range: ">=",
    },
    {
      label: "Pinned versions (save-exact)",
      packages: ["**"],
      dependencyTypes: ["prod", "dev"],
      range: "",
    },
  ],
  versionGroups: [
    {
      label: "Ignore pnpm overrides",
      packages: ["**"],
      dependencies: ["**"],
      dependencyTypes: ["pnpmOverrides"],
      isIgnored: true,
    },
    {
      label: "Ignore root package version (private, no version field)",
      packages: ["real-router"],
      dependencyTypes: ["local"],
      isIgnored: true,
    },
    {
      label: "Ensure consistent versions across packages",
      packages: ["**"],
      dependencies: ["**"],
      policy: "sameRange",
    },
  ],
};
