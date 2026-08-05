// The committed state is not supposed to move under a navigation that is
// already under way. That is assembled today from three independent decisions
// and was never written down (`fsm-as-state-owner-2026-07-31.md` §3.1 phase
// 0.1): `navigateToNotFound` cancels before it commits, `replace()`
// revalidation is blocked by `isTransitioning()`, and the reentrancy ban covers
// the listener windows. `transition.from`, the former `hasInflight` predicate (retired in #1669) and the
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
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
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

// ---------------------------------------------------------------------------
// The SISTER window (#1661). The property above owns the pre-start window of
// `navigate()`; this one owns the one `start()` opens, and they are different
// windows rather than two spellings of one: `completeStart()` sends STARTED —
// leaving STARTING for READY — BEFORE the boot navigation commits, so every
// `onStart` hook runs on a READY machine with `getState() === undefined` and a
// commit still owed. `NAVIGATE` is declared on READY, so the nested call is
// accepted, runs to completion synchronously and announces itself; the boot
// then writes over it.
//
// Scope, deliberately: the ban is on the `onStart` window, NOT on user code in
// general. A GUARD of the boot navigation that navigates is the classic
// redirect and stays legal — measured, it is the `isTransitioning()` half of
// the predicate that separates them (from `onStart` it reads false, from a boot
// guard true). Guards are therefore not generated here.
// ---------------------------------------------------------------------------

const arbStartCase = fc.record({
  // How the boot navigation ends. `guardRefused` matters on its own: there the
  // boot never commits at all, so ANY commit is foreign and the nested state
  // does not even get overwritten — it stands on a router whose `start()`
  // rejected.
  bootArc: fc.constantFrom<"match" | "notFound" | "guardRefused">(
    "match",
    "notFound",
    "guardRefused",
  ),
  // Which entry point the plugin drives from `onStart`. All three reach the
  // same `canNavigate()` gate, which is why this is a class guard and not a pin
  // on the one channel the issue reported.
  action: fc.constantFrom<
    "none" | "navigate" | "navigateToDefault" | "navigateToState"
  >("none", "navigate", "navigateToDefault", "navigateToState"),
  // Does the nested navigation target the boot's OWN route (#1662)? This is the
  // axis that separates the two symptoms of one window, and the first revision
  // of this generator had it fixed at "different" — so the whole of #1662 sat
  // outside the domain. Same target and the boot's own `navigateToState` meets
  // its same-state check, so the boot is refused rather than overwriting:
  // `start()` REJECTS while the router is active and holding the right state.
  // (On the `notFound` arc the boot's target is `UNKNOWN_ROUTE`, which no name
  // can address, so this axis degenerates to a second "different" there —
  // harmless, and cheaper than a conditional generator.)
  sameTarget: fc.boolean(),
});

describe("Nothing commits before the start navigation does (#1661)", () => {
  test.prop([arbStartCase], { numRuns: NUM_RUNS.fast })(
    "no state is announced to subscribers except the one start() settles on",
    async ({ bootArc, action, sameTarget }) => {
      const observed: string[] = [];
      // "outer" IS the boot's route on the match / guardRefused arcs.
      const nestedTarget = sameTarget ? "outer" : "nested";

      const router = createRouter(
        bootArc === "guardRefused"
          ? ROUTES.map((route) =>
              route.name === "outer"
                ? { ...route, canActivate: () => () => false }
                : route,
            )
          : ROUTES,
        {
          allowNotFound: bootArc === "notFound",
          ...(action === "navigateToDefault"
            ? { defaultRoute: nestedTarget }
            : {}),
        },
      );

      router.subscribe(({ route }) => {
        observed.push(route.name);
      });

      router.usePlugin(() => ({
        onStart() {
          const swallow = (): void => {
            /* fire-and-forget: refused once #1661 is closed */
          };

          switch (action) {
            case "navigate": {
              router.navigate(nestedTarget).catch(swallow);

              break;
            }
            case "navigateToDefault": {
              router.navigateToDefault().catch(swallow);

              break;
            }
            case "navigateToState": {
              const api = getPluginApi(router);

              api.navigateToState(api.makeState(nestedTarget)).catch(swallow);

              break;
            }
            // No default
          }
        },
      }));

      // `undefined` on rejection, which BOTH assertions below read as "there is
      // no state start() stands behind".
      const settled = await router
        .start(bootArc === "notFound" ? "/nope" : "/outer")
        .then(
          (state) => state.name,
          () => undefined,
        );

      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });

      // #1661 — stated per observation rather than as a snapshot of the whole
      // ledger: a subscriber must never be handed a state that is not the one
      // the boot settled on. When `start()` rejects there is no such state, so
      // every announcement is foreign.
      const foreign = observed.filter((name) => name !== settled);

      expect(foreign).toStrictEqual([]);

      // #1662 — the other half of the same window, and a DIFFERENT contract:
      // `start()`'s own promise. One equality says both directions — a resolved
      // start is the committed state, a rejected one leaves nothing committed.
      // Pre-fix on the same-target arc it read `undefined === "outer"`: the
      // router was active and correct while its promise said it had failed.
      //
      // ⚠ Scoped to THIS domain, and deliberately: `start()` legitimately
      // rejects over a committed state when an interceptor throws AFTER the
      // commit (#763, "never retract an observed success"). No interceptor is
      // generated here — widen the generator that way and this assertion needs
      // the carve-out, not a repair.
      expect(router.getState()?.name).toBe(settled);
    },
  );
});

