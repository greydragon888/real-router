import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { renderWithRouter } from "../helpers";
import ErrorBoundaryBasicTest from "../helpers/ErrorBoundaryBasicTest.svelte";
import ErrorBoundaryNestedTest from "../helpers/ErrorBoundaryNestedTest.svelte";
import ErrorBoundaryWithDismiss from "../helpers/ErrorBoundaryWithDismiss.svelte";
import ErrorBoundaryWithOnError from "../helpers/ErrorBoundaryWithOnError.svelte";
import ErrorCapture from "../helpers/ErrorCapture.svelte";

import type { Router, RouterError, State } from "@real-router/core";
import type { RouterErrorSnapshot } from "@real-router/sources";

interface ErrorState {
  readonly current: RouterErrorSnapshot;
}

describe("RouterErrorBoundary", () => {
  let router: Router;

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

  describe("useRouterError", () => {
    it("error === null initially", () => {
      let result!: ErrorState;

      renderWithRouter(router, ErrorCapture, {
        onCapture: (r: unknown) => {
          result = r as ErrorState;
        },
      });

      expect(result.current.error).toBeNull();
      expect(result.current.version).toBe(0);
    });

    it("error is set on TRANSITION_ERROR", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      let result!: ErrorState;

      renderWithRouter(router, ErrorCapture, {
        onCapture: (r: unknown) => {
          result = r as ErrorState;
        },
      });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      const err = result.current.error;

      expect(err).not.toBeNull();
      expect(err!.code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(result.current.version).toBe(1);
    });

    it("error cleared on TRANSITION_SUCCESS", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      let result!: ErrorState;

      renderWithRouter(router, ErrorCapture, {
        onCapture: (r: unknown) => {
          result = r as ErrorState;
        },
      });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(result.current.error).not.toBeNull();

      await router.navigate("settings");
      flushSync();

      expect(result.current.error).toBeNull();
    });

    it("SSR: returns initial snapshot", () => {
      const freshRouter = createRouter([{ name: "home", path: "/" }]);
      let result: any;

      renderWithRouter(freshRouter, ErrorCapture, {
        onCapture: (r: unknown) => {
          result = r;
        },
      });

      expect(result.current.error).toBeNull();
      expect(result.current.toRoute).toBeNull();
      expect(result.current.fromRoute).toBeNull();
      expect(result.current.version).toBe(0);
    });
  });

  describe("rendering", () => {
    it("renders children without error", () => {
      render(ErrorBoundaryBasicTest, { props: { router } });

      expect(screen.getByTestId("children")).toHaveTextContent("App Content");
      expect(screen.queryByTestId("fallback")).toBeNull();
    });

    it("shows fallback alongside children on error", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      render(ErrorBoundaryBasicTest, { props: { router } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(screen.getByTestId("children")).toHaveTextContent("App Content");
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    it("fallback receives correct RouterError", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      render(ErrorBoundaryBasicTest, { props: { router } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toHaveTextContent(
        errorCodes.CANNOT_ACTIVATE,
      );
    });

    it("auto-resets on successful navigation", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      render(ErrorBoundaryBasicTest, { props: { router } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toBeInTheDocument();

      await router.navigate("settings");
      flushSync();

      expect(screen.queryByTestId("fallback")).toBeNull();
      expect(screen.getByTestId("children")).toHaveTextContent("App Content");
    });
  });

  describe("resetError", () => {
    it("hides fallback manually", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      render(ErrorBoundaryWithDismiss, { props: { router } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("dismiss"));
      flushSync();

      expect(screen.queryByTestId("fallback")).toBeNull();
      expect(screen.getByTestId("children")).toHaveTextContent("App Content");
    });

    it("does not hide next error", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);
      lifecycle.addActivateGuard("settings", () => () => false);

      render(ErrorBoundaryWithDismiss, { props: { router } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("dismiss"));
      flushSync();

      expect(screen.queryByTestId("fallback")).toBeNull();

      await router.navigate("settings").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    it("handles same cached error after dismiss", async () => {
      render(ErrorBoundaryWithDismiss, { props: { router } });

      await router.navigate("home").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toHaveTextContent(
        errorCodes.SAME_STATES,
      );

      await userEvent.click(screen.getByTestId("dismiss"));
      flushSync();

      expect(screen.queryByTestId("fallback")).toBeNull();

      await router.navigate("home").catch(() => {});
      flushSync();

      expect(screen.getByTestId("fallback")).toHaveTextContent(
        errorCodes.SAME_STATES,
      );
    });
  });

  describe("onError callback", () => {
    it("called on error", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      const onError = vi.fn();

      render(ErrorBoundaryWithOnError, { props: { router, onError } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(onError).toHaveBeenCalledTimes(1);

      const [error, toRoute, fromRoute] = onError.mock.calls[0] as [
        RouterError,
        State | null,
        State | null,
      ];

      expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(toRoute).not.toBeNull();
      expect(fromRoute).not.toBeNull();
    });

    it("not called without error", () => {
      const onError = vi.fn();

      render(ErrorBoundaryWithOnError, { props: { router, onError } });

      expect(onError).not.toHaveBeenCalled();
    });

    // Documents the contract: a throwing onError must NOT bubble out and break
    // the boundary or surrounding reactivity. The error from onError is logged
    // and the fallback still renders.
    it("does not propagate when onError throws — fallback still shown and console.error invoked", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      const onError = vi.fn(() => {
        throw new Error("kaboom in onError");
      });

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(ErrorBoundaryWithOnError, { props: { router, onError } });
      }).not.toThrow();

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("fallback")).toHaveTextContent(
        errorCodes.CANNOT_ACTIVATE,
      );
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("RouterErrorBoundary onError handler threw"),
        expect.objectContaining({
          message: "kaboom in onError",
        }),
      );

      consoleError.mockRestore();
    });
  });

  describe("unmount cleanup", () => {
    it("unsubscribes on unmount", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      const onError = vi.fn();

      const { unmount } = render(ErrorBoundaryWithOnError, {
        props: { router, onError },
      });

      unmount();

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe("nested boundaries", () => {
    it("both show error", async () => {
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("dashboard", () => () => false);

      render(ErrorBoundaryNestedTest, { props: { router } });

      await router.navigate("dashboard").catch(() => {});
      flushSync();

      expect(screen.getByTestId("outer-fallback")).toHaveTextContent(
        errorCodes.CANNOT_ACTIVATE,
      );
      expect(screen.getByTestId("inner-fallback")).toHaveTextContent(
        errorCodes.CANNOT_ACTIVATE,
      );
    });
  });
});
