// probe-03: what does a plugin factory observe when it is re-run on a clone?
//
// cloneRouter.ts order: (1) new RouterClass(definitions with ONLY name/path/
// children) → (2) guard transfer → (3) usePlugin(...) — factories RUN here →
// (4) assignConfigEntries + resolvedForwardMap + routeCustomFields copy.
//
// On the BASE the constructor builds config from full route objects BEFORE any
// usePlugin call, so a factory that inspects routes at init sees complete
// config. On the CLONE the same factory runs inside the (3)-(4) window and may
// see an emptier world. Contract under test: plugin re-instantiation gives
// "fresh instances" semantically equivalent to base registration
// (CLAUDE.md "Plugins | Factories re-run on the clone — fresh instances").
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

import type { PluginFactory } from "@real-router/core";

interface Snapshot {
  buildPathWithDefaults: string;
  routeDefaultParams: unknown;
  routeCustomField: unknown;
  forwardStateResolved: string;
}

// The SAME factory instance is re-run by cloneRouter — snapshots arrive in
// call order: [0] = base registration, [1] = clone re-instantiation.
const snapshots: Snapshot[] = [];

const probePlugin: PluginFactory = (router) => {
  const routes = getRoutesApi(router);
  const user = routes.get("user");

  snapshots.push({
    // defaultParams should fill page=1 → /users/1?page=1
    buildPathWithDefaults: router.buildPath("user", { id: "1" }),
    routeDefaultParams: user?.defaultParams ?? null,
    // custom field declared on the route definition
    routeCustomField:
      (user as Record<string, unknown> | undefined)?.["searchSchema"] ?? null,
    forwardStateResolved: (() => {
      try {
        // forwardState applies forwardMap: legacy → target on the base
        return getPluginApiSafe(router);
      } catch (e) {
        return `threw:${(e as Error).constructor.name}`;
      }
    })(),
  });

  return {};
};

import { getPluginApi } from "@real-router/core/api";

function getPluginApiSafe(router: Parameters<PluginFactory>[0]): string {
  return getPluginApi(router).forwardState("legacy", {}).name;
}

void (async () => {
  const base = createRouter([
    {
      name: "user",
      path: "/users/:id?page",
      defaultParams: { page: "1" },
      searchSchema: { page: "number" },
    } as never,
    { name: "target", path: "/target" },
    { name: "legacy", path: "/legacy", forwardTo: "target" },
  ]);

  base.usePlugin(probePlugin);

  const clone = cloneRouter(base);

  console.log("base  factory snapshot:", JSON.stringify(snapshots[0]));
  console.log("clone factory snapshot:", JSON.stringify(snapshots[1]));

  const parity = JSON.stringify(snapshots[0]) === JSON.stringify(snapshots[1]);

  console.log(
    `factory-window verdict: ${parity ? "PARITY" : "DIVERGENCE — clone factory saw an under-initialized store"}`,
  );

  // Post-clone (after cloneRouter returned) the copy has landed — verify the
  // clone's config is complete OUTSIDE the window, so the defect is confined
  // to factory-time reads.
  const afterUser = getRoutesApi(clone).get("user");

  console.log(
    `clone AFTER cloneRouter returned: buildPath=${clone.buildPath("user", { id: "1" })} defaultParams=${JSON.stringify(afterUser?.defaultParams)} custom=${JSON.stringify((afterUser as Record<string, unknown> | undefined)?.["searchSchema"])}`,
  );
})();
