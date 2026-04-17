import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import LazyTest from "../helpers/LazyTest.svelte";
import MockFallbackComponent from "../helpers/MockFallbackComponent.svelte";
import MockLoadedComponent from "../helpers/MockLoadedComponent.svelte";

import type { Router } from "@real-router/core";
import type { Component } from "svelte";

type LazyLoader = () => Promise<{ default: Component }>;

describe("Lazy component", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should render fallback while loading", () => {
    let resolveLoader!: (value: { default: Component }) => void;
    const loader: LazyLoader = vi.fn(
      () =>
        new Promise<{ default: Component }>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("loaded")).not.toBeInTheDocument();

    // cleanup pending promise
    resolveLoader({ default: MockLoadedComponent });
  });

  it("should render loaded component after loading completes", async () => {
    const loader: LazyLoader = vi.fn(() =>
      Promise.resolve({ default: MockLoadedComponent }),
    );

    render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    await vi.waitFor(() => {
      flushSync();

      expect(screen.getByTestId("loaded")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("should handle loader errors gracefully", async () => {
    const testError = new Error("Failed to load component");
    const loader: LazyLoader = vi.fn(() => Promise.reject(testError));

    render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    await vi.waitFor(() => {
      flushSync();

      // Exact rendered string from Lazy.svelte: "Error loading component: <message>".
      // No regex — the full literal is asserted to catch formatting regressions.
      expect(screen.getByText(/Error loading component: /)).toBeInTheDocument();
    });

    const errorLine = screen.getByText(/Error loading component: /);

    expect(errorLine.textContent).toBe(
      "Error loading component: Failed to load component",
    );
  });

  it("should call loader function on mount", () => {
    const loader: LazyLoader = vi.fn(() =>
      Promise.resolve({ default: MockLoadedComponent }),
    );

    render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("should not render fallback if no fallback provided", () => {
    let resolveLoader!: (value: { default: Component }) => void;
    const loader: LazyLoader = vi.fn(
      () =>
        new Promise<{ default: Component }>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    render(LazyTest, {
      props: {
        router,
        loader,
      },
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();

    resolveLoader({ default: MockLoadedComponent });
  });

  it("should discard stale loader result when loader prop changes", async () => {
    let resolveFirst!: (value: { default: Component }) => void;
    const firstLoader: LazyLoader = vi.fn(
      () =>
        new Promise<{ default: Component }>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const secondLoader: LazyLoader = vi.fn(() =>
      Promise.resolve({ default: MockLoadedComponent }),
    );

    const { rerender } = render(LazyTest, {
      props: { router, loader: firstLoader, fallback: MockFallbackComponent },
    });

    // Switch loader while first is still pending
    await rerender({
      router,
      loader: secondLoader,
      fallback: MockFallbackComponent,
    });

    await vi.waitFor(() => {
      flushSync();

      expect(screen.getByTestId("loaded")).toBeInTheDocument();
    });

    // Now resolve the stale first loader — should be ignored
    resolveFirst({ default: MockFallbackComponent });
    await Promise.resolve();
    flushSync();

    // Still showing second loader's component, not first
    expect(screen.getByTestId("loaded")).toBeInTheDocument();
  });

  it("should not render loaded component after unmount", async () => {
    let resolveLoader!: (value: { default: Component }) => void;
    const loader: LazyLoader = vi.fn(
      () =>
        new Promise<{ default: Component }>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const { unmount } = render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    // Fallback is shown while loading
    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    // Unmount before the loader resolves
    unmount();

    // Now resolve the loader — the component should be discarded
    resolveLoader({ default: MockLoadedComponent });
    await Promise.resolve();

    // The loaded component should not appear in the DOM
    expect(screen.queryByTestId("loaded")).not.toBeInTheDocument();
  });

  it("should discard stale loader error when loader prop changes", async () => {
    let rejectFirst!: (err: Error) => void;
    const firstLoader: LazyLoader = vi.fn(
      () =>
        new Promise<{ default: Component }>((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );

    const secondLoader: LazyLoader = vi.fn(() =>
      Promise.resolve({ default: MockLoadedComponent }),
    );

    const { rerender } = render(LazyTest, {
      props: { router, loader: firstLoader, fallback: MockFallbackComponent },
    });

    // Switch loader while first is still pending
    await rerender({
      router,
      loader: secondLoader,
      fallback: MockFallbackComponent,
    });

    await vi.waitFor(() => {
      flushSync();

      expect(screen.getByTestId("loaded")).toBeInTheDocument();
    });

    // Now reject the stale first loader — should be ignored
    rejectFirst(new Error("stale error"));
    await Promise.resolve();
    flushSync();

    // Still showing second loader's component, no error
    expect(screen.getByTestId("loaded")).toBeInTheDocument();
    expect(
      screen.queryByText(/Error loading component/),
    ).not.toBeInTheDocument();
  });

  it("should show error when loader resolves without a default export", async () => {
    const loader = vi.fn(
      () =>
        // Bypass type check to simulate broken module shape
        Promise.resolve({}) as Promise<{ default: Component }>,
    );

    render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    await vi.waitFor(() => {
      flushSync();

      expect(
        screen.getByText(/resolved without a `default` export/),
      ).toBeInTheDocument();
    });

    const errorLine = screen.getByText(/resolved without a `default` export/);

    // Exact message from Lazy.svelte — locks the contract. A slight change in
    // copy (e.g. "without a default export") will no longer silently pass.
    expect(errorLine.textContent).toBe(
      "Error loading component: [real-router] Lazy loader resolved without a `default` export.",
    );

    expect(screen.queryByTestId("loaded")).not.toBeInTheDocument();
  });

  it("should wrap non-Error rejections into Error instances", async () => {
    const loader = vi.fn(() =>
      // Reject with a plain string — exercises `err instanceof Error ? … : new Error(String(err))`
      Promise.reject("string failure"),
    );

    render(LazyTest, {
      props: {
        router,
        loader,
        fallback: MockFallbackComponent,
      },
    });

    await vi.waitFor(() => {
      flushSync();

      expect(screen.getByText(/string failure/)).toBeInTheDocument();
    });
  });
});
