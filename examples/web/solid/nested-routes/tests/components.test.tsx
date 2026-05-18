import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/solid";
import { render, screen, cleanup, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, it, expect } from "vitest";

import { App } from "../src/App";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

describe("solid/nested-routes — components", () => {
  afterEach(() => {
    cleanup();
    testRouter.stop();
  });

  function renderApp() {
    return render(() => (
      <RouterProvider router={testRouter}>
        <App />
      </RouterProvider>
    ));
  }

  describe("Per-user sub-navigation appearance", () => {
    it("shows per-user sidebar (Profile, Settings) when on users.profile.*", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users/1");

      renderApp();

      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: "Profile" }),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("link", { name: "Settings" }),
      ).toBeInTheDocument();
    });

    it("does not show per-user sidebar on the users list page", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users");

      renderApp();

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Users" }),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("link", { name: "Profile" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Settings" }),
      ).not.toBeInTheDocument();
    });

    it("does not show per-user sidebar on home page", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/");

      renderApp();

      expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Profile" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Settings" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Active link classes", () => {
    it("outer sidebar 'Users' has active class on users", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users");

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
      await testRouter.start("/users");

      renderApp();

      await testRouter.navigate("users.profile", { id: "1" });

      await waitFor(() => {
        const sidebar = screen.getByRole("complementary");
        const usersLink = sidebar.querySelector("a[href='/users']");

        expect(usersLink).toHaveClass("active");
      });
    });

    it("per-user sidebar Profile link is active on /users/:id, Settings is not", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users/1");

      renderApp();

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Profile" })).toHaveClass(
          "active",
        );
      });

      expect(screen.getByRole("link", { name: "Settings" })).not.toHaveClass(
        "active",
      );
    });

    it("per-user sidebar Settings link becomes active on /users/:id/settings", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users/1/settings");

      renderApp();

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Settings" })).toHaveClass(
          "active",
        );
      });

      expect(screen.getByRole("link", { name: "Profile" })).not.toHaveClass(
        "active",
      );
    });
  });

  describe("Breadcrumbs", () => {
    it("shows breadcrumb trail on users", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users");

      renderApp();

      const breadcrumb = screen.getByLabelText("breadcrumb");

      await waitFor(() => {
        expect(breadcrumb).toHaveTextContent("Home");
      });

      expect(breadcrumb).toHaveTextContent("Users");
    });

    it("shows user ID in breadcrumb on users.profile", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users");

      renderApp();

      await testRouter.navigate("users.profile", { id: "2" });

      await waitFor(() => {
        expect(screen.getByLabelText("breadcrumb")).toHaveTextContent(
          "User #2",
        );
      });
    });

    it("shows User #id > Settings on /users/:id/settings", async () => {
      testRouter = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await testRouter.start("/users/3/settings");

      renderApp();

      const breadcrumb = await screen.findByLabelText("breadcrumb");

      await waitFor(() => {
        expect(breadcrumb).toHaveTextContent("User #3");
      });

      expect(breadcrumb).toHaveTextContent("Settings");
    });
  });
});
