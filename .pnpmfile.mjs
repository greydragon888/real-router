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

    return pkg;
  },
};
