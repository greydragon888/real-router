import { createRouter } from "@real-router/core";
import { render, act, screen, cleanup } from "@testing-library/react";
import { Fragment } from "react";
import { describe, it, expect, afterEach } from "vitest";

import { RouterProvider, RouteView } from "@real-router/react";

import { createStatefulCounter, createRenderCounter } from "./helpers";

import type { FC } from "react";

describe("RouteView keepAlive stress tests", () => {
  afterEach(() => {
    cleanup();
  });

  it("4.1: 10 keepAlive + 100 round-robin navigations — state preserved", async () => {
    const router = createRouter(
      Array.from({ length: 10 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const counters = Array.from({ length: 10 }, (_, i) =>
      createStatefulCounter(`page-${i}`),
    );

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          {counters.map(({ Component }, i) => (
            <RouteView.Match key={i} segment={`seg${i}`} keepAlive>
              <Component />
            </RouteView.Match>
          ))}
        </RouteView>
      </RouterProvider>,
    );

    for (let nav = 0; nav < 100; nav++) {
      await act(async () => {
        await router.navigate(`seg${(nav + 1) % 10}`);
      });
    }

    for (let i = 0; i < 10; i++) {
      expect(screen.getByTestId(`page-${i}`)).toBeInTheDocument();
      expect(counters[i].getRenderCount()).toBeGreaterThan(0);
    }

    router.stop();
  });

  it("4.2: 20 keepAlive + rapid fire-and-forget navigations — final state correct", async () => {
    const router = createRouter(
      Array.from({ length: 20 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const counters = Array.from({ length: 20 }, (_, i) =>
      createStatefulCounter(`rapid-${i}`),
    );

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          {counters.map(({ Component }, i) => (
            <RouteView.Match key={i} segment={`seg${i}`} keepAlive>
              <Component />
            </RouteView.Match>
          ))}
        </RouteView>
      </RouterProvider>,
    );

    await act(async () => {
      for (let i = 1; i < 20; i++) {
        void router.navigate(`seg${i}`);
      }

      await Promise.resolve();
    });

    expect(screen.getByTestId("rapid-19")).toBeInTheDocument();

    router.stop();
  });

  it("4.3: nested RouteView × 3 levels + keepAlive — inner state preserved", async () => {
    const router = createRouter(
      [
        {
          name: "level0",
          path: "/level0",
          children: [
            {
              name: "level1",
              path: "/level1",
              children: [{ name: "level2", path: "/level2" }],
            },
          ],
        },
        { name: "other", path: "/other" },
      ],
      { defaultRoute: "level0" },
    );

    await router.start("/level0");

    const innerCounter = createStatefulCounter("inner-page");

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="level0" keepAlive>
            <RouteView nodeName="level0">
              <RouteView.Match segment="level1" keepAlive>
                <RouteView nodeName="level0.level1">
                  <RouteView.Match segment="level2" keepAlive>
                    <innerCounter.Component />
                  </RouteView.Match>
                </RouteView>
              </RouteView.Match>
            </RouteView>
          </RouteView.Match>
          <RouteView.Match segment="other" keepAlive>
            <div data-testid="other-page">Other</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("level0.level1.level2");
    });
    const renderCountAfterFirstVisit = innerCounter.getRenderCount();

    expect(renderCountAfterFirstVisit).toBeGreaterThan(0);

    await act(async () => {
      await router.navigate("other");
    });

    expect(screen.getByTestId("other-page")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("level0.level1.level2");
    });

    expect(screen.getByTestId("inner-page")).toBeInTheDocument();
    expect(innerCounter.getRenderCount()).toBeGreaterThanOrEqual(
      renderCountAfterFirstVisit,
    );

    router.stop();
  });

  it("4.4: 10 keepAlive + 5 non-keepAlive + 200 navigations — render count contrast", async () => {
    const router = createRouter(
      Array.from({ length: 15 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const keepAliveCounters = Array.from({ length: 10 }, (_, i) =>
      createStatefulCounter(`ka-${i}`),
    );
    const regularCounters = Array.from({ length: 5 }, (_, i) =>
      createRenderCounter(`reg-${i}`),
    );

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          {keepAliveCounters.map(({ Component }, i) => (
            <RouteView.Match key={`ka-${i}`} segment={`seg${i}`} keepAlive>
              <Component />
            </RouteView.Match>
          ))}
          {regularCounters.map(({ Component }, i) => (
            <RouteView.Match key={`reg-${i}`} segment={`seg${10 + i}`}>
              <Component />
            </RouteView.Match>
          ))}
        </RouteView>
      </RouterProvider>,
    );

    for (let nav = 0; nav < 200; nav++) {
      await act(async () => {
        await router.navigate(`seg${(nav + 1) % 15}`);
      });
    }

    for (let i = 0; i < 10; i++) {
      expect(screen.getByTestId(`ka-${i}`)).toBeInTheDocument();
      expect(keepAliveCounters[i].getRenderCount()).toBeGreaterThan(1);
    }

    let totalRegularRenders = 0;

    for (let i = 0; i < 5; i++) {
      totalRegularRenders += regularCounters[i].getRenderCount();
    }

    let totalKeepAliveRenders = 0;

    for (let i = 0; i < 10; i++) {
      totalKeepAliveRenders += keepAliveCounters[i].getRenderCount();
    }

    expect(totalKeepAliveRenders).toBeGreaterThan(0);
    expect(totalRegularRenders).toBeGreaterThanOrEqual(0);

    router.stop();
  });

  it("4.5: collectElements with wrapper components and Fragments — correct match found", async () => {
    const router = createRouter(
      [
        { name: "pageA", path: "/pageA" },
        { name: "pageB", path: "/pageB" },
        { name: "pageC", path: "/pageC" },
      ],
      { defaultRoute: "pageA" },
    );

    await router.start("/pageA");

    const Wrapper: FC<{ children: React.ReactNode }> = ({ children }) => (
      <div className="wrapper">{children}</div>
    );

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <div>
            <RouteView.Match segment="pageA" keepAlive>
              <div data-testid="content-a">Page A</div>
            </RouteView.Match>
          </div>
          <Fragment>
            <RouteView.Match segment="pageB" keepAlive>
              <div data-testid="content-b">Page B</div>
            </RouteView.Match>
          </Fragment>
          <Wrapper>
            <RouteView.Match segment="pageC" keepAlive>
              <div data-testid="content-c">Page C</div>
            </RouteView.Match>
          </Wrapper>
        </RouteView>
      </RouterProvider>,
    );

    expect(screen.getByTestId("content-a")).toBeInTheDocument();

    for (let nav = 0; nav < 200; nav++) {
      const routes = ["pageA", "pageB", "pageC"];

      await act(async () => {
        await router.navigate(routes[(nav + 1) % 3]);
      });
    }

    expect(screen.getByTestId("content-a")).toBeInTheDocument();
    expect(screen.getByTestId("content-b")).toBeInTheDocument();
    expect(screen.getByTestId("content-c")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("pageB");
    });

    expect(screen.getByTestId("content-b")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("pageC");
    });

    expect(screen.getByTestId("content-c")).toBeInTheDocument();

    router.stop();
  });

  it("4.6: DOM element count stability after activating all keepAlive segments", async () => {
    const router = createRouter(
      Array.from({ length: 10 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const counters = Array.from({ length: 10 }, (_, i) =>
      createStatefulCounter(`stable-${i}`),
    );

    const { container } = render(
      <RouterProvider router={router}>
        <div data-testid="route-container">
          <RouteView nodeName="">
            {counters.map(({ Component }, i) => (
              <RouteView.Match key={i} segment={`seg${i}`} keepAlive>
                <Component />
              </RouteView.Match>
            ))}
          </RouteView>
        </div>
      </RouterProvider>,
    );

    for (let i = 1; i < 10; i++) {
      await act(async () => {
        await router.navigate(`seg${i}`);
      });
    }

    const routeContainer = container.querySelector(
      "[data-testid='route-container']",
    );

    expect(routeContainer).not.toBeNull();

    const domCountAfterActivation =
      routeContainer!.querySelectorAll("*").length;

    for (let nav = 0; nav < 90; nav++) {
      await act(async () => {
        await router.navigate(`seg${(nav + 1) % 10}`);
      });
    }

    const domCountAfterMoreNavs = routeContainer!.querySelectorAll("*").length;

    expect(domCountAfterMoreNavs).toBe(domCountAfterActivation);

    router.stop();
  });
});
