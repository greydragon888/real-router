// probe-01: does cloneRouter preserve the EFFECTIVE compiled guard when the
// same slot holds both an external and a definition guard?
//
// Contract under test: "last add wins — the compiled guard reflects the most
// recent registration regardless of origin" (RouteLifecycleNamespace.ts:30-37
// class jsdoc) + cloneRouter jsdoc "shares the ... lifecycle guards" of the
// source (cloneRouter.ts:14-17).
//
// cloneRouter re-registers definition guards FIRST (cloneRouter.ts:130-136),
// external guards SECOND (cloneRouter.ts:140-146). If the base registered them
// in the opposite temporal order (external first, then definition via
// routes.update), "last add wins" inverts on the clone.
//
// Structural probe — battery-safe (no latency measured).
import { createRouter } from "@real-router/core";
import { cloneRouter, getLifecycleApi, getRoutesApi } from "@real-router/core/api";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "admin", path: "/admin" },
];

void (async () => {
  // --- Scenario A: external added FIRST, definition added SECOND (via update) ---
  // base effective guard should be the DEFINITION one (last add wins).
  const baseA = createRouter(ROUTES);

  let extCallsA = 0;
  let defCallsA = 0;

  getLifecycleApi(baseA).addActivateGuard("admin", () => () => {
    extCallsA++;

    return false; // external BLOCKS
  });
  getRoutesApi(baseA).update("admin", {
    canActivate: () => () => {
      defCallsA++;

      return true; // definition ALLOWS
    },
  });

  await baseA.start("/");

  const baseVerdictA = baseA.canNavigateTo("admin");

  console.log(
    `A base: canNavigateTo(admin)=${baseVerdictA} (ext calls=${extCallsA}, def calls=${defCallsA})`,
  );
  console.log(
    `A base effective guard: ${defCallsA > 0 ? "DEFINITION (last add)" : "EXTERNAL"}`,
  );

  // Fresh counters for the clone.
  extCallsA = 0;
  defCallsA = 0;

  const cloneA = cloneRouter(baseA);

  await cloneA.start("/");

  const cloneVerdictA = cloneA.canNavigateTo("admin");

  console.log(
    `A clone: canNavigateTo(admin)=${cloneVerdictA} (ext calls=${extCallsA}, def calls=${defCallsA})`,
  );
  console.log(
    `A clone effective guard: ${defCallsA > 0 && extCallsA === 0 ? "DEFINITION" : extCallsA > 0 && defCallsA === 0 ? "EXTERNAL" : "MIXED"}`,
  );
  console.log(
    `A verdict: ${baseVerdictA === cloneVerdictA ? "PARITY (clone matches base)" : "DIVERGENCE — clone effective guard differs from base"}`,
  );

  // --- Scenario B: definition FIRST (route config), external SECOND ---
  // base effective guard should be the EXTERNAL one (last add wins).
  // Clone registration order (definition → external) matches this temporal
  // order, so parity is expected here.
  let extCallsB = 0;
  let defCallsB = 0;

  const baseB = createRouter([
    ROUTES[0],
    {
      ...ROUTES[1],
      canActivate: () => () => {
        defCallsB++;

        return true; // definition ALLOWS
      },
    },
  ]);

  getLifecycleApi(baseB).addActivateGuard("admin", () => () => {
    extCallsB++;

    return false; // external BLOCKS
  });

  await baseB.start("/");

  const baseVerdictB = baseB.canNavigateTo("admin");

  console.log(
    `\nB base: canNavigateTo(admin)=${baseVerdictB} (ext=${extCallsB}, def=${defCallsB})`,
  );

  extCallsB = 0;
  defCallsB = 0;

  const cloneB = cloneRouter(baseB);

  await cloneB.start("/");

  const cloneVerdictB = cloneB.canNavigateTo("admin");

  console.log(
    `B clone: canNavigateTo(admin)=${cloneVerdictB} (ext=${extCallsB}, def=${defCallsB})`,
  );
  console.log(
    `B verdict: ${baseVerdictB === cloneVerdictB ? "PARITY" : "DIVERGENCE"}`,
  );

  // --- navigate() cross-check for scenario A (public commit path, twin router) ---
  const baseA2 = createRouter(ROUTES);

  getLifecycleApi(baseA2).addActivateGuard("admin", () => () => false);
  getRoutesApi(baseA2).update("admin", { canActivate: () => () => true });
  await baseA2.start("/");

  const cloneA2 = cloneRouter(baseA2);

  await cloneA2.start("/");

  const baseNav = await baseA2.navigate("admin").then(
    (s) => `resolved:${s.name}`,
    (e: { code?: string }) => `rejected:${e.code}`,
  );
  const cloneNav = await cloneA2.navigate("admin").then(
    (s) => `resolved:${s.name}`,
    (e: { code?: string }) => `rejected:${e.code}`,
  );

  console.log(`\nA navigate(): base=${baseNav} clone=${cloneNav}`);
  console.log(
    `A navigate verdict: ${baseNav === cloneNav ? "PARITY" : "DIVERGENCE — same navigate() succeeds on one and is blocked on the other"}`,
  );
})();
