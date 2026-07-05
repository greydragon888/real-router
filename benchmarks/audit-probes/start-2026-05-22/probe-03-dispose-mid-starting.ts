/**
 * Probe 03: behavior of dispose() during STARTING phase (sync interceptor
 * throws — FSM stuck STARTING as Probe 01 shows).
 *
 * Question: does dispose() correctly transition STARTING → DISPOSED?
 *
 * FSM config: STARTING has only { STARTED → READY, FAIL → IDLE }. No DISPOSE
 * transition out of STARTING. Hypothesis: dispose() finds FSM in STARTING,
 * sendDispose() is invalid (canSend false), router stuck forever including
 * after dispose.
 */

import { createRouter, errorCodes, type RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const router = createRouter([{ name: "home", path: "/" }]);

  getPluginApi(router).addInterceptor("start", () => {
    throw new Error("sync throw");
  });

  try {
    await router.start("/");
  } catch {
    /* expected */
  }

  console.log("After throw, isActive:", router.isActive());

  router.dispose();
  console.log("After dispose, isActive:", router.isActive());

  // Try to use router after dispose
  let postDisposeError: Error | undefined;

  try {
    await router.start("/");
  } catch (e) {
    postDisposeError = e as Error;
  }

  console.log("postDispose error code:", (postDisposeError as RouterError | undefined)?.code);

  if (
    postDisposeError !== undefined &&
    (postDisposeError as RouterError).code === errorCodes.ROUTER_DISPOSED
  ) {
    console.log("→ dispose() worked correctly, throws ROUTER_DISPOSED");
    process.exitCode = 0;
  } else if (
    postDisposeError !== undefined &&
    (postDisposeError as RouterError).code === errorCodes.ROUTER_ALREADY_STARTED
  ) {
    console.log("→ Bug: dispose() did NOT clear STARTING state — still ALREADY_STARTED");
    process.exitCode = 1;
  } else {
    console.log("→ Inconclusive");
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
