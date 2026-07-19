// probe-05: a plugin factory that throws when re-run on the clone — what does
// the caller observe, and is the base router unaffected?
//
// Test-gap A14b (no vitest coverage). Documents CURRENT behaviour: cloneRouter
// propagates the throw (fail-fast, no half-broken clone returned), and the
// base keeps working. PluginsNamespace.use() multi-factory path rolls back
// already-initialized plugins of the same batch (PluginsNamespace.ts:118-135).
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

import type { PluginFactory } from "@real-router/core";

void (async () => {
  let runs = 0;
  const goodTeardowns: string[] = [];

  const goodPlugin: PluginFactory = () => ({
    teardown() {
      goodTeardowns.push("good");
    },
  });

  // Throws only on the SECOND run (i.e. on the clone).
  const flakyPlugin: PluginFactory = () => {
    runs++;

    if (runs > 1) {
      throw new Error("flaky factory refuses re-instantiation");
    }

    return {};
  };

  const base = createRouter([{ name: "home", path: "/" }]);

  base.usePlugin(goodPlugin, flakyPlugin);

  let cloneResult = "no-throw";

  try {
    cloneRouter(base);
  } catch (e) {
    cloneResult = `threw: ${(e as Error).message}`;
  }

  console.log(`cloneRouter(base) with a flaky plugin → ${cloneResult}`);
  console.log(
    `rollback: good plugin's teardown fired during batch rollback = ${JSON.stringify(goodTeardowns)}`,
  );

  // Base must be intact after the failed clone.
  await base.start("/");
  console.log(
    `base after failed clone: start OK, state=${base.getState()?.name}, isActive=${base.isActive()}`,
  );

  console.log(
    `verdict: ${cloneResult.startsWith("threw") ? "fail-fast (throw propagates, no half-clone returned)" : "UNEXPECTED — clone returned despite factory throw"}; base unaffected=${base.getState()?.name === "home"}`,
  );
})();
