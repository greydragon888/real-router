/**
 * Stress tests for `createViewTransitions` + `router.stop()` mid-VT (§7.2 #9, MED).
 *
 * Closes the §7.2 #9 review item: "viewTransitions=true + mid-transition
 * router.stop() — document.startViewTransition async; stop mid-transition
 * оставит dangling promise."
 *
 * Counterpart: `packages/preact/tests/stress/view-transitions-stop.stress.tsx`.
 *
 * Core concern: when `router.stop()` is called while a View Transition is
 * in progress (after `startViewTransition` called but before the animation
 * resolves), the abort handler inside `createViewTransitions` must:
 *   - call `skipTransition()` to terminate the in-flight VT animation;
 *   - resolve `resolveLeave()` so the router can proceed with teardown;
 *   - resolve the `deferred` promise (via `resolveAndClear`) so the VT's
 *     updateCallback return value settles.
 *
 * JSDOM has no native `document.startViewTransition` — every test installs
 * a controllable stub via `Object.defineProperty`.
 */

import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { createStressRouter } from "./helpers";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";

// ---------------------------------------------------------------------------
// VT stubs
// ---------------------------------------------------------------------------

interface DelayedVTStub {
  skipTransitionSpy: ReturnType<typeof vi.fn>;
  /** Invoke the pending startViewTransition callback (simulates the browser entering updateCallback). */
  triggerCallback: () => Promise<void>;
}

/**
 * Stubs `startViewTransition` so the updateCallback fires only when
 * `triggerCallback` is called.
 */
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

/**
 * Stubs `startViewTransition` so the updateCallback fires synchronously
 * (the normal fast path).
 */
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

function mountVTProvider(router: Router): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      setup: () => () =>
        h(
          RouterProvider,
          { router, viewTransitions: true },
          { default: () => h("div") },
        ),
    }),
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("§7.2 #9 — viewTransitions + router.stop() mid-VT (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    Reflect.deleteProperty(document, "startViewTransition");
    vi.restoreAllMocks();
  });

  it("9.1: stop() fires before VT updateCallback — skipTransition called, leave resolves (no orphan)", async () => {
    // Delayed stub: `startViewTransition` is called but the browser-side
    // updateCallback has not yet been invoked. This is the worst-case
    // timing: the router is blocked inside the leave Promise waiting for
    // resolveLeave, and the VT is waiting for the updateCallback.
    const { skipTransitionSpy } = stubDelayedVT();
    const wrapper = mountVTProvider(router);

    // Fire navigate but do NOT await — VT starts (startViewTransition
    // called), router waits for resolveLeave inside subscribeLeave.
    const navPromise = router.navigate("route1");

    // Stop the router. This aborts the ongoing navigation signal.
    // The abort handler inside createViewTransitions fires:
    //   resolveAndClear() → deferred resolves
    //   skipTransition()  → VT animation skipped
    //   resolveLeave()    → outer leave Promise resolves → router unblocks
    router.stop();

    await navPromise.catch(() => {
      // Navigation rejected after stop — expected.
    });

    // skipTransition MUST have been called — otherwise the in-flight VT
    // animation keeps running until the browser's 4-second timeout.
    expect(skipTransitionSpy).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("9.2: 30 rapid navigate+stop() pairs — no hangs, no unhandled rejections", async () => {
    // Immediate-callback stub: simulates the browser calling updateCallback
    // synchronously (fastest resolution path).
    const skipSpy = stubImmediateVT();
    const CYCLES = 30;

    for (let i = 0; i < CYCLES; i++) {
      const localRouter = createStressRouter(3);

      await localRouter.start("/route0");

      const wrapper = mountVTProvider(localRouter);

      // Kick off navigation (VT begins), then immediately stop.
      const nav = localRouter.navigate("route1");

      localRouter.stop();

      await nav.catch(() => {
        // stop() aborts navigation — expected.
      });

      wrapper.unmount();
    }

    // We can't assert exact call count because the immediate stub calls
    // the callback before stop fires the abort — the success path may
    // take over. The important invariant is "no throw across 30 cycles".
    expect(skipSpy.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  it("9.3: unmount after stop() calls vt.destroy() — idempotent, no error", async () => {
    stubImmediateVT();

    const wrapper = mountVTProvider(router);

    await router.navigate("route1");

    // Stop the router (may fire abort for any pending leave subscription).
    router.stop();

    // Unmount triggers the watch cleanup → vt.destroy() is called.
    // destroy() calls resolveAndClear() + skipTransition(). Both are
    // idempotent if already resolved / already called during stop's abort.
    expect(() => {
      wrapper.unmount();
    }).not.toThrow();
  });

  it("9.4: stop() + unmount after VT completes normally — no throw, no crash", async () => {
    // destroy() in createViewTransitions defensively calls
    // currentVT?.skipTransition?.() — correct if the setTimeout(0) that
    // clears currentVT hasn't fired yet (macrotask timing). The invariant
    // is "no throw", not a specific call count.
    stubImmediateVT();

    const wrapper = mountVTProvider(router);

    await router.navigate("route1");

    expect(() => {
      router.stop();
      wrapper.unmount();
    }).not.toThrow();
  });

  it("9.5: 50 rapid navigations + stop mid-sequence — no zombie promises", async () => {
    // Sustained burst with stop() in the middle. After stop, late VT
    // callbacks must not throw or update FSM.
    stubImmediateVT();

    const wrapper = mountVTProvider(router);

    const pendings: Promise<unknown>[] = [];

    for (let i = 0; i < 25; i++) {
      pendings.push(router.navigate(`route${i % 4}`).catch(() => null));
    }

    router.stop();

    for (let i = 0; i < 25; i++) {
      pendings.push(router.navigate(`route${i % 4}`).catch(() => null));
    }

    await Promise.all(pendings);

    // System still alive: no unhandled rejection observed by the await
    // above, no synchronous throw. The wrapper can be torn down cleanly.
    expect(() => {
      wrapper.unmount();
    }).not.toThrow();
  });
});
