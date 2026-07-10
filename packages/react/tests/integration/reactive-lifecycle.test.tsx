import { act, render, screen } from "@testing-library/react";
import { Activity } from "react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  Link,
  RouterErrorBoundary,
  RouterProvider,
  useRoute,
  useRouteEnter,
} from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Reactive-lifecycle regression invariants (#778) — the gap the audit flagged.
// This is the react P1 probe ported as a permanent guard: it locks the #765
// reconnect-reconcile fix under React 19's <Activity> hide → navigate → show.
describe("reactive lifecycle (#778)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
    // .catch: browser-plugin shares jsdom's window.location across tests, so a
    // prior test may have left us on /users/list → SAME_STATES (harmless here).
    await router.navigate("users.list").catch(() => {});
  });

  afterEach(() => {
    router.stop();
  });

  // #765 manifestation in React: a RouterProvider mounted UNDER an <Activity>
  // boundary. Hiding detaches effects → useSyncExternalStore unsubscribes →
  // createRouteSource disconnects; a navigation that lands while hidden was
  // stale on re-show before #765. With the reconnect reconcile (createRouteSource
  // onFirstSubscribe) the re-subscribed Provider reads the current route.
  it("P1: RouterProvider under <Activity> is fresh after hide → navigate → show", async () => {
    const RouteName = (): React.JSX.Element => {
      const { route } = useRoute();

      return <div data-testid="route-name">{route.name}</div>;
    };

    const Tree = ({
      mode,
    }: {
      mode: "visible" | "hidden";
    }): React.JSX.Element => (
      <Activity mode={mode}>
        <RouterProvider router={router}>
          <RouteName />
        </RouterProvider>
      </Activity>
    );

    const { rerender } = render(<Tree mode="visible" />);

    expect(screen.getByTestId("route-name").textContent).toBe("users.list");

    // Hide → effects detach → uSES unsubscribes → createRouteSource disconnects.
    rerender(<Tree mode="hidden" />);

    // Navigate while hidden.
    await act(async () => {
      await router.navigate("about");
    });

    // Show → re-subscribe → createRouteSource reconciles on first subscribe →
    // the Provider renders the current route, not the stale one.
    rerender(<Tree mode="visible" />);

    expect(screen.getByTestId("route-name").textContent).toBe("about");
  });

  // #1218 manifestation of the SAME hide → navigate → show reconcile: on
  // re-show the reconciled snapshot carries previousRoute: undefined (the
  // reconcile is a fresh read of router.getState() with no tracked predecessor).
  // useRouteEnter's `!previousRoute` guard MUST skip the handler rather than
  // invoke it with previousRoute: undefined, which RouteEnterContext.previousRoute
  // (non-nullable State) forbids. Probe PC2 from the #1218 audit, ported as a
  // permanent guard — discriminating: delete the guard and the handler fires
  // once with an undefined previousRoute, failing the assertion below.
  it("PC2 (#1218): useRouteEnter skips its handler after an <Activity> catch-up reconcile leaves previousRoute undefined", async () => {
    const handler = vi.fn();

    const Enter = (): React.JSX.Element => {
      useRouteEnter(handler, { skipSameRoute: false });

      return <div data-testid="enter-probe" />;
    };

    const Tree = ({
      mode,
    }: {
      mode: "visible" | "hidden";
    }): React.JSX.Element => (
      <Activity mode={mode}>
        <RouterProvider router={router}>
          <Enter />
        </RouterProvider>
      </Activity>
    );

    const { rerender } = render(<Tree mode="visible" />);

    // Hide → effects detach → source disconnects.
    rerender(<Tree mode="hidden" />);

    // Navigate while hidden.
    await act(async () => {
      await router.navigate("about");
    });

    // Show → reconcile → snapshot { route: about, previousRoute: undefined }.
    // The enter handler must NOT fire with an undefined previousRoute.
    rerender(<Tree mode="visible" />);

    expect(handler).not.toHaveBeenCalled();
  });

  // #766 manifestation: per-item-params <Link> on a long-lived router. Before
  // the lazy fix each unique (name|params) key opened a PERMANENT router
  // subscription (eager + no-op destroy), so unmounting the Links freed nothing
  // and the listener count grew toward the EventEmitter limit (10000). With the
  // lazy connection, an unmounted Link disconnects its active source — the
  // router-subscription count returns to ~baseline, bounded regardless of N.
  it("P3: N unique-params Links release their router subscriptions on unmount", () => {
    const N = 100;
    let active = 0;
    const realSubscribe = router.subscribe.bind(router);

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      active++;
      const unsubscribe = realSubscribe(listener);

      return () => {
        active--;
        unsubscribe();
      };
    });

    const Links = ({ show }: { show: boolean }): React.JSX.Element => (
      <RouterProvider router={router}>
        {show
          ? Array.from({ length: N }, (_, i) => (
              <Link
                key={i}
                routeName="users.view"
                routeParams={{ id: String(i) }}
              >
                {`U${String(i)}`}
              </Link>
            ))
          : null}
      </RouterProvider>
    );

    const { rerender } = render(<Links show />);

    // N unique-params Links each hold one active-route subscription (+ the
    // Provider's route subscription).
    const afterMount = active;

    expect(afterMount).toBeGreaterThanOrEqual(N);

    // Unmount every Link (the Provider stays mounted).
    rerender(<Links show={false} />);

    // Lazy connection: each unmounted Link disconnects → its subscription is
    // released. The count drops back to the Provider's handful, NOT N.
    expect(active).toBeLessThan(afterMount);
    expect(active).toBeLessThanOrEqual(2);

    vi.restoreAllMocks();
  });

  // #765 1.2 manifestation: a navigation error that fires BEFORE a
  // RouterErrorBoundary mounts (the ordinary load order — a lazy app shell, or
  // a failed boot navigation) is invisible to a boundary that creates its error
  // source lazily on mount, AFTER the error. RouterProvider now eagerly creates
  // the per-router error source, so it captures the error from Provider mount;
  // the boundary's createDismissableError catches up (#765) and shows the
  // fallback.
  it("P2: a RouterErrorBoundary mounted AFTER a navigation error shows the fallback", async () => {
    const Shell = ({
      withBoundary,
    }: {
      withBoundary: boolean;
    }): React.JSX.Element => (
      <RouterProvider router={router}>
        {withBoundary ? (
          <RouterErrorBoundary
            fallback={(error) => <div data-testid="fb">{error.code}</div>}
          >
            <div>app</div>
          </RouterErrorBoundary>
        ) : (
          <div>app</div>
        )}
      </RouterProvider>
    );

    const { rerender } = render(<Shell withBoundary={false} />);

    // Navigation error BEFORE the boundary mounts.
    await act(async () => {
      await router.navigate("nonexistent").catch(() => {});
    });

    // Mount the boundary now (e.g. a lazily-loaded app shell).
    rerender(<Shell withBoundary />);

    expect(screen.getByTestId("fb")).not.toBeNull();
    expect(screen.getByTestId("fb").textContent).toBe("ROUTE_NOT_FOUND");
  });
});
