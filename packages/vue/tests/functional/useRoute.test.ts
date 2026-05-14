import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h, watchSyncEffect } from "vue";

import { useRoute, RouterProvider } from "../../src";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Params, Router } from "@real-router/core";

function mountWithRouter<R>(router: Router, composable: () => R) {
  let result: R;
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

  return {
    get result() {
      return result!;
    },
    wrapper,
  };
}

describe("useRoute composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator", () => {
    const { result } = mountWithRouter(router, () => useRoute());

    expect(result.navigator).toBeTypeOf("object");
    expect(result.navigator.navigate).toBeTypeOf("function");
    expect(result.navigator.getState).toBeTypeOf("function");
    expect(result.navigator.isActiveRoute).toBeTypeOf("function");
    expect(result.navigator.subscribe).toBeTypeOf("function");
  });

  it("should return current route", async () => {
    const { result } = mountWithRouter(router, () => useRoute());

    expect(result.route.value.name).toBe("test");

    await router.navigate("items");
    await flushPromises();

    expect(result.route.value.name).toBe("items");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() =>
      mount(
        defineComponent({
          setup() {
            useRoute();

            return () => h("div");
          },
        }),
      ),
    ).toThrow("useRoute must be used within a RouterProvider");
  });

  it("should throw a clear error if router has not started yet", () => {
    const unstartedRouter = createTestRouterWithADefaultRouter();

    expect(() =>
      mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router: unstartedRouter },
              {
                default: () =>
                  h(
                    defineComponent({
                      setup() {
                        useRoute();

                        return () => h("div");
                      },
                    }),
                  ),
              },
            ),
        }),
      ),
    ).toThrow(
      /useRoute called with no active route\. Did you forget to await router\.start\(\) before rendering, or is the router stopped\/disposed\?/,
    );
  });

  it("shallowRef tracks identity: re-assigning the same frozen snapshot does NOT fire effects", async () => {
    let effectCount = 0;
    let routeRef: ReturnType<typeof useRoute>["route"] | undefined;

    const App = defineComponent({
      setup() {
        const ctx = useRoute();

        routeRef = ctx.route;

        watchSyncEffect(() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          ctx.route.value;
          effectCount++;
        });

        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(App) }),
      }),
    );

    await flushPromises();

    const countAfterMount = effectCount;

    await router.navigate("items.item", { id: 6 });
    await flushPromises();

    const countAfterNavigation = effectCount;
    const currentSnapshot = routeRef!.value;

    expect(countAfterNavigation).toBeGreaterThan(countAfterMount);
    expect(currentSnapshot).toBeDefined();

    // CORE shallowRef invariant: writing the SAME reference back must NOT
    // fire watchers. Vue's `triggerRef` would fire even on identity, so we
    // assign via the public `.value` setter to verify reactivity skips no-ops.
    (routeRef!.value as unknown) = currentSnapshot;
    await flushPromises();

    expect(effectCount).toBe(countAfterNavigation);

    // And: re-rendering with a *new* shallow object containing the same
    // nested data DOES trigger — proving deep-equality is NOT used.
    const cloned = { ...currentSnapshot };

    (routeRef!.value as unknown) = cloned;
    await flushPromises();

    expect(effectCount).toBe(countAfterNavigation + 1);
  });

  it("should propagate generic params type without runtime change", () => {
    type TypedParams = { id: string; tab: string } & Params;

    let typedParams: TypedParams | undefined;

    const App = defineComponent({
      setup() {
        const { route } = useRoute<TypedParams>();

        typedParams = route.value.params;

        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(App) }),
      }),
    );

    // Generic type params are erased at runtime — verify the params object shape.
    expect(typedParams).toBeTypeOf("object");
    expect(typedParams).not.toBeNull();
  });
});
