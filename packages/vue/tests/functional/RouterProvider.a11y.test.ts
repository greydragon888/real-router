import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";

import { RouterProvider } from "../../src/RouterProvider";
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
    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  it("announceNavigation=true — element appears and text updates after navigation", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
      "Navigated to",
    );
  });

  it("announcer textContent matches 'Navigated to {route name}'", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    // First navigation is skipped (initial navigation flag)
    await router.navigate("about");
    // Second navigation triggers the announcement
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to home",
    );
  });

  it("announcer textContent uses h1 text when present", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    // First navigation is skipped (initial navigation flag)
    await router.navigate("about");
    // Second navigation triggers the announcement — h1 is present
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to About Page",
    );

    h1.remove();
  });

  it("announcer has aria-live='assertive' and aria-atomic='true'", () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute("aria-live")).toBe("assertive");
    expect(announcer?.getAttribute("aria-atomic")).toBe("true");
  });

  it("cleanup on unmount — announcer element removed from DOM", () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    wrapper.unmount();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });
});
