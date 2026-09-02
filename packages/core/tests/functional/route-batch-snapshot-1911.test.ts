import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { installSpyValidator } from "../helpers/spyValidator";

import type { Route } from "@real-router/core/types";

/**
 * Core hands the validator the SNAPSHOT, never the caller's object (#1911).
 *
 * `snapshotRouteBatch` exists so one value answers for every reader. Which
 * object each door passes down is core's own responsibility — the plugin cannot
 * fix it from its side — so it is pinned here, on the call-site contract, with
 * `@real-router/validation-plugin`'s `drifting-route-batch-1911` covering the
 * outcome a drifting bag produces.
 */
describe("the route batch reaches the validator as a snapshot (#1911)", () => {
  const nested = (): Route[] => [
    {
      name: "parent",
      path: "/parent",
      children: [{ name: "child", path: "/child" }],
    },
  ];

  it("add passes a COPY, and walks into children", () => {
    const router = createRouter([]);
    const validator = installSpyValidator(router);
    const routes = nested();

    getRoutesApi(router).add(routes);

    const seen = (
      validator.routes.guardNoAsyncCallbacks as unknown as {
        mock: { calls: [Route][] };
      }
    ).mock.calls.map(([route]) => route);

    expect(seen.map((route) => route.name)).toStrictEqual(["parent", "child"]);

    // The contract: not the caller's objects. A `Proxy` reports an ordinary
    // data descriptor, so identity is the only thing that separates "validated
    // what will be stored" from "validated whatever it answered this time".
    expect(seen[0]).not.toBe(routes[0]);
    expect(seen[1]).not.toBe(routes[0].children?.[0]);

    router.dispose();
  });

  it("replace passes a COPY too, and walks into children", () => {
    const router = createRouter([]);
    const validator = installSpyValidator(router);
    const routes = nested();

    getRoutesApi(router).replace(routes);

    const seen = (
      validator.routes.guardNoAsyncCallbacks as unknown as {
        mock: { calls: [Route][] };
      }
    ).mock.calls.map(([route]) => route);

    expect(seen.map((route) => route.name)).toStrictEqual(["parent", "child"]);
    expect(seen[0]).not.toBe(routes[0]);
    expect(seen[1]).not.toBe(routes[0].children?.[0]);

    router.dispose();
  });

  it("CONTROL — the STRUCTURAL guard keeps seeing the caller's value", () => {
    // The split's whole point: a spread turns `null` / `42` / `true` into `{}`,
    // so the structural check has to run above the snapshot and still refuse
    // them. `snapshotRouteBatch`'s docblock owns the measurement.
    const router = createRouter([]);

    installSpyValidator(router);

    for (const bad of [null, 42, true, "ab"] as unknown as Route[]) {
      expect(() => {
        getRoutesApi(router).add([bad]);
      }).toThrow(/must be a non-array object/);
    }

    router.dispose();
  });
});
