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

/**
 * A route-name segment `arbSegmentName` cannot produce: its pattern caps at 16
 * characters (`/^[a-zA-Z_]\w{0,15}$/`) and this is longer, so a name built from
 * it can never collide with a generated route.
 */
const GHOST_SEGMENT = "ghostSegmentThatCannotBeGenerated";

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
   * STRUCTURAL: two consecutive steps — `resetStore` →
   * `lifecycleNamespace.clearAll()` — with no try/catch, which hold together
   * only because no user code runs in them. There is no exception to test
   * against, so this asserts the observable instead: whatever the router had
   * before, afterwards the tree and the guards are consistently empty
   * **together**. Stronger than "clear → has" above, which only looks at the
   * tree.
   *
   * ⚑ It was THREE steps until #1749, the third being a shift of the committed
   * pair. That primitive was reachable from the published `./validation`
   * subpath and dropped a live router's state with no event, so it is gone —
   * and with it the only thing `clear()` did to the state. `current` is
   * `undefined` there by PRECONDITION (#1612 refuses a committed state), so the
   * shift only ever moved `previous`, which #1663 adjudicated a residue rather
   * than a contract. The state clause therefore inverts: `previous` must
   * SURVIVE, and that arm is what kills a re-introduction of the shift.
   *
   * If a callback ever lands in one of those two steps, partial application
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
      // keeps its `previousState`, and that is the axis the state clause below
      // discriminates on — it is the only shape where `clear()` could still
      // change a state cell.
      if (ran) {
        await router.start("/home");
        await router.navigate("search");
        router.stop();
      }

      const previousBeforeClear = router.getPreviousState()?.name;

      // ⚠ The state clause below compares `previous` across `clear()`, so it is
      // only non-vacuous while there IS one — and `stop()`'s shift, the only
      // thing that puts it there, is pinned by nothing else in the tier
      // (measured: removing it leaves the functional and property tiers green).
      // Assert the precondition here rather than let the comparison quietly
      // become `undefined === undefined`.
      expect(previousBeforeClear).toBe(ran ? "search" : undefined);

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

      // 2. the state — `clear()` does not touch it (#1749). `current` is
      // `undefined` by precondition, and `previous` must come through
      // UNCHANGED: re-introducing the shift makes it `undefined` on the `ran`
      // arm and reds this.
      expect(router.getState()).toBeUndefined();
      expect(router.getPreviousState()?.name).toBe(previousBeforeClear);

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
   * Class guard for #1757, asserted over GENERATED trees. The rule itself is
   * INVARIANTS row 20; what belongs here is the shape that broke it — four
   * sites derived the cleared set from the name STRING,
   * `n === name || n.startsWith(name + ".")`, instead of from what the splice
   * took out.
   *
   * ⚠ The domain SHRANK at #1763. The arm that made the two forms disagree was a
   * dotted LEAF (`{ name: "a.b" }` beside `{ name: "a" }`), and bare core
   * refuses that spelling now, so the generator can no longer produce it —
   * `dotted-leaf-names-1763.test.ts` pins the refusal instead.
   *
   * ⚠ For one release this docstring then claimed the surviving arms "still
   * discriminate" the string-vs-set choice. They do not, and that was measured:
   * with `arbSegmentName` yielding dotless segments and the TREE spelling every
   * full name, the prefix form and the splice's own report agree on every shape
   * this property can generate — widening `shouldClear` back to
   * `n === name || n.startsWith(name + ".")` left the property tier green while
   * reddening one functional cell. The block was a class guard in name only.
   *
   * Assertion 5 restores it. After #1763 a dotted name that is NOT a route can
   * come from exactly one place — the LIFECYCLE registry, the one registry
   * `add` / `replace` never gated — so that is the single shape where the two
   * candidate predicates still disagree, and the property now generates it.
   *
   * The other assertions stay independent of how the fix computes the set:
   * survivors keep their config, the event reports exactly what disappeared,
   * what disappeared is the tree-structural subtree, and the active-route
   * refusal obeys the same containment rule.
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
      // A node is either nested under its predecessor (so its FULL name is
      // dotted, built by the tree) or a separate top-level route (so its full
      // name is its own bare name). The dotted spelling is never WRITTEN — core
      // refuses it (#1763), and writing it is what the tree does.
      const bFull = nestB ? `${a}.${b}` : b;
      const cFull = nestC ? `${bFull}.${c}` : c;

      const cNode = {
        name: c,
        path: `/${c}`,
        defaultParams: { k: cFull },
      };
      const bNode = {
        name: b,
        path: `/${b}`,
        defaultParams: { k: bFull },
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

      const all = [a, bFull, cFull];
      const target = all[targetIndex];

      // The independent oracle: the subtree is a CONTAINMENT relation spelled by
      // `children`, never by the dots in the name.
      const inside = (name: string): boolean =>
        name === target ||
        (target === a && nestB && name === bFull) ||
        (target === a && nestB && nestC && name === cFull) ||
        (target === bFull && nestC && name === cFull);

      const payload: string[] = [];

      routesApi.subscribeChanges((event) => {
        if (event.op === "remove") {
          payload.push(...event.removedSubtree.map((route) => route.name));
        }
      });

      const before = all.filter((name) => routesApi.has(name));

      // A dotted name the tree does not hold, dot-prefixed by the target. Longer
      // than `arbSegmentName` can produce (16 chars), so it cannot collide with
      // a generated route however the three names land.
      const ghost = `${target}.${GHOST_SEGMENT}`;

      getLifecycleApi(router).addActivateGuard(ghost, () => () => false);

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

      // 5. THE cell where the two candidate predicates still disagree, and the
      //    only one left after #1763: an EXTERNAL guard held for a dotted name
      //    that is not a route. Clearing by prefix takes it with the removal;
      //    clearing by the splice's own report leaves it. Observed by
      //    materialising the name — `replace()` preserves external guards — and
      //    asking the predicate: `false` means the guard is still registered.
      let node: unknown = { name: GHOST_SEGMENT, path: `/${GHOST_SEGMENT}` };

      for (const segment of target.split(".").toReversed()) {
        node = { name: segment, path: `/${segment}`, children: [node] };
      }

      routesApi.replace([{ name: "home", path: "/home" }, node] as never);

      // ⚠ POSITIVE CONTROL, and not optional: `canNavigateTo` answers `false`
      // for a route that does not exist too, so without this the assertion
      // below would pass whenever the materialisation silently failed — green
      // for the wrong reason on every run.
      expect(routesApi.has(ghost)).toBe(true);
      expect(router.canNavigateTo(ghost)).toBe(false);

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
