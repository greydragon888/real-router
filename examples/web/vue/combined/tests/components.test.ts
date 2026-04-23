import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { RouterProvider } from "@real-router/vue";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import App from "../src/App.vue";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
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
  testRouter.stop();
});

function renderApp() {
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(RouterProvider, { router: testRouter }, { default: () => h(App) });
    },
  });

  return render(Wrapper);
}

describe("Login → sidebar swap", () => {
  it("swaps sidebar links from public to private after login", async () => {
    const user = userEvent.setup();

    testRouter = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });

    await testRouter.start("/");

    renderApp();

    const sidebar = screen.getByRole("complementary");

    expect(sidebar).toHaveTextContent("Home");
    expect(sidebar).toHaveTextContent("Login");

    await user.click(screen.getByRole("link", { name: "Login" }));

    await user.type(
      screen.getByPlaceholderText("alice@example.com"),
      "alice@example.com",
    );
    await user.type(screen.getByPlaceholderText("any password"), "password");

    await user.click(screen.getByRole("button", { name: "Login" }));

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

    renderApp();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
    });

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
  it("loads products via lifecycle plugin and renders product cards", async () => {
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

    testRouter.usePlugin(lifecyclePluginFactory());
    getDependenciesApi(testRouter).set("abilities", defineAbilities("admin"));

    await testRouter.start("/products/list");

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Laptop")).toBeInTheDocument();
    });

    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });
});
