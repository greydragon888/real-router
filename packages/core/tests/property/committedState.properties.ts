// The committed state is not supposed to move under a navigation that is
// already under way. That is assembled today from three independent decisions
// and was never written down (`fsm-as-state-owner-2026-07-31.md` §3.1 phase
// 0.1): `navigateToNotFound` cancels before it commits, `replace()`
// revalidation is blocked by `isTransitioning()`, and the reentrancy ban covers
// the listener windows. `transition.from`, the `hasInflight` predicate and the
// whole commit-gate semantics lean on it.
//
// The window the three decisions do NOT cover is the PRE-START one (#1610):
// between entering `navigate()` and the transition being announced, user code
// runs (`forwardState` interceptors, `decodeParams`) and can drive a nested
// navigation to commit. The FSM has not been told about the outer navigation
// yet, so nothing refuses it.
//
// ⚠ Formulation matters, and the phase-0.1 wording ("while the FSM is in
// TRANSITION_STARTED / LEAVE_APPROVED the committed state is unchanged") is NOT
// the one that catches #1610 — measured, and pinned below as
// `fsmWindowViolations` so the difference cannot be lost again. A nested
// navigation SUPERSEDES: it cancels whatever was in flight before committing,
// so its commit always lands inside its own transition, and the FSM-worded
// statement stays true even on the bug. What #1610 actually breaks is the
// caller-facing half of the same property — the one §3 needs for `fromState`:
//
//   A navigation departs from the state that was committed when it was
//   REQUESTED. Equivalently: from the call to `navigate()` until its own
//   commit, no other navigation commits.

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { NUM_RUNS } from "./helpers";

import type { Route } from "@real-router/core";

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "outer", path: "/outer" },
  { name: "nested", path: "/nested" },
  { name: "parked", path: "/parked" },
];

const arbCase = fc.record({
  // Is a second navigation already in flight (FSM inside a transition) when the
  // outer navigation is requested?
  navInFlight: fc.boolean(),
  // Does the nested navigation suspend on an async guard instead of committing
  // synchronously?
  nestedAsync: fc.boolean(),
  // Which pre-start user-code hook drives the nested navigation. All three run
  // before the transition is announced — two inside `buildNavigateState`, one
  // inside `resolveDefault` — which is what makes this a CLASS guard rather
  // than a pin on the one site the issue reported.
  hook: fc.constantFrom<"forwardState" | "buildPath" | "defaultRoute">(
    "forwardState",
    "buildPath",
    "defaultRoute",
  ),
});

describe("Committed state is owned by the navigation in flight", () => {
  test.prop([arbCase], { numRuns: NUM_RUNS.fast })(
    "a navigation departs from the state committed when it was requested",
    async ({ navInFlight, nestedAsync, hook }) => {
      const starts: { to: string; from: string | undefined }[] = [];
      const commits: string[] = [];
      // Every commit that landed while the FSM was inside a transition that is
      // not the committing navigation's own — the phase-0.1 wording.
      const fsmWindowViolations: string[] = [];

      let releaseParked!: (value: boolean) => void;
      const parkedGuard = new Promise<boolean>((resolve) => {
        releaseParked = resolve;
      });

      let releaseNested!: (value: boolean) => void;
      const nestedGuard = new Promise<boolean>((resolve) => {
        releaseNested = resolve;
      });

      const router = createRouter(
        ROUTES,
        hook === "defaultRoute"
          ? // `defaultRoute` may be a dependency-resolved CALLBACK, so
            // `navigateToDefault` runs user code before it even has a route
            // name — the third pre-start window.
            {
              defaultRoute: () => {
                driveNested();

                return "outer";
              },
            }
          : {},
      );
      const ctx = getInternals(router);

      router.usePlugin(() => ({
        onTransitionStart: (to, from) =>
          starts.push({ to: to.name, from: from?.name }),
        onTransitionSuccess: (to) => {
          commits.push(to.name);

          if (ctx.isTransitioning()) {
            fsmWindowViolations.push(to.name);
          }
        },
      }));

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("parked", () => () => parkedGuard);

      if (nestedAsync) {
        lifecycle.addActivateGuard("nested", () => () => nestedGuard);
      }

      await router.start("/");

      let armed = true;
      const driveNested = (): void => {
        if (!armed) {
          return;
        }

        armed = false;
        router.navigate("nested").catch(() => {
          /* fire-and-forget: the ban rejects it once #1610 is closed */
        });
      };

      // Each hook runs user code before the transition is announced.
      if (hook === "forwardState") {
        getPluginApi(router).addInterceptor(
          "forwardState",
          (next, name, params) => {
            if (name === "outer") {
              driveNested();
            }

            return next(name, params);
          },
        );
      } else if (hook === "buildPath") {
        getPluginApi(router).addInterceptor("buildPath", (next, ...args) => {
          if (args[0] === "outer") {
            driveNested();
          }

          return next(...args);
        });
      }

      if (navInFlight) {
        router.navigate("parked").catch(() => {
          /* superseded or cancelled */
        });
        await Promise.resolve();
      }

      const stateWhenRequested = router.getState()?.name;

      const outerCall =
        hook === "defaultRoute"
          ? router.navigateToDefault()
          : router.navigate("outer");

      await outerCall.catch(() => {
        /* the outer call may legitimately fail; the ledger is what matters */
      });

      releaseNested(true);
      releaseParked(true);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });

      const outerStart = starts.find((entry) => entry.to === "outer");

      // The load-bearing half: the outer navigation departs from what was
      // committed when the caller asked for it. #1610 breaks exactly this.
      if (outerStart) {
        expect(outerStart.from).toBe(stateWhenRequested);
      }

      // The phase-0.1 wording, kept as a SEPARATE assertion so its (measured)
      // insensitivity to #1610 stays visible rather than being assumed.
      expect(fsmWindowViolations).toStrictEqual([]);
    },
  );
});
