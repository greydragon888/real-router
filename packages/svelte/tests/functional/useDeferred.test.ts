import { describe, expect, it } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  injectDeferred,
  renderWithRouter,
} from "../helpers";
import UseDeferredCapture from "../helpers/UseDeferredCapture.svelte";

import type { Router } from "@real-router/core";

describe("useDeferred", () => {
  it("returns the loader-published promise for the requested key", async () => {
    const router: Router = createTestRouterWithADefaultRouter();

    await router.start();

    const reviewsPromise = Promise.resolve(["r1", "r2"]);

    injectDeferred(router, { reviews: reviewsPromise });

    let captured: Promise<unknown> | undefined;

    renderWithRouter(router, UseDeferredCapture, {
      keyName: "reviews",
      onCapture: (promise: Promise<unknown>) => {
        captured = promise;
      },
    });

    expect(captured).toBe(reviewsPromise);
    await expect(captured).resolves.toStrictEqual(["r1", "r2"]);

    router.stop();
  });

  it("returns a forever-pending promise when the key is missing (no map)", async () => {
    const router: Router = createTestRouterWithADefaultRouter();

    await router.start();

    let captured: Promise<unknown> | undefined;

    renderWithRouter(router, UseDeferredCapture, {
      keyName: "missing",
      onCapture: (promise: Promise<unknown>) => {
        captured = promise;
      },
    });

    expect(captured).toBeInstanceOf(Promise);

    // Race against a 30ms timeout — the deferred promise should never settle.
    const sentinel = Symbol("pending");
    const racer = Promise.race([
      captured,
      new Promise((resolve) =>
        setTimeout(() => {
          resolve(sentinel);
        }, 30),
      ),
    ]);

    await expect(racer).resolves.toBe(sentinel);

    router.stop();
  });

  it("returns a forever-pending promise when the requested key is not in the map", async () => {
    const router: Router = createTestRouterWithADefaultRouter();

    await router.start();

    injectDeferred(router, { other: Promise.resolve("x") });

    let captured: Promise<unknown> | undefined;

    renderWithRouter(router, UseDeferredCapture, {
      keyName: "missing",
      onCapture: (promise: Promise<unknown>) => {
        captured = promise;
      },
    });

    const sentinel = Symbol("pending");
    const racer = Promise.race([
      captured,
      new Promise((resolve) =>
        setTimeout(() => {
          resolve(sentinel);
        }, 30),
      ),
    ]);

    await expect(racer).resolves.toBe(sentinel);

    router.stop();
  });

  it("propagates rejections downstream", async () => {
    const router: Router = createTestRouterWithADefaultRouter();

    await router.start();

    const failing = Promise.reject(new Error("boom"));

    // Suppress unhandled-rejection warning since we attach .then later.
    failing.catch(() => {
      /* defensive */
    });

    injectDeferred(router, { failing });

    let captured: Promise<unknown> | undefined;

    renderWithRouter(router, UseDeferredCapture, {
      keyName: "failing",
      onCapture: (promise: Promise<unknown>) => {
        captured = promise;
      },
    });

    await expect(captured).rejects.toThrow("boom");

    router.stop();
  });
});
