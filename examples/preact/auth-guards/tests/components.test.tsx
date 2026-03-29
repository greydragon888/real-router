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

describe("Login → sidebar swap", () => {
  it("swaps sidebar from public to private links after login", async () => {
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

    expect(within(sidebar).getByText("Home")).toBeInTheDocument();
    expect(within(sidebar).getByText("Services")).toBeInTheDocument();
    expect(within(sidebar).getByText("Contacts")).toBeInTheDocument();
    expect(within(sidebar).getByText("Login")).toBeInTheDocument();

    await user.click(within(sidebar).getByText("Login"));

    await user.type(
      screen.getByPlaceholderText("alice@example.com"),
      "alice@example.com",
    );
    await user.type(screen.getByPlaceholderText("any password"), "password");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(within(sidebar).getByText("Dashboard")).toBeInTheDocument();
    });

    expect(within(sidebar).getByText("Settings")).toBeInTheDocument();
    expect(within(sidebar).getByText("Admin")).toBeInTheDocument();
    expect(within(sidebar).queryByText("Login")).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("Services")).not.toBeInTheDocument();
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

    render(
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>,
    );

    const sidebar = screen.getByRole("complementary");

    expect(within(sidebar).getByText("Dashboard")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(within(sidebar).getByText("Home")).toBeInTheDocument();
    });

    expect(within(sidebar).getByText("Services")).toBeInTheDocument();
    expect(within(sidebar).getByText("Login")).toBeInTheDocument();
    expect(within(sidebar).queryByText("Dashboard")).not.toBeInTheDocument();
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

    render(
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>,
    );

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

    render(
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();

    await act(async () => {
      await testRouter.navigate("admin").catch(() => {});
    });

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Admin Panel" }),
    ).not.toBeInTheDocument();
  });
});
