/**
 * Stress tests for `<RouterErrorBoundary>` mount/unmount under an active
 * navigation error + concurrent re-throws (§7.2 #8, MED).
 *
 * Closes the §7.2 #8 review item: "RouterErrorBoundary mount/unmount во время
 * активной ошибки — Pattern C тестирует mount при чистом route, не при
 * активной error state. Race: navigate fail → boundary catches → unmount
 * mid-recovery → next navigate → boundary остаётся sticky?"
 *
 * Counterpart: `packages/preact/tests/stress/error-boundary-mount-unmount.stress.tsx`.
 *
 * Mount-ordering note: `createDismissableError` is eager but constructed
 * lazily on first call (cached per-router in `@real-router/sources`). A
 * test that navigates BEFORE mounting the first boundary would see no
 * captured error because the eager subscription would not yet exist. All
 * tests below mount FIRST, then navigate.
 *
 * Invariants:
 *  - 50 mount/unmount cycles around an active error — fallback renders
 *    every time (per-router cached source survives remount).
 *  - Remount after resetError does NOT resurrect the dismissed error
 *    (dismissedVersion state survives remount via the cached source).
 *  - Rapid concurrent re-throws — onError fires exactly once per error.
 */

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { createStressRouter } from "./helpers";
import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router, RouterError, State } from "@real-router/core";
import type { VNode } from "vue";

function mountBoundary(
  router: Router,
  options: {
    fallback: (error: RouterError, resetError: () => void) => VNode;
    onError?: (
      error: RouterError,
      toRoute: State | null,
      fromRoute: State | null,
    ) => void;
    childrenTestId?: string;
  },
): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      setup: () => () =>
        h(
          RouterProvider,
          { router },
          {
            default: () =>
              h(
                RouterErrorBoundary,
                {
                  fallback: options.fallback,
                  ...(options.onError ? { onError: options.onError } : {}),
                },
                {
                  default: () =>
                    h(
                      "div",
                      { "data-testid": options.childrenTestId ?? "children" },
                      "App",
                    ),
                },
              ),
          },
        ),
    }),
  );
}

describe("§7.2 #8 — RouterErrorBoundary mount/unmount under active error (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    // Permanently block `users.view` so we can trigger CANNOT_ACTIVATE
    // on demand. Sticky for the lifetime of the router.
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("users.view", () => () => false);
  });

  afterEach(() => {
    router.stop();
  });

  it("8.1: 50 mount/unmount cycles around an active error — fallback renders every time, no leak", async () => {
    let fallbackRenders = 0;

    const initialView = mountBoundary(router, {
      fallback: (error: RouterError) => {
        fallbackRenders++;

        return h("div", { "data-testid": "fallback-initial" }, error.code);
      },
      childrenTestId: "children-initial",
    });

    await router
      .navigate("users.view", { id: "1" })
      .catch((error: unknown) => error as RouterError);
    await flushPromises();
    await nextTick();

    expect(initialView.find("[data-testid='fallback-initial']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    initialView.unmount();

    // 50 fresh mount/unmount cycles. Each must see the same active error
    // via the WeakMap-cached source.
    for (let i = 0; i < 50; i++) {
      const view = mountBoundary(router, {
        fallback: (error: RouterError) => {
          fallbackRenders++;

          return h("div", { "data-testid": `fallback-${i}` }, error.code);
        },
        childrenTestId: `children-${i}`,
      });

      await flushPromises();
      await nextTick();

      expect(view.find(`[data-testid='fallback-${i}']`).text()).toBe(
        errorCodes.CANNOT_ACTIVATE,
      );

      view.unmount();
    }

    // Lower bound: 1 (initial) + 50 (loop) = 51 fallback renders. Vue's
    // watcher may double-flush, so we assert the floor only — the
    // regression we catch is "0 renders after remount".
    expect(fallbackRenders).toBeGreaterThanOrEqual(51);
  });

  it("8.2: remount after resetError does NOT resurrect the dismissed error", async () => {
    // Mount → trigger error → reset → unmount → remount. The
    // dismissedVersion state must persist via the per-router cached source.
    const ref: { reset: (() => void) | null } = { reset: null };

    const view = mountBoundary(router, {
      fallback: (_error: RouterError, resetError: () => void) => {
        ref.reset = resetError;

        return h("div", { "data-testid": "fallback-1" }, "err");
      },
      childrenTestId: "children-1",
    });

    await router
      .navigate("users.view", { id: "1" })
      .catch((error: unknown) => error as RouterError);
    await flushPromises();
    await nextTick();

    expect(view.find("[data-testid='fallback-1']").exists()).toBe(true);

    ref.reset?.();
    await nextTick();
    await flushPromises();

    expect(view.find("[data-testid='fallback-1']").exists()).toBe(false);

    view.unmount();

    // Remount a fresh boundary. The dismissed state must survive.
    const view2 = mountBoundary(router, {
      fallback: () => h("div", { "data-testid": "fallback-2" }, "err"),
      childrenTestId: "children-2",
    });

    await flushPromises();
    await nextTick();

    expect(view2.find("[data-testid='fallback-2']").exists()).toBe(false);
    expect(view2.find("[data-testid='children-2']").exists()).toBe(true);

    view2.unmount();
  });

  it("8.3: rapid concurrent re-throws — onError invoked once per error event, no duplicates", async () => {
    // Fire 20 rapid failing navigations back-to-back AFTER mount. Each
    // rejection emits one TRANSITION_ERROR; `onError` must fire exactly
    // 20 times.
    const onErrorCalls: {
      code: string;
      to: string | null;
      from: string | null;
    }[] = [];

    const view = mountBoundary(router, {
      fallback: (error: RouterError) => h("div", null, error.code),
      onError: (
        error: RouterError,
        to: State | null,
        from: State | null,
      ): void => {
        onErrorCalls.push({
          code: error.code,
          to: to?.name ?? null,
          from: from?.name ?? null,
        });
      },
    });

    for (let i = 0; i < 20; i++) {
      await router
        .navigate("users.view", { id: String(i) })
        .catch((error: unknown) => error as RouterError);
      await flushPromises();
    }

    await nextTick();

    expect(onErrorCalls).toHaveLength(20);

    for (const call of onErrorCalls) {
      expect(call.code).toBe(errorCodes.CANNOT_ACTIVATE);
    }

    view.unmount();
  });

  it("8.4: unmount mid-error then remount — fresh boundary observes the same active error", async () => {
    // Race scenario: error active → unmount → no boundary mounted → remount.
    // The cached dismissable source must still hold the error so the fresh
    // boundary lights up immediately on first paint.
    const view1 = mountBoundary(router, {
      fallback: (error: RouterError) =>
        h("div", { "data-testid": "fallback-a" }, error.code),
      childrenTestId: "children-a",
    });

    await router
      .navigate("users.view", { id: "1" })
      .catch((error: unknown) => error as RouterError);
    await flushPromises();
    await nextTick();

    expect(view1.find("[data-testid='fallback-a']").exists()).toBe(true);

    view1.unmount();

    // Fresh boundary — must see the persisted error from the cached source.
    const view2 = mountBoundary(router, {
      fallback: (error: RouterError) =>
        h("div", { "data-testid": "fallback-b" }, error.code),
      childrenTestId: "children-b",
    });

    await flushPromises();
    await nextTick();

    expect(view2.find("[data-testid='fallback-b']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    view2.unmount();
  });
});
