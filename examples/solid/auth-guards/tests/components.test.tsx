import { render, screen, cleanup } from "@solidjs/testing-library";
import { createRouter } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { RouterProvider } from "@real-router/solid";

import { App } from "../src/App";
import { publicRoutes, privateRoutes } from "../src/routes";
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

function renderApp() {
  return render(() => (
    <RouterProvider router={testRouter}>
      <App />
    </RouterProvider>
  ));
}

describe("Login → sidebar swap", () => {
  it("swaps sidebar from public to private links after login", async () => {
    testRouter = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    renderApp();

    const sidebar = screen.getByRole("complementary");

    expect(sidebar).toHaveTextContent("Home");
    expect(sidebar).toHaveTextContent("Services");
    expect(sidebar).toHaveTextContent("Contacts");
    expect(sidebar).toHaveTextContent("Login");

    // Swap routes BEFORE store update — Solid's synchronous reactivity
    // would otherwise create Link components for route names that don't
    // exist yet, causing buildPath errors.
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

    expect(sidebar).toHaveTextContent("Dashboard");
    expect(sidebar).toHaveTextContent("Settings");
    expect(sidebar).toHaveTextContent("Admin");
    expect(sidebar).not.toHaveTextContent("Login");
    expect(sidebar).not.toHaveTextContent("Services");
  });
});

describe("Logout → sidebar swap back to public", () => {
  it("restores public links after logout", async () => {
    store.set("user", {
      id: "1",
      name: "Alice",
      role: "admin" as const,
      email: "alice@example.com",
    });

    testRouter = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(testRouter).set("abilities", defineAbilities("admin"));
    await testRouter.start("/dashboard");

    renderApp();

    const sidebar = screen.getByRole("complementary");

    expect(sidebar).toHaveTextContent("Dashboard");

    // Swap routes before store update (same reason as login test)
    const routesApi = getRoutesApi(testRouter);

    routesApi.clear();
    routesApi.add(publicRoutes);
    getDependenciesApi(testRouter).set("abilities", []);
    store.set("user", null);

    await testRouter.navigate("home");

    expect(sidebar).toHaveTextContent("Home");
    expect(sidebar).toHaveTextContent("Services");
    expect(sidebar).toHaveTextContent("Login");
    expect(sidebar).not.toHaveTextContent("Dashboard");
  });
});

describe("RBAC — admin guard in UI", () => {
  it("admin can see Admin page", async () => {
    store.set("user", {
      id: "1",
      name: "Alice",
      role: "admin" as const,
      email: "alice@example.com",
    });

    testRouter = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(testRouter).set("abilities", defineAbilities("admin"));
    await testRouter.start("/admin");

    renderApp();

    expect(
      screen.getByRole("heading", { name: "Admin Panel" }),
    ).toBeInTheDocument();
  });

  it("editor stays on dashboard when admin guard rejects", async () => {
    store.set("user", {
      id: "2",
      name: "Bob",
      role: "editor" as const,
      email: "bob@example.com",
    });

    testRouter = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(testRouter).set("abilities", defineAbilities("editor"));
    await testRouter.start("/dashboard");

    renderApp();

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();

    await testRouter.navigate("admin").catch(() => {});

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Admin Panel" }),
    ).not.toBeInTheDocument();
  });
});
