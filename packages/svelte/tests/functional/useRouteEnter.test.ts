// Svelte useRouteEnter tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteEnter.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Svelte composables run **once** at component init; the handler is
//     captured in closure. Reactivity happens via `$state`/`$derived` read
//     inside the handler body, not by handler-ref swap.
//   - StrictMode test is React-only — Svelte has no equivalent.
//
// All other tests mirror the React suite 1:1.

import { render } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouteEnterHandlerSwapTest from "../helpers/RouteEnterHandlerSwapTest.svelte";
import RouteEnterTest from "../helpers/RouteEnterTest.svelte";

import type { Router } from "@real-router/core";

describe("useRouteEnter", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("does not fire on initial mount when there is no previousRoute", () => {
    const handler = vi.fn();

    render(RouteEnterTest, { props: { router, handler } });
    flushSync();

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire on a mount AFTER a navigation — previousRoute is undefined although transition.from is truthy (#1218)", async () => {
    const handler = vi.fn();

    await router.navigate("about"); // transition.from = "test" (truthy)

    // The Provider mounts AFTER the navigation, so the source's initial snapshot
    // carries previousRoute: undefined. The mount-firing $effect reaches the gate
    // with transition.from truthy but previousRoute undefined → the shared gate's
    // !previousRoute guard skips (skipSameRoute: false rules out the same-route
    // arm as the cause). #1435 delegates this to sources.
    render(RouteEnterTest, {
      props: { router, handler, options: { skipSameRoute: false } },
    });
    flushSync();

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires once after a navigation when component is already mounted", async () => {
    const handler = vi.fn();

    render(RouteEnterTest, { props: { router, handler } });

    await router.navigate("about");
    flushSync();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("about");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("fires again on each subsequent navigation", async () => {
    const handler = vi.fn();

    render(RouteEnterTest, { props: { router, handler } });

    await router.navigate("about");
    flushSync();
    await router.navigate("home");
    flushSync();
    await router.navigate("users.list");
    flushSync();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0].route.name).toBe("about");
    expect(handler.mock.calls[1][0].route.name).toBe("home");
    expect(handler.mock.calls[2][0].route.name).toBe("users.list");
  });

  it("provides previousRoute and route at mount time", async () => {
    const handler = vi.fn();

    render(RouteEnterTest, { props: { router, handler } });

    await router.navigate("users.view", { id: "42" });
    flushSync();

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("users.view");
    expect(ctx.route.params.id).toBe("42");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    render(RouteEnterTest, { props: { router, handler } });

    await router.navigate("users.view", { id: "1" });
    flushSync();

    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    flushSync();

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    render(RouteEnterTest, {
      props: { router, handler, options: { skipSameRoute: false } },
    });

    await router.navigate("users.view", { id: "1" });
    flushSync();
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });
    flushSync();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire on unmount", async () => {
    const handler = vi.fn();

    const result = render(RouteEnterTest, { props: { router, handler } });

    result.unmount();

    await router.navigate("about");
    flushSync();

    expect(handler).not.toHaveBeenCalled();
  });

  // Locks CLAUDE.md gotcha #1 / audit §4 #1: Svelte composables run once at
  // init, so `handler` is captured in closure at the call site. Swapping the
  // handler reference between renders has NO effect — the originally captured
  // handler keeps firing. Mirror of the useRouteExit handler-swap test.
  it("handler is captured at init — later handler-swap is ignored", async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    render(RouteEnterHandlerSwapTest, {
      props: { router, handlerA, handlerB },
    });

    const swapButton = document.querySelector("[data-testid='swap']")!;

    await userEvent.click(swapButton);
    flushSync();

    await router.navigate("about");
    flushSync();

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).not.toHaveBeenCalled();

    await router.navigate("test");
    flushSync();

    expect(handlerA).toHaveBeenCalledTimes(2);
    expect(handlerB).not.toHaveBeenCalled();
  });
});
