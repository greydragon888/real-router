import { render, act, cleanup } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, useRouteNode, useRoute } from "@real-router/react";

import {
  createStressRouter,
  navigateSequentially,
  roundRobinRoutes,
} from "./helpers";

import type { Router } from "@real-router/core";
import type { FC } from "react";

describe("subscription-fanout stress tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("1.1: 50 useRouteNode on different nodes + 100 navigations — each re-renders only when its node is navigated to", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 50 }).fill(0);

    const subscribers = Array.from({ length: 50 }, (_, i) => {
      const Sub: FC = () => {
        useRouteNode(`route${i}`);
        renderCounts[i]++;

        return <div />;
      };

      Sub.displayName = `Sub${i}`;

      return Sub;
    });

    render(
      <RouterProvider router={router}>
        {subscribers.map((Sub, i) => (
          <Sub key={i} />
        ))}
      </RouterProvider>,
    );

    const countsAfterMount = [...renderCounts];

    await act(async () => {
      await router.navigate("users.list");
    });

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    for (let i = 0; i < 50; i++) {
      const delta = renderCounts[i] - countsAfterMount[i];

      expect(delta).toBeGreaterThanOrEqual(4);
      expect(delta).toBeLessThanOrEqual(10);
    }
  });

  it("1.2: 20 useRoute + 30 useRouteNode('') consumers + 100 navigations — each re-renders on every navigation", async () => {
    await act(async () => {
      await router.navigate("users.list");
    });

    let routeRenders = 0;
    let rootNodeRenders = 0;

    const RouteConsumer: FC = () => {
      useRoute();
      routeRenders++;

      return <div />;
    };

    const RootNodeConsumer: FC = () => {
      useRouteNode("");
      rootNodeRenders++;

      return <div />;
    };

    render(
      <RouterProvider router={router}>
        {Array.from({ length: 20 }, (_, i) => (
          <RouteConsumer key={`r-${i}`} />
        ))}
        {Array.from({ length: 30 }, (_, i) => (
          <RootNodeConsumer key={`n-${i}`} />
        ))}
      </RouterProvider>,
    );

    const routeAfterMount = routeRenders;
    const rootAfterMount = rootNodeRenders;

    const routeNames = Array.from({ length: 10 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    expect(routeRenders - routeAfterMount).toBe(20 * 100 * 2);
    expect(rootNodeRenders - rootAfterMount).toBe(30 * 100 * 2);
  });

  it("1.3: 50 useRouteNode('users') + 50 inside users + 50 outside — renders only during users navigations", async () => {
    let usersRenders = 0;

    const subscribers = Array.from({ length: 50 }, (_, i) => {
      const Sub: FC = () => {
        useRouteNode("users");
        usersRenders++;

        return <div />;
      };

      Sub.displayName = `UsersSub${i}`;

      return Sub;
    });

    render(
      <RouterProvider router={router}>
        {subscribers.map((Sub, i) => (
          <Sub key={i} />
        ))}
      </RouterProvider>,
    );

    const rendersAfterMount = usersRenders;

    const usersRoutes = [
      { name: "users.list" },
      { name: "users.view", params: { id: "1" } },
      { name: "users.edit", params: { id: "1" } },
      { name: "users.list" },
      { name: "users.view", params: { id: "2" } },
    ];

    for (let i = 0; i < 10; i++) {
      for (const r of usersRoutes) {
        await act(async () => {
          await router.navigate(r.name, r.params);
        });
      }
    }

    const usersNavigationRenders = usersRenders - rendersAfterMount;

    expect(usersNavigationRenders).toBe(50 * 50 * 2);

    const outsideRoutes = roundRobinRoutes(
      ["route0", "route1", "route2", "route3", "route4"],
      50,
    );

    const rendersBeforeOutside = usersRenders;

    await navigateSequentially(
      router,
      outsideRoutes.map((name) => ({ name })),
    );
    const rendersAfterOutside = usersRenders - rendersBeforeOutside;

    expect(rendersAfterOutside).toBe(50 * 2);
  });

  it("1.4: mount/unmount 10 components concurrently with navigation — no errors thrown", async () => {
    let errorThrown: unknown = null;

    const NodeComp: FC<{ name: string }> = ({ name }) => {
      useRouteNode(name);

      return <div />;
    };

    const Toggle: FC = () => {
      const [show, setShow] = useState(true);

      return (
        <div>
          <button
            data-testid="toggle"
            onClick={() => {
              setShow((s) => !s);
            }}
          >
            toggle
          </button>
          {show &&
            Array.from({ length: 10 }, (_, i) => (
              <NodeComp key={i} name={`route${i % 5}`} />
            ))}
        </div>
      );
    };

    const { getByTestId } = render(
      <RouterProvider router={router}>
        <Toggle />
      </RouterProvider>,
    );

    const toggle = getByTestId("toggle");

    try {
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          toggle.click();
          await router.navigate(`route${(i % 5) + 1}`);
        });
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();
  });

  it("1.5: dynamic nodeName changes 100 times — correct state for current nodeName, no errors", async () => {
    let errorThrown: unknown = null;

    await act(async () => {
      await router.navigate("users.list");
    });

    const DynamicNode: FC<{ nodeName: string }> = ({ nodeName }) => {
      const { route } = useRouteNode(nodeName);

      return <div data-testid="dynamic">{route?.name ?? "none"}</div>;
    };

    const Wrapper: FC = () => {
      const [name, setName] = useState("users");

      return (
        <div>
          <button
            data-testid="change"
            onClick={() => {
              setName((n) => (n === "users" ? "" : "users"));
            }}
          >
            change
          </button>
          <DynamicNode nodeName={name} />
        </div>
      );
    };

    const { getByTestId } = render(
      <RouterProvider router={router}>
        <Wrapper />
      </RouterProvider>,
    );

    const changeButton = getByTestId("change");

    try {
      for (let i = 0; i < 100; i++) {
        act(() => {
          changeButton.click();
        });
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();

    await act(async () => {
      await router.navigate("users.view", { id: "1" });
    });

    expect(getByTestId("dynamic").textContent).not.toBe("");
  });
});
