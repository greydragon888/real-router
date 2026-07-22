import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params } from "@real-router/core";

/**
 * Documents which interceptors `matchPath` actually runs — answers #525 Q1.
 *
 * Findings (verified by the assertions below):
 *
 * - **`forwardState` interceptors → applied.** `matchPath` calls
 *   `this.#deps.forwardState(...)` (`RoutesNamespace.matchPath`), which is
 *   wired through `ctx.forwardState` (`wireNamespaces.ts`), which goes through
 *   `createBinaryInterceptable("forwardState", …)` in the Router constructor's
 *   `registerInternals` block.
 *
 * - **`buildPath` interceptors → NOT applied.** `matchPath` calls
 *   `this.#store.matcher.buildPath(...)` directly (`RoutesNamespace.matchPath`,
 *   low-level matcher API) to rewrite the path — **not** the `ctx.buildPath`
 *   interceptable from the same `registerInternals` block. So registered
 *   `buildPath` interceptors do not run here.
 *
 * Implication for issue #525:
 *
 * - A future fix that migrates plugins from
 *   `router.navigate(matchedState.name, matchedState.params)` to a primitive
 *   that bypasses `buildNavigateState` (e.g. `router.navigateToState(state)`)
 *   would also bypass `ctx.buildPath` and therefore skip `buildPath`
 *   interceptors. Plugins relying ONLY on `buildPath` interception (no
 *   matching `forwardState` interceptor) would silently lose effect for
 *   browser-initiated navigation.
 * - `@real-router/persistent-params-plugin` happens to register **both**
 *   `forwardState` and `buildPath` interceptors that produce the same merge,
 *   so the effect is symmetric there. A plugin that intercepts ONLY
 *   `buildPath` (none in this monorepo today, but the interceptor API allows
 *   it) would regress.
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

  it("does NOT apply buildPath interceptors (matchedState.path bypasses the interceptor pipeline)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    void router.start("/");

    const api = getPluginApi(router);
    let interceptorCallCount = 0;
    const remove = api.addInterceptor("buildPath", (next, route, params) => {
      interceptorCallCount++;

      // Append a marker to the result so any downstream comparison can tell
      // whether this interceptor ran.
      return `${next(route, params)}#intercepted`;
    });

    try {
      const matched = api.matchPath("/users");

      // matchPath uses RoutesNamespace.#store.matcher.buildPath — the
      // low-level matcher — to rewrite `state.path`. It does NOT pass
      // through ctx.buildPath, so the buildPath interceptor never runs and
      // the rewritten path carries no `#intercepted` marker.
      expect(interceptorCallCount).toBe(0);
      expect(matched?.path).toBe("/users");
      expect(matched?.path).not.toContain("#intercepted");

      // Sanity: the same interceptor DOES run when ctx.buildPath is invoked
      // through the public router.buildPath facade (which calls into
      // ctx.buildPath) and through buildNavigateState (the path that
      // `router.navigate(name, params)` takes).
      router.buildPath("users");

      expect(interceptorCallCount).toBeGreaterThan(0);
    } finally {
      remove();
    }
  });

  it("router.navigate (post-matchPath) goes through ctx.buildPath — interceptor runs there", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    const api = getPluginApi(router);
    let buildPathCalls = 0;
    const remove = api.addInterceptor("buildPath", (next, route, params) => {
      buildPathCalls++;

      return next(route, params);
    });

    try {
      const matched = api.matchPath("/users");

      // matchPath path: 0 buildPath interceptor invocations.
      expect(buildPathCalls).toBe(0);

      // Plugin-equivalent flow: forward (name, params) into router.navigate.
      // buildNavigateState (wireNamespaces.ts) calls
      // ctx.buildPath(name, params) — interceptor MUST run here.
      await router.navigate(matched!.name, matched!.params);

      expect(buildPathCalls).toBeGreaterThan(0);
    } finally {
      remove();
    }
  });
});
