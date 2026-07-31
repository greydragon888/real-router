import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * #1612 — `clear()` is only legal while the router holds no committed state.
 *
 * `clear()` used to drop the committed state to `undefined` and tell nobody:
 * every `router.subscribe` consumer (`@real-router/sources` and all six
 * adapters) kept rendering a route the router had already discarded, and the
 * router was left in `isActive() === true` with `getState() === undefined` —
 * a shape that otherwise exists only *during* `start()`, transiently. An
 * always-on guard already misreads it: path-less `navigateToNotFound()` throws
 * `ROUTER_NOT_STARTED` on a started router (#1172's window made permanent).
 *
 * The fix is not to announce the reset but to stop performing it: `clear()` is
 * a teardown primitive — the wiki has always documented it as "reset to initial
 * state" / "testing", and steered route SWAPS to `replace()`, which is atomic,
 * notifies subscribers and preserves external guards. So `clear()` now refuses
 * when there is a state to discard, and `replace(routes)` is the spelling for a
 * running router (design note `fsm-as-state-owner-2026-07-31.md` §11.A1,
 * option (в), owner decision 2026-08-01).
 */

function makeRouter(): Router {
  return createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
}

describe("#1612 — clear() requires a router with no committed state", () => {
  it("throws when a state is committed", async () => {
    const router = makeRouter();

    await router.start("/");

    expect(() => {
      getRoutesApi(router).clear();
    }).toThrow(
      expect.objectContaining({ code: errorCodes.ROUTER_NOT_STOPPED }),
    );
  });

  it("names the replacement in the message, so the migration is in the error", async () => {
    const router = makeRouter();

    await router.start("/");

    const message = (() => {
      try {
        getRoutesApi(router).clear();

        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(message).toContain("replace");
  });

  it("leaves the tree and the state untouched when it refuses", async () => {
    const router = makeRouter();

    await router.start("/");

    expect(() => {
      getRoutesApi(router).clear();
    }).toThrow();

    // The refusal is a no-op, not a partial teardown.
    expect(getPluginApi(router).matchPath("/a")?.name).toBe("a");
    expect(router.getState()?.name).toBe("home");
    expect(router.isActive()).toBe(true);
  });

  it("still clears a router that was never started", () => {
    const router = makeRouter();

    getRoutesApi(router).clear();

    expect(getPluginApi(router).matchPath("/")).toBeUndefined();
    expect(router.getState()).toBeUndefined();
  });

  it("still clears a stopped router", async () => {
    const router = makeRouter();

    await router.start("/");
    router.stop();

    getRoutesApi(router).clear();

    expect(getPluginApi(router).matchPath("/")).toBeUndefined();
    expect(router.getState()).toBeUndefined();
  });

  it("clears external guards on a stopped router, as it always did", async () => {
    const router = makeRouter();
    let ran = false;

    getLifecycleApi(router).addActivateGuard("a", () => () => {
      ran = true;

      return true;
    });

    await router.start("/");
    router.stop();

    getRoutesApi(router).clear();
    getRoutesApi(router).add([{ name: "a", path: "/a" }]);

    await router.start("/");
    await router.navigate("a");

    // `clear()` wipes EXTERNAL guards too — that is what separates it from
    // `replace()`, which preserves them. The teardown semantics are unchanged;
    // only the precondition is new.
    expect(ran).toBe(false);
  });
});
