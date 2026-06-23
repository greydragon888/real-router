/**
 * Probe 04: verify failing-test for audit row #9.
 *
 * Contract under test (packages/core/CLAUDE.md «Guards vs Plugins → subscribeLeave»):
 *   «fires after all deactivation guards pass (departure is certain) but before
 *    activation guards run»
 *
 * Hypothesis: if an activate-guard removes the target route, navigate fails
 * with ROUTE_NOT_FOUND in completeTransition AFTER subscribeLeave has already
 * fired. That violates «departure is certain» because state stays at fromState.
 *
 * This script is the failing-test from the audit report, run for real.
 * If contract holds (no violation) → audit row #9 is FALSE, must be retracted.
 * If contract violated → audit row #9 is CONFIRMED Bug.
 */

import { createRouter, errorCodes, type RouterError } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

async function main() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "target", path: "/target" },
  ]);
  await router.start("/");

  console.log("Initial state:", router.getState().name);

  let leaveCount = 0;
  let lastLeavePayload: { route: string; nextRoute: string } | null = null;
  router.subscribeLeave((payload) => {
    leaveCount++;
    lastLeavePayload = {
      route: payload.route?.name ?? "<undef>",
      nextRoute: payload.nextRoute?.name ?? "<undef>",
    };
  });

  const lifecycle = getLifecycleApi(router);
  let guardRan = false;
  lifecycle.addActivateGuard("target", () => () => {
    guardRan = true;
    console.log("  [guard] removing 'target' route mid-navigate…");
    getRoutesApi(router).remove("target");
    return true;
  });

  const result = await router.navigate("target").catch((e: unknown) => e);
  const error = result instanceof Error ? (result as RouterError) : null;

  console.log("\n--- Observations ---");
  console.log("State after nav:           ", router.getState().name);
  console.log("Nav returned:              ", error ? `error code=${error.code}` : `state=${(result as { name: string }).name}`);
  console.log("Activate guard ran:        ", guardRan);
  console.log("subscribeLeave fire count: ", leaveCount);
  console.log("Last leave payload:        ", lastLeavePayload);

  console.log("\n--- Contract check ---");
  const stateStayedAtHome = router.getState().name === "home";
  const errorIsRouteNotFound = error?.code === errorCodes.ROUTE_NOT_FOUND;
  const leaveFiredButNoDeparture = leaveCount > 0 && stateStayedAtHome;

  console.log(`(1) state stayed at home:          ${stateStayedAtHome}`);
  console.log(`(2) error is ROUTE_NOT_FOUND:      ${errorIsRouteNotFound}`);
  console.log(`(3) subscribeLeave fired:          ${leaveCount > 0}`);
  console.log(`(4) contract violation = 1 ∧ 3:    ${leaveFiredButNoDeparture}`);

  console.log("\n--- Verdict ---");
  if (leaveFiredButNoDeparture) {
    console.log("→ Bug CONFIRMED: «departure is certain» нарушено.");
    process.exitCode = 1;
  } else if (!stateStayedAtHome) {
    console.log("→ Unexpected: state did NOT stay at home. Investigate.");
    process.exitCode = 2;
  } else if (leaveCount === 0) {
    console.log("→ Bug REFUTED: subscribeLeave did not fire (defensive cancellation worked).");
    process.exitCode = 0;
  } else {
    console.log("→ Inconclusive.");
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
