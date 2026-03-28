import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterErrorBoundary, RouterProvider } from "@real-router/solid";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("RouterErrorBoundary - Integration Tests", () => {
  let router: Router;
  const user = userEvent.setup();

  const wrapper = (props: { children: JSX.Element }) => (
    <RouterProvider router={router}>{props.children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("Link + RouterErrorBoundary end-to-end", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      () => (
        <RouterErrorBoundary
          fallback={(error) => <div data-testid="fallback">{error.code}</div>}
        >
          <Link routeName="dashboard" data-testid="link-dashboard">
            Dashboard
          </Link>
          <Link routeName="settings" data-testid="link-settings">
            Settings
          </Link>
        </RouterErrorBoundary>
      ),
      { wrapper },
    );

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("link-dashboard"));

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("fallback").textContent).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    await user.click(screen.getByTestId("link-settings"));

    await waitFor(() => {
      expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    });

    expect(router.getState()?.name).toBe("settings");
  });

  it("multiple Links in one boundary trigger different errors", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    render(
      () => (
        <RouterErrorBoundary
          fallback={(error) => <div data-testid="fallback">{error.code}</div>}
        >
          <Link routeName="dashboard" data-testid="link-dashboard">
            Dashboard
          </Link>
          <Link routeName="settings" data-testid="link-settings">
            Settings
          </Link>
        </RouterErrorBoundary>
      ),
      { wrapper },
    );

    await user.click(screen.getByTestId("link-dashboard"));

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("fallback").textContent).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    await user.click(screen.getByTestId("link-settings"));

    await waitFor(() => {
      expect(screen.getByTestId("fallback").textContent).toBe(
        errorCodes.CANNOT_ACTIVATE,
      );
    });
  });

  it("error without transition (SAME_STATES)", async () => {
    render(
      () => (
        <RouterErrorBoundary
          fallback={(error) => <div data-testid="fallback">{error.code}</div>}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      ),
      { wrapper },
    );

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();

    await router.navigate("home").catch(() => {});

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("fallback").textContent).toBe(
      errorCodes.SAME_STATES,
    );

    expect(router.getState()?.name).toBe("home");
  });
});
