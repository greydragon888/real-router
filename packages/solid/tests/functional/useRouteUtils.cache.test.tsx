// packages/solid/tests/functional/useRouteUtils.cache.test.tsx

/**
 * Cache invariants for `useRouteUtils` (Sprint B.6 — audit-6 §5.2,
 * Stage-2 #17).
 *
 * The hook caches `RouteUtils` per `(router, tree)` via a module-level
 * `WeakMap<Router, { tree, utils }>`. Two contracts:
 *
 * 1. **Cache hit** — calling `useRouteUtils()` on the SAME router (and
 *    while its tree is unchanged) returns the SAME `RouteUtils`
 *    reference. N consumer components share ONE utils instance. A
 *    regression to per-call construction would break the assumption
 *    that callers can safely close over the ref.
 *
 * 2. **Cache self-heal on tree replacement** — if the router's tree
 *    changes (e.g. `getRoutesApi(router).addRoutes(...)`), the next
 *    `useRouteUtils()` call returns a FRESH `RouteUtils` derived from
 *    the new tree. The cache's two-level key (`router + tree`) detects
 *    the tree-ref change and recomputes.
 *
 * Lives in `tests/functional/` (not `tests/property/`) because the
 * hook requires `RouterContext` which only resolves through Solid's
 * JSX render pipeline — jsdom-only.
 */

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { RouterProvider, useRouteUtils } from "@real-router/solid";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

describe("useRouteUtils — cache invariants (Sprint B.6)", () => {
  it("cache hit — two calls in the SAME owner return the SAME RouteUtils ref", () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    const { result } = renderHook(
      () => {
        const a = useRouteUtils();
        const b = useRouteUtils();

        return { a, b };
      },
      { wrapper: wrapper(router) },
    );

    expect(result.a).toBe(result.b);
  });

  it("cache hit — separate owners on the SAME router share the SAME RouteUtils ref (cross-mount cache)", () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    const { result: result1 } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });
    const { result: result2 } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    // Different mounts, same router → cache returns the same RouteUtils.
    expect(result1).toBe(result2);
  });

  it("cache MISS — different router instances produce DIFFERENT RouteUtils refs", () => {
    const router1 = createRouter([{ name: "home", path: "/" }]);
    const router2 = createRouter([{ name: "home", path: "/" }]);

    const { result: r1 } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router1),
    });
    const { result: r2 } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router2),
    });

    // Structurally similar trees but distinct router identities → no
    // cross-router cache leak.
    expect(r1).not.toBe(r2);
  });

  it("cache self-heal — tree replacement on the SAME router returns a FRESH RouteUtils ref", () => {
    const router = createRouter([{ name: "home", path: "/" }]);

    const { result: beforeAdd } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    // Mutate the router's tree via the routes API. This is the real-
    // world path consumers exercise via `getRoutesApi(router).add(...)`
    // — it returns a NEW tree root, which invalidates the (router, tree)
    // cache key.
    const routesApi = getRoutesApi(router);

    routesApi.add({ name: "users", path: "/users" });

    const { result: afterAdd } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    // Cache self-heals: the tree ref changed, so RouteUtils is rebuilt.
    expect(afterAdd).not.toBe(beforeAdd);
    // The new utils CAN resolve the new route via getChain — sanity
    // check that the rebuilt RouteUtils sees the freshly-added route.
    expect(afterAdd.getChain("users")).toContain("users");
  });
});
