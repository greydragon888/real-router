import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/react";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect } from "vitest";

import { App } from "../src/App";
import { cartState } from "../src/cart-state";
import { editorState } from "../src/editor-state";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  cleanup();
  testRouter.stop();
  vi.useRealTimers();
});

function renderApp() {
  return render(
    <RouterProvider router={testRouter}>
      <App />
    </RouterProvider>,
  );
}

describe("ProgressBar during async guard", () => {
  it("shows progress bar while checkout guard is pending, hides after", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    renderApp();

    expect(document.querySelector(".progress-bar")).not.toBeInTheDocument();

    cartState.hasItems = true;
    vi.useFakeTimers();

    await act(async () => {
      void testRouter.navigate("checkout");
    });

    expect(document.querySelector(".progress-bar")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(document.querySelector(".progress-bar")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Checkout" }),
    ).toBeInTheDocument();
  });
});

describe("Checkout guard rejection in UI", () => {
  it("stays on home when cart is empty", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    renderApp();

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();

    cartState.hasItems = false;
    vi.useFakeTimers();

    await act(async () => {
      const nav = testRouter.navigate("checkout");

      await vi.advanceTimersByTimeAsync(500);
      await nav.catch(() => {});
    });

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Checkout" }),
    ).not.toBeInTheDocument();
  });
});

describe("Editor canDeactivate UX", () => {
  it("blocks leaving with unsaved changes when confirm=false", async () => {
    const user = userEvent.setup();

    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/editor");

    renderApp();

    expect(screen.getByRole("heading", { name: "Editor" })).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Type here to create unsaved changes..."),
      "hello",
    );

    vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    await act(async () => {
      await testRouter.navigate("home").catch(() => {});
    });

    expect(screen.getByRole("heading", { name: "Editor" })).toBeInTheDocument();
    expect(testRouter.getState()?.name).toBe("editor");
  });
});
