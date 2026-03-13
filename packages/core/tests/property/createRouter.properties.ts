import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  createRouter,
  getDependenciesApi,
  getRoutesApi,
} from "@real-router/core";

import {
  arbSegmentName,
  ROUTES,
  FIXTURE_ROUTE_NAMES,
  NUM_RUNS,
} from "./helpers";

describe("createRouter Properties", () => {
  it("no-args: returns valid unstarted router", () => {
    const router = createRouter();

    expect(router.isActive()).toBe(false);
    expect(router.getState()).toBeUndefined();
  });

  test.prop([fc.uniqueArray(arbSegmentName, { minLength: 1, maxLength: 5 })], {
    numRuns: NUM_RUNS.standard,
  })("all provided routes are registered", (names) => {
    fc.pre(names.every((n) => !FIXTURE_ROUTE_NAMES.includes(n as never)));

    const routes = names.map((n) => ({ name: n, path: `/${n}` }));
    const router = createRouter(routes);
    const routesApi = getRoutesApi(router);

    for (const name of names) {
      expect(routesApi.has(name)).toBe(true);
    }
  });

  it("dependencies are accessible via getDependenciesApi", () => {
    const deps = { apiUrl: "https://example.com", debug: true };
    const router = createRouter(ROUTES, {}, deps as never);
    const depsApi = getDependenciesApi(router);

    expect(depsApi.get("apiUrl" as never)).toBe("https://example.com");
    expect(depsApi.get("debug" as never)).toBe(true);
  });
});
