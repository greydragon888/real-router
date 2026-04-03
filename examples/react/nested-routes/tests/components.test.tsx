import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/react";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";

import { App } from "../src/App";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  cleanup();
  testRouter.stop();
});

function renderApp() {
  return render(
    <RouterProvider router={testRouter}>
      <App />
    </RouterProvider>,
  );
}

describe("Submenu appearance", () => {
  it("shows inner sidebar (List, Settings) when on users.* route", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/list");

    renderApp();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Users" }),
      ).toBeInTheDocument();
    });

    const listLink = screen.getByRole("link", { name: "List" });
    const settingsLink = screen.getByRole("link", { name: "Settings" });

    expect(listLink).toBeInTheDocument();
    expect(settingsLink).toBeInTheDocument();
  });

  it("does not show inner sidebar on home page", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    renderApp();

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "List" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });
});

describe("Active link classes", () => {
  it("outer sidebar 'Users' has active class on users.list", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/list");

    renderApp();

    const sidebar = screen.getByRole("complementary");
    const usersLink = sidebar.querySelector("a[href='/users']");
    const homeLink = sidebar.querySelector("a[href='/']");

    await waitFor(() => {
      expect(usersLink).toHaveClass("active");
    });

    expect(homeLink).not.toHaveClass("active");
  });

  it("outer sidebar 'Users' stays active on users.profile", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/list");

    renderApp();

    await act(async () => {
      await testRouter.navigate("users.profile", { id: "1" });
    });

    const sidebar = screen.getByRole("complementary");
    const usersLink = sidebar.querySelector("a[href='/users']");

    expect(usersLink).toHaveClass("active");
  });

  it("inner sidebar List link is active on users.list, Settings is not", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/list");

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "List" })).toHaveClass("active");
    });

    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveClass(
      "active",
    );
  });

  it("inner sidebar Settings link becomes active on users.settings", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/settings");

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Settings" })).toHaveClass(
        "active",
      );
    });

    expect(screen.getByRole("link", { name: "List" })).not.toHaveClass(
      "active",
    );
  });
});

describe("Breadcrumbs", () => {
  it("shows breadcrumb trail on users.list", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/list");

    renderApp();

    const breadcrumb = screen.getByLabelText("breadcrumb");

    await waitFor(() => {
      expect(breadcrumb).toHaveTextContent("Home");
    });

    expect(breadcrumb).toHaveTextContent("Users");
    expect(breadcrumb).toHaveTextContent("List");
  });

  it("shows user ID in breadcrumb on users.profile", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/users/list");

    renderApp();

    await act(async () => {
      await testRouter.navigate("users.profile", { id: "2" });
    });

    const breadcrumb = screen.getByLabelText("breadcrumb");

    expect(breadcrumb).toHaveTextContent("User #2");
  });
});
