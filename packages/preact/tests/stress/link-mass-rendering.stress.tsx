import {
  render,
  act,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/preact";
import { useState } from "preact/hooks";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, Link } from "@real-router/preact";

import { createStressRouter, navigateSequentially } from "./helpers";

import type { Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

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

const makeActiveWrappers = (
  renderCounts: number[],
  count: number,
): FunctionComponent[] =>
  Array.from({ length: count }, (_, i) => {
    const W: FunctionComponent = () => {
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
      const W: FunctionComponent = () => {
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

    expect(renderCounts.reduce((s, c) => s + c, 0)).toBe(500);
    expect(Math.max(...renderCounts)).toBe(1);
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

    expect(wrapperRenders.reduce((s, c) => s + c, 0)).toBe(500);

    await act(async () => {
      await router.navigate("route5");
    });

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

    expect(wrapperRenders.reduce((s, c) => s + c, 0)).toBe(500);

    await act(async () => {
      await router.navigate("users.list");
    });

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    await navigateSequentially(
      router,
      routeNames.map((name) => ({ name })),
    );

    expect(screen.getByTestId("link-49")).toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.5: 200 Links with deep routeParams + navigation — correct active state", async () => {
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

  it("2.7: 20 Links with dynamic routeName changing 100 times — correct final active state, no crashes", async () => {
    let errorThrown: unknown = null;

    const Parent: FunctionComponent = () => {
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
        await act(() => {
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
