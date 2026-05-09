import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Await } from "../../src/components/Await";
import { Streamed } from "../../src/components/Streamed";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function injectDeferred(
  router: Router,
  map: Record<string, Promise<unknown>>,
): void {
  const state = router.getState()!;
  const mutated = {
    ...state,
    context: { ...state.context, ssrDataDeferred: map },
  };

  Object.defineProperty(router, "getState", {
    value: () => mutated,
    configurable: true,
  });
}

describe("<Await>", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("renders default slot with the resolved value once the promise settles", async () => {
    injectDeferred(router, { reviews: Promise.resolve(["r1", "r2"]) });

    const Inner = defineComponent({
      setup: () => () =>
        h(
          Streamed,
          {},
          {
            default: () =>
              h(
                Await,
                { name: "reviews" },
                {
                  default: ({ value }: { value: string[] }) =>
                    h(
                      "ul",
                      { "data-testid": "list" },
                      value.map((r) => h("li", r)),
                    ),
                },
              ),
            fallback: () => h("span", { "data-testid": "fallback" }, "loading"),
          },
        ),
    });

    const wrapper = mount(RouterProvider, {
      props: { router },
      slots: { default: () => h(Inner) },
    });

    // Vue's Suspense flushes async setup on initial render — flushPromises is enough.
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-testid="list"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("r1");
    expect(wrapper.text()).toContain("r2");
  });

  it("shows fallback while the deferred promise is pending", async () => {
    const pending = new Promise<string[]>(() => undefined);

    injectDeferred(router, { reviews: pending });

    const Inner = defineComponent({
      setup: () => () =>
        h(
          Streamed,
          {},
          {
            default: () =>
              h(
                Await,
                { name: "reviews" },
                {
                  default: ({ value }: { value: string[] }) =>
                    h("span", { "data-testid": "list" }, value.join(",")),
                },
              ),
            fallback: () => h("span", { "data-testid": "fallback" }, "loading"),
          },
        ),
    });

    const wrapper = mount(RouterProvider, {
      props: { router },
      slots: { default: () => h(Inner) },
    });

    expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="list"]').exists()).toBe(false);
  });
});
