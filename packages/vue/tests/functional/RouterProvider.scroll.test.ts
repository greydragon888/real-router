import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { ScrollRestorationOptions } from "../../src/dom-utils";
import type { Router } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

describe("RouterProvider — scrollRestoration", () => {
  let router: Router;

  beforeEach(async () => {
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    sessionStorage.clear();
    history.scrollRestoration = "auto";
    vi.unstubAllGlobals();
  });

  it("no scrollRestoration prop — history.scrollRestoration unchanged", () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    expect(history.scrollRestoration).toBe("auto");
  });

  it("scrollRestoration provided — flips history.scrollRestoration to 'manual'", () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, scrollRestoration: { mode: "restore" } },
            { default: () => h("div") },
          ),
      }),
    );

    expect(history.scrollRestoration).toBe("manual");
  });

  it("unmount restores history.scrollRestoration", () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, scrollRestoration: { mode: "restore" } },
            { default: () => h("div") },
          ),
      }),
    );

    expect(history.scrollRestoration).toBe("manual");

    wrapper.unmount();

    expect(history.scrollRestoration).toBe("auto");
  });

  it("pagehide captures position when enabled", () => {
    Object.defineProperty(globalThis, "scrollY", {
      value: 275,
      configurable: true,
    });

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, scrollRestoration: { mode: "restore" } },
            { default: () => h("div") },
          ),
      }),
    );

    globalThis.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;

    expect(Object.values(saved)).toContain(275);

    wrapper.unmount();
  });

  // Reactivity regression tests — guards the primitive-deps watch() rewrite
  // so inline objects don't thrash while genuine option changes DO apply.
  describe("reactivity", () => {
    it("replacing the options ref with same fields — does NOT re-create the utility", async () => {
      const opts = ref<ScrollRestorationOptions>({ mode: "restore" });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router, scrollRestoration: opts.value },
              { default: () => h("div") },
            ),
        }),
      );

      expect(history.scrollRestoration).toBe("manual");

      // Replace with a NEW object ref, identical fields. If the watch were
      // reference-based, this would destroy + re-create: prevScrollRestoration
      // in the new instance would capture "manual", breaking the final restore.
      opts.value = { mode: "restore" };
      await wrapper.vm.$nextTick();

      wrapper.unmount();

      // If re-created once, prevScrollRestoration in instance #2 would be
      // "manual" (snapshot of #1's flip) and we'd stay "manual" after unmount.
      // If anti-thrash works, only instance #1 existed; its prev was "auto".
      expect(history.scrollRestoration).toBe("auto");
    });

    it("changing mode on the fly re-creates the utility", async () => {
      const opts = ref<ScrollRestorationOptions>({ mode: "restore" });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router, scrollRestoration: opts.value },
              { default: () => h("div") },
            ),
        }),
      );

      expect(history.scrollRestoration).toBe("manual");

      // Switch to "manual" — utility returns noop; flip should be reverted.
      opts.value = { mode: "manual" };
      await wrapper.vm.$nextTick();

      expect(history.scrollRestoration).toBe("auto");

      wrapper.unmount();
    });

    it("toggling from undefined → object creates the utility; object → undefined destroys it", async () => {
      const opts = ref<ScrollRestorationOptions | undefined>(undefined);

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            opts.value === undefined
              ? h(RouterProvider, { router }, { default: () => h("div") })
              : h(
                  RouterProvider,
                  { router, scrollRestoration: opts.value },
                  { default: () => h("div") },
                ),
        }),
      );

      expect(history.scrollRestoration).toBe("auto");

      opts.value = { mode: "restore" };
      await wrapper.vm.$nextTick();

      expect(history.scrollRestoration).toBe("manual");

      opts.value = undefined;
      await wrapper.vm.$nextTick();

      expect(history.scrollRestoration).toBe("auto");

      wrapper.unmount();
    });
  });
});
