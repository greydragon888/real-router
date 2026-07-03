// probe-02: is RoutesStore.rootPath carried over by cloneRouter?
//
// rootPath lives in RoutesStore (routesStore.ts `rootPath: string`), is mutated
// by PluginApi.setRootPath (getPluginApi.ts:87-93 → RoutesNamespace.setRootPath
// :190-193, which rebuilds the tree). cloneRouter.ts reads only tree/config/
// forward/custom + getCloneState() {options, deps, pluginFactories} — rootPath
// is not among them, and the clone's constructor starts from rootPath "".
//
// Contract under test: cloneRouter jsdoc "Build an independent router instance
// that SHARES THE ROUTE TREE ... of `router`" (cloneRouter.ts:14-15) — the
// clone must resolve the same URLs as the base.
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

void (async () => {
  const base = createRouter([{ name: "user", path: "/users/:id" }]);

  getPluginApi(base).setRootPath("/app");

  const basePath = base.buildPath("user", { id: "1" });
  const baseRoot = getPluginApi(base).getRootPath();

  console.log(`base rootPath="${baseRoot}" buildPath(user)=${basePath}`);

  const clone = cloneRouter(base);
  const clonePath = clone.buildPath("user", { id: "1" });
  const cloneRoot = getPluginApi(clone).getRootPath();

  console.log(`clone rootPath="${cloneRoot}" buildPath(user)=${clonePath}`);

  // start() cross-check: the URL the base emits must be matchable by the clone
  // (SSR: base built the URL during a previous render, clone serves the request).
  const cloneStart = await clone.start(basePath).then(
    (s) => `resolved:${s.name}`,
    (e: { code?: string }) => `rejected:${e.code}`,
  );

  console.log(`clone.start("${basePath}") → ${cloneStart}`);

  const baseStart = await base.start(basePath).then(
    (s) => `resolved:${s.name}`,
    (e: { code?: string }) => `rejected:${e.code}`,
  );

  console.log(`base.start("${basePath}") → ${baseStart}`);

  const parity =
    basePath === clonePath && baseRoot === cloneRoot && cloneStart === baseStart;

  console.log(
    `verdict: ${parity ? "PARITY — rootPath carried over" : "DIVERGENCE — clone lost the base's rootPath"}`,
  );
})();
