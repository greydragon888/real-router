import { render, screen, waitFor } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/vue";
import { defineComponent, h } from "vue";

import App from "../src/App.vue";
import { routes } from "../src/routes";
import { cartState } from "../src/cart-state";
import { editorState } from "../src/editor-state";

import type { Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  testRouter?.stop();
  vi.useRealTimers();
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

    void testRouter.navigate("checkout");

    await waitFor(() => {
      expect(document.querySelector(".progress-bar")).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      expect(document.querySelector(".progress-bar")).not.toBeInTheDocument();
    });

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

    const nav = testRouter.navigate("checkout");
    await vi.advanceTimersByTimeAsync(500);
    await nav.catch(() => {});

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    });

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

    await testRouter.navigate("home").catch(() => {});

    expect(screen.getByRole("heading", { name: "Editor" })).toBeInTheDocument();
    expect(testRouter.getState()?.name).toBe("editor");
  });
});
