import {
  render,
  screen,
  cleanup,
  act,
  waitFor,
  within,
} from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { RouterProvider } from "@real-router/preact";

import { App } from "../src/App";
import { publicRoutes, privateRoutes } from "../src/routes";
import { dataLoaderPluginFactory } from "../src/dataLoader";
import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";

import type { Router } from "@real-router/core";
import type { AppDependencies } from "../src/types";

let testRouter: Router<AppDependencies>;

vi.mock("../src/router", () => ({
  get router() {
    return testRouter;
  },
}));

afterEach(() => {
  cleanup();
  testRouter?.stop();
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

    render(
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>,
    );

    const sidebar = screen.getByRole("complementary");

    // Public sidebar shows Home and Login
    expect(within(sidebar).getByText("Home")).toBeInTheDocument();
    expect(within(sidebar).getByText("Login")).toBeInTheDocument();

    // Navigate to login page via sidebar link
    await user.click(within(sidebar).getByText("Login"));

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
      expect(within(sidebar).getByText("Dashboard")).toBeInTheDocument();
    });

    expect(within(sidebar).getByText("Products")).toBeInTheDocument();
    expect(within(sidebar).getByText("Users")).toBeInTheDocument();
    expect(within(sidebar).getByText("Settings")).toBeInTheDocument();
    expect(within(sidebar).getByText("Admin")).toBeInTheDocument();
    expect(within(sidebar).getByText("Checkout")).toBeInTheDocument();
    expect(within(sidebar).queryByText("Login")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// b) Data-driven render
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

    render(
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>,
    );

    // Wait for products to load (300ms API delay via dataLoader plugin)
    await waitFor(() => {
      expect(screen.getByText("Laptop")).toBeInTheDocument();
    });

    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// c) Guard rejection → UI feedback
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

    render(
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>,
    );

    // Verify on dashboard (lazy-loaded — may need to wait)
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
    });

    // Attempt to navigate to admin (guard rejects for viewer role)
    await act(async () => {
      await testRouter.navigate("admin").catch(() => {});
    });

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
