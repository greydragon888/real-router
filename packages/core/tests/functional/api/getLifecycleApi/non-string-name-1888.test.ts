import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getLifecycleApi } from "@real-router/core/api";

/**
 * The four guard doors refuse a non-string route name (#1888).
 *
 * They are the only doors in the route-name family that fail OPEN: a `Map` key
 * is compared by SameValueZero, so an object was stored under its own identity
 * and no later string lookup reached it — while the reporting path coerced, so
 * `get(name)` answered that the guard exists.
 *
 * ⚑ The `@@` half of `assertNoInternalRouteName` is deliberately NOT borrowed
 * here: guarding a system route is a declared capability, pinned below.
 */
describe("the guard doors refuse a non-string route name (#1888)", () => {
  const ADD_DOORS = ["addActivateGuard", "addDeactivateGuard"] as const;
  const REMOVE_DOORS = [
    "removeActivateGuard",
    "removeDeactivateGuard",
  ] as const;
  const DOORS = [...ADD_DOORS, ...REMOVE_DOORS];

  const NON_STRINGS: readonly (readonly [string, unknown])[] = [
    ["a bag whose toString names a route", { toString: () => "u" }],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
  ];

  /** One named cell per door x non-string, so a failure says WHICH pair. */
  const CELLS = DOORS.flatMap((door) =>
    NON_STRINGS.map(([label, name]) => [door, label, name] as const),
  );

  const routes = () => [
    { name: "u", path: "/u" },
    { name: "home", path: "/home" },
  ];
  const deny = () => () => false;

  it("CONTROL — neither table can shrink to nothing in silence", () => {
    // Each list that indexes an `it.each` needs its own threshold — a parent's
    // non-emptiness is not inherited (`table-vacuity-authority`).
    expect(ADD_DOORS).toHaveLength(2);
    expect(REMOVE_DOORS).toHaveLength(2);
    expect(DOORS).toHaveLength(4);
    expect(NON_STRINGS).toHaveLength(4);
    expect(CELLS).toHaveLength(16);
  });

  it.each(CELLS)("%s refuses %s", (door, _label, name) => {
    const router = createRouter(routes());
    const lifecycle = getLifecycleApi(router);

    expect(() => {
      (lifecycle[door] as (n: unknown, h?: unknown) => void)(name, deny);
    }).toThrow(
      new TypeError(
        `[router.${door}] Route name must be a string, got ${typeof name}`,
      ),
    );

    router.dispose();
  });

  it.each(ADD_DOORS)(
    "CONTROL — %s still installs a guard that RUNS",
    async (door) => {
      const router = createRouter(routes());

      getLifecycleApi(router)[door]("u", deny);

      const leaving = door === "addDeactivateGuard";

      await router.start(leaving ? "/u" : "/home");

      await expect(router.navigate(leaving ? "home" : "u")).rejects.toThrow();

      router.dispose();
    },
  );

  it.each(REMOVE_DOORS)(
    "CONTROL — %s still takes a guard away",
    async (door) => {
      const router = createRouter(routes());
      const lifecycle = getLifecycleApi(router);
      const leaving = door === "removeDeactivateGuard";

      lifecycle[leaving ? "addDeactivateGuard" : "addActivateGuard"]("u", deny);
      lifecycle[door]("u");

      await router.start(leaving ? "/u" : "/home");

      await expect(
        router.navigate(leaving ? "home" : "u"),
      ).resolves.toBeDefined();

      router.dispose();
    },
  );

  it("CONTROL — the base and its clone agree about the guard", async () => {
    const base = createRouter(routes());

    getLifecycleApi(base).addActivateGuard("u", deny);

    const clone = cloneRouter(base);

    await base.start("/home");
    await clone.start("/home");

    await expect(base.navigate("u")).rejects.toThrow();
    await expect(clone.navigate("u")).rejects.toThrow();

    base.dispose();
    clone.dispose();
  });

  it("a refused registration runs no application code", () => {
    // What the fix TOOK AWAY: the door used to accept the name, then compile the
    // guard — so the caller's factory ran for a registration that could never
    // take effect. It is refused before anything is compiled now.
    const router = createRouter(routes());
    let factoryRuns = 0;

    expect(() => {
      getLifecycleApi(router).addActivateGuard(
        { toString: () => "u" } as never,
        () => {
          factoryRuns += 1;

          return deny();
        },
      );
    }).toThrow(TypeError);

    expect(factoryRuns).toBe(0);

    // CONTROL — a string name still compiles the factory.
    getLifecycleApi(router).addActivateGuard("u", () => {
      factoryRuns += 1;

      return deny();
    });

    expect(factoryRuns).toBe(1);

    router.dispose();
  });

  it("CONTROL — a system @@ name is still accepted, on both add doors", () => {
    const router = createRouter(routes());
    const lifecycle = getLifecycleApi(router);

    expect(() => {
      lifecycle.addActivateGuard("@@router/UNKNOWN_ROUTE", false);
      lifecycle.addDeactivateGuard("@@notFound", true);
    }).not.toThrow();

    router.dispose();
  });
});
