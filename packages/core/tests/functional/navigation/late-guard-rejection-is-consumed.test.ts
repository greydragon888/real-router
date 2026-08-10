import { describe, it, expect, afterEach } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * A guard that settles AFTER the navigation is over must not surface as an
 * unhandled rejection.
 *
 * `finishAsyncNavigation` races the guard against the controller's abort
 * (#1018), and `Promise.race` subscribes to both — so on most arcs a late
 * rejection already has a handler. Not on this one: when the caller's signal is
 * already aborted at entry, the pre-check throws BEFORE the race is built, and
 * nothing is subscribed to `guardCompletion` at all. The bare
 * `guardCompletion.catch()` above the try is what covers that gap.
 *
 * ⚠ **Reaching it takes a guard that aborts the signal itself**, before
 * returning its promise: the abort lands while the pipeline is still
 * synchronous, so by the time `finishAsyncNavigation` is entered the signal is
 * dead and the pre-check fires. Measured — with the `catch` removed this exact
 * arc kills the process under `--unhandled-rejections=strict` (the Node 22+
 * default), which is why the assertion below is about the REJECTION EVENT and
 * not about the navigation's outcome: that outcome is `TRANSITION_CANCELLED`
 * either way.
 */

describe("a guard that rejects after the navigation ended (#1018)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  it("is consumed, not left to surface as an unhandled rejection", async () => {
    router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    const controller = new AbortController();
    let rejectGuard!: (error: unknown) => void;

    getLifecycleApi(router).addActivateGuard("b", () => () => {
      // Aborts BEFORE handing back the promise, so the pre-check in
      // `finishAsyncNavigation` throws before the race exists.
      controller.abort(new Error("aborted from inside the guard"));

      return new Promise<boolean>((_, reject) => {
        rejectGuard = reject;
      });
    });

    await router.start("/a");

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };

    process.on("unhandledRejection", onUnhandled);

    try {
      const code = await router
        .navigate("b", {}, undefined, { signal: controller.signal })
        .then(
          () => undefined,
          (error: unknown) => (error as { code?: string }).code,
        );

      expect(code).toBe(errorCodes.TRANSITION_CANCELLED);

      // The guard settles only now — after the navigation is over and after the
      // only subscriber it could have had was never created.
      rejectGuard(new Error("late guard rejection"));

      // Two macrotask turns: Node reports an unhandled rejection at the end of
      // the turn in which the promise settled without a handler.
      await new Promise((resolve) => setTimeout(resolve, 20));

      // THE assertion.
      expect(unhandled).toStrictEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
