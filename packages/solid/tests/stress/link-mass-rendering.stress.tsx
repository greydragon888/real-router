import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, Link } from "@real-router/solid";

import { createStressRouter, navigateSequentially } from "./helpers";

import type { Router } from "@real-router/core";

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

describe("link-mass-rendering stress tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(500);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("2.1: 200 Links mount — no render loops, all Links present", () => {
    const { container } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 200 }, (_, i) => (
          <Link routeName={`route${i}`} data-testid={`link-${i}`}>
            Link {i}
          </Link>
        ))}
      </RouterProvider>
    ));

    const links = container.querySelectorAll("a");

    expect(links).toHaveLength(200);
  });

  it("2.2: 200 Links to different routes + navigate to one — only active Link gets class", async () => {
    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 200 }, (_, i) => (
          <Link
            routeName={`route${i}`}
            activeClassName="active"
            data-testid={`link-${i}`}
          >
            Link {i}
          </Link>
        ))}
      </RouterProvider>
    ));

    await router.navigate("route5");

    expect(screen.getByTestId("link-5")).toHaveClass("active");
    expect(screen.getByTestId("link-0")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.3: 200 Links + 50 navigations round-robin — correct final active state", async () => {
    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 200 }, (_, i) => (
          <Link
            routeName={`route${i}`}
            activeClassName="active"
            data-testid={`link-${i}`}
          >
            Link {i}
          </Link>
        ))}
      </RouterProvider>
    ));

    await router.navigate("users.list");

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    await navigateSequentially(
      router,
      routeNames.map((name) => ({ name })),
    );

    expect(screen.getByTestId("link-49")).toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.5: 200 Links with deep routeParams + navigation — correct active state", async () => {
    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 200 }, (_, i) => (
          <Link
            routeName={`route${i}`}
            routeParams={deepParams(i)}
            activeClassName="active"
            data-testid={`link-${i}`}
          >
            Link {i}
          </Link>
        ))}
      </RouterProvider>
    ));

    await router.navigate("route10");

    expect(screen.getByTestId("link-10")).toHaveClass("active");
    expect(screen.getByTestId("link-0")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);

    await router.navigate("route50");

    expect(screen.getByTestId("link-50")).toHaveClass("active");
    expect(screen.getByTestId("link-10")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });

  it("2.7: 20 Links with dynamic routeName changing 100 times — correct final active state, no crashes", () => {
    let errorThrown: unknown = null;
    const [routeIndex, setRouteIndex] = createSignal(0);

    render(() => (
      <RouterProvider router={router}>
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
              routeName={`route${(routeIndex() + i) % 50}`}
              activeClassName="active"
              data-testid={`link-${i}`}
            >
              Link {i}
            </Link>
          ))}
        </div>
      </RouterProvider>
    ));

    const changeBtn = screen.getByTestId("change");

    try {
      for (let i = 0; i < 100; i++) {
        changeBtn.click();
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();

    expect(screen.getByTestId("link-0")).toHaveClass("active");
  });
});
