import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import ErrorBoundaryWithDismiss from "../helpers/ErrorBoundaryWithDismiss.svelte";
import ErrorBoundaryWithLink from "../helpers/ErrorBoundaryWithLink.svelte";

import type { Router } from "@real-router/core";

describe("RouterErrorBoundary - Integration Tests", () => {
  let router: Router;

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

    render(ErrorBoundaryWithLink, { props: { router } });

    expect(screen.queryByTestId("fallback")).toBeNull();

    await userEvent.click(screen.getByTestId("link-dashboard"));
    flushSync();

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.getByTestId("fallback")).toHaveTextContent(
      errorCodes.CANNOT_ACTIVATE,
    );

    await userEvent.click(screen.getByTestId("link-settings"));
    flushSync();

    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(router.getState()?.name).toBe("settings");
  });

  it("multiple Links trigger different errors", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    render(ErrorBoundaryWithLink, { props: { router } });

    await userEvent.click(screen.getByTestId("link-dashboard"));
    flushSync();

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.getByTestId("fallback")).toHaveTextContent(
      errorCodes.CANNOT_ACTIVATE,
    );

    await userEvent.click(screen.getByTestId("link-settings"));
    flushSync();

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.getByTestId("fallback")).toHaveTextContent(
      errorCodes.CANNOT_ACTIVATE,
    );
  });

  it("error without transition (SAME_STATES)", async () => {
    render(ErrorBoundaryWithDismiss, { props: { router } });

    expect(screen.queryByTestId("fallback")).toBeNull();

    await router.navigate("home").catch(() => {});
    flushSync();

    expect(screen.getByTestId("fallback")).toHaveTextContent(
      errorCodes.SAME_STATES,
    );

    expect(router.getState()?.name).toBe("home");
  });
});
