import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { render, screen, cleanup, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect } from "vitest";

import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import App from "../src/App.svelte";
import { dataLoaderPluginFactory } from "../src/dataLoader";
import { publicRoutes, privateRoutes } from "../src/routes";

import type { AppDependencies } from "../src/types";
import type { Router } from "@real-router/core";

let testRouter: Router<AppDependencies>;

afterEach(() => {
  cleanup();
  testRouter.stop();
});

// ---------------------------------------------------------------------------
// a) Login → sidebar swap
// ---------------------------------------------------------------------------
describe("Login → sidebar swap", () => {
  it("swaps sidebar links from public to private after login", async () => {
    const user = userEvent.setup();

    testRouter = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });

    await testRouter.start("/");

    // Svelte App receives router as a prop (no module mock needed)
    render(App, { props: { router: testRouter } });

    const sidebar = screen.getByRole("complementary");

    expect(sidebar).toHaveTextContent("Home");
    expect(sidebar).toHaveTextContent("Login");

    // Navigate to login page via sidebar link
    await user.click(screen.getByRole("link", { name: "Login" }));

    // Fill login form
    await user.type(
      screen.getByPlaceholderText("alice@example.com"),
      "alice@example.com",
    );
    await user.type(screen.getByPlaceholderText("any password"), "password");

    // Submit login
    await user.click(screen.getByRole("button", { name: "Login" }));

    // Wait for sidebar to update (300ms API delay → onLogin → route swap)
    await waitFor(() => {
      expect(sidebar).toHaveTextContent("Dashboard");
    });

    expect(sidebar).toHaveTextContent("Products");
    expect(sidebar).toHaveTextContent("Users");
    expect(sidebar).toHaveTextContent("Settings");
    expect(sidebar).toHaveTextContent("Admin");
    expect(sidebar).toHaveTextContent("Checkout");
    expect(sidebar).not.toHaveTextContent("Login");
  });
});

// ---------------------------------------------------------------------------
// b) Guard rejection → UI feedback
// ---------------------------------------------------------------------------
describe("Guard rejection → UI feedback", () => {
  it("keeps user on dashboard when admin guard rejects viewer", async () => {
    store.set("user", {
      id: "3",
      name: "Carol",
      role: "viewer" as const,
      email: "carol@example.com",
    });

    testRouter = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
      allowNotFound: true,
    });

    getDependenciesApi(testRouter).set("abilities", defineAbilities("viewer"));

    await testRouter.start("/dashboard");

    render(App, { props: { router: testRouter } });

    // Verify on dashboard
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
    });

    // Attempt to navigate to admin (guard rejects for viewer role)
    await testRouter.navigate("admin").catch(() => {});

    // Still on dashboard — admin page never rendered
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /admin/i }),
    ).not.toBeInTheDocument();
    expect(testRouter.getState()?.name).toBe("dashboard");
  });
});

// ---------------------------------------------------------------------------
// c) Data-driven render
// ---------------------------------------------------------------------------
describe("Data-driven render", () => {
  it("loads products via dataLoader plugin and renders product cards", async () => {
    store.set("user", {
      id: "1",
      name: "Alice",
      role: "admin" as const,
      email: "alice@example.com",
    });

    testRouter = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
      allowNotFound: true,
    });

    testRouter.usePlugin(dataLoaderPluginFactory());
    getDependenciesApi(testRouter).set("abilities", defineAbilities("admin"));

    await testRouter.start("/products/list");

    render(App, { props: { router: testRouter } });

    // Wait for products to load (300ms API delay via dataLoader plugin)
    await waitFor(() => {
      expect(screen.getByText("Laptop")).toBeInTheDocument();
    });

    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });
});
