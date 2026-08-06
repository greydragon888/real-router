import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

/**
 * #1684 — the `AbortController` belongs to the NAVIGATION, not to a
 * router-level slot beside it.
 *
 * The controller used to live in `InFlightNavigation`, one slot per router,
 * while the machine held the navigation itself (`ctx.inflight`, #1648). Two
 * owners for one fact, kept in step by hand — `adopt` on the way in, `release`
 * on the way out. The slot is gone: the controller is a field of the plan the
 * machine already carries, so ownership is transitive and "which controller is
 * current" is derived from identity rather than tracked beside it.
 *
 * ⚠ **What is pinned here is the one OBSERVABLE consequence, and it is a parity
 * gap the move closes.** `subscribeLeave`'s contract says the signal aborts when
 * the navigation is cancelled or fails, and core CLAUDE.md states it "holds
 * identically on the guard and no-guards pipeline paths". It did not. On the
 * guard-FREE leave arc the controller was local to `handleNoGuardsLeave`,
 * released as a SUCCESS before the commit, and `executeNavigation`'s own
 * `controller` variable — the one the failure handler read — was `null` there.
 * So a navigation that rejected `CANCELLED` handed its listener a signal that
 * never aborted, while the guard arc, whose failure handler did hold the
 * reference, aborted it correctly. #1197 closed the ASYNC half of this same arc;
 * this is its synchronous twin.
 *
 * **The guard arc is the CONTROL and is asserted side by side deliberately.** It
 * passed before this change and must keep passing: a fix that moved the guard
 * arc instead of lifting the guard-free one would look identical if only the
 * broken cell were checked. Discrimination measured by reverse mutation —
 * restoring the early release reds the guard-free cell alone.
 */

interface Arc {
  readonly name: string;
  /** Whether a guard sits on a walked segment is the ONLY thing that picks the arc. */
  readonly install: (router: Router) => void;
}

const ARCS: Arc[] = [
  {
    name: "guard arc (CONTROL)",
    install: (router) => {
      getLifecycleApi(router).addDeactivateGuard("a", () => () => true);
    },
  },
  {
    name: "guard-free leave arc",
    install: () => {
      // No guard — that absence IS this arc: the navigation goes through
      // `handleNoGuardsLeave`, a separate controller site with its own lifetime.
    },
  },
];

const settle = async (p: Promise<State> | State): Promise<string | undefined> =>
  Promise.resolve(p).then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );

function makeRouter(): Router {
  return createRouter([
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);
}

describe.each(ARCS)(
  "#1684 — the leave signal on the $name",
  ({ install }: Arc) => {
    it("aborts when the navigation is cancelled", async () => {
      const router = makeRouter();

      install(router);

      const external = new AbortController();
      let leaveSignal: AbortSignal | undefined;

      // Registered AFTER `start()`: start performs a navigation of its own, and
      // a listener present for it would spend the abort on that one instead.
      await router.start("/a");

      router.subscribeLeave(({ signal }) => {
        leaveSignal = signal;

        // Synchronous, from inside the navigation — the shape that never
        // reaches `finishAsyncNavigation`, where the signal↔FSM bridge lives.
        external.abort(new Error("cancelled by the app"));
      });

      const code = await settle(
        router.navigate("b", {}, undefined, { signal: external.signal }),
      );

      expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(leaveSignal).toBeDefined();
      // The assertion the guard-free arc used to fail: it handed out a signal
      // and released the controller as a success, so nothing ever aborted it
      // even though the navigation did not commit.
      expect(leaveSignal?.aborted).toBe(true);
    });

    it("stays unaborted when the navigation SUCCEEDS (#722)", async () => {
      const router = makeRouter();

      install(router);

      let leaveSignal: AbortSignal | undefined;

      router.subscribeLeave(({ signal }) => {
        leaveSignal = signal;
      });

      await router.start("/a");
      await router.navigate("b");

      expect(router.getState()?.name).toBe("b");
      // The other half of the same contract, and the reason the fix could not
      // be "always abort on the way out".
      expect(leaveSignal?.aborted).toBe(false);
    });
  },
);

describe("#1684 — the CANCEL action tolerates a navigation with no controller", () => {
  it("cancels a navigation whose controller was never allocated", async () => {
    // A pre-commit listener makes the navigation *suspendable* without giving it
    // anything to hand a signal to (`controller-allocation.test.ts` pins that
    // asymmetry), and `stop()` from inside the announce sends CANCEL before any
    // allocation site is reached. So the FSM action meets an `inflight` whose
    // `controller` is `undefined` — it must tolerate that rather than assume
    // every navigation it carries owns one.
    const router = makeRouter();

    // Registered after `start()`, so the hook fires for the measured navigation
    // and not for the boot one.
    await router.start("/a");

    router.usePlugin(() => ({
      onTransitionStart: () => {
        router.stop();
      },
    }));

    const code = await settle(router.navigate("b"));

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
    expect(router.getState()).toBeUndefined();
  });
});
