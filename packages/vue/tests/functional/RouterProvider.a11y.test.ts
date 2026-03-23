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
