import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbNavigationSeq,
  arbNodeName,
  arbRouteName,
  createStartedRouter,
  executeNavigations,
  NUM_RUNS,
  paramsForRoute,
} from "./helpers";
import { computeSnapshot } from "../../src/computeSnapshot.js";

import type { RouteNodeSnapshot } from "../../src";

const INITIAL_SNAPSHOT: RouteNodeSnapshot = {
  route: undefined,
  previousRoute: undefined,
};

describe("computeSnapshot — invariants", () => {
  test.prop([arbNodeName, arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "reference stability: repeated call without next produces the same ref",
    async (nodeName, navSeq) => {
      const router = await createStartedRouter();

      await executeNavigations(router, navSeq).catch(() => undefined);

      const first = computeSnapshot(INITIAL_SNAPSHOT, router, nodeName);
      const second = computeSnapshot(first, router, nodeName);

      // Idempotent: feeding the previous result back must produce the
      // identical reference (route/previousRoute stabilize to prev).
      expect(second).toBe(first);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "idempotency under same `next`: f(snap, router, node, next) === f(f(...), ...)",
    async (nodeName, routeName) => {
      const router = await createStartedRouter();

      await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {
        // ignore
      });

      const route = router.getState();

      if (route === undefined) {
        router.stop();

        return;
      }

      const next = { route, previousRoute: undefined };

      const once = computeSnapshot(INITIAL_SNAPSHOT, router, nodeName, next);
      const twice = computeSnapshot(once, router, nodeName, next);

      expect(twice).toBe(once);

      router.stop();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "root dominance: nodeName === '' ⇒ result.route === router.getState()",
    async (navSeq) => {
      const router = await createStartedRouter();

      await executeNavigations(router, navSeq).catch(() => undefined);

      const snap = computeSnapshot(INITIAL_SNAPSHOT, router, "");

      expect(snap.route).toBe(router.getState());

      router.stop();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "subtree containment: when navigated route is the node itself, result.route is defined and equals the navigated route",
    async (routeName) => {
      fc.pre(routeName !== "home");

      const router = await createStartedRouter();

      await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {
        // ignore
      });

      const snap = computeSnapshot(INITIAL_SNAPSHOT, router, routeName);

      expect(snap.route).toBeDefined();
      expect(snap.route?.name).toBe(routeName);

      router.stop();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "false-positive subtree match: 'users' node + currentRoute='users.list' is active",
    async (routeName) => {
      fc.pre(routeName.startsWith("users."));

      const router = await createStartedRouter();

      await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {
        // ignore
      });

      const snap = computeSnapshot(INITIAL_SNAPSHOT, router, "users");

      expect(snap.route?.name).toBe(routeName);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "unrelated route: result.route is undefined",
    async (nodeName, routeName) => {
      fc.pre(
        nodeName !== "" &&
          routeName !== nodeName &&
          !routeName.startsWith(`${nodeName}.`),
      );

      const router = await createStartedRouter();

      await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {
        // SAME_STATES is expected when targeting the boot route ("home")
      });

      const snap = computeSnapshot(INITIAL_SNAPSHOT, router, nodeName);

      expect(snap.route).toBeUndefined();

      router.stop();
    },
  );
});

describe("computeSnapshot — boundary cases (audit §6.2)", () => {
  test("nodeName='users' + currentRoute='search' → no false positive (route is undefined)", async () => {
    const router = await createStartedRouter();

    await router.navigate("search", { q: "x", page: "1" });

    const snap = computeSnapshot(INITIAL_SNAPSHOT, router, "users");

    expect(snap.route).toBeUndefined();

    router.stop();
  });

  test("nodeName='users.list' + currentRoute='users.view' → siblings, route undefined", async () => {
    const router = await createStartedRouter();

    await router.navigate("users.view", { id: "1" });

    const snap = computeSnapshot(INITIAL_SNAPSHOT, router, "users.list");

    expect(snap.route).toBeUndefined();

    router.stop();
  });

  test("nodeName='admin' + currentRoute='admin.dashboard' → ancestor active, route equals navigated route", async () => {
    const router = await createStartedRouter();

    await router.navigate("admin.dashboard");

    const snap = computeSnapshot(INITIAL_SNAPSHOT, router, "admin");

    expect(snap.route?.name).toBe("admin.dashboard");

    router.stop();
  });
});
