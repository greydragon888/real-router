import { getLifecycleApi } from "@real-router/core/api";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Link, RouterErrorBoundary, RouterProvider } from "@real-router/react";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router, RouterError } from "@real-router/core";
import type { FC, ReactNode } from "react";

describe("R4 — RouterErrorBoundary stress", () => {
  let router: Router;

  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createStressRouter(10);
    getLifecycleApi(router).addActivateGuard("route1", () => () => false);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("4.1: 100 rapid guard rejections — fallback renders last error, heap bounded", async () => {
    const seenCodes: string[] = [];

    render(
      <RouterErrorBoundary
        fallback={(error: RouterError) => {
          return <div data-testid="fallback">{error.code}</div>;
        }}
        onError={(error) => {
          seenCodes.push(error.code);
        }}
      >
        <div data-testid="children">App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      await act(async () => {
        await router.navigate("route1").catch(() => {});
      });
    }

    const heapAfter = takeHeapSnapshot();

    // Every rejection must reach onError (no dropped notifications).
    expect(seenCodes).toHaveLength(100);
    // Fallback still attached to latest error.
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.getByTestId("children")).toBeInTheDocument();
    // Error snapshot versioning must not accumulate memory.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);
  });

  it("4.2: resetError × 100 — boundary re-arms, no stale dismissedVersion buildup", async () => {
    const ResettingBoundary: FC = () => {
      return (
        <RouterErrorBoundary
          fallback={(error, resetError) => (
            <button
              type="button"
              data-testid="reset"
              data-code={error.code}
              onClick={resetError}
            >
              Dismiss
            </button>
          )}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      );
    };

    render(<ResettingBoundary />, { wrapper });

    for (let i = 0; i < 100; i++) {
      await act(async () => {
        await router.navigate("route1").catch(() => {});
      });

      // Fallback must be present for every error cycle.
      const resetButton = screen.getByTestId("reset");

      fireEvent.click(resetButton);

      // After reset, the exact same fallback must be gone.
      expect(screen.queryByTestId("reset")).not.toBeInTheDocument();
    }

    // Children survive the full cycle.
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  it("4.3: mount/unmount × 100 boundaries with interleaved errors — no unhandled rejections", async () => {
    let unhandled = false;

    const handler = (): void => {
      unhandled = true;
    };

    globalThis.addEventListener("unhandledrejection", handler);

    for (let i = 0; i < 100; i++) {
      const { unmount } = render(
        <RouterErrorBoundary
          fallback={(error: RouterError) => (
            <div data-testid="fallback">{error.code}</div>
          )}
        >
          <Link routeName="route1" data-testid="link">
            Go
          </Link>
        </RouterErrorBoundary>,
        { wrapper },
      );

      await act(async () => {
        await router.navigate("route1").catch(() => {});
      });

      unmount();
    }

    // Dangling error-source subscriptions would surface as unhandled rejections.
    expect(unhandled).toBe(false);

    globalThis.removeEventListener("unhandledrejection", handler);
  });

  it("4.4: multiple concurrent boundaries share error snapshot — no duplicate renders", async () => {
    const boundaryRenders: Record<string, number> = { a: 0, b: 0, c: 0 };

    const CountingBoundary: FC<{ id: "a" | "b" | "c" }> = ({ id }) => {
      return (
        <RouterErrorBoundary
          fallback={(error: RouterError) => {
            boundaryRenders[id]++;

            return <div data-testid={`fallback-${id}`}>{error.code}</div>;
          }}
        >
          <div />
        </RouterErrorBoundary>
      );
    };

    render(
      <>
        <CountingBoundary id="a" />
        <CountingBoundary id="b" />
        <CountingBoundary id="c" />
      </>,
      { wrapper },
    );

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await router.navigate("route1").catch(() => {});
      });
    }

    // All three boundaries received the error (global router event).
    expect(screen.getByTestId("fallback-a")).toBeInTheDocument();
    expect(screen.getByTestId("fallback-b")).toBeInTheDocument();
    expect(screen.getByTestId("fallback-c")).toBeInTheDocument();

    // Render counts must scale linearly with errors (no fanout blow-up).
    // Tolerance accounts for React StrictMode double-invoke in dev.
    for (const id of ["a", "b", "c"] as const) {
      expect(boundaryRenders[id]).toBeGreaterThanOrEqual(20);
      expect(boundaryRenders[id]).toBeLessThanOrEqual(60);
    }
  });
});
