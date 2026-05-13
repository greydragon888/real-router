// packages/preact/tests/stress/suspense-lazy-routeview.stress.tsx

/**
 * Stress tests for Suspense + RouteView.Match `fallback` + lazy() under rapid
 * navigations.
 *
 * Closes §7.2 #12 (M22): "Suspense + RouteView + lazy() под stress — fallback
 * documented 'experimental'. Rapid navigations among lazy-loaded matches
 * uncovered. Risk: race lazy promise resolves после unmount →
 * uncaught rejection."
 *
 * Background:
 *   RouteView.Match with `fallback` wraps children in `<Suspense>` from
 *   preact/compat. When a lazy() component throws its pending Promise, Preact
 *   suspends the Suspense boundary and shows `fallback`. If the router
 *   navigates away BEFORE the lazy promise resolves, the Suspense boundary
 *   (and its children) unmount. The lazy promise may still resolve after
 *   unmount — this must not cause uncaught rejections or reconciler errors.
 *
 * Test design:
 *   We use controlled Promises (not real dynamic import()) so we can
 *   reproduce the exact timing: suspend → navigate away → resolve.
 *   preact/compat's `lazy()` is used as the integration point to mirror
 *   real-world usage.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/preact";
import { lazy } from "preact/compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider, RouteView } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

// ---------------------------------------------------------------------------
// Helper: controlled lazy module
// ---------------------------------------------------------------------------

interface LazyControl {
  /** The lazy Preact component — suspends until `resolve` is called. */
  Component: FunctionComponent;
  /** Resolve the lazy module with a simple text-rendering component. */
  resolve: (testId: string) => void;
  /** The underlying module promise (awaitable for act() synchronisation). */
  modulePromise: Promise<{ default: FunctionComponent }>;
}

