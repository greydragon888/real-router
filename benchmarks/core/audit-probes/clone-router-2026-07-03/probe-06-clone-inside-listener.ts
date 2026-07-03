// probe-06: cloneRouter called from INSIDE a transition listener / a
// subscribeChanges handler. Cloning is not a navigation and not a route-CRUD
// op, so neither the REENTRANT_NAVIGATION ban (#1030/§4) nor the
// REENTRANT_TREE_MUTATION ban (#1032) should apply — but nothing pins that.
//
// New surface since the 2026-05-22 audit (reentrancy model #1030-#1035).
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

void (async () => {
  // --- inside router.subscribe (TRANSITION_SUCCESS dispatch on the stack) ---
  const base = createRouter([
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ]);

  await base.start("/");

  let subscribeVerdict = "listener not called";

  base.subscribe(() => {
    try {
      const c = cloneRouter(base);

      subscribeVerdict = `clone OK mid-subscribe (isActive=${c.isActive()}, state=${String(c.getState())})`;
    } catch (e) {
      subscribeVerdict = `threw mid-subscribe: ${(e as { code?: string }).code ?? (e as Error).message}`;
    }
  });

  await base.navigate("about");
  console.log(subscribeVerdict);

  // --- inside subscribeChanges (TREE_CHANGED emit on the stack, #1032 window) ---
  const base2 = createRouter([{ name: "home", path: "/" }]);
  let changesVerdict = "handler not called";

  getRoutesApi(base2).subscribeChanges(() => {
    try {
      const c = cloneRouter(base2);

      changesVerdict = `clone OK mid-TREE_CHANGED (routes has new? ${getRoutesApi(c).has("added")})`;
    } catch (e) {
      changesVerdict = `threw mid-TREE_CHANGED: ${(e as { code?: string }).code ?? (e as Error).message}`;
    }
  });

  getRoutesApi(base2).add([{ name: "added", path: "/added" }]);
  console.log(changesVerdict);
})();
