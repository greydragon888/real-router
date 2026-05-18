import { render, screen } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it } from "vitest";

import { Streamed } from "@real-router/react/ssr";

import type { ReactElement } from "react";

interface TrackedPromise<T> extends Promise<T> {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
}

/**
 * Mark a Promise with React-19's internal {@link TrackedPromise} shape.
 * `use()` reads `.status === "fulfilled"` and returns `.value` synchronously.
 * Production wire-format installs the same shape via the inline settle scripts.
 */
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

function Resolved({
  promise,
}: {
  readonly promise: Promise<string>;
}): ReactElement {
  const value = use(promise);

  return <span data-testid="value">{value}</span>;
}

describe("<Streamed>", () => {
  it("renders children when no descendant suspends", () => {
    render(
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <span data-testid="ready">ready</span>
      </Streamed>,
    );

    expect(screen.getByTestId("ready")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("shows fallback while a child suspends on a pending promise", () => {
    render(
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <Resolved promise={trackPending<string>()} />
      </Streamed>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("value")).not.toBeInTheDocument();
  });

  it("renders children synchronously when the promise is pre-tracked as fulfilled", () => {
    render(
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <Resolved promise={trackResolved("hello")} />
      </Streamed>,
    );

    expect(screen.getByTestId("value")).toHaveTextContent("hello");
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });
});
