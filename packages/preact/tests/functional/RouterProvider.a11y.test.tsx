import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { act, render } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

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

    await act(() => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      await router.navigate("about");
    });

    await act(async () => {
      await router.navigate("home");
    });

    // Final navigation is "home" → announcer text should reflect the last
    // route, not a prior one. Last wins.
    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to home",
    );
  });

  it("announcer element has aria-live='assertive' and aria-atomic='true'", () => {
    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute("aria-live")).toBe("assertive");
    expect(announcer?.getAttribute("aria-atomic")).toBe("true");
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

  it("should handle internal route prefix @@ in announcer", async () => {
    const notFoundRouter = createRouter(
      [
        { name: "test", path: "/" },
        { name: "other", path: "/other" },
        { name: "@@notfound", path: "/notfound" },
      ],
      {
        defaultRoute: "test",
        allowNotFound: true,
      },
    );

    notFoundRouter.usePlugin(browserPluginFactory({}));
    await notFoundRouter.start("/");

    render(
      <RouterProvider router={notFoundRouter} announceNavigation>
        <div />
      </RouterProvider>,
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    await act(() => {
      vi.advanceTimersByTime(100);
    });

    // The announcer skips the first post-mount navigation as "initial" —
    // do a warm-up navigation first, then the real assertion.
    await act(async () => {
      await notFoundRouter.navigate("other");
    });

    await act(async () => {
      await notFoundRouter.navigate("@@notfound");
    });

    const announcerText = document.querySelector(ANNOUNCER_SEL)?.textContent;

    // Internal "@@notfound" route name is filtered → falls back to the
    // pathname ("/notfound"). Prefix must still be present, and the
    // internal "@@" marker must not leak into the announcement.
    expect(announcerText).toBe("Navigated to /notfound");
    expect(announcerText).not.toContain("@@");

    notFoundRouter.stop();
    document.querySelector(ANNOUNCER_SEL)?.remove();
  });
});
