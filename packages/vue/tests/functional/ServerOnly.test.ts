import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { ServerOnly } from "../../src/components/ServerOnly";

const buildHost = () =>
  defineComponent({
    setup: () => () =>
      h(
        ServerOnly,
        {},
        {
          default: () =>
            h("span", { "data-testid": "children" }, "server content"),
          fallback: () =>
            h("span", { "data-testid": "fallback" }, "client view"),
        },
      ),
  });

describe("ServerOnly", () => {
  describe("SSR (vue/server-renderer)", () => {
    it("renders children on the server", async () => {
      const view = await renderToString(createSSRApp(buildHost()));

      expect(view).toContain("server content");
      expect(view).not.toContain("client view");
    });

    it("renders children when no fallback slot is provided", async () => {
      const NoFallback = defineComponent({
        setup: () => () =>
          h(
            ServerOnly,
            {},
            {
              default: () =>
                h("span", { "data-testid": "children" }, "server content"),
            },
          ),
      });
      const view = await renderToString(createSSRApp(NoFallback));

      expect(view).toContain("server content");
    });
  });

  describe("client (after mount)", () => {
    it("renders fallback after mount when provided", async () => {
      const wrapper = mount(buildHost());

      await flushPromises();

      expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='children']").exists()).toBe(false);
    });

    it("renders nothing after mount when no fallback (default)", async () => {
      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              ServerOnly,
              {},
              {
                default: () =>
                  h("span", { "data-testid": "children" }, "server content"),
              },
            ),
        }),
      );

      await flushPromises();

      expect(wrapper.find("[data-testid='children']").exists()).toBe(false);
    });
  });

  describe("hydration (renderToString → createSSRApp.mount)", () => {
    it("hydrates without mismatch warnings, then swaps to fallback", async () => {
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
        container.querySelector('[data-testid="fallback"]'),
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
