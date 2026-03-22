import { createRouter } from "@real-router/core";
import { render, screen } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect, afterEach } from "vitest";

import {
  RouterProvider,
  RouteView,
  Link,
  useRouteNode,
  useRouterTransition,
} from "@real-router/solid";

import { createStressRouter } from "./helpers";

describe("R8 — combined SPA simulation", () => {
  afterEach(() => {
    // Solid testing library auto-cleans up
  });

  it("8.1: full app — 5 RouteView + 30 Links + 10 useRouteNode + 200 navigations", async () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      name: `page${i}`,
      path: `/page${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "page0" });

    await router.start("/page0");

    const sidebarEffects = Array.from<number>({ length: 10 }).fill(0);

    function SidebarSubscriber(props: { index: number }) {
      const routeState = useRouteNode(
        props.index < 5 ? `page${props.index}` : "",
      );

      createEffect(() => {
        routeState();
        sidebarEffects[props.index]++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        <nav>
          {Array.from({ length: 30 }, (_, i) => (
            <Link routeName={`page${i % 5}`}>Link {i}</Link>
          ))}
        </nav>
        <main>
          <RouteView nodeName="">
            {routes.map((r) => (
              <RouteView.Match segment={r.name}>
                <div data-testid={r.name}>{r.name}</div>
              </RouteView.Match>
            ))}
          </RouteView>
        </main>
        {Array.from({ length: 10 }, (_, i) => (
          <SidebarSubscriber index={i} />
        ))}
      </RouterProvider>
    ));

    for (let nav = 0; nav < 200; nav++) {
      await router.navigate(`page${(nav + 1) % 5}`);
    }

    expect(router.getState()?.name).toBe(`page${200 % 5}`);

    for (let i = 5; i < 10; i++) {
      expect(sidebarEffects[i]).toBeGreaterThanOrEqual(200);
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

    let progressEffects = 0;

    function Progress() {
      const transition = useRouterTransition();

      createEffect(() => {
        transition();
        progressEffects++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        <Progress />
        <nav>
          {routes.map((r) => (
            <Link routeName={r.name}>{r.name}</Link>
          ))}
        </nav>
      </RouterProvider>
    ));

    const afterMount = progressEffects;

    for (let nav = 0; nav < 100; nav++) {
      await router.navigate(`item${(nav % 49) + 1}`);
    }

    expect(progressEffects - afterMount).toBeGreaterThanOrEqual(100);

    router.stop();
  });

  it("8.4: mount -> 50 nav -> unmount -> remount -> 50 nav — correct after remount", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let effectCount = 0;

    function App() {
      const routeState = useRouteNode("");

      createEffect(() => {
        routeState();
        effectCount++;
      });

      return <div data-testid="app">{routeState().route?.name ?? "none"}</div>;
    }

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ));

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${(i % 49) + 1}`);
    }

    const countAfterFirst = effectCount;

    expect(countAfterFirst).toBeGreaterThan(0);

    unmount();

    effectCount = 0;

    const { unmount: unmount2 } = render(() => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ));

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${((i + 1) % 49) + 1}`);
    }

    expect(effectCount).toBeGreaterThan(0);
    expect(router.getState()?.name).toBeDefined();

    unmount2();
    router.stop();
  });

  it("8.5: RouteView active match correctness through 100 navigations", async () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      name: `section${i}`,
      path: `/section${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "section0" });

    await router.start("/section0");

    render(() => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          {routes.map((r) => (
            <RouteView.Match segment={r.name}>
              <div data-testid={`content-${r.name}`}>{r.name} content</div>
            </RouteView.Match>
          ))}
        </RouteView>
      </RouterProvider>
    ));

    expect(screen.getByTestId("content-section0")).toBeInTheDocument();

    for (let nav = 0; nav < 100; nav++) {
      const target = `section${(nav + 1) % 5}`;

      await router.navigate(target);

      expect(screen.getByTestId(`content-${target}`)).toBeInTheDocument();
    }

    router.stop();
  });
});
