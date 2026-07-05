/**
 * Probe 07: hydrateRouter() called twice without stop() in between.
 *
 * Setup: hydrateRouter A → already started. hydrateRouter B → router.start
 * inside B rejects with ROUTER_ALREADY_STARTED. The finally restores
 * ctx.hydrationState = previous.
 *
 * Question: is `previous` correctly captured (null on first hydrate) and
 * restored even on rejected nested call? Specifically, after hydrateRouter
 * B rejects, is internals.hydrationState back to null?
 */

import { createRouter } from "@real-router/core";
import { hydrateRouter } from "@real-router/core/utils";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "users", path: "/users" },
  ]);

  console.log("Before hydrate A: hydrationState =", getInternals(router).hydrationState);

  await hydrateRouter(router, { path: "/" });

  console.log("After hydrate A: hydrationState =", getInternals(router).hydrationState);
  console.log("router.isActive():", router.isActive());

  // Second hydrate without stop()
  let nestedError: Error | undefined;

  try {
    await hydrateRouter(router, { path: "/users" });
  } catch (e) {
    nestedError = e as Error;
  }

  console.log("Nested hydrate error code:", (nestedError as { code?: string } | undefined)?.code);
  console.log("After nested fail: hydrationState =", getInternals(router).hydrationState);

  if (getInternals(router).hydrationState === null) {
    console.log("→ hydrationState correctly restored to null in finally");
    process.exitCode = 0;
  } else {
    console.log("→ Bug: hydrationState leaked across failed nested hydrate");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
