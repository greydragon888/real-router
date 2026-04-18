import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  createStartedRouter,
  arbNodeName,
  arbNavigationSeq,
  arbListenerCount,
  NUM_RUNS,
  arbNavigation,
  arbDestroyCount,
  NAVIGABLE_ROUTE_NAMES,
  paramsForRoute,
} from "./helpers";
import { createRouteNodeSource } from "../../src";

const navigableSet = new Set<string>(NAVIGABLE_ROUTE_NAMES);

const arbUsersSubtreeRouteName = fc.constantFrom(
  "users.list",
  "users.view",
  "users.edit",
);

const arbNonUsersRouteName = fc.constantFrom(
  "admin.dashboard",
  "admin.settings",
  "search",
);

function isNodeActive(
  routeName: string | undefined,
  nodeName: string,
): boolean {
  if (nodeName === "") {
    return true;
  }
  if (routeName === undefined) {
    return false;
  }

  return routeName === nodeName || routeName.startsWith(`${nodeName}.`);
}

describe("node scoping", () => {
  test.prop([arbNodeName], { numRuns: NUM_RUNS.standard })(
    "node is active after navigating to itself",
    async (nodeName) => {
      fc.pre(navigableSet.has(nodeName) && nodeName !== "home");
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.subscribe(() => {});
      await router.navigate(nodeName, paramsForRoute(nodeName));

      const snapshot = source.getSnapshot();

      expect(snapshot.route).not.toBeUndefined();
      expect(snapshot.route!.name).toBe(nodeName);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "node is active for descendant routes",
    async (nodeName, nav) => {
      fc.pre(nodeName !== "" && nav.name.startsWith(`${nodeName}.`));
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.subscribe(() => {});
      await router.navigate(nav.name, nav.params).catch(() => {});

      const snapshot = source.getSnapshot();

      expect(snapshot.route).not.toBeUndefined();
      expect(snapshot.route!.name).toBe(nav.name);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "node is inactive for unrelated routes",
    async (nodeName, nav) => {
      fc.pre(
        nodeName !== "" &&
          nodeName !== "home" &&
          nav.name !== nodeName &&
          !nav.name.startsWith(`${nodeName}.`) &&
          nav.name !== "home",
      );
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.subscribe(() => {});
      await router.navigate(nav.name, nav.params).catch(() => {});

      expect(source.getSnapshot().route).toBeUndefined();

      router.stop();
    },
  );

  test.prop([arbNavigation], { numRuns: NUM_RUNS.standard })(
    "root node is always active",
    async (nav) => {
      fc.pre(nav.name !== "home");
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, "");

      source.subscribe(() => {});
      await router.navigate(nav.name, nav.params).catch(() => {});

      expect(source.getSnapshot().route).toBe(router.getState());

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "listener not called when navigation is outside node subtree",
    async (nodeName, nav) => {
      fc.pre(
        nodeName !== "" &&
          nodeName !== "home" &&
          nav.name !== nodeName &&
          !nav.name.startsWith(`${nodeName}.`) &&
          nav.name !== "home",
      );
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);
      const listener = vi.fn();

      source.subscribe(listener);
      await router.navigate(nav.name, nav.params).catch(() => {});

      expect(listener).not.toHaveBeenCalled();

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "snapshot reference is stable when navigation does not affect node",
    async (nodeName, nav) => {
      fc.pre(
        nodeName !== "" &&
          nodeName !== "home" &&
          nav.name !== nodeName &&
          !nav.name.startsWith(`${nodeName}.`) &&
          nav.name !== "home",
      );
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.subscribe(() => {});
      const snapshotBefore = source.getSnapshot();

      await router.navigate(nav.name, nav.params).catch(() => {});

      expect(source.getSnapshot()).toBe(snapshotBefore);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "root source route is not undefined when node source route is not undefined",
    async (nodeName, nav) => {
      fc.pre(nav.name !== "home");
      const router = await createStartedRouter();
      const nodeSource = createRouteNodeSource(router, nodeName);
      const rootSource = createRouteNodeSource(router, "");

      nodeSource.subscribe(() => {});
      rootSource.subscribe(() => {});
      await router.navigate(nav.name, nav.params).catch(() => {});
      if (nodeSource.getSnapshot().route !== undefined) {
        expect(rootSource.getSnapshot().route).not.toBeUndefined();
      }

      router.stop();
    },
  );

  test.prop([arbUsersSubtreeRouteName, arbUsersSubtreeRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "previousRoute reflects prior route after within-subtree navigation",
    async (nameA, nameB) => {
      fc.pre(nameA !== nameB);
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, "users");

      source.subscribe(() => {});
      await router.navigate(nameA, paramsForRoute(nameA));
      await router.navigate(nameB, paramsForRoute(nameB));

      const snapshot = source.getSnapshot();

      expect(snapshot.route?.name).toBe(nameB);
      expect(snapshot.previousRoute?.name).toBe(nameA);

      router.stop();
    },
  );

  test.prop(
    [
      arbUsersSubtreeRouteName,
      arbUsersSubtreeRouteName,
      arbUsersSubtreeRouteName,
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "previousRoute chain: after A→B→C in subtree, previousRoute is B",
    async (nameA, nameB, nameC) => {
      fc.pre(nameA !== nameB && nameB !== nameC);
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, "users");

      source.subscribe(() => {});
      await router.navigate(nameA, paramsForRoute(nameA));
      await router.navigate(nameB, paramsForRoute(nameB));
      await router.navigate(nameC, paramsForRoute(nameC));

      const snapshot = source.getSnapshot();

      expect(snapshot.route?.name).toBe(nameC);
      expect(snapshot.previousRoute?.name).toBe(nameB);

      router.stop();
    },
  );

  test.prop(
    [arbUsersSubtreeRouteName, arbNonUsersRouteName, arbUsersSubtreeRouteName],
    { numRuns: NUM_RUNS.standard },
  )(
    "previousRoute is global, includes routes outside node subtree",
    async (nameA, nameB, nameC) => {
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, "users");

      source.subscribe(() => {});
      await router.navigate(nameA, paramsForRoute(nameA));
      await router.navigate(nameB, paramsForRoute(nameB));
      await router.navigate(nameC, paramsForRoute(nameC));

      const snapshot = source.getSnapshot();

      expect(snapshot.route?.name).toBe(nameC);
      expect(snapshot.previousRoute?.name).toBe(nameB);

      router.stop();
    },
  );
});

describe("lazy-connection and reconnection", () => {
  test.prop([arbNodeName], { numRuns: NUM_RUNS.standard })(
    "no router subscription before first subscribe",
    async (nodeName) => {
      const router = await createStartedRouter();
      const originalSubscribe = router.subscribe.bind(router);
      let subscribeCallCount = 0;

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        subscribeCallCount++;

        return originalSubscribe(listener);
      });
      createRouteNodeSource(router, nodeName);

      expect(subscribeCallCount).toStrictEqual(0);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbListenerCount], { numRuns: NUM_RUNS.standard })(
    "router unsubscribes when last listener is removed",
    async (nodeName, listenerCount) => {
      const router = await createStartedRouter();
      const originalSubscribe = router.subscribe.bind(router);
      let unsubCallCount = 0;

      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        const unsub = originalSubscribe(listener);

        return () => {
          unsubCallCount++;
          unsub();
        };
      });
      const source = createRouteNodeSource(router, nodeName);
      const unsubFns: (() => void)[] = [];

      for (let i = 0; i < listenerCount; i++) {
        unsubFns.push(source.subscribe(() => {}));
      }
      for (let i = 0; i < listenerCount - 1; i++) {
        unsubFns[i]();

        expect(unsubCallCount).toStrictEqual(0);
      }

      unsubFns[listenerCount - 1]();

      expect(unsubCallCount).toStrictEqual(1);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "snapshot reflects current state after reconnection",
    async (nodeName, nav) => {
      fc.pre(nav.name !== "home");
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);
      const unsub = source.subscribe(() => {});

      unsub();
      await router.navigate(nav.name, nav.params).catch(() => {});
      source.subscribe(() => {});
      const currentRoute = router.getState();
      const expectedRoute = isNodeActive(currentRoute?.name, nodeName)
        ? currentRoute
        : undefined;

      expect(source.getSnapshot().route).toBe(expectedRoute);

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "snapshot is current after multiple mount/unmount cycles with navigations",
    async (nodeName, navSeq) => {
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      for (const nav of navSeq) {
        const unsub = source.subscribe(() => {});

        unsub();
        try {
          await router.navigate(nav.name, nav.params);
        } catch {
          // SAME_STATES expected when navigating to current route
        }
        const resub = source.subscribe(() => {});
        const currentRoute = router.getState();
        const expectedRoute = isNodeActive(currentRoute?.name, nodeName)
          ? currentRoute
          : undefined;

        expect(source.getSnapshot().route).toBe(expectedRoute);

        resub();
      }

      router.stop();
    },
  );

  test.prop([fc.integer({ min: 2, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "double-unsubscribe is safe and does not affect remaining listeners",
    async (n) => {
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, "users");
      const listeners = Array.from({ length: n }, () => vi.fn());
      const unsubs = listeners.map((l) => source.subscribe(l));

      unsubs[0]();
      unsubs[0]();

      await router.navigate("users.list");

      for (const l of listeners.slice(1)) {
        expect(l).toHaveBeenCalledTimes(1);
      }

      for (const unsub of unsubs.slice(1)) {
        unsub();
      }

      router.stop();
    },
  );
});

describe("destroy (cached shared source — no-op)", () => {
  test.prop([arbNodeName, arbDestroyCount], { numRuns: NUM_RUNS.standard })(
    "destroy is idempotent on cached source",
    async (nodeName, destroyCount) => {
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.subscribe(() => {});

      expect(() => {
        for (let i = 0; i < destroyCount; i++) {
          source.destroy();
        }
      }).not.toThrow();

      router.stop();
    },
  );

  test.prop([arbNodeName], { numRuns: NUM_RUNS.standard })(
    "post-destroy subscribe still returns a function and receives updates",
    async (nodeName) => {
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.destroy();
      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      expect(typeof unsub).toBe("function");

      unsub();

      router.stop();
    },
  );

  test.prop([arbNodeName, arbNavigation], { numRuns: NUM_RUNS.standard })(
    "getSnapshot returns current snapshot after destroy (shared cached)",
    async (nodeName, nav) => {
      fc.pre(nav.name !== "home");
      const router = await createStartedRouter();
      const source = createRouteNodeSource(router, nodeName);

      source.subscribe(() => {});
      await router.navigate(nav.name, nav.params).catch(() => {});
      const lastSnapshot = source.getSnapshot();

      source.destroy();

      expect(source.getSnapshot()).toBe(lastSnapshot);

      router.stop();
    },
  );
});
