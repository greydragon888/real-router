/**
 * Probe 04: after interceptor sync-throw + dispose(), check whether the FSM
 * actually reached DISPOSED. Hypothesis: it stayed in STARTING because the
 * STARTING state in routerFSM has no DISPOSE transition.
 *
 * If true, two consequences:
 *   1. isActive() returns true post-dispose (Probe 03 observation)
 *   2. isDisposed() returns false post-dispose → if a re-entrant call were
 *      to use this fact, weird behavior
 */

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

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

  router.dispose();

  // Read internals to inspect FSM state. There's no public getter for FSM
  // state; isActive() / isDisposed() are derived. isDisposed() === false
  // means FSM is NOT in DISPOSED.
  console.log("isActive():   ", router.isActive());
  // isDisposed is only exposed via internals; #markDisposed overrode start/
  // navigate but isActive() / isDisposed() are NOT overridden — they read
  // FSM state.
  // We check via @real-router/core/validation:
  const ctx = getInternals(router);
  console.log("internals.isDisposed():", ctx.isDisposed());

  // If isDisposed() === false post-dispose, the contract «After dispose:
  // all mutating methods throw ROUTER_DISPOSED» from CLAUDE.md is honoured
  // only by static method-rebinding, NOT by FSM. That's a leaky abstraction
  // — internal callers using `eventBus.isDisposed()` won't see DISPOSED.
  if (ctx.isDisposed() === false) {
    console.log("→ Bug CONFIRMED: dispose() left FSM in STARTING, not DISPOSED.");
    console.log("  Method-rebinding masks the issue from end-users, but");
    console.log("  internal isDisposed()/isActive() consumers see stale truth.");
    process.exitCode = 1;
  } else {
    console.log("→ FSM properly reached DISPOSED");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
