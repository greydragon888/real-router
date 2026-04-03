import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/vue";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import App from "../src/App.vue";
import { baseRoutes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

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

describe("Feature flag toggle — analytics", () => {
  it("toggling analytics on adds link and page, off removes them", async () => {
    const user = userEvent.setup();

    testRouter = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    renderApp();

    expect(
      screen.queryByRole("link", { name: "Analytics" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Analytics"));

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Analytics" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("link", { name: "Analytics" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Analytics" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Analytics"));

    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: "Analytics" }),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
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

    renderApp();

    expect(
      screen.queryByRole("link", { name: "Admin" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Admin Panel"));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Users" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Admin \u2014 Users" }),
      ).toBeInTheDocument();
    });
  });
});
