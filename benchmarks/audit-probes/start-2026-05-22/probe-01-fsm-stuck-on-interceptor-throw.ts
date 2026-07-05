/**
 * Probe 01: verify failing-test for audit row about FSM-stuck-STARTING.
 *
 * Hypothesis: if a `start` interceptor throws SYNCHRONOUSLY before calling
 * next(path), the FSM advances IDLE → STARTING via Router.start.facade
 * (sendStart), but the `.catch` block in Router.start only restores the
 * router if isReady() returns true. STARTING is not READY → no recovery.
 *
 * Expected (if bug exists):
 *   - first start() rejects with the interceptor error
 *   - router.isActive() returns true (STARTING is "active" by EventBus.isActive())
 *   - subsequent start() calls reject with ROUTER_ALREADY_STARTED forever
 *   - stop() is a no-op (facade isReady/isTransitioning both false in STARTING)
 *
 * That makes the router permanently unusable from a single buggy plugin
 * registration. This is a Bug per the discrimination rule.
 */

import { createRouter, errorCodes, type RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const router = createRouter([{ name: "home", path: "/" }]);

  const api = getPluginApi(router);

  // Sync-throwing start interceptor BEFORE next(path)
  api.addInterceptor("start", (_next, _path) => {
    throw new Error("interceptor sync throw before next()");
  });

  // 1) First start() — interceptor throws
  let firstError: RouterError | Error | undefined;

  try {
    await router.start("/");
  } catch (e) {
    firstError = e as Error;
  }

  console.log("--- After first start() ---");
  console.log("error name:        ", firstError?.name);
  console.log("error message:     ", firstError?.message);
  console.log("router.isActive(): ", router.isActive());
  console.log("router.getState(): ", router.getState());

  // 2) Try stop()
  try {
    router.stop();
    console.log("stop() returned (no throw)");
  } catch (e) {
    console.log("stop() threw:", (e as Error).message);
  }

  console.log("After stop() isActive:", router.isActive());

  // 3) Try second start() — what happens?
  let secondError: RouterError | Error | undefined;
  let secondState;

  try {
    secondState = await router.start("/");
  } catch (e) {
    secondError = e as Error;
  }

  console.log("\n--- After second start() (post-stop) ---");
  console.log("error code:        ", (secondError as RouterError | undefined)?.code);
  console.log("error message:     ", secondError?.message);
  console.log("router.isActive(): ", router.isActive());
  console.log("router.getState(): ", router.getState());
  if (secondState !== undefined) {
    console.log("second state name: ", secondState.name);
  }

  // 4) Verdict
  console.log("\n--- Verdict ---");

  const fsmStuck =
    secondError !== undefined &&
    (secondError as RouterError).code === errorCodes.ROUTER_ALREADY_STARTED;

  if (fsmStuck) {
    console.log("→ Bug CONFIRMED: FSM stuck in STARTING after sync-throw interceptor.");
    console.log("  Router is unusable from a single sync interceptor throw.");
    process.exitCode = 1;
  } else if (router.isActive() === false && secondError === undefined) {
    console.log("→ Bug REFUTED: FSM recovered to IDLE; subsequent start() works.");
    process.exitCode = 0;
  } else {
    console.log("→ Inconclusive. Inspect raw output above.");
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
