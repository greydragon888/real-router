/**
 * A write that throws leaves the staleness flag set (#1916).
 *
 * The reachable trigger is a loader that resolves and produces a value the
 * write refuses — a branded payload with no `deferred` bag (#1835). The throw
 * rejects the navigation, which then never commits, so the next navigation
 * refreshes again.
 */

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { invalidate, ssrDataPluginFactory } from "../../src";

const BRAND = Symbol.for("@real-router/ssr-data-plugin/defer");
const routes = [{ name: "users", path: "/users/:id" }];

describe("the staleness flag outlives a failed write (#1916)", () => {
  it("re-runs the loader on the next navigation after the write threw", async () => {
    let calls = 0;
    let poison = false;

    const router = createRouter(routes);

    // Only this route has a loader, so nothing else can consume the flag.
    router.usePlugin(
      ssrDataPluginFactory({
        users: () => async () => {
          calls += 1;

          return poison ? { [BRAND]: true } : "good";
        },
      }),
    );

    await router.start("/users/1");

    expect(calls).toBe(1);

    poison = true;
    invalidate(router, "data");

    await expect(router.navigate("users", { id: "2" })).rejects.toThrow(
      /must carry a `deferred` object/u,
    );

    const afterFailure = calls;

    poison = false;
    await router.navigate("users", { id: "3" });

    expect(calls).toBeGreaterThan(afterFailure);
    expect(router.getState()?.context.data).toBe("good");
  });

  it("CONTROL — a successful write still consumes the flag exactly once", async () => {
    let calls = 0;
    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        users: () => async () => {
          calls += 1;

          return "good";
        },
      }),
    );

    await router.start("/users/1");

    expect(calls).toBe(1);

    invalidate(router, "data");
    await router.navigate("users", { id: "2" });

    expect(calls).toBe(2);

    // No fresh `invalidate` — the flag was consumed by the write above, so this
    // navigation must not refresh. Without this the fix could make the flag
    // permanently sticky and the cell above would still pass.
    await router.navigate("users", { id: "3" });

    expect(calls).toBe(2);
  });
});