// ---------------------------------------------------------------------------
// The chain invariant that makes the machine's context self-sufficient
// (`fsm-as-state-owner-2026-07-31.md` §3, acceptance criterion §12.3).
//
// If `fromState` of the next commit is always `toState` of the previous one,
// the machine never has to read the departure point from outside — it is
// already there as the result of the last transition. That is precisely what
// lets the state cells move INTO the context later without the machine growing
// a dependency on the store.
//
// It could not be asserted before the system commit landed: `navigateToNotFound`
// and `replace()`'s revalidation wrote the state and announced it themselves,
// so the chain held in the STORE but not in the machine. Both go through
// `SYSTEM_COMMIT` now, which is why this belongs here and not earlier.
// ---------------------------------------------------------------------------

const arbCommitSequence = fc.array(
  fc.constantFrom<"navigate" | "notFound" | "revalidate">(
    "navigate",
    "notFound",
    "revalidate",
  ),
  { minLength: 2, maxLength: 5 },
);

describe("fromState of the next commit is toState of the previous one", () => {
  test.prop([arbCommitSequence], { numRuns: NUM_RUNS.fast })(
    "holds across navigate, navigateToNotFound and replace() revalidation alike",
    async (steps) => {
      const definitions: Route[] = [
        { name: "home", path: "/" },
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ];
      const router = createRouter(definitions);
      const commits: { to: string; from: string | undefined }[] = [];
      // The CELL, read at the moment of each commit — not the payload. The two
      // are different claims and only this one is about the slice: before it,
      // both non-transition commits already emitted the previously-committed
      // state as `fromState`, so the payload chain held on the pre-slice code
      // too (measured). What moved into the machine is the PAIR, and a shift
      // that stopped shifting would leave the payload chain intact (#1646).
      const cells: {
        current: string | undefined;
        previous: string | undefined;
      }[] = [];

      router.usePlugin(() => ({
        onTransitionSuccess: (to, from) => {
          commits.push({ to: to.name, from: from?.name });
          cells.push({
            current: router.getState()?.name,
            previous: router.getPreviousState()?.name,
          });
        },
      }));

      await router.start("/");

      let flip = false;

      for (const step of steps) {
        if (step === "navigate") {
          flip = !flip;
          // Alternate the target: navigating to the committed route is a
          // SAME_STATES refusal and commits nothing, which would leave a hole
          // in the chain for reasons unrelated to the invariant.
          await router.navigate(flip ? "a" : "b").catch(() => {
            /* a refusal commits nothing; the ledger below is what matters */
          });
        } else if (step === "notFound") {
          getInternals(router).navigateToNotFound("/gone");
        } else {
          // A survivor revalidation: the URL still maps to the same route, so
          // it re-commits the state it already had.
          getRoutesApi(router).replace(definitions);
        }
      }

      for (let index = 1; index < commits.length; index++) {
        expect(commits[index].from).toBe(commits[index - 1].to);
      }

      // The pair is a shift register driven by the table: at every commit the
      // cell holds what this commit wrote, and `previous` holds what it
      // displaced — i.e. the `toState` of the commit before it.
      for (const [index, cell] of cells.entries()) {
        expect(cell.current).toBe(commits[index].to);

        if (index > 0) {
          expect(cell.previous).toBe(commits[index - 1].to);
        }
      }

      router.dispose();
    },
  );
});
