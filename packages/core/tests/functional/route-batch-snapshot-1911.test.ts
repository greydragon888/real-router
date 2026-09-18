import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * Core hands the SNAPSHOT to the check position, never the caller's object
 * (#1911 / #2388).
 *
 * `snapshotRouteBatch` exists so one value answers for every reader. Which
 * object each door passes down is core's own responsibility — a plugin cannot
 * fix it from its side — so it is pinned here, on the call-site contract, with
 * `@real-router/validation-plugin`'s `drifting-route-batch-1911` covering the
 * outcome a drifting bag produces.
 *
 * ⚠ The per-route WALK belongs to the checking plugin now, so what core owes is
 * the whole snapshot with its children snapshotted too. A cell asserting the
 * walk would be pinning the plugin's behaviour from core's suite.
 */
describe("the route batch reaches the check as a snapshot (#1911)", () => {
  const nested = (): Route[] => [
    {
      name: "parent",
      path: "/parent",
      children: [{ name: "child", path: "/child" }],
    },
  ];

  it("add hands over a COPY, children included", () => {
    const router = createRouter([]);
    const routes = nested();
    let batch: readonly Route[] = [];

    getPluginApi(router).addCheck("addRoute:batch", (handed) => {
      batch = handed as readonly Route[];
    });

    getRoutesApi(router).add(routes);

    expect(batch.map((route) => route.name)).toStrictEqual(["parent"]);
    expect(batch[0].children?.map((child) => child.name)).toStrictEqual([
      "child",
    ]);

    // The contract: not the caller's objects. A `Proxy` reports an ordinary
    // data descriptor, so identity is the only thing that separates "checked
    // what will be stored" from "checked whatever it answered this time".
    expect(batch[0]).not.toBe(routes[0]);
    expect(batch[0].children?.[0]).not.toBe(routes[0].children?.[0]);

    router.dispose();
  });

  it("replace hands over a COPY too, children included", () => {
    const router = createRouter([]);
    const routes = nested();
    let batch: readonly Route[] = [];

    getPluginApi(router).addCheck("replaceRoutes:batch", (handed) => {
      batch = handed as readonly Route[];
    });

    getRoutesApi(router).replace(routes);

    expect(batch.map((route) => route.name)).toStrictEqual(["parent"]);
    expect(batch[0].children?.map((child) => child.name)).toStrictEqual([
      "child",
    ]);
    expect(batch[0]).not.toBe(routes[0]);
    expect(batch[0].children?.[0]).not.toBe(routes[0].children?.[0]);

    router.dispose();
  });
});
