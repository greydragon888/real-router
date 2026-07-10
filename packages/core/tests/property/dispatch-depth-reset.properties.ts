// #1178 — dispatch-depth reset invariant (the #1030-#1034 model, merged via #1035).
//
//   After ANY navigate outcome (success / guard rejection / supersede-cancel), the
//   transition-dispatch depth (`EventBusNamespace.#dispatchDepth`) is back to 0 —
//   observable publicly as "the next TOP-LEVEL navigate() does NOT throw
//   REENTRANT_NAVIGATION".
//
// `#dispatchDepth` is incremented around every transition emit (the 5 emitTransition*
// wrappers) and the synchronous subscribeLeave batch, each restoring it in a
// `finally`; `Router.#assertNotReentrant` rejects any top-level navigate while it is
// > 0. A single leaked increment (a dropped `finally` decrement) permanently bricks
// the router — every later navigate throws a FALSE REENTRANT_NAVIGATION.
//
// Discriminating power (mutation-proven, #1178): the failure paths (guard-reject →
// emitTransitionError, supersede → emitTransitionCancel) route the depth through
// their own `finally`. Remove any one of those `finally` decrements and, once the
// sequence hits that outcome, the final `navigate` below throws REENTRANT_NAVIGATION
// synchronously → the property fails. The existing reentrant-ban functional tests
// assert from INSIDE a listener (where depth > 0 is legitimate); NONE asserts the
// reset afterwards across the failure paths — this property closes that.

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  // Two open routes so a "success" step can always change state (never SAME_STATES).
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  // Sync guard block → CANNOT_ACTIVATE → TRANSITION_ERROR emitted synchronously.
  { name: "blocked", path: "/blocked", canActivate: () => () => false },
  // Never-settling guard → a navigation here parks until a supersede cancels it
  // (TRANSITION_CANCEL).
  {
    name: "parked",
    path: "/parked",
    canActivate: () => () => new Promise<boolean>(() => {}),
  },
];

type Outcome = "success" | "reject" | "cancel";

describe("#1178 dispatch-depth resets after every navigate outcome", () => {
  test.prop(
    [
      fc.array(fc.constantFrom<Outcome>("success", "reject", "cancel"), {
        minLength: 1,
        maxLength: 8,
      }),
    ],
    {
      numRuns: NUM_RUNS.fast,
    },
  )(
    "after any outcome sequence, the next top-level navigate() is never a false REENTRANT_NAVIGATION",
    async (outcomes) => {
      const router: Router = createRouter(ROUTES, { defaultRoute: "home" });

      await router.start("/home");

      let toggle = false;
      const openTarget = (): string => {
        toggle = !toggle;

        return toggle ? "a" : "b";
      };

      for (const outcome of outcomes) {
        if (outcome === "success") {
          await router.navigate(openTarget());
        } else if (outcome === "reject") {
          // guard-block → TRANSITION_ERROR; swallow the expected rejection.
          await router.navigate("blocked").catch(() => {});
        } else {
          // park then supersede → the parked nav is cancelled (TRANSITION_CANCEL).
          const parked = router.navigate("parked");

          parked.catch(() => {});
          await router.navigate(openTarget());
        }
      }

      // Depth must be 0: a top-level navigate() does NOT throw REENTRANT_NAVIGATION
      // SYNCHRONOUSLY (the ban throws at the facade, before returning the promise).
      // A leaked `finally` decrement makes this throw → the property fails.
      let syncThrow: unknown;

      try {
        void router.navigate(openTarget()).catch(() => {
          /* async outcome is irrelevant — we only assert no SYNC reentrant throw */
        });
      } catch (error) {
        syncThrow = error;
      }

      expect(syncThrow).toBeUndefined();

      router.dispose();
    },
  );
});
