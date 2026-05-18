import { render, screen, waitFor } from "@solidjs/testing-library";
import { lazy } from "solid-js";
import { describe, expect, it } from "vitest";

import { Streamed } from "@real-router/solid/ssr";

import type { JSX } from "solid-js";

describe("<Streamed>", () => {
  it("renders children when no descendant suspends", () => {
    render(() => (
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <span data-testid="ready">ready</span>
      </Streamed>
    ));

    expect(screen.getByTestId("ready")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("shows fallback while a lazy descendant is suspended", async () => {
    let resolveComponent!: (module_: { default: () => JSX.Element }) => void;
    const componentPromise = new Promise<{ default: () => JSX.Element }>(
      (r) => {
        resolveComponent = r;
      },
    );
    const LazyChild = lazy(() => componentPromise);

    render(() => (
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <LazyChild />
      </Streamed>
    ));

    // Suspense boundary active — fallback visible, content not yet.
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    resolveComponent({
      default: () => <span data-testid="content">ready</span>,
    });

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders multiple children when no descendant suspends", () => {
    render(() => (
      <Streamed fallback={<span data-testid="fallback">loading</span>}>
        <span data-testid="child-a">a</span>
        <span data-testid="child-b">b</span>
      </Streamed>
    ));

    expect(screen.getByTestId("child-a")).toBeInTheDocument();
    expect(screen.getByTestId("child-b")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });
});
