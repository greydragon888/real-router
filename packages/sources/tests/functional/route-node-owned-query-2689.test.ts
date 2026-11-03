import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { createRouteNodeSource } from "../../src";

import type { Router } from "@real-router/core";

// `useRouteNode` in every adapter is built on this source, and the source
// decides through `router.shouldUpdateNode` (#2689): the node whose segment
// declares a query param must see that param change.
describe("createRouteNodeSource — a query param the node's own segment declares (#2689)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  async function ordersAt(path: string): Promise<Router> {
    const instance = createRouter(
      [
        {
          name: "orders",
          path: "/orders?status",
          children: [{ name: "list", path: "/list?page" }],
        },
      ],
      { defaultRoute: "orders.list" },
    );

    router = instance;
    await instance.start(path);

    return instance;
  }

  it("emits for the parent when only its own query param changes", async () => {
    const r = await ordersAt("/orders/list?status=new&page=1");
    const source = createRouteNodeSource(r, "orders");
    let emits = 0;
    const unsubscribe = source.subscribe(() => {
      emits++;
    });

    await r.navigate("orders.list", {}, { status: "closed", page: "1" });

    expect(emits).toBe(1);
    expect(source.getSnapshot().route?.search).toStrictEqual({
      status: "closed",
      page: "1",
    });
    expect(source.getSnapshot().previousRoute?.path).toBe(
      "/orders/list?status=new&page=1",
    );

    unsubscribe();
  });

  it("does not emit for the parent when only a query key no segment declares changes", async () => {
    const r = await ordersAt("/orders/list?status=new&page=1&extra=1");
    const source = createRouteNodeSource(r, "orders");
    let emits = 0;
    const unsubscribe = source.subscribe(() => {
      emits++;
    });

    await r.navigate(
      "orders.list",
      {},
      { status: "new", page: "1", extra: "2" },
    );

    expect(r.getState()?.search.extra).toBe("2");
    expect(emits).toBe(0);

    // The same source still emits when the parent's own key changes.
    await r.navigate(
      "orders.list",
      {},
      { status: "closed", page: "1", extra: "2" },
    );

    expect(emits).toBe(1);

    unsubscribe();
  });
});
