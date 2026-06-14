import { RouterError } from "@real-router/core";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop, waitForTransitions } from "./helpers";

/**
 * RouterError codes that are legitimate outcomes of tearing the plugin down
 * mid-flight (navigation superseded / router stopped / same-state dedup /
 * corrupted-route). Any OTHER rejection reason — a non-RouterError, or a
 * RouterError with an unexpected code such as a context-namespace / plugin /
 * listener error — indicates that a late `onTransitionSuccess` touched a
 * released claim or a torn-down browser handle. Those must NOT be swallowed.
 */
const TEARDOWN_SAFE_CODES = new Set<string>([
  "SAME_STATES",
  "TRANSITION_CANCELLED",
  "ROUTE_NOT_FOUND",
  "ROUTER_NOT_STARTED",
]);

describe("B7.1: teardown in the middle of in-flight navigation", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("B7.1: unsubscribe mid-transition does not log to console.error or crash", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);
    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start();

      // Fire off 50 navigations and tear the plugin down after the first one resolves.
      // Any onTransitionSuccess that lands after `unsubscribe()` must not attempt
      // `#claim.write` on a released namespace — such a call would surface as a
      // console.error (thrown inside core, swallowed up the stack).
      // Capture each navigate's settled outcome (status + rejection reason) so
      // we can inspect WHAT happened, not just whether console.error fired. A
      // teardown-access bug (a late onTransitionSuccess writing to a released
      // `#claim` namespace or touching a torn-down browser handle) can surface
      // either as a console.error OR as a rejected navigate promise — the old
      // test's `.catch` swallowed the latter entirely.
      const navPromises: Promise<PromiseSettledResult<unknown>>[] = [];

      for (let i = 0; i < 50; i++) {
        navPromises.push(
          router.navigate(i % 2 === 0 ? "users.list" : "home").then(
            (value): PromiseSettledResult<unknown> => ({
              status: "fulfilled",
              value,
            }),
            (error: unknown): PromiseSettledResult<unknown> => ({
              status: "rejected",
              reason: error,
            }),
          ),
        );

        if (i === 25) {
          unsubscribe();
        }
      }

      const outcomes = await Promise.all(navPromises);

      await waitForTransitions(10);

      // (1) No core-level error logged (late write to released claim throws
      // inside core and is swallowed up the stack → console.error).
      expect(errorSpy).not.toHaveBeenCalled();

      // (2) Any navigate that rejected must have done so for a legitimate
      // teardown reason (cancelled / not-started / same-state / route-not-found),
      // never a non-RouterError nor an unexpected RouterError code (e.g.
      // CONTEXT_NAMESPACE_*/PLUGIN_*/LISTENER) that would betray a
      // released-namespace or torn-down-handle access.
      const teardownAccessErrors = outcomes
        .filter((o) => o.status === "rejected")
        .map((o) => o.reason)
        .filter(
          (reason) =>
            !(reason instanceof RouterError) ||
            !TEARDOWN_SAFE_CODES.has(reason.code),
        );

      expect(teardownAccessErrors).toStrictEqual([]);

      // (3) In the healthy case every fired navigate settles as fulfilled — the
      // plugin's onTransitionSuccess ran to completion (claim writes + URL sync)
      // for each one without throwing back into the navigate promise. A teardown
      // handler that throws (released-claim access) would flip some of these to
      // rejected, shrinking the fulfilled count below 50.
      const fulfilledCount = outcomes.filter(
        (o) => o.status === "fulfilled",
      ).length;

      expect(fulfilledCount).toBe(50);
    } finally {
      router.stop();
      errorSpy.mockRestore();
    }
  });

  it("B7.1: popstate after unsubscribe is ignored (listener removed)", async () => {
    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start();
      await router.navigate("users.list");

      const stateBefore = router.getState()?.name;

      unsubscribe();

      // After teardown, a popstate event must not trigger any navigation
      // because the plugin's listener was removed in `createPopstateLifecycle.teardown`.
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { name: "home", params: {}, path: "/home" },
        }),
      );

      await waitForTransitions(10);

      expect(router.getState()?.name).toBe(stateBefore);
    } finally {
      router.stop();
    }
  });
});
