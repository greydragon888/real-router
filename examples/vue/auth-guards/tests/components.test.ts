import { render, screen, waitFor } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { RouterProvider } from "@real-router/vue";
import { defineComponent, h } from "vue";

import App from "../src/App.vue";
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
  testRouter?.stop();
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
  it("swaps sidebar from public to private links after login", async () => {
    const user = userEvent.setup();

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

    expect(sidebar).toHaveTextContent("Settings");
    expect(sidebar).toHaveTextContent("Admin");
    expect(sidebar).not.toHaveTextContent("Login");
    expect(sidebar).not.toHaveTextContent("Services");
  });
});

describe("Logout → sidebar swap back to public", () => {
  it("restores public links after logout", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(sidebar).toHaveTextContent("Home");
    });

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
