import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { useState } from "preact/hooks";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { Link } from "../../src/components/Link";
import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router, RouterError } from "@real-router/core";
import type { ComponentChildren, VNode } from "preact";

describe("RouterErrorBoundary", () => {
  let router: Router;

  const wrapper = ({ children }: { children: ComponentChildren }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("renders children without error", () => {
    render(
      <RouterErrorBoundary
        fallback={(error) => <div data-testid="fallback">{error.code}</div>}
      >
        <div data-testid="children">App Content</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("shows fallback alongside children on error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error) => <div data-testid="fallback">{error.code}</div>}
      >
        <div data-testid="children">App Content</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });

  it("fallback receives correct RouterError", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error) => <div data-testid="fallback">{error.code}</div>}
      >
        <div>App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(screen.getByTestId("fallback").textContent).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
  });

  it("auto-resets on successful navigation", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error) => <div data-testid="fallback">{error.code}</div>}
      >
        <div data-testid="children">App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("settings");
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  it("resetError() hides fallback manually", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error, resetError) => (
          <div data-testid="fallback">
            {error.code}
            <button data-testid="dismiss" onClick={resetError}>
              Dismiss
            </button>
          </div>
        )}
      >
        <div data-testid="children">App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("dismiss"));

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  it("resetError() does not hide next error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error, resetError) => (
          <div data-testid="fallback">
            {error.code}
            <button data-testid="dismiss" onClick={resetError}>
              Dismiss
            </button>
          </div>
        )}
      >
        <div>App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("dismiss"));

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate("settings").catch(() => {});
    });

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });

  it("onError called on error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const onError = vi.fn();

    render(
      <RouterErrorBoundary
        fallback={(error) => <div data-testid="fallback">{error.code}</div>}
        onError={onError}
      >
        <div>App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(onError).toHaveBeenCalledTimes(1);

    const [error, toRoute, fromRoute] = onError.mock.calls[0] as [
      RouterError,
      unknown,
      unknown,
    ];

    expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(toRoute).not.toBeNull();
    expect(fromRoute).not.toBeNull();
  });

  it("onError not called on re-render", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const onError = vi.fn();

    function TestWrapper(): VNode {
      const [, setCount] = useState(0);

      return (
        <RouterErrorBoundary
          fallback={(error) => <div data-testid="fallback">{error.code}</div>}
          onError={onError}
        >
          <button
            data-testid="rerender"
            onClick={() => {
              setCount((c) => c + 1);
            }}
          >
            Re-render
          </button>
        </RouterErrorBoundary>
      );
    }

    render(<TestWrapper />, { wrapper });

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(onError).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("rerender"));

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("works with Link", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error) => <div data-testid="fallback">{error.code}</div>}
      >
        <Link routeName="dashboard" data-testid="link">
          Go to Dashboard
        </Link>
      </RouterErrorBoundary>,
      { wrapper },
    );

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("link"));

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("fallback").textContent).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
  });

  it("nested boundaries both show error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    render(
      <RouterErrorBoundary
        fallback={(error) => (
          <div data-testid="outer-fallback">{error.code}</div>
        )}
      >
        <RouterErrorBoundary
          fallback={(error) => (
            <div data-testid="inner-fallback">{error.code}</div>
          )}
        >
          <div data-testid="children">App</div>
        </RouterErrorBoundary>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(screen.getByTestId("outer-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("inner-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("outer-fallback").textContent).toBe(
      screen.getByTestId("inner-fallback").textContent,
    );
  });

  it("resetError then same cached error", async () => {
    render(
      <RouterErrorBoundary
        fallback={(error, resetError) => (
          <div data-testid="fallback">
            {error.code}
            <button data-testid="dismiss" onClick={resetError}>
              Dismiss
            </button>
          </div>
        )}
      >
        <div data-testid="children">App</div>
      </RouterErrorBoundary>,
      { wrapper },
    );

    await act(async () => {
      await router.navigate("home").catch(() => {});
    });

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("fallback").textContent).toContain(
      errorCodes.SAME_STATES,
    );

    fireEvent.click(screen.getByTestId("dismiss"));

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate("home").catch(() => {});
    });

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("fallback").textContent).toContain(
      errorCodes.SAME_STATES,
    );
  });
});
