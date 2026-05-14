// Vue useRouteEnter tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteEnter.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Vue composables run **once** during `setup()`; the handler is captured
//     in closure at the call site. Reactivity in Vue happens through
//     refs/computeds consumed inside the handler body.
//   - StrictMode test is React-only — Vue has no equivalent.
//
// All other tests mirror the React suite 1:1.

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { useRouteEnter } from "../../src/composables/useRouteEnter";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type {
  RouteEnterHandler,
  UseRouteEnterOptions,
} from "../../src/composables/useRouteEnter";
import type { Router } from "@real-router/core";

function mountProbe(
  router: Router,
  handler: RouteEnterHandler,
  options?: UseRouteEnterOptions,
) {
  const Probe = defineComponent({
    setup() {
      useRouteEnter(handler, options);

      return () => h("div", { "data-testid": "probe" });
    },
  });

  return mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(Probe) }),
    }),
  );
}

describe("useRouteEnter", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("does not fire on initial mount when there is no previousRoute", async () => {
    const handler = vi.fn();

    mountProbe(router, handler);
    await flushPromises();

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires once after a navigation when component is already mounted", async () => {
    const handler = vi.fn();

    mountProbe(router, handler);

    await router.navigate("about");
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("about");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("fires again on each subsequent navigation", async () => {
    const handler = vi.fn();

    mountProbe(router, handler);

    await router.navigate("about");
    await flushPromises();
    await router.navigate("home");
    await flushPromises();
    await router.navigate("users.list");
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0].route.name).toBe("about");
    expect(handler.mock.calls[1][0].route.name).toBe("home");
    expect(handler.mock.calls[2][0].route.name).toBe("users.list");
  });

  it("provides previousRoute and route at mount time", async () => {
    const handler = vi.fn();

    mountProbe(router, handler);

    await router.navigate("users.view", { id: "42" });
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("users.view");
    expect(ctx.route.params.id).toBe("42");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    mountProbe(router, handler);

    await router.navigate("users.view", { id: "1" });
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    await flushPromises();

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    mountProbe(router, handler, { skipSameRoute: false });

    await router.navigate("users.view", { id: "1" });
    await flushPromises();
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire on unmount", async () => {
    const handler = vi.fn();

    const wrapper = mountProbe(router, handler);

    wrapper.unmount();

    await router.navigate("about");
    await flushPromises();

    expect(handler).not.toHaveBeenCalled();
  });

  // CLAUDE.md gotcha #1 — Handler captured at init (Vue-specific contract)
  //
  // Symmetric with the `useRouteExit` regression: Vue captures the handler
  // closure-style in `setup()`; the inner `watch(route)` reads `route.value`
  // (reactive) but always invokes the original handler reference. Mutating
  // a parent-supplied wrapper object after mount must not swap which function
  // the watcher invokes.
  it("CLAUDE.md gotcha #1: handler is captured at setup() — late reassignment has no effect", async () => {
    const originalHandler = vi.fn();
    const replacementHandler = vi.fn();

    const Probe = defineComponent({
      props: {
        handlerRef: {
          type: Object as () => { current: RouteEnterHandler },
          required: true,
        },
      },
      setup(probeProps) {
        // Capture the function reference at setup-time. Vue does NOT re-run
        // setup() when the parent's prop value mutates (the prop object
        // identity is itself stable here — only its `.current` property is
        // reassigned).
        useRouteEnter(probeProps.handlerRef.current);

        return () => h("div", { "data-testid": "probe" });
      },
    });

    const handlerRef = { current: originalHandler as RouteEnterHandler };

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router },
            { default: () => h(Probe, { handlerRef }) },
          ),
      }),
    );

    // Reassign before any navigation — but AFTER setup() has captured the
    // original. The watcher inside useRouteEnter holds the original closure.
    handlerRef.current = replacementHandler;

    await router.navigate("about");
    await flushPromises();

    expect(originalHandler).toHaveBeenCalledTimes(1);
    expect(replacementHandler).not.toHaveBeenCalled();
  });
});
