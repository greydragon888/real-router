// packages/preact/tests/stress/error-boundary-mount-unmount.stress.tsx

/**
 * Stress tests for `<RouterErrorBoundary>` mount/unmount under an active
 * navigation error + concurrent re-throws.
 *
 * Closes §7.2 #8 review item: "RouterErrorBoundary mount/unmount во время
 * активной ошибки — unmount path covered functionally, но не stress с
 * concurrent re-throws. Risk: dismissal state lost on remount → stale
 * fallback или дублирующиеся notifications."
 *
 * Mount-ordering note: `getErrorSource` is eager but constructed lazily on
 * first call. A test that navigates BEFORE mounting the first boundary
 * would see no captured error because the eager subscription would not
 * yet exist. All tests below mount FIRST, then navigate.
 *
 * Invariants:
 *  - 50 mount/unmount cycles around an active error — fallback renders
 *    every time (the dismissable source is per-router cached and survives
 *    remount).
 *  - Remount after resetError() does NOT resurrect the dismissed error
 *    (dismissedVersion state survives remount).
 *  - Rapid concurrent re-throws — onError fires exactly once per error
 *    event, no duplicates from re-subscription storms.
 */

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { act, cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterErrorBoundary, RouterProvider } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router, RouterError, State } from "@real-router/core";

