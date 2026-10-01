// danger declares undici twice — a dependency (`^7.16.0`) and an optional
// peer — and pnpm resolves such a dependency as the peer, which nothing
// installs by itself. Without a provider, danger's `require("undici")` falls
// through to whatever copy is hoisted (jsdom's 8.x, outside danger's ranges).
// Dropping the peer declaration makes the dependency danger's own again.
// IMPLEMENTATION_NOTES: "undici: danger installs its own copy".
export const hooks = {
  readPackage(pkg) {
    if (pkg.name === "danger" && pkg.peerDependencies?.undici) {
      delete pkg.peerDependencies.undici;
      delete pkg.peerDependenciesMeta?.undici;
    }

    // @vue/test-utils declares @vue/server-renderer as an optional peer. The
    // renderer requires vue at its own exact version, and a lockfile update of
    // vue alone leaves the peer at the old one, which `strictPeerDependencies`
    // refuses — the Dependabot runs of 2026-10-01. No test renders through
    // test-utils' SSR helpers, and vue brings a renderer of its own.
    // IMPLEMENTATION_NOTES: "The patches group takes production dependencies
    // only".
    if (
      pkg.name === "@vue/test-utils" &&
      pkg.peerDependencies?.["@vue/server-renderer"]
    ) {
      delete pkg.peerDependencies["@vue/server-renderer"];
      delete pkg.peerDependenciesMeta?.["@vue/server-renderer"];
    }

    return pkg;
  },
};
