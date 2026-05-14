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

      router.stop();

      // Discard runs where navigation didn't land on a defined route — these
      // don't exercise the property under test. Using `fc.pre` lets fast-check
      // shrink toward inputs that actually run the assertions, instead of
      // silently treating "no route" as a passing run.
      fc.pre(route !== undefined);

      const next = { route, previousRoute: undefined };

      const once = computeSnapshot(INITIAL_SNAPSHOT, router, nodeName, next);
      const twice = computeSnapshot(once, router, nodeName, next);

      expect(twice).toBe(once);
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
      // previousRoute carries forward from the INITIAL_SNAPSHOT we feed in;
      // an unrelated-route transition must not invent a previousRoute either.
      expect(snap.previousRoute).toBeUndefined();
      // Reference identity: when the node is inactive, computeSnapshot returns
      // INITIAL_SNAPSHOT verbatim (path through stabilizeState short-circuit).
      expect(snap).toBe(INITIAL_SNAPSHOT);

      router.stop();
    },
  );
});

describe("computeSnapshot — nodeName containment monotonicity", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "leaf-active ⇒ ancestor-active: snap(node=A.B) defined ⇒ snap(node=A) defined",
    async (routeName) => {
      // Only meaningful for nested routes — top-level routes have no ancestor.
      fc.pre(routeName.includes("."));

      const router = await createStartedRouter();

      await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {
        // ignore
      });

      const leafName = routeName;
      const ancestorName = leafName.slice(0, leafName.lastIndexOf("."));

      const leafSnap = computeSnapshot(INITIAL_SNAPSHOT, router, leafName);
      const ancestorSnap = computeSnapshot(
        INITIAL_SNAPSHOT,
        router,
        ancestorName,
      );

      if (leafSnap.route !== undefined) {
        expect(ancestorSnap.route).toBeDefined();
        // And the ancestor sees the same active route, since both contain it.
        expect(ancestorSnap.route?.name).toBe(leafSnap.route.name);
      }

      router.stop();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "root (node='') is always at-least-as-active as any specific nodeName",
    async (routeName) => {
      fc.pre(routeName !== "home");

      const router = await createStartedRouter();

      await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {
        // ignore
      });

      const rootSnap = computeSnapshot(INITIAL_SNAPSHOT, router, "");
      const nodeSnap = computeSnapshot(INITIAL_SNAPSHOT, router, routeName);

      // Root is always active when a route is active → if nodeSnap.route is
      // defined, rootSnap.route must equal it (root contains every node).
      if (nodeSnap.route === undefined) {
        // Root may still be defined (router has some route) even when the
        // specific node isn't related — root is a superset.
        expect(rootSnap.route).toBe(router.getState());
      } else {
        expect(rootSnap.route).toBe(nodeSnap.route);
      }

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
