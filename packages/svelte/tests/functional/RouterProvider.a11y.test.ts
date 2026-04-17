import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouterProviderAnnounceTest from "../helpers/RouterProviderAnnounceTest.svelte";

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

  it("no announceNavigation prop — no announcer element in DOM but children render", () => {
    const { container } = render(RouterProviderAnnounceTest, {
      props: { router },
    });

    flushSync();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
    // Sanity check: children rendered, so the absence of announcer is not because
    // RouterProvider itself failed to render.
    expect(container.querySelector("[data-testid='child']")).not.toBeNull();
  });

  it("announceNavigation=true — element appears and text changes after each navigation", async () => {
    render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });
    flushSync();

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    vi.advanceTimersByTime(100);

    // The first navigation after mount is treated as the initial transition
    // (isInitialNavigation=true) and is intentionally NOT announced — so we
    // perform a "warm-up" navigation, then assert on subsequent ones.
    await router.navigate("about");
    flushSync();

    await router.navigate("home");
    flushSync();
    const textAfterHome = document.querySelector(ANNOUNCER_SEL)?.textContent;

    // The announcer must include a "Navigated to" prefix and the target route
    // name — asserting just the prefix makes the test pass on *any* non-empty
    // announcement, so we pin both pieces.
    expect(textAfterHome).toContain("Navigated to");
    expect(textAfterHome).toContain("home");

    await router.navigate("about");
    flushSync();
    const textAfterAbout = document.querySelector(ANNOUNCER_SEL)?.textContent;

    expect(textAfterAbout).toContain("Navigated to");
    expect(textAfterAbout).toContain("about");
    // Catches the case where the announcer stopped updating after the first nav.
    expect(textAfterAbout).not.toBe(textAfterHome);
  });

  it("announcer has aria-live='assertive' and aria-atomic='true'", () => {
    render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });
    flushSync();

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute("aria-live")).toBe("assertive");
    expect(announcer?.getAttribute("aria-atomic")).toBe("true");
  });

  it("cleanup on unmount — announcer element removed from DOM", () => {
    const { unmount } = render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });

    flushSync();

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    unmount();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });
});
