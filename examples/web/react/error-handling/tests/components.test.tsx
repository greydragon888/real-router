import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/react";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";

import { errorStore } from "../src/error-store";
import { ErrorPanel } from "../src/pages/ErrorPanel";
import { routes } from "../src/routes";

import type { PluginFactory, Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  cleanup();
  testRouter.stop();
  vi.useRealTimers();
});

describe("ErrorPanel — plugin log in UI", () => {
  it("shows 'no errors yet' initially", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    render(
      <RouterProvider router={testRouter}>
        <ErrorPanel />
      </RouterProvider>,
    );

    expect(screen.getByText(/no errors yet/i)).toBeInTheDocument();
  });

  it("displays CANNOT_ACTIVATE after guard rejection", async () => {
    const errorLoggerPlugin: PluginFactory = () => ({
      onTransitionError(_toState, _fromState, err) {
        errorStore.add(err);
      },
    });

    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    testRouter.usePlugin(errorLoggerPlugin);
    await testRouter.start("/");

    render(
      <RouterProvider router={testRouter}>
        <ErrorPanel />
      </RouterProvider>,
    );

    await act(async () => {
      await testRouter.navigate("protected").catch(() => {});
    });

    await waitFor(() => {
      expect(screen.getByText("CANNOT_ACTIVATE")).toBeInTheDocument();
    });
  });

  it("displays TRANSITION_CANCELLED after competing navigation", async () => {
    const errorLoggerPlugin: PluginFactory = () => ({
      onTransitionCancel(toState, fromState) {
        errorStore.addCancel(toState, fromState);
      },
    });

    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    testRouter.usePlugin(errorLoggerPlugin);
    await testRouter.start("/");

    render(
      <RouterProvider router={testRouter}>
        <ErrorPanel />
      </RouterProvider>,
    );

    vi.useFakeTimers();

    await act(async () => {
      const firstNav = testRouter.navigate("slow");

      testRouter.navigate("about").catch(() => {});
      await vi.advanceTimersByTimeAsync(5000);
      await firstNav.catch(() => {});
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("TRANSITION_CANCELLED")).toBeInTheDocument();
    });
  });
});
