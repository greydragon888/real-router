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

  it("NEVER_PROMISE is a shared sentinel — distinct missing keys return SAME ref (audit-2026-05-17 §6 P3 #3.9)", () => {
    // The module-top `NEVER_PROMISE` is allocated ONCE per module load.
    // Two `useDeferred("missing-A")` and `useDeferred("missing-B")` calls
    // must return the same promise reference — a regression that
    // allocated a fresh forever-pending promise per call (e.g.
    // `?? new Promise<never>(() => {})`) would balloon memory under
    // mass-mount and prevent `<Suspense>` from coalescing identical
    // pending states.
    let firstRef: Promise<unknown> | undefined;
    let secondRef: Promise<unknown> | undefined;

    renderInRouter(router, () => {
      firstRef = useDeferred("missing-A")();
      secondRef = useDeferred("missing-B")();

      return <span>x</span>;
    });

    expect(firstRef).toBeDefined();
    expect(secondRef).toBeDefined();
    expect(firstRef).toBe(secondRef);
  });

  it("found-key passthrough — no wrap, no double-Promise (audit-2026-05-17 §6 P3 #3.9)", () => {
    // When the key exists in `ssrDataDeferred`, useDeferred returns the
    // exact promise reference stored in state.context — not a wrapping
    // promise. Pin-test the verbatim passthrough so a defensive
    // `Promise.resolve(deferred[key])` refactor doesn't slip in
    // (that would double-wrap and break `<Await>` reference identity
    // expectations).
    const trackedPromise = Promise.resolve("payload");
    const state = router.getState()!;
    const mutated = {
      ...state,
      context: {
        ...state.context,
        ssrDataDeferred: { found: trackedPromise },
      },
    };

    Object.defineProperty(router, "getState", {
      value: () => mutated,
      configurable: true,
    });

    let captured: Promise<unknown> | undefined;

    renderInRouter(router, () => {
      captured = useDeferred("found")();

      return <span>x</span>;
    });

    // Strict ref equality — the helper does NOT wrap the input.
    expect(captured).toBe(trackedPromise);
  });
});
