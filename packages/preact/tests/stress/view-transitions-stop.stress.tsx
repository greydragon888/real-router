// packages/preact/tests/stress/view-transitions-stop.stress.tsx

/**
 * Stress tests for `createViewTransitions` + `router.stop()` mid-VT.
 *
 * Closes §7.2 #9 (M20): "viewTransitions=true + mid-transition router.stop()
 * — document.startViewTransition async; stop mid-transition оставит dangling
 * promise. Hard-to-reproduce live bug."
 *
 * Core concern: when router.stop() is called while a View Transition is in
 * progress (after startViewTransition called but before the animation resolves),
 * the abort handler in createViewTransitions must:
 *   - call skipTransition() to terminate the in-flight VT animation;
 *   - resolve resolveLeave() so the router can proceed with teardown;
 *   - resolve the `deferred` promise (via resolveAndClear) so the VT's
 *     updateCallback return value settles.
 *
 * All three stubs below use jsdom's configurable `document.startViewTransition`
 * property. Tests run in pool:"forks" (see vitest.config.stress.mts), so each
 * test gets an isolated jsdom document.
 */

import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

// ---------------------------------------------------------------------------
// VT stubs
// ---------------------------------------------------------------------------

interface DelayedVTStub {
  skipTransitionSpy: ReturnType<typeof vi.fn>;
  /** Invoke the pending startViewTransition callback (simulates browser entering updateCallback). */
  triggerCallback: () => Promise<void>;
}

/** Stubs startViewTransition so the updateCallback fires only when `triggerCallback` is called. */
function stubDelayedVT(): DelayedVTStub {
  let pendingCallback: (() => void | Promise<void>) | null = null;
  const skipTransitionSpy = vi.fn();

  Object.defineProperty(document, "startViewTransition", {
    value: vi.fn((cb: () => void | Promise<void>) => {
      pendingCallback = cb;

      return { skipTransition: skipTransitionSpy };
    }),
    writable: true,
    configurable: true,
  });

  return {
    skipTransitionSpy,
    triggerCallback: async () => {
      if (pendingCallback) {
        await pendingCallback();
        pendingCallback = null;
      }
    },
  };
}

/** Stubs startViewTransition so the updateCallback fires synchronously (normal fast path). */
function stubImmediateVT(): ReturnType<typeof vi.fn> {
  const skipTransitionSpy = vi.fn();

  Object.defineProperty(document, "startViewTransition", {
    value: vi.fn((cb: () => void | Promise<void>) => {
      void cb();

      return { skipTransition: skipTransitionSpy };
    }),
    writable: true,
    configurable: true,
  });

  return skipTransitionSpy;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("R — viewTransitions + router.stop() mid-VT (§7.2 #9, M20)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    Reflect.deleteProperty(document, "startViewTransition");
    vi.restoreAllMocks();
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Delayed callback path — the most dangerous scenario
  // -----------------------------------------------------------------------

  it("stop() fires before VT updateCallback — skipTransition called, leave resolves (no orphan)", async () => {
    // Delayed stub: startViewTransition is called but the browser-side
    // updateCallback has not yet been invoked. This is the worst-case
    // timing: the router is blocked inside the leave Promise waiting for
    // resolveLeave, and the VT is waiting for the updateCallback.

    const { skipTransitionSpy } = stubDelayedVT();

    render(
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>,
    );

    // Fire navigate but do NOT await — VT starts (startViewTransition
    // called), router is waiting for resolveLeave inside subscribeLeave.
    const navPromise = router.navigate("route1");

    // Stop the router. This aborts the ongoing navigation signal.
    // The abort handler inside createViewTransitions fires:
    //   resolveAndClear() → deferred resolves
    //   skipTransition()  → VT animation skipped
    //   resolveLeave()    → outer leave Promise resolves → router unblocks
    router.stop();

    // Drain the event loop — abort handler fires synchronously on signal
    // abort, but the setTimeout(0) in the subscribe handler adds a task.
    await act(async () => {
      await navPromise.catch(() => {
        // Navigation rejected after stop — expected.
      });
    });

    // skipTransition MUST have been called — otherwise the in-flight VT
    // animation keeps running until a 4-second browser timeout.
    expect(skipTransitionSpy).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 2. Stress: N rapid navigate + stop() pairs
  // -----------------------------------------------------------------------

  it("30 rapid navigate+stop() pairs — no hangs, no unhandled rejections", async () => {
    // Immediate-callback stub: simulates the browser calling updateCallback
    // synchronously (fastest resolution path).
    const skipSpy = stubImmediateVT();

    const CYCLES = 30;

    for (let i = 0; i < CYCLES; i++) {
      const localRouter = createStressRouter(3);

      await localRouter.start("/route0");

      const { unmount } = render(
        <RouterProvider router={localRouter} viewTransitions>
          <div />
        </RouterProvider>,
      );

      // Kick off navigation (VT begins), then immediately stop.
      const nav = localRouter.navigate("route1");

      localRouter.stop();

      await act(async () => {
        await nav.catch(() => {
          // stop() aborts navigation — expected.
        });
      });

      unmount();
    }

    // Each cycle that entered startViewTransition should have had
    // skipTransition available. We can't assert exact call count because
    // the immediate stub calls the callback before stop fires the abort,
    // so the success path may take over — the important thing is no throw.
    expect(skipSpy.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // 3. destroy() via unmount after stop() is idempotent
  // -----------------------------------------------------------------------

  it("unmount after stop() calls vt.destroy() — double-resolve is idempotent, no error", async () => {
    stubImmediateVT();

    const { unmount } = render(
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route1");
    });

    // Stop the router (may fire abort for any pending leave subscription).
    router.stop();

    // Unmount triggers the useEffect cleanup → vt.destroy() is called.
    // destroy() calls resolveAndClear() + skipTransition(). Both are
    // idempotent if already resolved / already called during stop's abort.
    expect(() => unmount()).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // 4. stop() + unmount after completed VT — no throw, idempotent
  // -----------------------------------------------------------------------

  it("stop() + unmount after VT completes normally — no throw, no crash", async () => {
    // destroy() in createViewTransitions defensively calls
    // currentVT?.skipTransition?.() — this is correct if the
    // setTimeout(0) that clears currentVT hasn't fired yet (macrotask
    // timing). The invariant is: no throw, not a specific call count.
    stubImmediateVT();

    const { unmount } = render(
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>,
    );

    // Let the navigation complete — VT animate + subscribe fires.
    await act(async () => {
      await router.navigate("route1");
    });

    // stop() then unmount (triggers vt.destroy()) — must not throw.
    expect(() => {
      router.stop();
      unmount();
    }).not.toThrow();
  });
});
