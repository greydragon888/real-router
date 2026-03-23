import { render, screen } from "@solidjs/testing-library";
import { onCleanup } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// @ts-expect-error - link is used in JSX directives
// eslint-disable-next-line @typescript-eslint/no-unused-vars, sonarjs/unused-import
import { RouterProvider, link } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("link-directive stress tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(200);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("6.1: 100 use:link elements mount — all receive a11y attributes", () => {
    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 100 }, (_, i) => (
          <div use:link={{ routeName: `route${i}` }} data-testid={`dlink-${i}`}>
            Link {i}
          </div>
        ))}
      </RouterProvider>
    ));

    for (let i = 0; i < 100; i++) {
      const el = screen.getByTestId(`dlink-${i}`);

      expect(el.getAttribute("role")).toBe("link");
      expect(el.getAttribute("tabindex")).toBe("0");
    }
  });

  it("6.2: mount/unmount 100 use:link elements × 50 cycles — bounded heap, cleanup fires", () => {
    const heapBefore = takeHeapSnapshot();
    let cleanupCount = 0;

    for (let cycle = 0; cycle < 50; cycle++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          {Array.from({ length: 100 }, (_, i) => (
            <LinkWithCleanup
              routeName={`route${i}`}
              testId={`dlink-${i}`}
              onCleanupFn={() => {
                cleanupCount++;
              }}
            />
          ))}
        </RouterProvider>
      ));

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(200 * MB);
    expect(cleanupCount).toBe(100 * 50);
  });

  it("6.3: 100 use:link with activeClassName — correct active class after navigation", async () => {
    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 100 }, (_, i) => (
          <div
            use:link={{
              routeName: `route${i}`,
              activeClassName: "active",
            }}
            data-testid={`dlink-${i}`}
          >
            Link {i}
          </div>
        ))}
      </RouterProvider>
    ));

    await router.navigate("route5");

    expect(screen.getByTestId("dlink-5")).toHaveClass("active");
    expect(screen.getByTestId("dlink-0")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);

    await router.navigate("route50");

    expect(screen.getByTestId("dlink-50")).toHaveClass("active");
    expect(screen.getByTestId("dlink-5")).not.toHaveClass("active");
    expect(document.querySelectorAll(".active")).toHaveLength(1);
  });
});

function LinkWithCleanup(props: {
  readonly routeName: string;
  readonly testId: string;
  readonly onCleanupFn: () => void;
}): JSX.Element {
  onCleanup(props.onCleanupFn);

  return (
    <div use:link={{ routeName: props.routeName }} data-testid={props.testId}>
      Link
    </div>
  );
}
