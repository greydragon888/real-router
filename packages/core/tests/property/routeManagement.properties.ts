import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import {
  createFixtureRouter,
  arbSegmentName,
  FIXTURE_ROUTE_NAMES,
  NUM_RUNS,
} from "./helpers";

describe("Route Management (getRoutesApi) Properties", () => {
  test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "add → has: after add(route), has(route.name) === true",
    (name) => {
      fc.pre(!FIXTURE_ROUTE_NAMES.includes(name as never));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);

      routesApi.add({ name, path: `/${name}` });

      expect(routesApi.has(name)).toBe(true);
    },
  );

  test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "add → get: after add(route), get(route.name).path matches",
    (name) => {
      fc.pre(!FIXTURE_ROUTE_NAMES.includes(name as never));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);
      const path = `/${name}`;

      routesApi.add({ name, path });

      const route = routesApi.get(name);

      expect(route).toBeDefined();
      expect(route!.path).toBe(path);
    },
  );

  test.prop([fc.uniqueArray(arbSegmentName, { minLength: 1, maxLength: 5 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "add → NO_REGRESSION: existing routes are structurally unchanged after adding new routes",
    (newNames) => {
      fc.pre(newNames.every((n) => !FIXTURE_ROUTE_NAMES.includes(n as never)));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);

      // Snapshot every pre-existing route's full config BEFORE the add.
      const before = new Map(
        FIXTURE_ROUTE_NAMES.map((name) => [name, routesApi.get(name)]),
      );

      routesApi.add(newNames.map((name) => ({ name, path: `/${name}` })));

      // Adding new (top-level) routes must not mutate any existing route —
      // catches the historical dup-overwrite/torn-merge class (issue #698).
      for (const name of FIXTURE_ROUTE_NAMES) {
        expect(routesApi.has(name)).toBe(true);
        expect(routesApi.get(name)).toStrictEqual(before.get(name));
      }
    },
  );

  test.prop(
    [
      fc.constantFrom(
        ...(FIXTURE_ROUTE_NAMES as unknown as [string, ...string[]]),
      ),
    ],
    { numRuns: NUM_RUNS.fast },
  )("remove → has: after remove(name), has(name) === false", (name) => {
    fc.pre(name !== "oldUsers");

    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.remove(name);

    expect(routesApi.has(name)).toBe(false);
  });

  it("cyclic forwardTo throws", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    expect(() => {
      routesApi.add([
        { name: "cycA", path: "/cyc-a", forwardTo: "cycB" },
        { name: "cycB", path: "/cyc-b", forwardTo: "cycA" },
      ]);
    }).toThrow();

    // Atomicity (issue #698): a rejected cyclic batch leaves nothing behind.
    expect(routesApi.has("cycA")).toBe(false);
    expect(routesApi.has("cycB")).toBe(false);
  });

  it("replace atomicity: old routes gone, new routes present", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.replace([
      { name: "newA", path: "/new-a" },
      { name: "newB", path: "/new-b" },
    ]);

    expect(routesApi.has("home")).toBe(false);
    expect(routesApi.has("users")).toBe(false);
    expect(routesApi.has("newA")).toBe(true);
    expect(routesApi.has("newB")).toBe(true);
  });

  test.prop([arbSegmentName], { numRuns: NUM_RUNS.fast })(
    "update → get: after update, get reflects changes",
    (newForward) => {
      fc.pre(!FIXTURE_ROUTE_NAMES.includes(newForward as never));

      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);

      routesApi.add({ name: newForward, path: `/${newForward}` });
      routesApi.update("home", { forwardTo: newForward });

      const route = routesApi.get("home");

      expect(route).toBeDefined();
      expect(route!.forwardTo).toBe(newForward);
    },
  );

  it("clear → has: after clear(), no routes exist", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.clear();

    for (const name of FIXTURE_ROUTE_NAMES) {
      expect(routesApi.has(name)).toBe(false);
    }
  });

  /**
   * `clear()` atomicity, and it is a POST-CONDITION property on purpose.
   *
   * Unlike `replace` / `add` / `update`, whose prepare-then-commit contract is
   * declared and tested (#698 / #1046 / #1193), `clear()`'s atomicity is
   * STRUCTURAL: three consecutive steps — `resetStore` →
   * `lifecycleNamespace.clearAll()` → `clearState()` — with no try/catch, which
   * hold together only because no user code runs in them. There is no exception
   * to test against, so this asserts the observable instead: whatever the router
   * had before, afterwards the three are consistently empty **together**.
   * Stronger than "clear → has" above, which only looks at the tree.
   *
   * If a callback ever lands in one of those three steps, partial application
   * becomes possible and this is what notices — see INVARIANTS
   * "Route Management" #17.
   */
  test.prop([fc.array(arbSegmentName, { maxLength: 4 }), fc.boolean()], {
    numRuns: NUM_RUNS.standard,
  })(
    "clear atomicity: tree, guards and state go empty together",
    async (extra, ran) => {
      const router = createFixtureRouter();
      const routesApi = getRoutesApi(router);
      const lifecycle = getLifecycleApi(router);

      // "Whatever the router had before" includes having RUN: a stopped router
      // keeps its `previousState`, so this axis is what makes the state clause
      // non-vacuous (and kills the mutant that drops `clearState()`).
      if (ran) {
        await router.start("/home");
        await router.navigate("search");
        router.stop();
      }

      // Arbitrary prior shape: extra routes on top of the fixture, every route
      // carrying a BLOCKING guard so a survivor would be observable.
      for (const name of extra) {
        if (
          !FIXTURE_ROUTE_NAMES.includes(name as never) &&
          !routesApi.has(name)
        ) {
          routesApi.add({ name, path: `/${name}` });
        }
      }

      for (const name of [...FIXTURE_ROUTE_NAMES, ...extra]) {
        if (routesApi.has(name)) {
          lifecycle.addActivateGuard(name, () => () => false);
        }
      }

      routesApi.clear();

      // 1. the tree
      for (const name of [...FIXTURE_ROUTE_NAMES, ...extra]) {
        expect(routesApi.has(name)).toBe(false);
      }

      // 2. the state — BOTH cells, current and previous
      expect(router.getState()).toBeUndefined();
      expect(router.getPreviousState()).toBeUndefined();

      // 3. the guards — re-adding a name must not resurrect the blocking guard
      // that used to sit on it. Observed through behaviour, not internals, and
      // deliberately on a name that DID carry one: starting on a fresh name
      // would pass even if `clearAll()` never ran (measured — that is exactly
      // the mutant this arm exists to kill).
      routesApi.add({ name: "home", path: "/home" });

      await router.start("/home");

      expect(router.getState()?.name).toBe("home");
    },
  );

  it("add with parent: child is accessible via dot notation", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.add({ name: "child", path: "/child" }, { parent: "users" });

    expect(routesApi.has("users.child")).toBe(true);
  });

  it("getRouteConfig returns custom fields for a route", () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.add({
      name: "custom",
      path: "/custom",
      myField: "value",
    });

    const config = getPluginApi(router).getRouteConfig("custom");

    expect(config).toBeDefined();
    expect(config!.myField).toBe("value");
  });

  it("getRouteConfig returns undefined for unknown route", () => {
    const router = createFixtureRouter();

    expect(getPluginApi(router).getRouteConfig("nonexistent")).toBeUndefined();
  });

  it("update with canActivate guard: guard blocks navigation", async () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);

    routesApi.update("admin.settings", {
      canActivate: () => () => false,
    });

    await router.start("/");

    expect(router.canNavigateTo("admin.settings")).toBe(false);

    router.stop();
  });

  it("update with canActivate null: removes the definition guard but preserves an external one (#952)", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    const routesApi = getRoutesApi(router);

    // Definition guard (set via update) — update(canActivate: null) clears it.
    routesApi.update("admin.settings", { canActivate: () => () => false });

    await router.start("/");

    expect(router.canNavigateTo("admin.settings")).toBe(false);

    routesApi.update("admin.settings", { canActivate: null });

    expect(router.canNavigateTo("admin.settings")).toBe(true);

    // An EXTERNAL guard, by contrast, SURVIVES update(canActivate: null) — the
    // clear is origin-selective (#952), not the old origin-blind wipe.
    lifecycle.addActivateGuard("admin.settings", () => () => false);

    expect(router.canNavigateTo("admin.settings")).toBe(false);

    routesApi.update("admin.settings", { canActivate: null });

    expect(router.canNavigateTo("admin.settings")).toBe(false);

    router.stop();
  });

  it("replace during active navigation is silent no-op", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    const routesApi = getRoutesApi(router);

    let resolveGuard!: (value: boolean) => void;
    let resolveReached!: () => void;
    const guardReached = new Promise<void>((resolve) => {
      resolveReached = resolve;
    });

    lifecycle.addActivateGuard(
      "admin.settings",
      () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
          resolveReached();
        }),
    );

    await router.start("/");

    const navPromise = router.navigate("admin.settings");

    await guardReached;

    routesApi.replace([{ name: "replaced", path: "/replaced" }]);

    expect(routesApi.has("home")).toBe(true);
    expect(routesApi.has("replaced")).toBe(false);

    resolveGuard(true);
    await navPromise;

    router.stop();
  });

  /**
   * Class guard for #1757. `remove(name)` clears config and lifecycle handlers
   * for a SET of names; the only correct set is the one the removal actually
   * took out of the tree. Four sites derived it from the name STRING instead —
   * `n === name || n.startsWith(name + ".")` — which is wider than the splice
   * whenever a dotted LEAF is declared beside its namesake, because core accepts
   * `{ name: "a.b" }` as a standalone node.
   *
   * The three assertions are independent of how the fix computes that set:
   * survivors keep their config, the event reports exactly what disappeared, and
   * what disappeared is the tree-structural subtree.
   */
  test.prop(
    [
      fc.uniqueArray(arbSegmentName, { minLength: 3, maxLength: 3 }),
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom(0, 1, 2),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "remove() clears config for exactly the routes that disappeared, and says so (#1757)",
    async ([a, b, c], nestB, nestC, targetIndex) => {
      const cNode = {
        name: nestC ? c : `${a}.${b}.${c}`,
        path: `/${c}`,
        defaultParams: { k: `${a}.${b}.${c}` },
      };
      const bNode = {
        name: nestB ? b : `${a}.${b}`,
        path: `/${b}`,
        defaultParams: { k: `${a}.${b}` },
        ...(nestC ? { children: [cNode] } : {}),
      };
      const aNode = {
        name: a,
        path: `/${a}`,
        defaultParams: { k: a },
        ...(nestB ? { children: [bNode] } : {}),
      };

      const router = createRouter(
        [
          { name: "home", path: "/home" },
          aNode,
          ...(nestB ? [] : [bNode]),
          ...(nestC ? [] : [cNode]),
        ] as never,
        { allowNotFound: true },
      );
      const routesApi = getRoutesApi(router);

      await router.start("/home");

      const all = [a, `${a}.${b}`, `${a}.${b}.${c}`];
      const target = all[targetIndex];

      // The independent oracle: the subtree is a CONTAINMENT relation spelled by
      // `children`, never by the dots in the name.
      const inside = (name: string): boolean =>
        name === target ||
        (target === a && nestB && name === `${a}.${b}`) ||
        (target === a && nestB && nestC && name === `${a}.${b}.${c}`) ||
        (target === `${a}.${b}` && nestC && name === `${a}.${b}.${c}`);

      const payload: string[] = [];

      routesApi.subscribeChanges((event) => {
        if (event.op === "remove") {
          payload.push(...event.removedSubtree.map((route) => route.name));
        }
      });

      const before = all.filter((name) => routesApi.has(name));

      routesApi.remove(target);

      const gone = before.filter((name) => !routesApi.has(name));

      const byName = (left: string, right: string): number =>
        left.localeCompare(right);
      const expected = before.filter((name) => inside(name));

      // 1. exactly the structural subtree disappeared
      expect(gone.toSorted(byName)).toStrictEqual(expected.toSorted(byName));
      // 2. the event named exactly that
      expect(payload.toSorted(byName)).toStrictEqual(gone.toSorted(byName));

      // 3. every survivor kept its own config
      for (const name of before.filter((n) => !gone.includes(n))) {
        expect(routesApi.get(name)?.defaultParams).toStrictEqual({ k: name });
      }

      router.dispose();

      // 4. the active-route refusal obeys the SAME containment rule: standing on
      //    a route inside the subtree blocks the removal, standing on one that
      //    merely shares the name prefix does not. Asserted on a second router
      //    per candidate, because a refusal leaves the tree intact.
      for (const standingOn of before) {
        const second = createRouter(
          [
            { name: "home", path: "/home" },
            aNode,
            ...(nestB ? [] : [bNode]),
            ...(nestC ? [] : [cNode]),
          ] as never,
          { allowNotFound: true },
        );

        await second.start("/home");
        await second.navigate(standingOn);

        getRoutesApi(second).remove(target);

        expect(getRoutesApi(second).has(target)).toBe(inside(standingOn));

        second.dispose();
      }
    },
  );

  it("replace preserves external guards, clears definition guards", async () => {
    const router = createFixtureRouter();
    const routesApi = getRoutesApi(router);
    const lifecycle = getLifecycleApi(router);

    routesApi.update("admin.settings", {
      canActivate: () => () => false,
    });

    lifecycle.addActivateGuard("admin.dashboard", () => () => false);

    await router.start("/");

    expect(router.canNavigateTo("admin.settings")).toBe(false);
    expect(router.canNavigateTo("admin.dashboard")).toBe(false);

    routesApi.replace([
      { name: "home", path: "/" },
      {
        name: "admin",
        path: "/admin",
        children: [
          { name: "dashboard", path: "/" },
          { name: "settings", path: "/settings" },
        ],
      },
    ]);

    expect(router.canNavigateTo("admin.settings")).toBe(true);
    expect(router.canNavigateTo("admin.dashboard")).toBe(false);

    router.stop();
  });
});
