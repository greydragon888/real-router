// Angular injectRouteExit tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteExit.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Angular `inject*` functions run **once** during component
//     construction; the handler is captured in closure at the call site
//     and there is no re-render-driven swap. The common Angular pattern
//     is to pass a class method whose identity is stable.
//   - StrictMode test is React-only — Angular has no equivalent.
//
// All other tests mirror the React suite 1:1, but driven via TestBed
// `runInInjectionContext` instead of `render(<RouterProvider>...)`.

import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { injectRouteExit } from "../../src/functions/injectRouteExit";
import { provideRealRouter } from "../../src/providers";

import type {
  RouteExitHandler,
  UseRouteExitOptions,
} from "../../src/functions/injectRouteExit";
import type { Router } from "@real-router/core";

const routes = [
  { name: "test", path: "/" },
  { name: "home", path: "/home" },
  { name: "about", path: "/about" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/list" },
      { name: "view", path: "/:id" },
    ],
  },
];

describe("injectRouteExit", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes, {
      defaultRoute: "test",
      trailingSlash: "never",
      queryParamsMode: "loose",
    });
    await router.start("/");

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
  });

  afterEach(() => {
    router.stop();
  });

  function setup(handler: RouteExitHandler, options?: UseRouteExitOptions) {
    const injector = TestBed.inject(Injector);

    runInInjectionContext(injector, () => {
      injectRouteExit(handler, options);
    });
  }

  it("invokes the handler on cross-route navigation", async () => {
    const handler = vi.fn();

    setup(handler);

    await router.navigate("about");

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("test");
    expect(ctx.nextRoute.name).toBe("about");
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    setup(handler);

    await router.navigate("users.view", { id: "1" });
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    setup(handler, { skipSameRoute: false });

    await router.navigate("users.view", { id: "1" });
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("blocks navigation until the returned Promise resolves", async () => {
    let resolveExit!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const handler = vi.fn(() => exitPromise);

    setup(handler);

    let navigated = false;
    const navigation = router.navigate("about").then(() => {
      navigated = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(navigated).toBe(false);

    resolveExit();
    await navigation;

    expect(navigated).toBe(true);
  });

  it("unsubscribes when the injection context is destroyed", async () => {
    const handler = vi.fn();

    @Component({ template: "" })
    class HostComponent {
      readonly attached = (() => {
        injectRouteExit(handler);

        return true;
      })();
    }

    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
      imports: [HostComponent],
    });
    const fixture = TestBed.createComponent(HostComponent);

    fixture.detectChanges();
    fixture.destroy();

    await router.navigate("about");

    expect(handler).not.toHaveBeenCalled();
  });

  it("provides AbortSignal context to the handler", async () => {
    let receivedSignal: AbortSignal | undefined;
    const handler = vi.fn(({ signal }) => {
      receivedSignal = signal;
    });

    setup(handler);

    await router.navigate("about");

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);
  });

  it("skips the handler when signal is already aborted (reentrant abort)", () => {
    // Stub the router with a controllable subscribeLeave so we can inject
    // a pre-aborted signal — exercises the early-return branch that's
    // hard to reproduce via real navigation timing.
    const handler = vi.fn();
    const leaveListeners: ((payload: {
      route: { name: string };
      nextRoute: { name: string };
      signal: AbortSignal;
    }) => void)[] = [];

    const fakeRouter = Object.create(router) as Router;

    Object.assign(fakeRouter, {
      subscribeLeave(
        listener: (payload: {
          route: { name: string };
          nextRoute: { name: string };
          signal: AbortSignal;
        }) => void,
      ) {
        leaveListeners.push(listener);

        return () => {
          const index = leaveListeners.indexOf(listener);

          if (index !== -1) {
            leaveListeners.splice(index, 1);
          }
        };
      },
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRealRouter(fakeRouter)],
    });
    const fakeInjector = TestBed.inject(Injector);

    runInInjectionContext(fakeInjector, () => {
      injectRouteExit(handler);
    });

    const controller = new AbortController();

    controller.abort();

    for (const listener of leaveListeners) {
      listener({
        route: { name: "test" },
        nextRoute: { name: "about" },
        signal: controller.signal,
      });
    }

    expect(handler).not.toHaveBeenCalled();
  });
});
