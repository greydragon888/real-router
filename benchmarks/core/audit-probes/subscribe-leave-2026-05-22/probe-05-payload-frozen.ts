/**
 * Probe 05: LeaveState payload immutability.
 *
 * EventBusNamespace.awaitLeaveListeners constructs:
 *   const leaveState: LeaveState = { route: fromState, nextRoute: toState, signal };
 *
 * No Object.freeze on the wrapper. Check whether:
 *  (a) the payload object itself can be mutated
 *  (b) payload.route is frozen
 *  (c) payload.nextRoute is frozen
 *  (d) payload.signal can be replaced
 */

import { createRouter } from "@real-router/core";

async function main() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  router.subscribeLeave((payload) => {
    console.log("Object.isFrozen(payload):       ", Object.isFrozen(payload));
    console.log(
      "Object.isFrozen(payload.route):  ",
      Object.isFrozen(payload.route),
    );
    console.log(
      "Object.isFrozen(payload.nextRoute):",
      Object.isFrozen(payload.nextRoute),
    );
    console.log(
      "Object.isFrozen(payload.signal): ",
      Object.isFrozen(payload.signal),
    );

    try {
      (payload as { extra?: string }).extra = "added";
      console.log("✗ payload.extra assigned:", (payload as { extra?: string }).extra);
    } catch (e: unknown) {
      console.log("✓ payload.extra threw:", (e as Error).message);
    }

    try {
      (payload as { route: unknown }).route = null;
      console.log("✗ payload.route replaced:", payload.route);
    } catch (e: unknown) {
      console.log("✓ replace route threw:", (e as Error).message);
    }

    try {
      (payload.route as { name: string }).name = "evil";
      console.log("✗ payload.route.name mutated:", payload.route.name);
    } catch (e: unknown) {
      console.log("✓ payload.route.name threw:", (e as Error).message);
    }
  });

  await router.navigate("a");
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
