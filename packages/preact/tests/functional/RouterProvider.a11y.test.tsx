import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { act, render } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { createRouteAnnouncer } from "../../src/dom-utils";
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
    document.title = "";
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
    expect(document.querySelector(ANNOUNCER_SEL)!.textContent).toBe(
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
    expect(announcer!.getAttribute("aria-live")).toBe("assertive");
    expect(announcer!.getAttribute("aria-atomic")).toBe("true");
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

  it("h1 text content is used as announcement text when present", async () => {
    // resolveText priority: getCustomText → h1.textContent → document.title → route.name.
    // When an <h1> is rendered inside RouterProvider's children, the announcer
    // must prefer its trimmed textContent over the route name.
    render(
      <RouterProvider router={router} announceNavigation>
        <div>
          <h1>Page Title</h1>
          <div />
        </div>
      </RouterProvider>,
    );

    await act(() => {
      vi.advanceTimersByTime(100);
    });

    // Warmup: the announcer skips the very first post-mount navigation as
    // "initial" (isInitialNavigation guard). We need a second navigation
    // for the announcement to actually fire.
    await act(async () => {
      await router.navigate("about");
    });

    await act(async () => {
      await router.navigate("home");
    });

    // The double-rAF fires synchronously (stubbed above).
    // h1 is "Page Title" — announcer must use it instead of route name.
    expect(document.querySelector(ANNOUNCER_SEL)!.textContent).toBe(
      "Navigated to Page Title",
    );
  });

  it("document.title fallback used when no h1 is present", async () => {
    // Without an <h1>, resolveText falls back to document.title, then route.name.
    // document.title is reset in afterEach so other tests don't inherit it.
    document.title = "My App";

    render(
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>,
    );

    await act(() => {
      vi.advanceTimersByTime(100);
    });

    // Warmup: first post-mount navigation is skipped as "initial".
    await act(async () => {
      await router.navigate("about");
    });

    await act(async () => {
      await router.navigate("home");
    });

    expect(document.querySelector(ANNOUNCER_SEL)!.textContent).toBe(
      "Navigated to My App",
    );
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

    const announcerText = document.querySelector(ANNOUNCER_SEL)!.textContent;

    // Internal "@@notfound" route name is filtered → falls back to the
    // pathname ("/notfound"). Prefix must still be present, and the
    // internal "@@" marker must not leak into the announcement.
    expect(announcerText).toBe("Navigated to /notfound");
    expect(announcerText).not.toContain("@@");

    notFoundRouter.stop();
    document.querySelector(ANNOUNCER_SEL)?.remove();
  });

  describe("createRouteAnnouncer — shared utility surface", () => {
    // Preact's <RouterProvider announceNavigation> does not surface
    // RouteAnnouncerOptions, but the shared `createRouteAnnouncer` (consumed
    // from this package via the dom-utils symlink) does. Locks two parts of
    // its contract that are otherwise untested in the Preact suite: the
    // `getAnnouncementText` override and the same-text dedupe gate.

    it("getAnnouncementText override is preferred over default h1/title resolution", async () => {
      // Bring up an announcer attached to the existing test router. A custom
      // text resolver returns a fixed string — its presence in the live
      // region after a navigation proves the override fires first.
      document.body.innerHTML = "<h1>Page Title</h1>";

      const announcer = createRouteAnnouncer(router, {
        getAnnouncementText: (route) => `custom: ${route.name}`,
      });

      await act(() => {
        vi.advanceTimersByTime(100);
      });

      // Warmup: skip initial post-mount navigation.
      await act(async () => {
        await router.navigate("about");
      });

      await act(async () => {
        await router.navigate("home");
      });

      // getAnnouncementText returns the *complete* announcement — prefix is
      // applied only on the fallback chain. Override must win over the <h1>
      // fallback ("Navigated to Page Title").
      expect(document.querySelector(ANNOUNCER_SEL)!.textContent).toBe(
        "custom: home",
      );

      announcer.destroy();
      document.body.innerHTML = "";
    });

    it("does not re-announce when consecutive resolved texts are identical (lastAnnouncedText dedupe)", async () => {
      // Two navigations resolving to the same announcement text must not
      // trigger a second live-region write — defensive dedupe documented
      // in shared/dom-utils/route-announcer.ts.
      const announcer = createRouteAnnouncer(router, {
        getAnnouncementText: () => "stable",
      });

      await act(() => {
        vi.advanceTimersByTime(100);
      });

      // Warmup: skip initial post-mount navigation.
      await act(async () => {
        await router.navigate("about");
      });

      await act(async () => {
        await router.navigate("home");
      });

      const region = document.querySelector(ANNOUNCER_SEL)!;
      const firstText = region.textContent;

      expect(firstText).toBe("stable");

      // Clear the region to detect a second write. The dedupe path bails
      // out before clear+write, so the region must stay empty after the
      // second navigation.
      region.textContent = "";

      await act(async () => {
        await router.navigate("about");
      });

      expect(region.textContent).toBe("");

      announcer.destroy();
    });

    it("getOrCreateAnnouncer reuses the existing element (singleton — only one announcer in DOM)", () => {
      // The factory mounts at most one `[data-real-router-announcer]` element
      // per document — a second `createRouteAnnouncer` call returns the same
      // node and DOES NOT duplicate it. Two nested `<RouterProvider>`s, or a
      // direct call alongside the provider, must not produce two live regions.
      const announcerA = createRouteAnnouncer(router);
      const announcerB = createRouteAnnouncer(router);

      const elements = document.querySelectorAll(ANNOUNCER_SEL);

      expect(elements).toHaveLength(1);

      announcerA.destroy();
      announcerB.destroy();
    });

    it("manageFocus(null) is a no-op when no <h1> is present (defensive guard)", async () => {
      // resolveText falls back to document.title when there is no <h1>, and
      // doAnnounce passes the (null) h1 to manageFocus, which must early-return
      // without touching focus or throwing. The test fixes document.title to
      // force the fallback path and asserts that the announcement still fires.
      document.title = "Untitled";
      const announcer = createRouteAnnouncer(router);

      await act(() => {
        vi.advanceTimersByTime(100);
      });

      await act(async () => {
        await router.navigate("about");
      });

      // Throwing here would surface as an unhandled rejection inside the
      // double-rAF; assert the second navigation succeeds and the live region
      // received the expected fallback text.
      await act(async () => {
        await router.navigate("home");
      });

      expect(document.querySelector(ANNOUNCER_SEL)!.textContent).toBe(
        "Navigated to Untitled",
      );

      announcer.destroy();
    });

    it("clears the live region after CLEAR_DELAY (7s) — defensive auto-clear", async () => {
      // Announcer keeps the text for CLEAR_DELAY = 7000 ms, then wipes it.
      // The auto-clear prevents stale text from being re-announced by assistive
      // tech if the live region is revisited (e.g. screen-reader re-focus).
      document.title = "Untitled";
      const announcer = createRouteAnnouncer(router);

      await act(() => {
        vi.advanceTimersByTime(100);
      });

      await act(async () => {
        await router.navigate("about");
      });

      await act(async () => {
        await router.navigate("home");
      });

      const region = document.querySelector(ANNOUNCER_SEL)!;

      expect(region.textContent).toBe("Navigated to Untitled");

      // Advance just under CLEAR_DELAY — text must still be there.
      await act(() => {
        vi.advanceTimersByTime(6999);
      });

      expect(region.textContent).toBe("Navigated to Untitled");

      // Crossing the threshold triggers the clear.
      await act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(region.textContent).toBe("");

      announcer.destroy();
    });
  });
});
