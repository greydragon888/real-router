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

  it("no announceNavigation prop — no announcer element in DOM", () => {
    render(RouterProviderAnnounceTest, { props: { router } });
    flushSync();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  it("announceNavigation=true — element appears and text updates after navigation", async () => {
    render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });
    flushSync();

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    flushSync();

    await router.navigate("home");
    flushSync();

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
      "Navigated to",
    );
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
