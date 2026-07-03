// probe-10: TREE_CHANGED channel vs dispose/clearAll — the axis the 2026-05-22
// probe-08 could not know (channel landed in #717, guard in #982, isDispatching
// in #1034).
//
// Contracts: core CLAUDE.md "Routes Mutation Events" — dispose() releases all
// subscribeChanges listeners during the clearAll events step; after disposal
// subscribeChanges throws ROUTER_DISPOSED (incl. pre-bound refs).
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

void (async () => {
  const r = createRouter([{ name: "home", path: "/" }]);

  await r.start("/");

  let fires = 0;
  const routes = getRoutesApi(r);

  routes.subscribeChanges(() => {
    fires++;
  });

  routes.add([{ name: "a", path: "/a" }]);
  console.log(`1. before dispose: TREE_CHANGED fires=${fires} (expect 1)`);

  // pre-bound reference captured BEFORE dispose (#982 hazard shape)
  const preBound = routes.subscribeChanges.bind(routes);

  r.dispose();

  // No emit source remains — and the listener registry is cleared; verify a
  // late registration attempt throws rather than silently re-registering.
  let direct = "no-throw";

  try {
    routes.subscribeChanges(() => {});
  } catch (e) {
    direct = `threw:${(e as { code?: string }).code}`;
  }

  let bound = "no-throw";

  try {
    preBound(() => {});
  } catch (e) {
    bound = `threw:${(e as { code?: string }).code}`;
  }

  console.log(`2. after dispose: subscribeChanges direct=${direct} preBound=${bound} (expect ROUTER_DISPOSED both)`);
  console.log(`3. fires stayed at ${fires} (no post-dispose events)`);
})();
