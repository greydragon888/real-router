/**
 * Probe 10: What FSM state does the `start` interceptor see when it runs?
 *
 * Expected: interceptor runs DURING STARTING phase. So isActive() = true,
 * but FSM = STARTING (not READY yet). Interceptor cannot navigate() or do
 * many things during this window.
 *
 * Check: does calling navigate() from a start interceptor throw
 * ROUTER_NOT_STARTED (FSM not READY)? Hash plugin / scroll-restore /
 * navigation-plugin priming might try to navigate from within their start
 * interceptor in some edge cases.
 */

import { createRouter, errorCodes, type RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "users", path: "/users" },
  ]);

  let isActiveInInterceptor = false;
  let navigateErrorCode: string | undefined;

  getPluginApi(router).addInterceptor("start", async (next, path) => {
    isActiveInInterceptor = router.isActive();

    // Try to navigate FROM the interceptor BEFORE next() — i.e., before
    // completeStart() fires. FSM should still be STARTING.
    try {
      await router.navigate("users");
    } catch (e) {
      navigateErrorCode = (e as RouterError).code;
    }

    return next(path);
  });

  await router.start("/");

  console.log("isActive() in interceptor (before next): ", isActiveInInterceptor);
  console.log("navigate() error code:                   ", navigateErrorCode);
  console.log("expected ROUTER_NOT_STARTED:             ", errorCodes.ROUTER_NOT_STARTED);

  if (navigateErrorCode === errorCodes.ROUTER_NOT_STARTED) {
    console.log("→ Interceptor sees STARTING (active but not ready). navigate() rejects.");
    process.exitCode = 0;
  } else {
    console.log("→ Unexpected: navigate from interceptor=", navigateErrorCode);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
