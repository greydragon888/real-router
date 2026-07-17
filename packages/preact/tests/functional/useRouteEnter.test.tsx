import { act, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider, useRouteEnter } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type {
  RouteEnterHandler,
  UseRouteEnterOptions,
} from "@real-router/preact";
import type { JSX } from "preact";

function Probe({
  handler,
  options,
}: Readonly<{
  handler: RouteEnterHandler;
  options?: UseRouteEnterOptions;
}>): JSX.Element {
  useRouteEnter(handler, options);

  return <div data-testid="probe" />;
}

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

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire on a mount AFTER a navigation — previousRoute is undefined although transition.from is truthy (#1218)", async () => {
    const handler = vi.fn();

    await act(async () => {
      await router.navigate("about"); // transition.from = "test" (truthy)
    });

    // The Provider (and the source) mount AFTER the navigation, so the source's
    // initial snapshot carries previousRoute: undefined. The mount-firing effect
    // reaches the gate with transition.from truthy but previousRoute undefined →
    // the shared gate's !previousRoute guard skips (skipSameRoute: false rules
    // out the same-route arm as the cause). #1435 delegates this to sources.
    render(
      <RouterProvider router={router}>
        <Probe handler={handler} options={{ skipSameRoute: false }} />
      </RouterProvider>,
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires once after a navigation when component is already mounted", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("about");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("fires again on each subsequent navigation", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });
    await act(async () => {
      await router.navigate("home");
    });
    await act(async () => {
      await router.navigate("users.list");
    });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0].route.name).toBe("about");
    expect(handler.mock.calls[1][0].route.name).toBe("home");
    expect(handler.mock.calls[2][0].route.name).toBe("users.list");
  });

  it("uses the latest handler reference without resubscribing", async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const { rerender } = render(
      <RouterProvider router={router}>
        <Probe handler={handlerA} />
      </RouterProvider>,
    );

    rerender(
      <RouterProvider router={router}>
        <Probe handler={handlerB} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it("provides previousRoute and route at mount time", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("users.view", { id: "42" });
    });

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("users.view");
    expect(ctx.route.params.id).toBe("42");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("users.view", { id: "1" });
    });

    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    await act(async () => {
      await router.navigate("users.view", { id: "1", q: "x" });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} options={{ skipSameRoute: false }} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("users.view", { id: "1" });
    });
    handler.mockClear();

    await act(async () => {
      await router.navigate("users.view", { id: "1", q: "x" });
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire on unmount", async () => {
    const handler = vi.fn();

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    unmount();

    await act(async () => {
      await router.navigate("about");
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
