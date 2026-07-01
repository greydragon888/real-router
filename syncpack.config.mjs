// @ts-check

/** @type {import("syncpack").RcFile} */
export default {
  sortFirst: [
    "name",
    "version",
    "type",
    "description",
    "main",
    "module",
    "types",
    "exports",
  ],
  source: [
    "package.json",
    "packages/*/package.json",
    "benchmarks/package.json",
    "!packages/*/dist/**",
    "!packages/*/coverage/**",
  ],
  semverGroups: [
    {
      label: "Ignore local package versions",
      packages: ["**"],
      dependencyTypes: ["local"],
      isIgnored: true,
    },
    {
      label: "Workspace packages use workspace:^",
      packages: ["**"],
      dependencies: [
        "@real-router/*",
        "core-types",
        "route-tree",
        "type-guards",
        "logger",
        "search-params",
        "browser-env",
        "dom-utils",
      ],
      // No "peer": a @real-router/* peer dep must NOT be forced to workspace:^
      // (on 0.x, ^0.x.y is patch-only → any minor bump triggers a major via
      // changesets — CLAUDE.md "Never use workspace:^ for peerDependencies on
      // 0.x"). Peer deps fall through to the ">= ranges" group below.
      dependencyTypes: ["prod", "dev"],
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
    // REQUIRED — not dead after the pnpm 11 migration. syncpack 15.x reads pnpm
    // `overrides` from pnpm-workspace.yaml as well as the legacy package.json#pnpm
    // location, so this `pnpmOverrides` ignore still matches. Verified: removing
    // it makes `@types/node: $@types/node` trip SameRangeMismatch against the
    // pinned devDependency. (The pnpm-11 migration analysis assumed this group
    // would go dead — it does not.)
    {
      label: "Ignore pnpm overrides",
      packages: ["**"],
      dependencies: ["**"],
      dependencyTypes: ["pnpmOverrides"],
      isIgnored: true,
    },
    {
      label: "Ignore local package versions",
      packages: ["**"],
      dependencyTypes: ["local"],
      isIgnored: true,
    },
    {
      // Preact adapter spans Preact 10.28+ and Preact 11 beta — the
      // compound peer range `>=10.28.0 || ^11.0.0-0` can't be compared
      // with `sameRange` policy against the pinned example versions.
      label: "Ignore preact peer dependency range",
      packages: ["@real-router/preact"],
      dependencies: ["preact"],
      dependencyTypes: ["peer"],
      isIgnored: true,
    },
    {
      label: "Workspace packages use workspace:^ protocol",
      dependencies: [
        "@real-router/*",
        "core-types",
        "route-tree",
        "type-guards",
        "logger",
        "search-params",
        "event-emitter",
        "path-matcher",
        "browser-env",
        "dom-utils",
      ],
      // prod/dev only — peer deps must NOT be pinned to workspace:^ (on 0.x,
      // ^0.x.y is patch-only → minor bump → unwanted major via changesets #822;
      // this is the root the cap-major-bumps.mjs workaround papered over). Peer
      // ranges are governed by the ">= ranges" semverGroup instead. Without this
      // exclusion the pin overrode that intent (DiffersToPin).
      dependencyTypes: ["prod", "dev"],
      pinVersion: "workspace:^",
      policy: "pinned",
    },
    {
      label: "Ensure consistent versions across packages",
      packages: ["**"],
      dependencies: ["**"],
      policy: "sameRange",
    },
  ],
};
