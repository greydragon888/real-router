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
    const loader: LazyLoader = vi.fn(
      (): Promise<{ default: Component }> =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ default: MockLoadedComponent });
          }, 100);
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

    await new Promise((resolve) => setTimeout(resolve, 50));
    flushSync();

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("loaded")).toBeInTheDocument();
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

    await new Promise((resolve) => setTimeout(resolve, 50));
    flushSync();

    expect(screen.getByText(/Error loading component/)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load component/)).toBeInTheDocument();
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
    const loader: LazyLoader = vi.fn(
      (): Promise<{ default: Component }> =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ default: MockLoadedComponent });
          }, 100);
        }),
    );

    render(LazyTest, {
      props: {
        router,
        loader,
      },
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("should render loaded component successfully", async () => {
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

    await new Promise((resolve) => setTimeout(resolve, 50));
    flushSync();

    expect(screen.getByTestId("loaded")).toBeInTheDocument();
  });
});
