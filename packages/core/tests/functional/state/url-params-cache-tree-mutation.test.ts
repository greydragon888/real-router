import { describe, it, expect, afterEach } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

// #723 — the URL-param-name cache (used by areStatesEqual / isActiveRoute to
// know which params are path params) must be invalidated on every route-tree
// mutation, otherwise comparisons stay frozen to a route's pre-mutation shape.

const itemState = (params: Record<string, string>): State =>
  ({ name: "item", params, path: "/x", context: {} }) as State;

describe("URL-param cache invalidation on tree mutation (#723)", () => {
  let active: Router | undefined;

  afterEach(() => {
    if (active?.isActive()) {
      active.stop();
    }

    active = undefined;
  });

  it("areStatesEqual reflects the new param shape after replace()", async () => {
    const router = (active = createRouter([
      { name: "home", path: "/" },
      { name: "item", path: "/item/:id" },
    ]));

    await router.start("/");

    // Warm the cache: item -> ["id"] (tab is a query param, ignored)
    router.areStatesEqual(itemState({ id: "1" }), itemState({ id: "2" }), true);

    getRoutesApi(router).replace([
      { name: "home", path: "/" },
      { name: "item", path: "/item/:id/:tab" }, // tab is now a path param
    ]);

    // s1 and s2 differ ONLY in `tab`, now a path param → must be unequal
    const equal = router.areStatesEqual(
      itemState({ id: "1", tab: "a" }),
      itemState({ id: "1", tab: "b" }),
      true,
    );

    expect(equal).toBe(false);
  });

  it("areStatesEqual reflects the new param shape after remove() + add()", async () => {
    const router = (active = createRouter([
      { name: "home", path: "/" },
      { name: "item", path: "/item/:id" },
    ]));

    await router.start("/");

    const routes = getRoutesApi(router);

    // Warm the cache: item -> ["id"]
    router.areStatesEqual(itemState({ id: "1" }), itemState({ id: "2" }), true);

    routes.remove("item");
    routes.add({ name: "item", path: "/item/:id/:tab" });

    const equal = router.areStatesEqual(
      itemState({ id: "1", tab: "a" }),
      itemState({ id: "1", tab: "b" }),
      true,
    );

    expect(equal).toBe(false);
  });

  it("isActiveRoute reflects the new param shape after replace()", async () => {
    const router = (active = createRouter([
      { name: "home", path: "/" },
      { name: "item", path: "/item/:id" },
    ]));

    await router.start("/");
    await router.navigate("item", { id: "1" });

    // Warm the cache for "item" (tab is a query param here → ignored → true)
    expect(
      router.isActiveRoute(
        "item",
        { id: "1", tab: "b" },
        undefined,
        false,
        true,
      ),
    ).toBe(true);

    getRoutesApi(router).replace([
      { name: "home", path: "/" },
      { name: "item", path: "/item/:id/:tab" },
    ]);

    await router.navigate("item", { id: "1", tab: "a" });

    // tab is now a path param → active item has tab "a", query target tab "b"
    expect(
      router.isActiveRoute(
        "item",
        { id: "1", tab: "b" },
        undefined,
        false,
        true,
      ),
    ).toBe(false);
  });
});
