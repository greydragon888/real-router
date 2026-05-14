import { render } from "@testing-library/svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouter,
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouterCapture from "../helpers/RouterCapture.svelte";
import UseRouterInEffect from "../helpers/UseRouterInEffect.svelte";
import UseRouterInTimeout from "../helpers/UseRouterInTimeout.svelte";

import type { Router } from "@real-router/core";

describe("useRouter composable", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return router", () => {
    let result: unknown;

    renderWithRouter(router, RouterCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result).toStrictEqual(router);
  });

  it("should return stable reference across navigations", async () => {
    const routerWithRoutes = createTestRouterWithADefaultRouter();

    await routerWithRoutes.start("/");

    let result: unknown;

    renderWithRouter(routerWithRoutes, RouterCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const firstRef = result;

    await routerWithRoutes.navigate("about");

    expect(result).toBe(firstRef);

    routerWithRoutes.stop();
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => {
      render(RouterCapture, {
        props: {
          onCapture: () => {},
        },
      });
    }).toThrow("useRouter must be used within a RouterProvider");
  });

  // Locks Svelte 5 component-context inheritance: `$effect` callbacks run
  // within the same context active at init, so `getContext` still resolves
  // the RouterProvider when called inside an effect. Activates the previously
  // unused `UseRouterInEffect.svelte` helper (CLAUDE.md gotcha #2 audit).
  it("should resolve router when called inside $effect (Svelte 5 context inheritance)", async () => {
    let capturedRouter: unknown = "not-called";
    let capturedError: unknown = "not-called";

    renderWithRouter(router, UseRouterInEffect, {
      onCapture: (r: unknown, err: unknown) => {
        capturedRouter = r;
        capturedError = err;
      },
    });

    // $effect runs after mount — give the scheduler one tick.
    await Promise.resolve();

    expect(capturedError).toBeNull();
    expect(capturedRouter).toBe(router);
  });

  // Locks the actual misuse contract documented in CLAUDE.md "getContext Must
  // Be Called During Component Init": composables called from async callbacks
  // (setTimeout, fetch, requestAnimationFrame) run outside any reactive
  // context and outside the component's `current_component_context`. Svelte 5
  // raises `lifecycle_outside_component` — `getContext` cannot be called.
  // This is the user-visible signal that you forgot to call the composable
  // during init.
  it("should throw 'lifecycle_outside_component' when called from setTimeout (outside component context)", async () => {
    let capturedError: unknown = "not-called";

    renderWithRouter(router, UseRouterInTimeout, {
      onCapture: (_r: unknown, err: unknown) => {
        capturedError = err;
      },
    });

    // setTimeout(..., 0) fires after the current microtask queue drains.
    // Poll until the helper invokes its callback to avoid flake on slower CI.
    await new Promise((resolve) => setTimeout(resolve, 16));

    expect(capturedError).toBeInstanceOf(Error);
    // Svelte 5 emits a structured `lifecycle_outside_component` code with a
    // human-readable message about `getContext`. Match the code rather than
    // the full message — the message text has changed between Svelte minor
    // versions, but the code is stable.
    expect((capturedError as Error).message).toMatch(
      /lifecycle_outside_component|getContext/,
    );
  });
});
