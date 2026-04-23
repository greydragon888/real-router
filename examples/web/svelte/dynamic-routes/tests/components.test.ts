import { createRouter } from "@real-router/core";
import { render, screen, cleanup, act, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect } from "vitest";

import App from "../src/App.svelte";
import { baseRoutes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  cleanup();
  testRouter.stop();
});

describe("Feature flag toggle — analytics", () => {
  it("toggling analytics on adds link, off removes it", async () => {
    const user = userEvent.setup();

    testRouter = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    render(App, { props: { router: testRouter } });

    expect(
      screen.queryByRole("link", { name: "Analytics" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Analytics"));

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Analytics" }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      await testRouter.navigate("analytics");
    });

    expect(testRouter.getState()?.name).toBe("analytics");

    // Navigate away before toggling off (required by routesApi.remove)
    await act(async () => {
      await testRouter.navigate("home");
    });

    await user.click(screen.getByLabelText("Analytics"));

    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: "Analytics" }),
      ).not.toBeInTheDocument();
    });

    expect(testRouter.getState()?.name).toBe("home");
  });
});

describe("Feature flag toggle — admin with nested routes", () => {
  it("toggling admin on shows nested links", async () => {
    const user = userEvent.setup();

    testRouter = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    render(App, { props: { router: testRouter } });

    expect(
      screen.queryByRole("link", { name: "Admin" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Admin Panel"));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();

    await act(async () => {
      await testRouter.navigate("admin.users");
    });

    expect(testRouter.getState()?.name).toBe("admin.users");
    expect(testRouter.getState()?.path).toBe("/admin/users");
  });
});
