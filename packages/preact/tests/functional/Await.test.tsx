import { render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/preact";
import { Await, Streamed } from "@real-router/preact/ssr";

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

    render(
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string[]> name="reviews">
            {(reviews) => (
              <ul data-testid="list">
                {reviews.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </Await>
        </Streamed>
      </RouterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("list")).toBeInTheDocument();
    });

    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();
  });

  it("shows Streamed fallback while pending", () => {
    const pending = new Promise<string[]>(() => undefined);

    injectDeferred(router, { reviews: pending });

    render(
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string[]> name="reviews">
            {(reviews) => <span data-testid="list">{reviews.join(",")}</span>}
          </Await>
        </Streamed>
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("list")).not.toBeInTheDocument();
  });

  it("renders children synchronously when the promise is pre-tracked as fulfilled", () => {
    const ready = Object.assign(Promise.resolve("hello"), {
      status: "fulfilled" as const,
      value: "hello",
    });

    injectDeferred(router, { msg: ready });

    render(
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string> name="msg">
            {(msg) => <span data-testid="msg">{msg}</span>}
          </Await>
        </Streamed>
      </RouterProvider>,
    );

    expect(screen.getByTestId("msg")).toHaveTextContent("hello");
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("tags an untagged promise on first read so the second render can resolve synchronously", async () => {
    interface TaggedPromise<T> extends Promise<T> {
      status?: "pending" | "fulfilled" | "rejected";
      value?: T;
      reason?: unknown;
    }

    const promise = Promise.resolve("hi");

    injectDeferred(router, { x: promise });

    render(
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string> name="x">
            {(v) => <span data-testid="v">{v}</span>}
          </Await>
        </Streamed>
      </RouterProvider>,
    );

    // Allow microtask to fire — the success branch of the .then() handler
    // installed by `track` flips status from "pending" to "fulfilled".
    await promise;
    await Promise.resolve();

    const tagged = promise as TaggedPromise<string>;

    expect(tagged.status).toBe("fulfilled");
    expect(tagged.value).toBe("hi");
  });

  it("re-throws the rejection reason when the promise is pre-tracked as rejected (caught by ErrorBoundary)", () => {
    const reason = new Error("boom");
    const rejected = Object.assign(Promise.reject(reason), {
      status: "rejected" as const,
      reason,
    });

    // Avoid unhandled-rejection warnings in test runner.
    rejected.catch(() => undefined);

    injectDeferred(router, { broken: rejected });

    expect(() =>
      render(
        <RouterProvider router={router}>
          <Streamed fallback={<span data-testid="fallback">loading</span>}>
            <Await<string> name="broken">
              {(value) => <span data-testid="value">{value}</span>}
            </Await>
          </Streamed>
        </RouterProvider>,
      ),
    ).toThrow("boom");
  });

  it("suspends forever (renders fallback) when the deferred key is missing", () => {
    render(
      <RouterProvider router={router}>
        <Streamed fallback={<span data-testid="fallback">loading</span>}>
          <Await<string> name="missing">
            {(value) => <span data-testid="value">{value}</span>}
          </Await>
        </Streamed>
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("value")).not.toBeInTheDocument();
  });
});
