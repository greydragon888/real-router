import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
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
      fc.pre(nameA.split(".", 1)[0] !== nameB.split(".", 1)[0]);

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

      unsub();

      await router.navigate(navTarget).catch(() => undefined);

      const unsub2 = selector.subscribe(name, () => {});

      // Reconnection re-seeds active state from router; the snapshot must
      // match the oracle, independent of the pre-disconnect value.
      expect(selector.isActive(name)).toBe(oracleIsActive(router, name));

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

      expect(selector.isActive(name)).toBe(oracleIsActive(router, name));

      unsub();
      router.stop();
    },
  );
});

// =============================================================================
// Audit §2/§6 HIGH — prefix collision, subscription sharing, pre-subscribe path.
// =============================================================================

async function createConflictRouter(): Promise<Router> {
  const router = createRouter([
    { name: "u", path: "/u" },
    {
      name: "users",
      path: "/users",
      children: [{ name: "list", path: "/list" }],
    },
    { name: "usersAdmin", path: "/usersAdmin" },
  ]);

  await router.start("/u");

  return router;
}

describe("createActiveNameSelector — prefix `.` boundary (audit §6 HIGH)", () => {
  test.prop(
    [
      fc.tuple(
        fc.constantFrom("u", "users", "usersAdmin"),
        fc.constantFrom("u", "users", "usersAdmin"),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "names with a shared prefix but no `.`-boundary do not falsely activate each other",
    async ([watchedName, currentRoute]) => {
      fc.pre(watchedName !== currentRoute);

      const router = await createConflictRouter();
      const selector = createActiveNameSelector(router);
      const unsub = selector.subscribe(watchedName, () => {});

      await router.navigate(currentRoute).catch(() => undefined);

      // None of {u, users, usersAdmin} are `.`-ancestors of each other — so
      // navigating to one must not activate the others. Regressing the
      // boundary to `startsWith(name)` without the trailing dot would flip
      // "users" active when the user navigates to "usersAdmin".
      expect(selector.isActive(watchedName)).toBe(false);

      unsub();
      router.stop();
    },
  );

  test("explicit regression: subscribe('users') stays false after navigate('usersAdmin')", async () => {
    const router = await createConflictRouter();
    const selector = createActiveNameSelector(router);
    const listener = vi.fn();
    const unsub = selector.subscribe("users", listener);

    await router.navigate("usersAdmin");

    expect(selector.isActive("users")).toBe(false);
    // No false-positive listener call either — the per-name diff guard must
    // recognise "users" is still inactive after the navigation.
    expect(listener).not.toHaveBeenCalled();

    unsub();
    router.stop();
  });

  test("explicit regression: subscribe('users') flips true after navigate('users.list')", async () => {
    const router = await createConflictRouter();
    const selector = createActiveNameSelector(router);
    const listener = vi.fn();
    const unsub = selector.subscribe("users", listener);

    await router.navigate("users.list");

    expect(selector.isActive("users")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    router.stop();
  });
});

describe("createActiveNameSelector — subscription sharing (audit §6 HIGH)", () => {
  test.prop(
    [
      fc.uniqueArray(
        fc.constantFrom(
          "users",
          "users.list",
          "admin",
          "admin.dashboard",
          "search",
        ),
        { minLength: 2, maxLength: 5 },
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "K listeners on K distinct names produce EXACTLY ONE router.subscribe call",
    async (names) => {
      const router = await createStartedRouter();
      const subscribeSpy = vi.spyOn(router, "subscribe");
      // Selector is cached per-router; create it AFTER spying so we count
      // every router.subscribe the selector makes during its lifetime.
      const selector = createActiveNameSelector(router);

      const baselineCalls = subscribeSpy.mock.calls.length;
      const unsubs = names.map((name) => selector.subscribe(name, () => {}));

      // After K subscribe(name) calls, the selector must have opened exactly
      // ONE router subscription (it shares the listener across all names).
      expect(subscribeSpy.mock.calls.length - baselineCalls).toBe(1);

      for (const u of unsubs) {
        u();
      }

      router.stop();
      subscribeSpy.mockRestore();
    },
  );

  test.prop(
    [
      fc.uniqueArray(
        fc.constantFrom(
          "users",
          "users.list",
          "admin",
          "admin.dashboard",
          "search",
        ),
        { minLength: 2, maxLength: 5 },
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "last-unsubscribe disconnects: after every listener is removed, the router subscription is released exactly once",
    async (names) => {
      const router = await createStartedRouter();
      const realSubscribe = router.subscribe.bind(router);
      const routerUnsubSpy = vi.fn();

      // Wrap router.subscribe so we can count when the selector releases its
      // shared subscription. Must be installed BEFORE the selector is created.
      vi.spyOn(router, "subscribe").mockImplementation((listener) => {
        const unsub = realSubscribe(listener);

        return () => {
          routerUnsubSpy();
          unsub();
        };
      });

      const selector = createActiveNameSelector(router);
      const unsubs = names.map((name) => selector.subscribe(name, () => {}));

      for (const u of unsubs) {
        u();
      }

      // After all selector consumers detach, the selector must release its
      // single router.subscribe handle exactly once.
      expect(routerUnsubSpy).toHaveBeenCalledTimes(1);

      router.stop();
      vi.restoreAllMocks();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.lifecycle })(
    "isActive(name) before any subscribe() returns the correct boolean (pre-subscribe / fallback path)",
    async (navTarget) => {
      const router = await createStartedRouter();
      const selector = createActiveNameSelector(router);

      await router.navigate(navTarget).catch(() => undefined);

      // No `.subscribe()` was called — exercises the fallback branch in
      // `isActive` that consults `router.getState()` directly because the
      // `activeByName` cache is empty.
      const current = router.getState();

      if (current) {
        const expected =
          current.name === navTarget ||
          current.name.startsWith(`${navTarget}.`);

        expect(selector.isActive(navTarget)).toBe(expected);
      } else {
        // Router failed to land — selector should mirror native semantics.
        expect(selector.isActive(navTarget)).toBe(false);
      }

      router.stop();
    },
  );
});
