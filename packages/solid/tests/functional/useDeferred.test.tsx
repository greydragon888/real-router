import { render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/solid";
import { useDeferred } from "@real-router/solid/ssr";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

function renderInRouter(router: Router, child: () => JSX.Element): void {
  render(() => <RouterProvider router={router}>{child()}</RouterProvider>);
}

describe("useDeferred", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("returns an accessor that reads the promise from state.context.ssrDataDeferred[key]", () => {
    const promise = Promise.resolve(["r1", "r2"]);
    const state = router.getState()!;
    const mutated = {
      ...state,
      context: { ...state.context, ssrDataDeferred: { reviews: promise } },
    };

    Object.defineProperty(router, "getState", {
      value: () => mutated,
      configurable: true,
    });

    let captured: Promise<unknown> | undefined;

    renderInRouter(router, () => {
      const accessor = useDeferred<string[]>("reviews");

      captured = accessor();

      return <span>x</span>;
    });

    expect(captured).toBe(promise);
  });

  it("returns a forever-pending promise when the key is missing", async () => {
    let captured: Promise<unknown> | undefined;

    renderInRouter(router, () => {
      const accessor = useDeferred<string[]>("missing");

      captured = accessor();

      return <span>x</span>;
    });

    expect(captured).toBeInstanceOf(Promise);

    const winner = await Promise.race([
      captured!.then(() => "settled"),
      Promise.resolve("microtask"),
    ]);

    expect(winner).toBe("microtask");
  });

  it("returns a forever-pending promise when ssrDataDeferred is undefined", async () => {
    let captured: Promise<unknown> | undefined;

    renderInRouter(router, () => {
      const accessor = useDeferred("reviews");

      captured = accessor();

      return <span>x</span>;
    });

    const winner = await Promise.race([
      captured!.then(() => "settled"),
      Promise.resolve("microtask"),
    ]);

    expect(winner).toBe("microtask");
  });
});
