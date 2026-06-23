/**
 * Probe 08: concurrent hydrateRouter() — second call overwrites scratchpad
 * while first start interceptor is paused awaiting something.
 *
 * Setup:
 *   - SSR-like start interceptor that awaits an external Promise
 *   - hydrateRouter A (path /home, context.data = "A")
 *   - hydrateRouter B (path /users, context.data = "B") — fires before A awaits
 *   - When A's interceptor resumes, it reads internals.hydrationState — is it
 *     A's payload (correct) or B's (corruption)?
 *
 * Note: hydrate B will fast-reject with ALREADY_STARTED because A's start
 * already locked the FSM in STARTING. But hydrate B sets the scratchpad
 * BEFORE checking that. So the timing window is:
 *   A: ctx.hydrationState = A; await router.start("/home") {
 *       interceptor: capture internals.hydrationState; await externalGate;
 *       B: ctx.hydrationState = B; await router.start("/users") → rejects;
 *       B.finally: ctx.hydrationState = A;
 *       externalGate resolves;
 *       interceptor: read internals.hydrationState again ← still A?
 *   }
 */

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { hydrateRouter } from "@real-router/core/utils";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "users", path: "/users" },
  ]);

  let gateResolve!: () => void;
  const gate = new Promise<void>((r) => {
    gateResolve = r;
  });

  let beforeAwait: unknown;
  let afterAwait: unknown;

  getPluginApi(router).addInterceptor("start", async (next, path) => {
    beforeAwait = JSON.parse(JSON.stringify(getInternals(router).hydrationState));
    await gate;
    afterAwait = JSON.parse(JSON.stringify(getInternals(router).hydrationState));
    return next(path);
  });

  // Hydrate A
  const hydratePromiseA = hydrateRouter(router, {
    name: "home",
    path: "/",
    params: {},
    context: { tag: "A" },
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
  });

  // Wait a microtask to let A's interceptor capture beforeAwait
  await new Promise((r) => setTimeout(r, 0));

  // Now fire hydrate B concurrently
  const hydratePromiseB = hydrateRouter(router, {
    name: "users",
    path: "/users",
    params: {},
    context: { tag: "B" },
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
  }).catch((e: unknown) => e);

  // Wait for B to settle (it will reject fast with ALREADY_STARTED but
  // not before mutating ctx.hydrationState in its try block)
  await hydratePromiseB;

  // Open the gate for A
  gateResolve();

  await hydratePromiseA;

  console.log("beforeAwait context.tag:", (beforeAwait as { context?: { tag?: string } } | null)?.context?.tag);
  console.log("afterAwait  context.tag:", (afterAwait as { context?: { tag?: string } } | null)?.context?.tag);

  if ((afterAwait as { context?: { tag?: string } } | null)?.context?.tag === "A") {
    console.log("→ scratchpad correctly held A's data after concurrent B was rejected.");
    process.exitCode = 0;
  } else {
    console.log(
      "→ Bug: scratchpad shows tag=",
      (afterAwait as { context?: { tag?: string } } | null)?.context?.tag,
      "— concurrent hydrate corrupted SSR plugin's view of own state.",
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
