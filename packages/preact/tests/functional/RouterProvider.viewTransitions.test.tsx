import { act, render } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function stubStartViewTransition(): ReturnType<typeof vi.fn> {
  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    void cb();

    return { skipTransition: vi.fn() };
  });

  Object.defineProperty(document, "startViewTransition", {
    value: startSpy,
    writable: true,
    configurable: true,
  });

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

    render(
      <RouterProvider router={router}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    render(
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions: false — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    render(
      <RouterProvider router={router} viewTransitions={false}>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("unmount tears down the utility", async () => {
    const startSpy = stubStartViewTransition();

    const { unmount } = render(
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(startSpy).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await router.navigate("home");
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});
