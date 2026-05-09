import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/react";
import { Await } from "@real-router/react/ssr";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

interface TrackedPromise<T> extends Promise<T> {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
}

function trackResolved<T>(value: T): TrackedPromise<T> {
  const p = Promise.resolve(value) as TrackedPromise<T>;

  p.status = "fulfilled";
  p.value = value;

  return p;
}

function trackPending<T>(): TrackedPromise<T> {
  const p = new Promise<T>(() => {
    // never resolves
  }) as TrackedPromise<T>;

  p.status = "pending";

  return p;
}

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

  it("renders children with the resolved value when the deferred promise is pre-tracked as fulfilled", () => {
    injectDeferred(router, { reviews: trackResolved(["r1", "r2"]) });

    render(
      <RouterProvider router={router}>
        <Suspense fallback={<span data-testid="fallback">loading</span>}>
          <Await<string[]> name="reviews">
            {(value) => (
              <ul data-testid="list">
                {value.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </Await>
        </Suspense>
      </RouterProvider>,
    );

    expect(screen.getByTestId("list")).toBeInTheDocument();
    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("shows Suspense fallback while pending", () => {
    injectDeferred(router, { reviews: trackPending<string[]>() });

    render(
      <RouterProvider router={router}>
        <Suspense fallback={<span data-testid="fallback">loading</span>}>
          <Await<string[]> name="reviews">
            {(reviews) => <span data-testid="list">{reviews.join(",")}</span>}
          </Await>
        </Suspense>
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("list")).not.toBeInTheDocument();
  });

  it("suspends forever (renders fallback) when the deferred key is missing", () => {
    // No injectDeferred — useDeferred returns the never-promise.
    render(
      <RouterProvider router={router}>
        <Suspense fallback={<span data-testid="fallback">loading</span>}>
          <Await<string> name="missing">
            {(value) => <span data-testid="value">{value}</span>}
          </Await>
        </Suspense>
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("value")).not.toBeInTheDocument();
  });

  it("passes the resolved value to the children render-prop", () => {
    injectDeferred(router, { user: trackResolved({ name: "Alice", id: 42 }) });

    render(
      <RouterProvider router={router}>
        <Suspense fallback={<span data-testid="fallback">loading</span>}>
          <Await<{ name: string; id: number }> name="user">
            {(user) => (
              <span data-testid="user">{`${user.name}-${user.id}`}</span>
            )}
          </Await>
        </Suspense>
      </RouterProvider>,
    );

    expect(screen.getByTestId("user")).toHaveTextContent("Alice-42");
  });
});
