import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { renderWithRouter } from "../helpers";
import TransitionCapture from "../helpers/TransitionCapture.svelte";

import type { Router } from "@real-router/core";

describe("useRouterTransition", () => {
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

  it("isTransitioning === false initially", () => {
    let result: any;

    renderWithRouter(router, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result.current.isTransitioning).toBe(false);
  });

  it("isTransitioning === true upon TRANSITION_START", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    let result: any;

    renderWithRouter(router, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    void router.navigate("dashboard");
    await Promise.resolve();
    flushSync();

    expect(result.current.isTransitioning).toBe(true);

    resolveGuard(true);
    await Promise.resolve();
    flushSync();
  });

  it("isTransitioning === false upon TRANSITION_SUCCESS", async () => {
    let result: any;

    renderWithRouter(router, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    await router.navigate("dashboard");
    flushSync();

    expect(result.current.isTransitioning).toBe(false);
  });

  it("isTransitioning === false upon TRANSITION_ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    let result: any;

    renderWithRouter(router, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    await router.navigate("dashboard").catch(() => {});
    flushSync();

    expect(result.current.isTransitioning).toBe(false);
  });

  it("toRoute and fromRoute === null when no transition", () => {
    let result: any;

    renderWithRouter(router, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result.current.toRoute).toBeNull();
    expect(result.current.fromRoute).toBeNull();
  });

  it("should set isLeaveApproved to true after deactivation guards pass", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    let result: any;

    renderWithRouter(router, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result.current.isLeaveApproved).toBe(false);

    const navPromise = router.navigate("dashboard");

    await Promise.resolve();
    flushSync();

    expect(result.current.isTransitioning).toBe(true);
    expect(result.current.isLeaveApproved).toBe(true);

    resolveGuard(true);
    await navPromise;
    flushSync();

    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.isLeaveApproved).toBe(false);
  });

  it("SSR: always returns IDLE_SNAPSHOT", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    let result: any;

    renderWithRouter(freshRouter, TransitionCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.toRoute).toBeNull();
    expect(result.current.fromRoute).toBeNull();
  });
});
