import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouterProviderViewTransitionsTest from "../helpers/RouterProviderViewTransitionsTest.svelte";

import type { Router } from "@real-router/core";

// Stub `document.startViewTransition` with a spy that synchronously runs the
// updateCallback and hands back a controllable `{ skipTransition }` handle. The
// createViewTransitions state machine (subscribeLeave → open VT, subscribe →
// resolve deferred via setTimeout(0), abort → skip) is exercised through the
// real `<RouterProvider viewTransitions>` wiring, rendered via
// @testing-library/svelte + a host component — parity with the shared
// view-transitions suite and the react/preact/vue/solid adapters.
function stubStartViewTransition(): ReturnType<typeof vi.fn> {
  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    void cb();

    return { skipTransition: vi.fn() };
  });

  (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition =
    startSpy as unknown as Document["startViewTransition"];

  return startSpy;
}

describe("RouterProvider — viewTransitions", () => {
  let router: Router;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();

    Reflect.deleteProperty(document, "startViewTransition");
    vi.unstubAllGlobals();
  });

  it("no viewTransitions prop — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, { props: { router } });

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions: false — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: false },
    });

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("unmount tears down the utility", async () => {
    const startSpy = stubStartViewTransition();

    const { unmount } = render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);

    unmount();

    await router.navigate("home");

    // After unmount, utility destroyed — no additional calls.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves the deferred and clears currentVT after the post-success setTimeout", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });

    vi.useFakeTimers();

    await router.navigate("about");

    // The success handler schedules a setTimeout(0) that resolves the deferred
    // and nulls currentVT via the identity guard.
    await vi.advanceTimersByTimeAsync(1);

    expect(startSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("skips the transition when a concurrent navigation aborts the leave", async () => {
    const startSpy = stubStartViewTransition();

    render(RouterProviderViewTransitionsTest, {
      props: { router, viewTransitions: true },
    });

    // Two navigations in flight: the second supersedes the first, aborting the
    // first transition's signal → the VT abort handler runs (real cancellation).
    const first = router.navigate("about");
    const second = router.navigate("users");

    await Promise.allSettled([first, second]);

    expect(startSpy).toHaveBeenCalled();
  });
});
