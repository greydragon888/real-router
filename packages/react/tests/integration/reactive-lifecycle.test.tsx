import { act, render, screen } from "@testing-library/react";
import { Activity } from "react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { Link, RouterProvider, useRoute } from "@real-router/react";

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
    await router.navigate("users.list");
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
});
