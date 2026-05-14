// Closes review §7.1 #9 (MED): viewTransitions stress — mid-transition
// `router.stop()` leaves a pending `document.startViewTransition` callback
// dangling in real browsers. We can't fully simulate browser-native VT here,
// but we can hammer the integration: 100+ cycles of (start view transition →
// stop router → start new router) must not leak listeners, must not crash,
// and must not accumulate pending callbacks.
//
// Risk being closed: pending callback after stop may leak; reaching for the
// router instance after teardown should be a no-op. The stress validates the
// lifecycle.destroy() invocation in createViewTransitions teardown.

import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MB, createStressRouter, forceGC, getHeapUsedBytes } from "./helpers";
import RouterProviderViewTransitionsTest from "../helpers/RouterProviderViewTransitionsTest.svelte";

import type { Router } from "@real-router/core";

interface PendingTransition {
  resolve: () => void;
  reject: (err: unknown) => void;
  skipTransition: ReturnType<typeof vi.fn>;
}

function stubStartViewTransition(): {
  startSpy: ReturnType<typeof vi.fn>;
  pending: PendingTransition[];
} {
  const pending: PendingTransition[] = [];
  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    // Capture the callback as a "pending transition" but DON'T resolve it
    // synchronously — that's the realistic case where the browser is
    // animating and the consumer calls router.stop().
    let resolveFinish!: () => void;
    let rejectFinish!: (err: unknown) => void;
    const finished = new Promise<void>((resolve, reject) => {
      resolveFinish = resolve;
      rejectFinish = reject;
    });
    const skipTransition = vi.fn();
    const transition = {
      finished,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition,
    };

    pending.push({
      resolve: resolveFinish,
      reject: rejectFinish,
      skipTransition,
    });
    // Call the inner callback immediately (DOM update phase).
    void cb();

    return transition;
  });

  (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition =
    startSpy as unknown as Document["startViewTransition"];

  return { startSpy, pending };
}

describe("Stress: viewTransitions + mid-transition router.stop()", () => {
  let router: Router;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createStressRouter(2);
    await router.start("/route0");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      router.stop();
    } catch {
      // Already stopped in test — ignore.
    }
    Reflect.deleteProperty(document, "startViewTransition");
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it("100 cycles of (navigate → stop mid-transition) — bounded heap, lifecycle survives", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 100; i++) {
      const { pending } = stubStartViewTransition();
      const { unmount } = render(RouterProviderViewTransitionsTest, {
        props: { router, viewTransitions: true },
      });

      flushSync();

      // Trigger one navigation → startViewTransition called → pending.
      await router.navigate("route1").catch(() => undefined);
      flushSync();

      // Now stop the router mid-transition. The pending VT callback's
      // outer `finished` promise is still unresolved at this point — the
      // browser would resolve it after the animation finishes.
      router.stop();

      // Synthesize the "real browser" path where the transition eventually
      // resolves AFTER router.stop(). The createViewTransitions utility's
      // teardown must have already cleaned up its subscribers — so post-stop
      // resolution is a no-op on router state.
      pending.forEach((p) => {
        p.resolve();
      });

      unmount();

      // Restart a fresh router for the next iteration.
      router = createStressRouter(2);
      await router.start("/route0");

      Reflect.deleteProperty(document, "startViewTransition");
    }

    forceGC();
    const finalHeap = getHeapUsedBytes();

    // Generous budget — VT integration shouldn't accumulate state across 100 cycles.
    expect(finalHeap - baseline).toBeLessThan(50 * MB);
    // No console errors from leaked subscriptions.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("teardown of RouterProvider while VT is pending — no console.error from leaked subscription", async () => {
    const { pending } = stubStartViewTransition();

    const { unmount } = render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });

    flushSync();

    await router.navigate("route1").catch(() => undefined);
    flushSync();

    expect(pending).toHaveLength(1);

    // Unmount the provider BEFORE the pending transition resolves.
    unmount();

    // Now resolve the pending callback. The lifecycle.destroy() ran during
    // unmount, so the utility's internal state is gone — the callback's
    // resolution must not throw or log.
    pending[0].resolve();

    await new Promise((resolve) => setTimeout(resolve, 16));

    // No error logs from the post-teardown resolution.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("rapid mount/unmount with VT enabled — 100 cycles, bounded heap", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 100; i++) {
      stubStartViewTransition();

      const { unmount } = render(RouterProviderViewTransitionsTest, {
        props: { router, viewTransitions: true },
      });

      flushSync();
      unmount();

      Reflect.deleteProperty(document, "startViewTransition");
    }

    forceGC();
    const finalHeap = getHeapUsedBytes();

    expect(finalHeap - baseline).toBeLessThan(30 * MB);
  });
});
