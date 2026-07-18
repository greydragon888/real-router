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
        "engine",
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
      // UI frameworks, third-party routers, and testing libraries are dev/test/
      // example-only — they never ship to consumers (published adapters expose
      // them via peerDependency ranges, governed by the ">= ranges" group above).
      // Float the PATCH (`~`, not `^` — a minor can carry behavioural change and
      // stays reviewed) so `pnpm update` pulls the latest patch and Dependabot can
      // stay quiet on patch bumps (see .github/dependabot.yml "float-set" ignores).
      // @angular/* is included so the whole framework floats in lockstep: its
      // packages have EXACT cross-peer requirements (router@x needs core@x
      // exactly), so a single-package bump breaks strictPeerDependencies — hence
      // Dependabot ignores @angular/* entirely and the set moves together via
      // `pnpm update` (this replaced the old `@angular/router` pnpm override).
      label: "UI frameworks, routers, testing libs float latest patch (~)",
      packages: ["**"],
      dependencies: [
        "react",
        "react-dom",
        "preact",
        "preact-render-to-string",
        "solid-js",
        "svelte",
        "vue",
        "@angular/*",
        "@testing-library/*",
        "@tanstack/*",
        "@solidjs/*",
        "react-router",
        "react-router-dom",
        "vue-router",
        "wouter",
        "sv-router",
        "@mateothegreat/svelte5-router",
      ],
      dependencyTypes: ["prod", "dev"],
      range: "~",
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
        "engine",
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
