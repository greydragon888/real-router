/**
 * Probe 06: plugin's onStart calls router.start() — what happens?
 *
 * ROUTER_START is emitted by completeStart()/sendStarted — FSM
 * STARTING → READY. So by the time onStart fires, FSM is in READY.
 *
 * Plugin onStart listener calls router.start("/users") synchronously.
 * Router.start checks canStart() → FSM in READY → can't START (no
 * START transition from READY). Returns Promise.reject(ALREADY_STARTED).
 *
 * Question: any FSM corruption? Original start() promise still resolves
 * correctly? subscribe/eventListener observability stable?
 */

import { createRouter, errorCodes, type RouterError } from "@real-router/core";
import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "users", path: "/users" },
  ]);

  let secondStartError: Error | undefined;
  let onStartFired = false;

  getPluginApi(router).addEventListener(events.ROUTER_START, () => {
    onStartFired = true;
    void router.start("/users").catch((e) => {
      secondStartError = e as Error;
    });
  });

  const state = await router.start("/");
  console.log("first state:", state.name);
  console.log("onStart fired:", onStartFired);

  await new Promise((r) => setTimeout(r, 10));

  console.log(
    "second start error code:",
    (secondStartError as RouterError | undefined)?.code,
  );
  console.log("router.isActive():", router.isActive());
  console.log("router.getState():", router.getState()?.name);

  if (
    (secondStartError as RouterError | undefined)?.code ===
    errorCodes.ROUTER_ALREADY_STARTED
  ) {
    console.log("→ Correctly rejected reentrant start() from onStart with ALREADY_STARTED");
    process.exitCode = 0;
  } else {
    console.log("→ Unexpected behaviour");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
