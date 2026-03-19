import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useRouter } from "../../src/composables/useRouter";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

function mountWithRouter(router: Router, composable: () => unknown) {
  let result: unknown;
  const App = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    },
  });

  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(App) }),
    }),
  );

  return { result, wrapper };
}

describe("useRouter composable", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return router", () => {
    const { result } = mountWithRouter(router, () => useRouter());

    expect(result).toStrictEqual(router);
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => {
      mount(
        defineComponent({
          setup() {
            useRouter();

            return () => h("div");
          },
        }),
      );
    }).toThrow();
  });
});
