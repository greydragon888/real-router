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
  // syncpack reads `optionalDependencies` only through a type that names them.
  customTypes: {
    optional: { strategy: "versionsByName", path: "optionalDependencies" },
  },
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
      ],
      // No "peer": `workspace:^` is not a semver range, so syncpack applies none
      // from this group, and a peer listed here would skip the ">= ranges" group
      // below — a `^0.x` peer would pass, while on 0.x `^0.x.y` is patch-only: a
      // core minor leaves the range and every consumer hits a peer conflict.
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
      // UI frameworks and testing libraries are dev/test-only — they never ship
      // to consumers (published adapters expose them via peerDependency ranges,
      // governed by the ">= ranges" group above, except the preact adapter's
      // `preact` peer, which a version group below ignores).
      // Float the PATCH (`~`, not `^` — a minor can carry behavioural change and
      // stays reviewed): a patch then moves the lockfile alone, and Dependabot
      // brings it every week without touching the range
      // (`increase-if-necessary`, see .github/dependabot.yml).
      // @angular/* is included so the whole framework floats in lockstep: its
      // packages have EXACT cross-peer requirements (router@x needs core@x
      // exactly), so a single-package bump breaks strictPeerDependencies — hence
      // Dependabot ignores @angular/* entirely and the set moves together via
      // `pnpm update`.
      label: "UI frameworks and testing libs float latest patch (~)",
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
        "@solidjs/*",
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
    {
      // turbo reads `optionalDependencies` before `devDependencies`, so an
      // entry there with a version hides the edge the `workspace:^` entry in
      // `devDependencies` gives. Banned, not checked for its form:
      // `scripts/tests/peer-edges.test.mjs` then needs only the entry's
      // presence, and runs syncpack with this file on fixtures.
      label: "No @real-router/* in optionalDependencies",
      packages: ["**"],
      dependencies: ["@real-router/*"],
      dependencyTypes: ["optional"],
      isBanned: true,
    },
    {
      // A published package with core in `dependencies` installs a second copy
      // of core for a consumer whose core is a minor ahead, with npm even
      // beside a peer entry. Core identifies a router by identity, so a plugin
      // of that package that reaches core's internals refuses the consumer's
      // router. Core is a peer, with its `workspace:^` entry in
      // `devDependencies`. The filter is the package name: `router-benchmarks`
      // is not published and keeps core here.
      label: "No @real-router/core in the dependencies of a published package",
      packages: ["@real-router/*"],
      dependencies: ["@real-router/core"],
      dependencyTypes: ["prod"],
      isBanned: true,
    },
    // Required: syncpack reads the `overrides` of pnpm-workspace.yaml as the type
    // `pnpmOverrides` (not those of package.json#pnpm), and without this group
    // `@types/node: $@types/node` there trips SameRangeMismatch against the
    // pinned devDependency.
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
      // with `sameRange` policy against the `~` ranges the workspace declares
      // for preact elsewhere.
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
      ],
      // prod/dev only — peer deps must NOT be pinned to workspace:^: on 0.x,
      // ^0.x.y is patch-only, so a core minor leaves the range and every
      // consumer sees a peer conflict. Peer ranges are governed by the
      // ">= ranges" semverGroup instead. With "peer" here, the pin would report
      // every peer floor as DiffersToPin.
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
