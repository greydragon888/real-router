// Tarball substitution for this workspace — inert unless RR_TARBALLS names a
// directory of `pnpm pack` output (`scripts/checkout-tarballs.mjs` writes one).
//
// ⚠ `overrides`, not `readPackage`: they reach every edge of the graph, peers
// included. `@real-router/core` is a peer in every tarball, and a project that
// declares an adapter but not core (the `*-examples-shared` aggregators) gets it
// through `autoInstallPeers`, an edge `readPackage` never sees — measured, that
// bundled a second core from the registry.
//
// ⚠ `peerDependencyRules` for @real-router/* in this mode only: a peer range such
// as `>=0.148.0` does not accept the version `file:…`, and
// `strictPeerDependencies` refuses the install (ERR_PNPM_PEER_DEP_ISSUES).
//
// ⚠ Editing this file changes `pnpmfileChecksum` in pnpm-lock.yaml: commit them
// together, or `--frozen-lockfile` refuses the install.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.RR_TARBALLS;
const tarballs = {};

if (dir) {
  for (const file of readdirSync(dir)) {
    const match = /^real-router-(.+)-\d+\.\d+\.\d+(?:-[0-9a-f]+)?\.tgz$/.exec(
      file,
    );

    if (match) tarballs[`@real-router/${match[1]}`] = `file:${join(dir, file)}`;
  }
}

export const hooks = {
  updateConfig(config) {
    if (dir) {
      config.overrides = { ...config.overrides, ...tarballs };
      config.peerDependencyRules = {
        ...config.peerDependencyRules,
        allowAny: [
          ...(config.peerDependencyRules?.allowAny ?? []),
          "@real-router/*",
        ],
      };
    }

    return config;
  },
};
