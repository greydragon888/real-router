import { render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, lazy, onCleanup } from "solid-js";
import { describe, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/solid";

import { createStressRouter } from "./helpers";

/**
 * Audit section 7, scenario #10: RouteView switching between lazy() components
 * with Suspense fallback.
 *
 * Verifies:
 *   - Previous lazy component is disposed (onCleanup fires) on every switch.
 *   - Suspense fallback clears once the new chunk resolves.
 *   - Rapid A→B→A→B cycles do not leak onCleanup subscriptions.
 */
describe("S8 — RouteView lazy switching (Solid)", () => {
  it("8.1: N switches between lazy routes — previous component disposed each time", async () => {
    const router = createStressRouter(0);

    await router.start("/users/list");

    let usersDisposed = 0;
    let adminDisposed = 0;

    // Deferred loaders — we resolve them eagerly for test determinism.
    const LazyUsers = lazy(() =>
      Promise.resolve({
        default: function UsersPage() {
          onCleanup(() => {
            usersDisposed++;
          });

          return <div data-testid="users">Users</div>;
        },
      }),
    );

    const LazyAdmin = lazy(() =>
      Promise.resolve({
        default: function AdminPage() {
          onCleanup(() => {
            adminDisposed++;
          });

          return <div data-testid="admin">Admin</div>;
        },
      }),
    );

    render(() => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users" fallback={<div>loading-users</div>}>
            <LazyUsers />
          </RouteView.Match>
          <RouteView.Match segment="admin" fallback={<div>loading-admin</div>}>
            <LazyAdmin />
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    const SWITCHES = 20;

    for (let i = 0; i < SWITCHES; i++) {
      const target = i % 2 === 0 ? "admin.dashboard" : "users.list";

      await router.navigate(target);
      await waitFor(() => {
        const expectedId = target.startsWith("admin") ? "admin" : "users";

        expect(screen.getByTestId(expectedId)).toBeInTheDocument();
      });
    }

    // 20 switches starting from users. Pattern: users → admin → users → ... → admin.
    // After an even-indexed switch (i=0,2,...) we end on admin — users was disposed.
    // After an odd-indexed switch we end on users — admin was disposed.
    // Totals: 10 admin disposals + 10 users disposals (+ 1 initial users disposal on first switch).
    expect(usersDisposed).toBeGreaterThanOrEqual(SWITCHES / 2);
    expect(adminDisposed).toBeGreaterThanOrEqual(SWITCHES / 2);

    router.stop();
  });

  it("8.2: Suspense fallback clears after lazy chunk resolves", async () => {
    const router = createStressRouter(0);

    await router.start("/users/list");

    let resolveChunk!: (module_: {
      default: () => ReturnType<typeof SlowPage>;
    }) => void;

    function SlowPage() {
      return <div data-testid="slow">Slow</div>;
    }

    const LazySlow = lazy(
      () =>
        new Promise<{ default: typeof SlowPage }>((resolve) => {
          resolveChunk = resolve;
        }),
    );

    const [show, setShow] = createSignal(false);

    render(() => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users" fallback={<div>users-fallback</div>}>
            {show() ? <LazySlow /> : <div data-testid="eager">Eager</div>}
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    ));

    expect(screen.getByTestId("eager")).toBeInTheDocument();

    setShow(true);

    // While the chunk is pending, Suspense shows its fallback.
    await waitFor(() => {
      expect(screen.getByText("users-fallback")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("slow")).not.toBeInTheDocument();

    resolveChunk({ default: SlowPage });

    await waitFor(() => {
      expect(screen.getByTestId("slow")).toBeInTheDocument();
    });

    expect(screen.queryByText("users-fallback")).not.toBeInTheDocument();

    router.stop();
  });
});
