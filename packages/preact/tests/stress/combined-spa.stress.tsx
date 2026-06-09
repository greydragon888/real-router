import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render, act, cleanup } from "@testing-library/preact";
import { describe, it, expect, afterEach } from "vitest";

import {
  RouterProvider,
  RouteView,
  Link,
  useRouteNode,
  useRouterTransition,
} from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { FunctionComponent } from "preact";

describe("R8 — combined SPA simulation", () => {
  afterEach(() => {
    cleanup();
  });

  it("8.1: full app — 5 RouteView + 30 Links + 10 useRouteNode + 200 navigations", async () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      name: `page${i}`,
      path: `/page${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "page0" });

    await router.start("/page0");

    const sidebarRenders = Array.from({ length: 10 }, () => 0);

    const Sidebar: FunctionComponent = () => (
      <>
        {Array.from({ length: 10 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            useRouteNode(i < 5 ? `page${i}` : "");
            sidebarRenders[i]++;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    const Nav: FunctionComponent = () => (
      <nav>
        {Array.from({ length: 30 }, (_, i) => (
          <Link key={i} routeName={`page${i % 5}`}>
            Link {i}
          </Link>
        ))}
      </nav>
    );

    render(
      <RouterProvider router={router}>
        <Nav />
        <main>
          <RouteView nodeName="">
            {routes.map((r) => (
              <RouteView.Match key={r.name} segment={r.name}>
                <div data-testid={r.name}>{r.name}</div>
              </RouteView.Match>
            ))}
          </RouteView>
        </main>
        <Sidebar />
      </RouterProvider>,
    );

    for (let nav = 0; nav < 200; nav++) {
      await act(async () => {
        await router.navigate(`page${(nav + 1) % 5}`);
      });
    }

    expect(router.getState()?.name).toBe(`page${200 % 5}`);

    for (let i = 5; i < 10; i++) {
      expect(sidebarRenders[i]).toBeGreaterThanOrEqual(200);
    }

    router.stop();
  });

  it("8.2: nav menu — 50 Links + transition progress + 100 navigations", async () => {
    const routes = Array.from({ length: 50 }, (_, i) => ({
      name: `item${i}`,
      path: `/item${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "item0" });

    // Manually-resolved activate guards split each navigation into two
    // observable phases. Without this split, Preact 10.28+ batches the
    // TRANSITION_START and TRANSITION_SUCCESS setState calls into a single
    // commit; since IDLE_SNAPSHOT is a frozen singleton, the polyfill's
    // `Object.is(prev, next)` bail-out collapses the round trip to zero
    // renders. Real apps always interleave a microtask (guards, lazy
    // loads, data fetching) between start and success — we model that
    // explicitly so the stress test continues to exercise both edges of
    // the transition.
    const lifecycle = getLifecycleApi(router);
    const pendingResolvers: ((value: boolean) => void)[] = [];

    for (const route of routes) {
      lifecycle.addActivateGuard(
        route.name,
        () => () =>
          new Promise<boolean>((resolve) => {
            pendingResolvers.push(resolve);
          }),
      );
    }

    // Bypass guards for the initial mount.
    pendingResolvers.length = 0;
    const startPromise = router.start("/item0");

    pendingResolvers.shift()?.(true);
    await startPromise;

    let progressRenders = 0;

    const Progress: FunctionComponent = () => {
      useRouterTransition();
      progressRenders++;

      return null;
    };

    render(
      <RouterProvider router={router}>
        <Progress />
        <nav>
          {routes.map((r, i) => (
            <Link key={i} routeName={r.name}>
              {r.name}
            </Link>
          ))}
        </nav>
      </RouterProvider>,
    );

    const afterMount = progressRenders;

    for (let nav = 0; nav < 100; nav++) {
      await act(async () => {
        void router.navigate(`item${(nav % 49) + 1}`);
        await Promise.resolve();
      });

      await act(async () => {
        pendingResolvers.shift()?.(true);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(progressRenders - afterMount).toBeGreaterThanOrEqual(100);

    router.stop();
  });

  it("8.4: mount -> 50 nav -> unmount -> remount -> 50 nav — correct after remount", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let renderCount = 0;

    const App: FunctionComponent = () => {
      useRouteNode("");
      renderCount++;

      return null;
    };

    const { unmount } = render(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    for (let i = 0; i < 50; i++) {
      await act(async () => {
        await router.navigate(`route${(i % 49) + 1}`);
      });
    }

    const countAfterFirst = renderCount;

    expect(countAfterFirst).toBeGreaterThan(0);

    unmount();

    renderCount = 0;

    const { unmount: unmount2 } = render(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    for (let i = 0; i < 50; i++) {
      await act(async () => {
        await router.navigate(`route${((i + 1) % 49) + 1}`);
      });
    }

    expect(renderCount).toBeGreaterThan(0);
    expect(router.getState()?.name).toBeDefined();

    unmount2();
    router.stop();
  });
});
