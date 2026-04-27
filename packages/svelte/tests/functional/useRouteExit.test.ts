// Svelte useRouteExit tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteExit.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Svelte composables run **once** at component init; the handler is
//     captured in closure at the call site and there is no re-render-driven
//     swap. Reactivity in Svelte happens through `$state` / `$derived`
//     consumed inside the handler body — not by replacing the handler ref.
//   - StrictMode test is React-only — Svelte has no equivalent.
//
// All other tests mirror the React suite 1:1.

import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouteExitTest from "../helpers/RouteExitTest.svelte";

import type { Router } from "@real-router/core";

describe("useRouteExit", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("invokes the handler on cross-route navigation", async () => {
    const handler = vi.fn();

    render(RouteExitTest, { props: { router, handler } });

    await router.navigate("about");
    flushSync();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("test");
    expect(ctx.nextRoute.name).toBe("about");
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    render(RouteExitTest, { props: { router, handler } });

    await router.navigate("users.view", { id: "1" });
    flushSync();
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    flushSync();

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    render(RouteExitTest, {
      props: { router, handler, options: { skipSameRoute: false } },
    });

    await router.navigate("users.view", { id: "1" });
    flushSync();
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    flushSync();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("blocks navigation until the returned Promise resolves", async () => {
    let resolveExit!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const handler = vi.fn(() => exitPromise);

    render(RouteExitTest, { props: { router, handler } });

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

  it("unsubscribes on unmount", async () => {
    const handler = vi.fn();

    const result = render(RouteExitTest, { props: { router, handler } });

    result.unmount();

    await router.navigate("about");
    flushSync();

    expect(handler).not.toHaveBeenCalled();
  });

  it("provides AbortSignal context to the handler", async () => {
    let receivedSignal: AbortSignal | undefined;
    const handler = vi.fn(({ signal }) => {
      receivedSignal = signal;
    });

    render(RouteExitTest, { props: { router, handler } });

    await router.navigate("about");
    flushSync();

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

    render(RouteExitTest, { props: { router: fakeRouter, handler } });

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
