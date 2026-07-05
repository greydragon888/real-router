/**
 * Probe 02: variant of Probe 01 — async interceptor that rejects before
 * calling next(path).
 *
 * The router.start path does:
 *   sendStart()  →  internals.start(...).catch(... if isReady() then stop())
 *
 * If the interceptor returns Promise.reject without invoking next:
 *   - sendStart already moved FSM IDLE → STARTING
 *   - never reach completeStart, so STARTING never advances to READY
 *   - .catch sees isReady() === false → does nothing
 *
 * Question: is this a bug for the async-throw path too? Expected: yes,
 * same shape as Probe 01.
 */

import { createRouter, errorCodes, type RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const router = createRouter([{ name: "home", path: "/" }]);

  const api = getPluginApi(router);

  api.addInterceptor("start", async (_next, _path) => {
    return Promise.reject(new Error("interceptor async reject before next()"));
  });

  let firstError: Error | undefined;

  try {
    await router.start("/");
  } catch (e) {
    firstError = e as Error;
  }

  console.log("first error:        ", firstError?.message);
  console.log("router.isActive():  ", router.isActive());

  router.stop();
  console.log("After stop() isActive:", router.isActive());

  let secondError: Error | undefined;

  try {
    await router.start("/");
  } catch (e) {
    secondError = e as Error;
  }

  console.log("second error code:  ", (secondError as RouterError | undefined)?.code);

  if (
    secondError !== undefined &&
    (secondError as RouterError).code === errorCodes.ROUTER_ALREADY_STARTED
  ) {
    console.log("→ Bug CONFIRMED: same FSM-stuck issue on async-reject path.");
    process.exitCode = 1;
  } else {
    console.log("→ Bug REFUTED on async-reject path.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
