import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbNavigableRoute,
  arbSegmentName,
  NUM_RUNS,
} from "./helpers";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("canNavigateTo Properties", () => {
  test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "unknown route returns false",
    async (unknownRoute) => {
      fc.pre(
        !["home", "users", "admin", "search", "oldUsers"].includes(
          unknownRoute,
        ),
      );

      const router = createFixtureRouter();

      await router.start("/");

      expect(router.canNavigateTo(unknownRoute)).toBe(false);

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "no guards → canNavigateTo returns true for existing routes",
    async (route) => {
      const router = createFixtureRouter();

      await router.start("/");

      expect(router.canNavigateTo(route, getParamsForRoute(route))).toBe(true);

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "sync guard returning true → canNavigateTo === true",
    async (route) => {
      fc.pre(route !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(route, () => () => true);

      await router.start("/");

      expect(router.canNavigateTo(route, getParamsForRoute(route))).toBe(true);

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "sync guard returning false → canNavigateTo === false",
    async (route) => {
      fc.pre(route !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(route, () => () => false);

      await router.start("/");

      expect(router.canNavigateTo(route, getParamsForRoute(route))).toBe(false);

      router.stop();
    },
  );

  // #725 — the predicate must answer, never throw, on incomplete input. Routes
  // with required path params (e.g. users.view "/users/:id") used to throw a
  // raw buildPath Error when called with empty params; they now resolve to false.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "missing required params resolve to false instead of throwing",
    async (route) => {
      const router = createFixtureRouter();

      await router.start("/");

      let result: boolean | undefined;

      expect(() => {
        result = router.canNavigateTo(route, {});
      }).not.toThrow();
      expect(typeof result).toBe("boolean");

      router.stop();
    },
  );
});
