import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params } from "@real-router/core";

/**
 * Does `matchPath` run the interceptor chain — #525 Q1.
 *
 * It does: `RoutesNamespace.matchPath` calls `this.#deps.forwardState(...)`,
 * wired through `ctx.forwardState` (`wireNamespaces.ts`) and so through the
 * interceptable built in the Router constructor's `registerInternals` block.
 * The URL it hands back is printed locally, from the engine — and since #1938
 * that is what every door does, so the print carries no chain of its own
 * anywhere.
 *
 * ⚠ This file answers "does the chain run here", one door. WHICH door runs the
 * seam, and how many times, is `seam-coverage-authority-1938`'s table — do not
 * grow a second copy of it here.
 */
describe("matchPath: interceptor application audit (#525, Q1)", () => {
  it("applies forwardState interceptors (matchedState reflects intercepted forwardState output)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    void router.start("/");

    const api = getPluginApi(router);
    const calls: { name: string; params: Params }[] = [];
    const remove = api.addInterceptor("forwardState", (next, name, params) => {
      const result = next(name, params);

      calls.push({
        name: result.name,
        params: { ...result.params },
      });

      return {
        name: result.name,
        params: { ...result.params, intercepted: "yes" },
        search: {},
      };
    });

    try {
      const matched = api.matchPath("/users");

      // The interceptor ran while matchPath was resolving the route, and the
      // injected param is part of the returned state — proving matchPath
      // goes through ctx.forwardState (intercepted), not the raw
      // RoutesNamespace.forwardState method.
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((c) => c.name === "users")).toBe(true);
      expect(matched?.params).toMatchObject({ intercepted: "yes" });
    } finally {
      remove();
    }
  });
});
