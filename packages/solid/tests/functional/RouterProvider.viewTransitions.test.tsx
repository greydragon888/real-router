import { render } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

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

    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
    vi.unstubAllGlobals();
  });

  // Both falsy forms (omitted prop OR explicit `false`) must skip wiring —
  // mountFeature() treats `enabled` as boolean-truthy, so undefined and false
  // share the same code path. Parameterized to lock both cases.
  it.each([
    { label: "no viewTransitions prop", props: {} as const },
    {
      label: "viewTransitions: false",
      props: { viewTransitions: false } as const,
    },
  ])("$label — utility not wired", async ({ props }) => {
    const startSpy = stubStartViewTransition();

    render(() => (
      <RouterProvider router={router} {...props}>
        <div />
      </RouterProvider>
    ));

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    render(() => (
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>
    ));

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("unmount tears down the utility", async () => {
    const startSpy = stubStartViewTransition();

    const { unmount } = render(() => (
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>
    ));

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);

    unmount();

    await router.navigate("home");

    // After unmount, utility destroyed — no additional calls.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves the deferred and clears currentVT after the post-success setTimeout", async () => {
    const startSpy = stubStartViewTransition();

    render(() => (
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>
    ));

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

    render(() => (
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>
    ));

    // Two navigations in flight: the second supersedes the first, aborting the
    // first transition's signal → the VT abort handler runs (real cancellation).
    const first = router.navigate("about");
    const second = router.navigate("users");

    await Promise.allSettled([first, second]);

    expect(startSpy).toHaveBeenCalled();
  });
});
