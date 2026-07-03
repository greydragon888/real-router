/**
 * Probe 05 (wave 2, 2026-07-03): payload immutability boundaries.
 *
 * Wiki/leave.md "Payload Immutability" documents:
 *  - wrapper { route, nextRoute, signal } is Object.freeze'd (throws in strict mode)
 *  - payload.route (fromState) is deeply frozen
 *  - payload.nextRoute is the PENDING target — NOT yet frozen during the leave
 *    phase (frozen later, on commit) — "treat as read-only"
 *
 * Questions:
 *  (a) wrapper mutation throws (frozen) — regression check of wave-1 probe-05
 *  (b) route (fromState) mutation throws (deep-frozen)
 *  (c) nextRoute.params mutation during leave — does it LAND in the committed
 *      state? (documented "not frozen", but what is the actual blast radius?)
 *  (d) nextRoute top-level field (name) mutation — lands or blocked?
 *  (e) is the committed getState() object the SAME identity as nextRoute?
 */

import { createRouter } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "user", path: "/users/:id" },
];

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

void (async () => {
  // ===== (a) wrapper frozen =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let wrapperThrow: unknown;
    router.subscribeLeave((payload) => {
      try {
        (payload as { route: unknown }).route = null;
      } catch (error) {
        wrapperThrow = error;
      }
    });
    await router.navigate("user", { id: "1" });
    report(
      "(a) wrapper mutation throws (frozen payload)",
      wrapperThrow instanceof TypeError,
      `threw=${String(wrapperThrow)}`,
    );
  }

  // ===== (b) route (fromState) deep-frozen =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    await router.navigate("user", { id: "1" });
    let paramsThrow: unknown;
    router.subscribeLeave(({ route }) => {
      try {
        (route.params as Record<string, unknown>).id = "HACKED";
      } catch (error) {
        paramsThrow = error;
      }
    });
    await router.navigate("home");
    report(
      "(b) fromState.params mutation throws (deep-frozen)",
      paramsThrow instanceof TypeError,
      `threw=${String(paramsThrow)}`,
    );
  }

  // ===== (c) nextRoute.params mutability during leave (isolated) =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let paramsMutationThrew: unknown = "did-not-throw";
    let nextRouteRef: unknown;
    router.subscribeLeave(({ nextRoute }) => {
      nextRouteRef = nextRoute;
      try {
        (nextRoute.params as Record<string, unknown>).id = "INJECTED";
      } catch (error) {
        paramsMutationThrew = error;
      }
    });
    const committed = await router
      .navigate("user", { id: "42" })
      .catch((e: unknown) => e);
    const state = router.getState();

    console.log(
      `INFO | (c) params mutation attempt: ${
        paramsMutationThrew === "did-not-throw"
          ? "did NOT throw"
          : `threw ${String(paramsMutationThrew)}`
      }`,
    );
    console.log(
      `INFO | (c) committed params.id = ${String(state?.params.id)} ("42" = ineffective, "INJECTED" = landed)`,
    );
    console.log(
      `INFO | (e) nextRoute identity === committed state: ${String(nextRouteRef === committed)}`,
    );
    report(
      "(c) params NOT corrupted in committed state",
      state?.params.id === "42",
      `params.id=${String(state?.params.id)} threw=${String(paramsMutationThrew !== "did-not-throw")}`,
    );
  }

  // ===== (d) nextRoute.name mutability during leave (isolated — wave-2 run 1
  // crashed the process here: the mutation LANDED and completeTransition threw
  // ROUTE_NOT_FOUND for the hijacked name; navigate was unhandled in the probe) =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let nameMutationThrew: unknown = "did-not-throw";
    router.subscribeLeave(({ nextRoute }) => {
      try {
        (nextRoute as { name: string }).name = "hijacked";
      } catch (error) {
        nameMutationThrew = error;
      }
    });
    const outcome = await router
      .navigate("user", { id: "42" })
      .catch((e: unknown) => e);
    const state = router.getState();

    console.log(
      `INFO | (d) name mutation attempt: ${
        nameMutationThrew === "did-not-throw"
          ? "did NOT throw (nextRoute.name is writable during leave)"
          : `threw ${String(nameMutationThrew)}`
      }`,
    );
    console.log(
      `INFO | (d) navigate outcome: ${String((outcome as { code?: string } | undefined)?.code ?? outcome)}`,
    );
    console.log(
      `INFO | (d) state after: name=${String(state?.name)} (started at home)`,
    );
    report(
      "(d) name mutation does NOT silently commit a hijacked state",
      state?.name !== "hijacked",
      `state.name=${String(state?.name)} navigate=${String((outcome as { code?: string } | undefined)?.code ?? outcome)}`,
    );
  }

  console.log("\nprobe-05 done");
})();
