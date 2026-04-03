import { createRouter } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { RouterProvider } from "@real-router/solid";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { afterEach, describe, it, expect } from "vitest";

import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import { App } from "../src/App";
import { dataLoaderPluginFactory } from "../src/dataLoader";
import { publicRoutes, privateRoutes } from "../src/routes";

import type { AppDependencies } from "../src/types";
import type { Router } from "@real-router/core";

let testRouter: Router<AppDependencies>;

vi.mock(import("../src/router"), () => ({
  get router() {
    return testRouter;
  },
}));

afterEach(() => {
  cleanup();
  testRouter.stop();
});

describe("Login → sidebar swap", () => {
  it("swaps sidebar links from public to private after login", async () => {
    testRouter = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });

    await testRouter.start("/");

    render(() => (
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>
    ));

    const sidebar = screen.getByRole("complementary");

    expect(sidebar).toHaveTextContent("Home");
    expect(sidebar).toHaveTextContent("Login");

    const routesApi = getRoutesApi(testRouter);

    routesApi.clear();
    routesApi.add(privateRoutes);
    getDependenciesApi(testRouter).set("abilities", defineAbilities("admin"));
    store.set("user", {
      id: "1",
      name: "Alice",
      role: "admin" as const,
      email: "alice@example.com",
    });

    await testRouter.navigate("dashboard");

    await screen.findByText("Dashboard", { selector: "a" });

    expect(sidebar).toHaveTextContent("Products");
    expect(sidebar).toHaveTextContent("Users");
    expect(sidebar).toHaveTextContent("Settings");
    expect(sidebar).toHaveTextContent("Admin");
    expect(sidebar).toHaveTextContent("Checkout");
    expect(sidebar).not.toHaveTextContent("Login");
  });
});

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

    render(() => (
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>
    ));

    await screen.findByRole("heading", { name: "Dashboard" });

    await testRouter.navigate("admin").catch(() => {});

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /admin/i }),
    ).not.toBeInTheDocument();
    expect(testRouter.getState()?.name).toBe("dashboard");
  });
});

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

    render(() => (
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>
    ));

    await screen.findByText("Laptop");

    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });
});
