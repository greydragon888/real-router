import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { RouterProvider } from "../../src/RouterProvider";
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

    delete (document as any).startViewTransition;
    vi.unstubAllGlobals();
  });

  it("no viewTransitions prop — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("viewTransitions: true — utility wired, startViewTransition called on navigate", async () => {
    const startSpy = stubStartViewTransition();

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, viewTransitions: true },
            { default: () => h("div") },
          ),
      }),
    );

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("viewTransitions: false — utility not wired", async () => {
    const startSpy = stubStartViewTransition();

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, viewTransitions: false },
            { default: () => h("div") },
          ),
      }),
    );

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("unmount tears down the utility", async () => {
    const startSpy = stubStartViewTransition();

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, viewTransitions: true },
            { default: () => h("div") },
          ),
      }),
    );

    await router.navigate("about");

    expect(startSpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    await router.navigate("home");

    // After unmount, utility destroyed — no additional calls.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("toggling viewTransitions from false → true creates the utility", async () => {
    const startSpy = stubStartViewTransition();
    const enabled = ref(false);

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, viewTransitions: enabled.value },
            { default: () => h("div") },
          ),
      }),
    );

    await router.navigate("about");

    expect(startSpy).not.toHaveBeenCalled();

    enabled.value = true;
    await wrapper.vm.$nextTick();

    await router.navigate("home");

    expect(startSpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
