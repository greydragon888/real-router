import {
  render,
  act,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { memo, useState } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, Link } from "@real-router/react";

import { createStressRouter, navigateSequentially } from "./helpers";

import type { Router } from "@real-router/core";
import type { FC } from "react";

const makeActiveWrappers = (renderCounts: number[], count: number): FC[] =>
  Array.from({ length: count }, (_, i) => {
    const W: FC = () => {
      renderCounts[i]++;

      return (
        <Link
          routeName={`route${i}`}
          activeClassName="active"
          data-testid={`link-${i}`}
        >
          Link {i}
        </Link>
      );
    };

    W.displayName = `W${i}`;

    return W;
  });

describe("link-mass-rendering stress tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(500);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("2.1: 500 Links mount — exactly 500 renders, no render loops", () => {
    const renderCounts: number[] = Array.from<number>({ length: 500 }).fill(0);

    const wrappers = Array.from({ length: 500 }, (_, i) => {
      const W: FC = () => {
        renderCounts[i]++;

        return (
          <Link routeName={`route${i}`} data-testid={`link-${i}`}>
            Link {i}
          </Link>
        );
      };

      W.displayName = `W${i}`;

      return W;
    });

    render(
      <RouterProvider router={router}>
        {wrappers.map((W, i) => (
          <W key={i} />
        ))}
      </RouterProvider>,
    );

    expect(renderCounts.reduce((s, c) => s + c, 0)).toBe(500 * 2);
    expect(Math.max(...renderCounts)).toBe(2);
  });

  it("2.2: 500 Links to different routes + navigate to one — only 1-2 Links re-render", async () => {
    const wrapperRenders: number[] = Array.from<number>({ length: 500 }).fill(
      0,
    );

    const wrappers = makeActiveWrappers(wrapperRenders, 500);

    render(
      <RouterProvider router={router}>
        {wrappers.map((W, i) => (
          <W key={i} />
        ))}
      </RouterProvider>,
    );

    expect(wrapperRenders.reduce((s, c) => s + c, 0)).toBe(500 * 2);

    await act(async () => {
      await router.navigate("route5");
    });

    expect(wrapperRenders.reduce((s, c) => s + c, 0)).toBe(500 * 2);

    expect(screen.getByTestId("link-5")).toHaveClass("active");
    expect(screen.getByTestId("link-0")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.3: 500 Links + 50 navigations round-robin — each Link renders max 2 times total", async () => {
    const wrapperRenders: number[] = Array.from<number>({ length: 500 }).fill(
      0,
    );

    const wrappers = makeActiveWrappers(wrapperRenders, 500);

    render(
      <RouterProvider router={router}>
        {wrappers.map((W, i) => (
          <W key={i} />
        ))}
      </RouterProvider>,
    );

    expect(wrapperRenders.reduce((s, c) => s + c, 0)).toBe(500 * 2);

    await act(async () => {
      await router.navigate("users.list");
    });

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    await navigateSequentially(
      router,
      routeNames.map((name) => ({ name })),
    );

    expect(wrapperRenders.reduce((s, c) => s + c, 0)).toBe(500 * 2);

    expect(screen.getByTestId("link-49")).toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.4: 200 Links with inline routeParams + parent re-render × 10 — useStableValue prevents extra renders", () => {
    const renderCounts: number[] = Array.from<number>({ length: 200 }).fill(0);

    const SpyLink = memo(
      ({
        i,
        routeName,
        routeParams,
      }: {
        i: number;
        routeName: string;
        routeParams: Record<string, string>;
      }) => {
        renderCounts[i]++;

        return (
          <Link
            routeName={routeName}
            routeParams={routeParams}
            data-testid={`link-${i}`}
          >
            Link {i}
          </Link>
        );
      },
      (prev, next) =>
        prev.routeName === next.routeName &&
        prev.i === next.i &&
        JSON.stringify(prev.routeParams) === JSON.stringify(next.routeParams),
    );

    const Parent: FC = () => {
      const [, forceUpdate] = useState(0);

      return (
        <div>
          <button
            data-testid="trigger"
            onClick={() => {
              forceUpdate((c) => c + 1);
            }}
          >
            trigger
          </button>
          {Array.from({ length: 200 }, (_, i) => (
            <SpyLink
              key={i}
              i={i}
              routeName={`route${i}`}
              routeParams={{ id: String(i) }}
            />
          ))}
        </div>
      );
    };

    render(
      <RouterProvider router={router}>
        <Parent />
      </RouterProvider>,
    );

    expect(renderCounts.reduce((s, c) => s + c, 0)).toBe(200 * 2);

    const trigger = screen.getByTestId("trigger");

    for (let i = 0; i < 10; i++) {
      act(() => {
        trigger.click();
      });
    }

    expect(renderCounts.reduce((s, c) => s + c, 0)).toBe(200 * 2);
  });

  it("2.5: 200 Links with deep routeParams + navigation — areLinkPropsEqual correctly compares", async () => {
    const deepParams = (i: number): Record<string, string> => ({
      id: String(i),
      a: "1",
      b: "2",
      c: "3",
      d: "4",
      e: "5",
      f: "6",
      g: "7",
      h: "8",
      j: "9",
    });

    render(
      <RouterProvider router={router}>
        {Array.from({ length: 200 }, (_, i) => (
          <Link
            key={i}
            routeName={`route${i}`}
            routeParams={deepParams(i)}
            activeClassName="active"
            data-testid={`link-${i}`}
          >
            Link {i}
          </Link>
        ))}
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route10");
    });

    expect(screen.getByTestId("link-10")).toHaveClass("active");
    expect(screen.getByTestId("link-0")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);

    await act(async () => {
      await router.navigate("route50");
    });

    expect(screen.getByTestId("link-50")).toHaveClass("active");
    expect(screen.getByTestId("link-10")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.6: 50 rapid Link clicks without await — 0 unhandled rejections, final route is correct", async () => {
    render(
      <RouterProvider router={router}>
        <Link routeName="route5" activeClassName="active" data-testid="link">
          Link
        </Link>
      </RouterProvider>,
    );

    const link = screen.getByTestId("link");

    for (let i = 0; i < 50; i++) {
      fireEvent.click(link);
    }

    await act(async () => {});

    expect(link).toHaveClass("active");
  });

  it("2.7: 20 Links with dynamic routeName changing 100 times — correct final active state, no crashes", () => {
    let errorThrown: unknown = null;

    const Parent: FC = () => {
      const [routeIndex, setRouteIndex] = useState(0);

      return (
        <div>
          <button
            data-testid="change"
            onClick={() => {
              setRouteIndex((i) => (i + 1) % 50);
            }}
          >
            change
          </button>
          {Array.from({ length: 20 }, (_, i) => (
            <Link
              key={i}
              routeName={`route${(routeIndex + i) % 50}`}
              activeClassName="active"
              data-testid={`link-${i}`}
            >
              Link {i}
            </Link>
          ))}
        </div>
      );
    };

    render(
      <RouterProvider router={router}>
        <Parent />
      </RouterProvider>,
    );

    const changeButton = screen.getByTestId("change");

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

    expect(screen.getByTestId("link-0")).toHaveClass("active");
  });
});