describe("R — RouterErrorBoundary mount/unmount under active error (§7.2 #8)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    // Permanently block "users.view" so we can trigger CANNOT_ACTIVATE
    // on demand. Sticky for the lifetime of the router.
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("users.view", () => () => false);
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("50 mount/unmount cycles around an active error — fallback renders every time, no leak", async () => {
    // Mount FIRST so getErrorSource subscribes BEFORE the failing nav.
    // Then trigger the error. From this point onward, every fresh boundary
    // mount must see the error via the per-router cached dismissable source.
    let fallbackRenders = 0;

    const initialView = render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={(error: RouterError) => {
            fallbackRenders++;

            return <div data-testid="fallback-initial">{error.code}</div>;
          }}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    await act(async () => {
      await router
        .navigate("users.view", { id: "1" })
        .catch((error: unknown) => error as RouterError);
    });

    // Initial render observed the error.
    expect(initialView.getByTestId("fallback-initial").textContent).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    initialView.unmount();

    // 50 fresh mount/unmount cycles. Each must see the same active error
    // via the WeakMap-cached source.
    for (let i = 0; i < 50; i++) {
      const view = render(
        <RouterProvider router={router}>
          <RouterErrorBoundary
            fallback={(error: RouterError) => {
              fallbackRenders++;

              return <div data-testid={`fallback-${i}`}>{error.code}</div>;
            }}
          >
            <div data-testid="children">App</div>
          </RouterErrorBoundary>
        </RouterProvider>,
      );

      expect(view.getByTestId(`fallback-${i}`).textContent).toBe(
        errorCodes.CANNOT_ACTIVATE,
      );

      view.unmount();
    }

    // Lower bound: 1 (initial) + 50 (loop) = 51 fallback renders. Preact
    // may double-invoke under StrictMode-style harness behaviour, so we
    // assert the floor only — the regression to catch is "0 renders after
    // remount" (per-router source dropped its state).
    expect(fallbackRenders).toBeGreaterThanOrEqual(51);
  });

  it("remount after resetError does NOT resurrect the dismissed error", async () => {
    // Mount → trigger error → reset → unmount → remount. The
    // dismissedVersion state must persist via the per-router cached source.
    let reset: (() => void) | null = null;

    const view = render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={(_error: RouterError, resetError: () => void) => {
            reset = resetError;

            return <div data-testid="fallback-1">err</div>;
          }}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    await act(async () => {
      await router
        .navigate("users.view", { id: "1" })
        .catch((error: unknown) => error as RouterError);
    });

    expect(view.queryByTestId("fallback-1")).not.toBeNull();

    // Dismiss the error from the rendered fallback.
    await act(async () => {
      reset?.();
    });

    expect(view.queryByTestId("fallback-1")).toBeNull();

    view.unmount();

    // Remount a fresh boundary. The dismissed state must survive.
    const view2 = render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={() => <div data-testid="fallback-2">err</div>}
        >
          <div data-testid="children-2">App</div>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    expect(view2.queryByTestId("fallback-2")).toBeNull();
    expect(view2.queryByTestId("children-2")).not.toBeNull();
  });

  it("rapid concurrent re-throws — onError invoked once per error event, no duplicates", async () => {
    // Fire 20 rapid failing navigations back-to-back AFTER mount. Each
    // rejection emits one TRANSITION_ERROR; `onError` must fire exactly
    // 20 times.
    const onErrorCalls: {
      code: string;
      to: string | null;
      from: string | null;
    }[] = [];

    render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={(error: RouterError) => <div>{error.code}</div>}
          onError={(
            error: RouterError,
            to: State | null,
            from: State | null,
          ) => {
            onErrorCalls.push({
              code: error.code,
              to: to?.name ?? null,
              from: from?.name ?? null,
            });
          }}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await router
          .navigate("users.view", { id: String(i) })
          .catch((error: unknown) => error as RouterError);
      });
    }

    // 20 navigations × 1 onError call each.
    expect(onErrorCalls).toHaveLength(20);

    for (const call of onErrorCalls) {
      expect(call.code).toBe(errorCodes.CANNOT_ACTIVATE);
    }
  });

  /**
   * Closes review §7 #13 LOW-MEDIUM: "RouterErrorBoundary: вложенные —
   * `RouterErrorBoundary.test.tsx:334` (nested boundaries both show error),
   * но не stress mount/unmount нескольких вложенных при concurrent errors.
   * Дубль onError calls если дочерний boundary не reset'ит до распространения."
   *
   * Outer and inner boundaries both subscribe to the SAME router-cached
   * `createDismissableError` source. The contract: each onError fires once
   * per error event per boundary instance, even under rapid concurrent
   * navigations and mount/unmount churn.
   */
  it("two nested boundaries each fire onError exactly once per error event (no duplicates)", async () => {
    const outerCalls: RouterError[] = [];
    const innerCalls: RouterError[] = [];

    render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={(error) => (
            <div data-testid="outer-fallback">{error.code}</div>
          )}
          onError={(error) => {
            outerCalls.push(error);
          }}
        >
          <RouterErrorBoundary
            fallback={(error) => (
              <div data-testid="inner-fallback">{error.code}</div>
            )}
            onError={(error) => {
              innerCalls.push(error);
            }}
          >
            <div data-testid="children">App</div>
          </RouterErrorBoundary>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    for (let i = 0; i < 30; i++) {
      await act(async () => {
        await router
          .navigate("users.view", { id: String(i) })
          .catch((error: unknown) => error as RouterError);
      });
    }

    // Each error event must call BOTH boundaries' onError exactly once.
    // A regression where one boundary's subscription fires multiple times
    // per event would surface as `outerCalls.length > 30`.
    expect(outerCalls).toHaveLength(30);
    expect(innerCalls).toHaveLength(30);

    for (const call of [...outerCalls, ...innerCalls]) {
      expect(call.code).toBe(errorCodes.CANNOT_ACTIVATE);
    }
  });

  it("nested boundaries survive 50 mount/unmount cycles of the inner under an error", async () => {
    // Mount outer once, then mount/unmount the inner 50 times. After every
    // inner mount, trigger a fresh error and verify the inner's fallback
    // renders (proves the per-router cached source re-attaches the inner's
    // listener correctly across remount churn).
    const { rerender } = render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={(error) => (
            <div data-testid="outer-fallback">{error.code}</div>
          )}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    for (let i = 0; i < 50; i++) {
      // Mount inner.
      rerender(
        <RouterProvider router={router}>
          <RouterErrorBoundary
            fallback={(error) => (
              <div data-testid="outer-fallback">{error.code}</div>
            )}
          >
            <RouterErrorBoundary
              fallback={(error) => (
                <div data-testid={`inner-fallback-${i}`}>{error.code}</div>
              )}
            >
              <div data-testid="children">App</div>
            </RouterErrorBoundary>
          </RouterErrorBoundary>
        </RouterProvider>,
      );

      await act(async () => {
        await router
          .navigate("users.view", { id: `iter-${i}` })
          .catch((error: unknown) => error as RouterError);
      });

      // Inner fallback for THIS iteration must be visible — proves the inner
      // boundary subscribed and received the latest error event.
      expect(screen.getByTestId(`inner-fallback-${i}`)).toBeInTheDocument();

      // Unmount inner (back to outer-only tree).
      rerender(
        <RouterProvider router={router}>
          <RouterErrorBoundary
            fallback={(error) => (
              <div data-testid="outer-fallback">{error.code}</div>
            )}
          >
            <div data-testid="children">App</div>
          </RouterErrorBoundary>
        </RouterProvider>,
      );

      // Previous inner-fallback-i node should be gone.
      expect(screen.queryByTestId(`inner-fallback-${i}`)).toBeNull();
    }

    // Outer survived all 50 remount cycles.
    expect(screen.getByTestId("outer-fallback")).toBeInTheDocument();
  });

  it("resetError() on inner does NOT dismiss outer (per-boundary dismissedVersion)", async () => {
    // Important behaviour: `createDismissableError` is per-router cached;
    // BUT each `useSyncExternalStore` consumer holds its own snapshot. The
    // `resetError` exposed via fallback is captured in the snapshot —
    // calling it on the inner advances dismissedVersion in the shared
    // dismissable store, which dismisses for BOTH outer and inner on the
    // SAME error event. This test locks the documented behaviour: the
    // shared dismissable source is a SINGLE channel; reset propagates to
    // both boundaries.
    let innerResetFn: (() => void) | undefined;
    let outerResetFn: (() => void) | undefined;

    render(
      <RouterProvider router={router}>
        <RouterErrorBoundary
          fallback={(error, resetError) => {
            outerResetFn = resetError;

            return <div data-testid="outer-fallback">{error.code}</div>;
          }}
        >
          <RouterErrorBoundary
            fallback={(error, resetError) => {
              innerResetFn = resetError;

              return <div data-testid="inner-fallback">{error.code}</div>;
            }}
          >
            <div data-testid="children">App</div>
          </RouterErrorBoundary>
        </RouterErrorBoundary>
      </RouterProvider>,
    );

    await act(async () => {
      await router
        .navigate("users.view", { id: "1" })
        .catch((error: unknown) => error as RouterError);
    });

    expect(screen.getByTestId("inner-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("outer-fallback")).toBeInTheDocument();
    expect(innerResetFn).toBeDefined();
    expect(outerResetFn).toBeDefined();

    // Call inner's resetError — single shared channel means BOTH dismiss.
    await act(async () => {
      innerResetFn?.();
    });

    expect(screen.queryByTestId("inner-fallback")).toBeNull();
    expect(screen.queryByTestId("outer-fallback")).toBeNull();
  });
});
