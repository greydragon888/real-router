import { render, screen, act } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { useRoute, useRouteNode, RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Reactive-lifecycle regression invariants (#778) — the gap the audit flagged:
// the package suites cover only pure functions, none asserts the subscription
// lifecycle survives unmount → navigate → remount. These are the preact P1 / P1b
// probes ported as permanent guards (both pass today — anti-stale locks).
describe("reactive lifecycle (#778)", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  // P1b — Preact has no <Activity>, so a full Provider unmount/remount is the
  // only "hide → navigate → show" shape. It is immune to the #765 reconnect
  // stale window: the Provider's `useMemo(createRouteSource)` instance dies with
  // the unmount, so a fresh Provider builds a fresh source that reads the
  // current `router.getState()`. Locks that #765 stays latent for Preact.
  it("P1b: a full RouterProvider remount renders the route that changed while unmounted", async () => {
    await router.start("/users/list");

    const RouteName = () => {
      const { route } = useRoute();

      return <div data-testid="route">{route.name}</div>;
    };

    const { unmount } = render(
      <RouterProvider router={router}>
        <RouteName />
      </RouterProvider>,
    );

    expect(screen.getByTestId("route").textContent).toBe("users.list");

    // Unmount the whole Provider — its source instance dies with it.
    unmount();

    // Navigate while no Provider (and no source) is mounted.
    await act(async () => {
      await router.navigate("about");
    });

    // A fresh Provider builds a fresh createRouteSource → current state.
    render(
      <RouterProvider router={router}>
        <RouteName />
      </RouterProvider>,
    );

    expect(screen.getByTestId("route").textContent).toBe("about");
  });

  // P1 — a nested node consumer that unmounts, misses a navigation while
  // disconnected, then remounts must reconcile to the current node state. This
  // is `createRouteNodeSource`'s reconnect reconcile + BaseSource subscribe
  // order (listener added before onFirstSubscribe) + the uSES polyfill working
  // end to end — the exact chain the sources "BaseSource subscribe order"
  // invariant exists for.
  it("P1: a useRouteNode consumer that remounts after a missed navigation is fresh", async () => {
    await router.start("/users/list");

    const NodeReader = () => {
      const { route } = useRouteNode("users");

      return <div data-testid="node">{route?.name ?? "none"}</div>;
    };

    const Tree = ({ show }: { show: boolean }) => (
      <RouterProvider router={router}>
        {show ? <NodeReader /> : <div data-testid="hidden">hidden</div>}
      </RouterProvider>
    );

    const { rerender } = render(<Tree show />);

    expect(screen.getByTestId("node").textContent).toBe("users.list");

    // Unmount the node consumer (last subscriber → source disconnects). The
    // Provider stays mounted, so only createRouteNodeSource("users") drops.
    rerender(<Tree show={false} />);

    expect(screen.getByTestId("hidden")).not.toBeNull();

    // Navigate WITHIN the "users" node while the consumer is unmounted.
    await act(async () => {
      await router.navigate("users.view", { id: "42" });
    });

    // Remount the consumer — onFirstSubscribe reconciles to the current node
    // state and the just-added listener catches it: the snapshot is fresh.
    rerender(<Tree show />);

    expect(screen.getByTestId("node").textContent).toBe("users.view");
  });
});
