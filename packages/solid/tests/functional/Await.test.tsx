import { render, screen, waitFor } from "@solidjs/testing-library";
import { ErrorBoundary } from "solid-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/solid";
import { Await, Streamed } from "@real-router/solid/ssr";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function injectDeferred(
  router: Router,
  map: Record<string, Promise<unknown>>,
): void {
  const state = router.getState()!;
  const mutated = {
    ...state,
    context: { ...state.context, ssrDataDeferred: map },
  };

  Object.defineProperty(router, "getState", {
    value: () => mutated,
    configurable: true,
  });
}

describe("<Await>", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("renders children with the resolved value once the promise settles", async () => {
    injectDeferred(router, { reviews: Promise.resolve(["r1", "r2"]) });

    render(() => (
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string[]> name="reviews">
            {(reviews) => (
              <ul data-testid="list">
                {reviews.map((r) => (
                  <li>{r}</li>
                ))}
              </ul>
            )}
          </Await>
        </Streamed>
      </RouterProvider>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("list")).toBeInTheDocument();
    });

    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();
  });

  it("shows fallback while the deferred promise is pending", async () => {
    const pending = new Promise<string[]>(() => undefined);

    injectDeferred(router, { reviews: pending });

    render(() => (
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string[]> name="reviews">
            {(reviews) => <span data-testid="list">{reviews.join(",")}</span>}
          </Await>
        </Streamed>
      </RouterProvider>
    ));

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("list")).not.toBeInTheDocument();
  });

  // Regression: <Show when={resource()} keyed> dropped falsy resolved values
  // (0, false, null, ""), suspending forever even after the promise settled.
  // The fix gates on `resource.state === "ready"` so any value reaches the
  // render-prop.
  it.each([
    ["zero", 0, "value=0"],
    ["false", false, "value=false"],
    ["null", null, "value=null"],
    ["empty string", "", "value="],
  ] as const)(
    "renders children for resolved falsy value (%s)",
    async (_label, value, expected) => {
      injectDeferred(router, { count: Promise.resolve(value) });

      render(() => (
        <RouterProvider router={router}>
          <Streamed fallback={<span data-testid="fallback">loading</span>}>
            <Await<number | boolean | null | string> name="count">
              {(v) => <span data-testid="value">value={String(v)}</span>}
            </Await>
          </Streamed>
        </RouterProvider>
      ));

      await waitFor(() => {
        expect(screen.getByTestId("value")).toBeInTheDocument();
      });

      expect(screen.getByTestId("value")).toHaveTextContent(expected);
    },
  );

  it("rejection bubbles to the surrounding <ErrorBoundary>", async () => {
    const failing = Promise.reject(new Error("boom"));

    // Defensive: suppress unhandled rejection while the consumer attaches.
    failing.catch(() => {
      /* tracked downstream by createResource */
    });

    injectDeferred(router, { reviews: failing });

    render(() => (
      <RouterProvider router={router}>
        <ErrorBoundary
          fallback={(err: Error) => (
            <span data-testid="error">caught: {err.message}</span>
          )}
        >
          <Streamed fallback={<span data-testid="fallback">loading</span>}>
            <Await<string[]> name="reviews">
              {(reviews) => <span data-testid="list">{reviews.join(",")}</span>}
            </Await>
          </Streamed>
        </ErrorBoundary>
      </RouterProvider>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("error")).toHaveTextContent("caught: boom");
    expect(screen.queryByTestId("list")).not.toBeInTheDocument();
  });
});
