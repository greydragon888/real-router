// RFC navigation-cancellation-unification §5 (Variant B): the FSM is the single
// owner of cancellation. This property exercises RANDOM SEQUENCES of suspended
// navigations cancelled by every "settling" source (stop / dispose / external
// `opts.signal`) and asserts the load-bearing invariant:
//
//   A cancellation always WAKES the parked navigation (it rejects) and leaves the
//   FSM in a settled, non-stuck state — across any sequence, with no accumulation.
//
// Discriminating power: the navigations suspend on a NEVER-settling activate guard,
// so the ONLY thing that can wake a parked navigation is the FSM CANCEL action
// aborting its controller (#1018 + Variant B). Remove that abort and every
// `await nav` below hangs → the property times out. (Verified mutationally:
// disabling `handleCancel`'s abort fails this property.) A self-settling guard
// would NOT discriminate — the guard would wake the navigation regardless.
//
// `r0` is unguarded (start / restart target); `r1`–`r3` never settle (the
// cancellation targets). supersede is covered by abort-signal / concurrent-
// navigation functional suites — it starts a *new* in-flight navigation rather
// than settling the router, so it does not fit this "settle after each step" model.

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

const GUARDED = ["r1", "r2", "r3"] as const;

const ROUTES: Route[] = [
  // Unguarded — always startable / restartable.
  { name: "r0", path: "/r0" },
  // Never settle → a navigation here parks until the CANCEL action aborts it.
  ...GUARDED.map((name) => ({
    name,
    path: `/${name}`,
    canActivate: () => () => new Promise<boolean>(() => {}),
  })),
];

const arbStep = fc.record({
  target: fc.constantFrom(...GUARDED),
  action: fc.constantFrom("stop", "dispose", "external"),
});

const arbSequence = fc.array(arbStep, { minLength: 1, maxLength: 8 });

interface Step {
  target: string;
  action: "stop" | "dispose" | "external";
}

// Park a navigation on a never-settling guard, cancel it via `step.action`, and
// assert it woke (rejected) + the FSM settled. Returns whether the router was
// disposed (terminal). The `await ... resolves.toBe("rejected")` is the
// discriminator: without the CANCEL-action abort the parked nav never wakes.
async function cancelAndAssert(router: Router, step: Step): Promise<boolean> {
  const controller = new AbortController();
  const opts = step.action === "external" ? { signal: controller.signal } : {};
  const nav = router.navigate(step.target, {}, opts).then(
    () => "resolved",
    () => "rejected",
  );

  if (step.action === "stop") {
    router.stop();
  } else if (step.action === "external") {
    controller.abort(new Error("external cancel"));
  } else {
    router.dispose();
  }

  await expect(nav).resolves.toBe("rejected");

  if (step.action === "dispose") {
    return true;
  }

  // stop → IDLE (isActive false); external → recovered to READY (isActive true).
  expect(router.isActive()).toBe(step.action === "external");
  expect(router.isLeaveApproved()).toBe(false); // never stuck mid-leave

  return false;
}

describe("Navigation cancellation invariants (Variant B, §5)", () => {
  test.prop([arbSequence], { numRuns: NUM_RUNS.fast })(
    "every cancellation wakes the parked navigation and leaves the FSM settled",
    async (steps) => {
      const router: Router = createRouter(ROUTES);

      await router.start("/r0");

      let disposed = false;

      for (const step of steps) {
        if (disposed) {
          break;
        }

        // A previous stop() returned the FSM to IDLE — restart to keep going.
        if (!router.isActive()) {
          await router.start("/r0");
        }

        disposed = await cancelAndAssert(router, step);
      }

      // A non-disposed router is fully recovered, not stuck in TRANSITION_STARTED:
      // route-CRUD that is silently blocked while transitioning (#1030) now works.
      if (!disposed && router.isActive()) {
        const routes = getRoutesApi(router);

        routes.replace([{ name: "fresh", path: "/fresh" }]);

        expect(routes.has("fresh")).toBe(true);
        expect(routes.has("r1")).toBe(false);
      }
    },
  );
});
