import { createRouter } from "@real-router/core";
import { render, act, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";

import {
  RouterProvider,
  RouteView,
  Link,
  useRouteNode,
  useRouterTransition,
} from "@real-router/react";

import { createStressRouter, createStatefulCounter } from "./helpers";

import type { FC } from "react";

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

    const sidebarRenders = Array.from<number>({ length: 10 }).fill(0);

    const Sidebar: FC = () => (
      <>
        {Array.from({ length: 10 }, (_, i) => {
          const Sub: FC = () => {
            useRouteNode(i < 5 ? `page${i}` : "");
            sidebarRenders[i]++;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    const Nav: FC = () => (
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

    await router.start("/item0");

    let progressRenders = 0;

    const Progress: FC = () => {
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
        await router.navigate(`item${(nav % 49) + 1}`);
      });
    }

    expect(progressRenders - afterMount).toBeGreaterThanOrEqual(100);

    router.stop();
  });

  it("8.3: tab layout — 5 keepAlive tabs + 30 Links + 200 navigations", async () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      name: `tab${i}`,
      path: `/tab${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "tab0" });

    await router.start("/tab0");

    const tabCounters = Array.from({ length: 5 }, (_, i) =>
      createStatefulCounter(`tab-${i}`),
    );

    render(
      <RouterProvider router={router}>
        <nav>
          {Array.from({ length: 30 }, (_, i) => (
            <Link key={i} routeName={`tab${i % 5}`}>
              Tab {i}
            </Link>
          ))}
        </nav>
        <RouteView nodeName="">
          {tabCounters.map(({ Component }, i) => (
            <RouteView.Match key={i} segment={`tab${i}`} keepAlive>
              <Component />
            </RouteView.Match>
          ))}
        </RouteView>
      </RouterProvider>,
    );

    for (let nav = 0; nav < 200; nav++) {
      await act(async () => {
        await router.navigate(`tab${(nav + 1) % 5}`);
      });
    }

    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`tab-${i}`)).toBeInTheDocument();
      expect(tabCounters[i].getRenderCount()).toBeGreaterThan(0);
    }

    router.stop();
  });

  it("8.4: mount → 50 nav → unmount → remount → 50 nav — correct after remount", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let renderCount = 0;

    const App: FC = () => {
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
