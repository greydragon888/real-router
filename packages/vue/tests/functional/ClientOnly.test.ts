import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { ClientOnly } from "../../src/components/ClientOnly";

const buildHost = () =>
  defineComponent({
    setup: () => () =>
      h(
        ClientOnly,
        {},
        {
          default: () =>
            h("span", { "data-testid": "children" }, "client content"),
          fallback: () => h("span", { "data-testid": "fallback" }, "loading"),
        },
      ),
  });

describe("ClientOnly", () => {
  describe("SSR (vue/server-renderer)", () => {
    it("renders fallback on the server", async () => {
      const view = await renderToString(createSSRApp(buildHost()));

      expect(view).toContain("loading");
      expect(view).not.toContain("client content");
    });

    it("renders nothing when no fallback slot is provided", async () => {
      const NoFallback = defineComponent({
        setup: () => () =>
          h(
            ClientOnly,
            {},
            {
              default: () =>
                h("span", { "data-testid": "children" }, "client content"),
            },
          ),
      });
      const view = await renderToString(createSSRApp(NoFallback));

      expect(view).not.toContain("client content");
    });
  });

  describe("client (after mount)", () => {
    it("renders children after mount", async () => {
      const wrapper = mount(buildHost());

      await flushPromises();

      expect(wrapper.find("[data-testid='children']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
    });

    it("renders children when no fallback is provided (post-mount)", async () => {
      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              ClientOnly,
              {},
              {
                default: () =>
                  h("span", { "data-testid": "children" }, "client content"),
              },
            ),
        }),
      );

      await flushPromises();

      expect(wrapper.find("[data-testid='children']").exists()).toBe(true);
    });

    it("supports multiple children", async () => {
      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              ClientOnly,
              {},
              {
                default: () => [
                  h("span", { "data-testid": "a" }, "A"),
                  h("span", { "data-testid": "b" }, "B"),
                ],
              },
            ),
        }),
      );

      await flushPromises();

      expect(wrapper.find("[data-testid='a']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='b']").exists()).toBe(true);
    });
  });

  describe("hydration (renderToString → createSSRApp.mount)", () => {
    it("hydrates without mismatch warnings, then swaps to children", async () => {
      const errSpy = vi.spyOn(console, "error");
      const warnSpy = vi.spyOn(console, "warn");
      const Host = buildHost();
      const ssrHtml = await renderToString(createSSRApp(Host));
      const container = document.createElement("div");

      document.body.append(container);
      container.innerHTML = ssrHtml;

      const app = createSSRApp(Host);

      app.mount(container);

      await flushPromises();

      expect(
        container.querySelector('[data-testid="children"]'),
      ).not.toBeNull();

      const allCalls = [...errSpy.mock.calls, ...warnSpy.mock.calls];
      const hydrationIssues = allCalls.filter(
        ([msg]: readonly unknown[]) =>
          typeof msg === "string" && /hydrat|mismatch/i.test(msg),
      );

      expect(hydrationIssues).toHaveLength(0);

      app.unmount();
      container.remove();
      errSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
