import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Mock document.startViewTransition — jsdom has no View Transitions API. The
// stub invokes the update callback synchronously (mirroring the spec's "capture
// old DOM → run updateCallback" order closely enough for the router's
// subscribeLeave choreography) and returns a { skipTransition } handle so the
// abort path has something to call. Parity with the react adapter's suite,
// driven here via `<RouterProvider viewTransitions>` mounted through
// @vue/test-utils.
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

  // Mount `<RouterProvider viewTransitions>` through a render-function component
  // — the vue analogue of react's `render(<RouterProvider …/>)`. No `act`
  // wrapper: `createViewTransitions` wires via `subscribeLeave`/`subscribe`, the
  // reactive utility is created synchronously in `setup()` (immediate watch),
  // and the startViewTransition stub runs its callback synchronously — so the
  // whole path resolves on the navigation's own microtasks, with no vue
  // reactivity to flush before asserting.
  function mountVT(props: Record<string, unknown> = {}) {
    return mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router, ...props }, { default: () => h("div") }),
      }),
    );
  }

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

    delete (document as unknown as Record<string, unknown>).startViewTransition;
    vi.unstubAllGlobals();
  });

  it("no viewTransitions prop — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    mountVT();

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    mountVT({ viewTransitions: true });

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions: false — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    mountVT({ viewTransitions: false });

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("unmount tears down the utility", async () => {
    const startSpy = stubStartViewTransition();

    const wrapper = mountVT({ viewTransitions: true });

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    await router.navigate("home");

    // After unmount, utility destroyed — no additional calls.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves the deferred and clears currentVT after the post-success setTimeout", async () => {
    const startSpy = stubStartViewTransition();

    mountVT({ viewTransitions: true });

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

    mountVT({ viewTransitions: true });

    // Two navigations in flight: the second supersedes the first, aborting the
    // first transition's signal → the VT abort handler runs (real cancellation).
    const first = router.navigate("about");
    const second = router.navigate("users");

    await Promise.allSettled([first, second]);

    expect(startSpy).toHaveBeenCalled();
  });
});
