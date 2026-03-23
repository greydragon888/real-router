import { act, render } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

describe("RouterProvider — announceNavigation", () => {
  let router: Router;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelector(ANNOUNCER_SEL)?.remove();
  });

  it("no announceNavigation prop — no announcer element in DOM", () => {
    render(
      <RouterProvider router={router}>
        <div />
      </RouterProvider>,
    );

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  it("announceNavigation=true — element appears and text updates after navigation", async () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      await router.navigate("about");
    });

    await act(async () => {
      await router.navigate("home");
    });

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
      "Navigated to",
    );
  });

  it("cleanup on unmount — announcer element removed from DOM", () => {
    const { unmount } = render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    unmount();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });
});