function makeControlledLazy(): LazyControl {
  let resolveModule!: (value: { default: FunctionComponent }) => void;
  const modulePromise = new Promise<{ default: FunctionComponent }>((r) => {
    resolveModule = r;
  });

  // preact/compat lazy() is typed as returning T extends ComponentType<any>,
  // but the inferred type for FunctionComponent may not satisfy the
  // ComponentType constraint in all preact versions — cast to bypass.
  const Component = lazy(() => modulePromise) as unknown as FunctionComponent;

  return {
    Component,
    resolve: (testId: string) => {
      resolveModule({
        default: () => <span data-testid={testId}>lazy-content</span>,
      });
    },
    modulePromise,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("R — Suspense + RouteView.Match lazy() stress (§7.2 #12, M22)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Core race: lazy resolves AFTER RouteView.Match unmounts
  // -----------------------------------------------------------------------

  it("lazy promise resolves after RouteView.Match unmounts — no uncaught rejection, no crash", async () => {
    const {
      Component: LazyComp,
      resolve,
      modulePromise,
    } = makeControlledLazy();

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match
            segment="route1"
            fallback={<span data-testid="loading">loading</span>}
          >
            <LazyComp />
          </RouteView.Match>
          <RouteView.Match segment="route0">
            <span data-testid="home">home</span>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    // Navigate to route1 — lazy suspends, Suspense shows fallback.
    await act(async () => {
      await router.navigate("route1");
    });

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();

    // Navigate away BEFORE lazy resolves — Match and its Suspense unmount.
    await act(async () => {
      await router.navigate("route0");
    });

    expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("home")).toBeInTheDocument();

    // NOW resolve the lazy promise. The Suspense boundary is already
    // unmounted. This must be a silent no-op — no throw, no uncaught
    // rejection, no attempt to re-render into a detached tree.
    await act(async () => {
      resolve("lazy-resolved-after-unmount");
      await modulePromise;
    });

    // Lazy content must NOT appear (its Suspense is unmounted).
    expect(
      screen.queryByTestId("lazy-resolved-after-unmount"),
    ).not.toBeInTheDocument();
    // Home stays stable.
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 2. Rapid in/out × 20 cycles — no crashes
  // -----------------------------------------------------------------------

  it("rapid in/out of lazy route × 20 cycles — fallback toggled correctly, no crashes", async () => {
    // A lazy component whose module promise never resolves during the
    // test — simulates a network-slow import().
    const neverResolvingModule = new Promise<{ default: FunctionComponent }>(
      () => undefined,
    );
    const AlwaysLazy = lazy(
      () => neverResolvingModule,
    ) as unknown as FunctionComponent;

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match
            segment="route1"
            fallback={<span data-testid="loading">loading</span>}
          >
            <AlwaysLazy />
          </RouteView.Match>
          <RouteView.Match segment="route0">
            <span data-testid="home">home</span>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    const CYCLES = 20;

    for (let i = 0; i < CYCLES; i++) {
      // Navigate in — Suspense shows fallback.
      await act(async () => {
        await router.navigate("route1");
      });

      expect(screen.getByTestId("loading")).toBeInTheDocument();
      expect(screen.queryByTestId("home")).not.toBeInTheDocument();

      // Navigate out — Suspense unmounts, home appears.
      await act(async () => {
        await router.navigate("route0");
      });

      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
      expect(screen.getByTestId("home")).toBeInTheDocument();
    }
  });

  // -----------------------------------------------------------------------
  // 3. Resolve order independence — multiple sequential lazy resolutions
  // -----------------------------------------------------------------------

  it("N sequential lazy resolutions after nav-away — each is a no-op, no reconciler corruption", async () => {
    const COUNT = 8;
    const controls = Array.from({ length: COUNT }, () => makeControlledLazy());

    // Navigate to route1 (which has the first lazy), navigate away, then
    // repeat with fresh lazy instances on each cycle. Each cycle: a new
    // lazy is pending → nav away → resolve → assert no content appears.

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          {controls.map(({ Component: C }, i) => (
            <RouteView.Match
              key={i}
              segment="route1"
              fallback={<span data-testid={`loading-${i}`}>loading</span>}
            >
              <C />
            </RouteView.Match>
          ))}
          <RouteView.Match segment="route0">
            <span data-testid="home">home</span>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    // RouteView renders the FIRST matching segment only. Navigate once to
    // trigger the first Match (which renders C[0]).
    await act(async () => {
      await router.navigate("route1");
    });

    // First Match is active, its lazy suspends → loading visible.
    await waitFor(() => {
      expect(screen.getByTestId("loading-0")).toBeInTheDocument();
    });

    // Navigate away — all Matches for route1 unmount.
    await act(async () => {
      await router.navigate("route0");
    });

    expect(screen.getByTestId("home")).toBeInTheDocument();

    // Resolve all lazy modules sequentially — each must be a silent no-op.
    for (let i = 0; i < COUNT; i++) {
      await act(async () => {
        controls[i].resolve(`lazy-${i}`);
        await controls[i].modulePromise;
      });

      expect(screen.queryByTestId(`lazy-${i}`)).not.toBeInTheDocument();
    }

    // Home must remain intact throughout.
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 4. Lazy resolves WHILE still mounted — normal render path
  // -----------------------------------------------------------------------

  it("lazy that resolves while still mounted renders content correctly", async () => {
    const {
      Component: LazyComp,
      resolve,
      modulePromise,
    } = makeControlledLazy();

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match
            segment="route1"
            fallback={<span data-testid="loading">loading</span>}
          >
            <LazyComp />
          </RouteView.Match>
          <RouteView.Match segment="route0">
            <span data-testid="home">home</span>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route1");
    });

    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Resolve while still on route1 — lazy renders.
    await act(async () => {
      resolve("lazy-while-mounted");
      await modulePromise;
    });

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
      expect(screen.getByTestId("lazy-while-mounted")).toBeInTheDocument();
    });
  });
});
