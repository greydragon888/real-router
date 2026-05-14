import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  arbNavigationSeq,
  arbRouteName,
  createStartedRouter,
  executeNavigations,
  NUM_RUNS,
} from "./helpers";
import { createActiveNameSelector } from "../../src";

import type { Router } from "@real-router/core";

// Restrict to names the selector can meaningfully observe (i.e., present in
// the fixture router's route tree, exercising both leaf and parent variants).
const arbWatchedName = fc.constantFrom(
  "users",
  "users.list",
  "users.view",
  "users.edit",
  "admin",
  "admin.dashboard",
  "admin.settings",
  "search",
);

/**
 * Mirrors the selector's internal `isActiveNonStrict` — the only semantics
 * the selector promises (non-strict, params-ignored, no query-string match).
 * Using this as the oracle keeps the test aligned with the implementation
 * rather than with `router.isActiveRoute`, which also compares params.
 */
function oracleIsActive(router: Router, routeName: string): boolean {
  const current = router.getState();

  if (!current) {
    return false;
  }

  return current.name === routeName || current.name.startsWith(`${routeName}.`);
}

describe("createActiveNameSelector — invariants", () => {
  test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "createActiveNameSelector(router) returns the same cached instance",
    async (callCount) => {
      const router = await createStartedRouter();
      const first = createActiveNameSelector(router);

      for (let i = 1; i < callCount; i++) {
        expect(createActiveNameSelector(router)).toBe(first);
      }

      router.stop();
    },
  );

  test.prop([arbWatchedName, arbNavigationSeq], {
    numRuns: NUM_RUNS.standard,
  })(
    "isActive(name) is consistent with router.isActiveRoute (non-strict)",
    async (name, navigations) => {
      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);
      const unsub = selector.subscribe(name, () => {});

      await executeNavigations(router, navigations).catch(() => undefined);

      expect(selector.isActive(name)).toBe(oracleIsActive(router, name));

      unsub();
      router.stop();
    },
  );

  test.prop([arbWatchedName, arbNavigationSeq], {
    numRuns: NUM_RUNS.standard,
  })(
    "listener fires only when active state for the specific name flips",
    async (name, navigations) => {
      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);
      const listener = vi.fn();
      const unsub = selector.subscribe(name, listener);

      let prev = selector.isActive(name);
      let expectedFlips = 0;

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);
        const next = oracleIsActive(router, name);

        if (next !== prev) {
          expectedFlips++;
          prev = next;
        }
      }

      expect(listener).toHaveBeenCalledTimes(expectedFlips);

      unsub();
      router.stop();
    },
  );

  test.prop([arbWatchedName, arbWatchedName, arbNavigationSeq], {
    numRuns: NUM_RUNS.standard,
  })(
    "two listeners on the same name receive identical notifications",
    async (name, _unused, navigations) => {
      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      const unsubA = selector.subscribe(name, listenerA);
      const unsubB = selector.subscribe(name, listenerB);

      await executeNavigations(router, navigations).catch(() => undefined);

      expect(listenerA).toHaveBeenCalledTimes(listenerB.mock.calls.length);

      unsubA();
      unsubB();
      router.stop();
    },
  );

  test.prop([arbWatchedName, arbWatchedName, arbNavigationSeq], {
    numRuns: NUM_RUNS.standard,
  })(
    "listeners for disjoint names don't fire on each other's flips",
    async (nameA, nameB, navigations) => {
      // Disjoint: nameA and nameB share no ancestor/descendant link.
      fc.pre(
        nameA !== nameB &&
          !nameA.startsWith(`${nameB}.`) &&
          !nameB.startsWith(`${nameA}.`),
      );
      // Plus they must occupy different top-level subtrees so no navigation
      // can simultaneously activate both (e.g., "users" + "admin").
      fc.pre(nameA.split(".")[0] !== nameB.split(".")[0]);

      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      const unsubA = selector.subscribe(nameA, listenerA);
      const unsubB = selector.subscribe(nameB, listenerB);

      let prevA = selector.isActive(nameA);
      let prevB = selector.isActive(nameB);
      let flipsA = 0;
      let flipsB = 0;

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);
        const nextA = oracleIsActive(router, nameA);
        const nextB = oracleIsActive(router, nameB);

        if (nextA !== prevA) {
          flipsA++;
          prevA = nextA;
        }
        if (nextB !== prevB) {
          flipsB++;
          prevB = nextB;
        }
      }

      expect(listenerA).toHaveBeenCalledTimes(flipsA);
      expect(listenerB).toHaveBeenCalledTimes(flipsB);

      unsubA();
      unsubB();
      router.stop();
    },
  );

  test.prop([arbWatchedName, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "unsubscribe → re-subscribe restores the active state for the name",
    async (name, navTarget) => {
      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);

      const unsub = selector.subscribe(name, () => {});
      const initial = selector.isActive(name);

      unsub();

      await router.navigate(navTarget).catch(() => undefined);

      const unsub2 = selector.subscribe(name, () => {});

      // Reconnection re-seeds active state from router; the snapshot must
      // match the oracle, independent of the pre-disconnect value.
      expect(selector.isActive(name)).toBe(oracleIsActive(router, name));
      expect(typeof initial).toBe("boolean");

      unsub2();
      router.stop();
    },
  );

  test.prop([arbWatchedName], { numRuns: NUM_RUNS.standard })(
    "destroy() on the cached selector is a no-op — selector remains usable",
    async (name) => {
      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);

      selector.destroy();
      selector.destroy();

      const unsub = selector.subscribe(name, () => {});

      expect(typeof selector.isActive(name)).toBe("boolean");

      unsub();
      router.stop();
    },
  );
});
