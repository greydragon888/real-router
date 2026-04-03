import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/vue";
import { render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { errorStore } from "../src/error-store";
import ErrorPanel from "../src/pages/ErrorPanel.vue";
import { routes } from "../src/routes";

import type { PluginFactory, Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  testRouter.stop();
  vi.useRealTimers();
});

function renderErrorPanel() {
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(
          RouterProvider,
          { router: testRouter },
          { default: () => h(ErrorPanel) },
        );
    },
  });

  return render(Wrapper);
}

describe("ErrorPanel — plugin log in UI", () => {
  it("shows 'no errors yet' initially", async () => {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start("/");

    renderErrorPanel();

    expect(screen.getByText(/no errors yet/i)).toBeInTheDocument();
  });

  it("displays CANNOT_ACTIVATE after guard rejection", async () => {
    const errorLoggerPlugin: PluginFactory = () => ({
      onTransitionError(_toState, _fromState, err) {
        errorStore.add(err);
      },
    });

    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    testRouter.usePlugin(errorLoggerPlugin);
    await testRouter.start("/");

    renderErrorPanel();

    await testRouter.navigate("protected").catch(() => {});

    await waitFor(() => {
      expect(screen.getByText("CANNOT_ACTIVATE")).toBeInTheDocument();
    });
  });

  it("displays TRANSITION_CANCELLED after competing navigation", async () => {
    const errorLoggerPlugin: PluginFactory = () => ({
      onTransitionCancel(toState, fromState) {
        errorStore.addCancel(toState, fromState);
      },
    });

    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    testRouter.usePlugin(errorLoggerPlugin);
    await testRouter.start("/");

    renderErrorPanel();

    vi.useFakeTimers();

    const firstNav = testRouter.navigate("slow");

    testRouter.navigate("about").catch(() => {});
    await vi.advanceTimersByTimeAsync(5000);
    await firstNav.catch(() => {});

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("TRANSITION_CANCELLED")).toBeInTheDocument();
    });
  });
});
