import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * The plugin's `isPlainBag` mirror answers what core's answers (#2282).
 *
 * `validators/dependencies.ts` carries a copy of core's predicate, and its own
 * docblock says it "has to stay one" — the contract is `plugin ⊇ core`: the
 * plugin may diagnose more, never refuse what core accepts. So a shape core
 * refuses must be refused here too, or the copies have parted.
 *
 * ⚠ The gate decides by reading the PROTOTYPE, which a `Proxy` traps. One lie
 * used to walk an array through both copies at once — this file pins the mirror
 * half; `packages/core/tests/functional/plain-bag-door-parity-2243.test.ts`
 * pins core's two doors.
 */
type Deps = Record<string, unknown>;

const ROUTES = [{ name: "home", path: "/home" }];

function routerWithPlugin(): Router<Deps> {
  const router = createRouter<Deps>(ROUTES);

  router.usePlugin(validationPlugin());

  return router;
}

const lyingArray = (): Deps =>
  new Proxy(["a", "b"] as unknown as Deps, {
    getPrototypeOf: () => Object.prototype,
  });

describe("the plugin's isPlainBag mirror (#2282)", () => {
  it("refuses an array hiding behind a lying prototype", () => {
    const deps = getDependenciesApi(routerWithPlugin());

    // ⚠ Asserting the MESSAGE, not merely a throw: core's own
    // `guardDependencyShape` refuses this value one layer down, so a bare
    // `toThrow` stays green with the mirror term removed and pins nothing. What
    // the mirror buys is the refusal arriving from THIS door, named.
    expect(() => {
      deps.setAll(lyingArray());
    }).toThrow(/\[router\.setDependencies\].*plain object/);

    expect(deps.getAll()).toStrictEqual({});
  });

  // CONTROL — the bare array is refused too, so the cell above is about the LIE
  // rather than about proxies or arrays on their own.
  it("CONTROL — the same array bare is refused", () => {
    const deps = getDependenciesApi(routerWithPlugin());

    expect(() => {
      deps.setAll(["a", "b"] as unknown as Deps);
    }).toThrow(TypeError);
  });

  // CONTROL — a Proxy that tells no lie is refused as well.
  it("CONTROL — a Proxy over the array without the lie is refused", () => {
    const deps = getDependenciesApi(routerWithPlugin());

    expect(() => {
      deps.setAll(new Proxy(["a", "b"] as unknown as Deps, {}));
    }).toThrow(TypeError);
  });

  // ⚑ The SAME lie on the navigate door, where it laundered rather than walked
  // through: the shape guard reads the prototype and is fooled, `adoptChannel`
  // then SPREADS the array into a genuine plain object, and `isParams` — which
  // does carry an `Array.isArray` term — sees nothing wrong with the copy.
  it("refuses a lying array on the navigate params bag", async () => {
    const router = createRouter<Deps>([
      { name: "h", path: "/h" },
      { name: "p", path: "/p" },
    ]);

    router.usePlugin(validationPlugin());

    await router.start("/h");

    // ⚠ A SYNCHRONOUS throw, matching the bare-array control below: the shape
    // half runs on the facade, before any transition exists (P1).
    expect(() => router.navigate("p", lyingArray() as never)).toThrow(
      TypeError,
    );

    expect(router.getState()?.name).toBe("h");
  });

  // CONTROL — the bare array is refused on that door already, so the cell above
  // is about the lie. Without it the pair reads as "arrays are refused", which
  // was true before the fix too.
  it("CONTROL — the bare array is refused on the navigate door", async () => {
    const router = createRouter<Deps>([
      { name: "h", path: "/h" },
      { name: "p", path: "/p" },
    ]);

    router.usePlugin(validationPlugin());

    await router.start("/h");

    expect(() => router.navigate("p", ["a", "b"] as never)).toThrow(TypeError);
  });

  // ⚑ `isActiveRoute` is the shape guard's OWN door — the copy that launders
  // does not run on a predicate, so without the array term here the lie is not
  // refused but silently ANSWERED `false`, while the bare array throws.
  it("isActiveRoute refuses the lie as it refuses the bare array", () => {
    const router = routerWithPlugin();

    expect(() => router.isActiveRoute("home", lyingArray() as never)).toThrow(
      /\[router\.isActiveRoute\].*plain object/,
    );

    expect(() => router.isActiveRoute("home", ["a", "b"] as never)).toThrow(
      /\[router\.isActiveRoute\].*plain object/,
    );

    // CONTROL — a sound bag still ANSWERS rather than throwing, so the door is
    // still a predicate.
    expect(router.isActiveRoute("home", { x: "1" })).toBe(false);
  });

  // ⚑ `makeState` is core's COPY door, and the term there is not a gate: it stops
  // `adoptChannel` LAUNDERING the lying array into a genuine `{0:…,1:…}`. With
  // the laundering the plugin's own `isParams` — which does carry an array term
  // — is handed an ordinary object and finds nothing wrong. Without it the proxy
  // survives to that check and is refused.
  //
  // ⚠ Bare core does NOT refuse it, and must not: an array as a params bag is
  // degraded rather than rejected there, which `CLAUDE.md` § Supported Input
  // Shapes owns. The control below pins that half.
  it("makeState refuses the laundered array once the plugin is installed", () => {
    const router = routerWithPlugin();

    expect(() =>
      getPluginApi(router).makeState(
        "home",
        lyingArray() as never,
        {},
        "/home",
      ),
    ).toThrow(TypeError);
  });

  it("CONTROL — bare core still DEGRADES on the same value, by policy", () => {
    const bare = createRouter<Deps>(ROUTES);
    const state = getPluginApi(bare).makeState(
      "home",
      lyingArray() as never,
      {},
      "/home",
    );

    expect(state.params).toStrictEqual({ "0": "a", "1": "b" });
  });

  // CONTROL — the door still accepts what core accepts. Without this the cells
  // above are satisfied by a mirror that refuses everything, which is the
  // `plugin ⊇ core` false-reject of #1224 / #1225.
  it("CONTROL — a plain bag, and a Proxy over one, still land", () => {
    const deps = getDependenciesApi(routerWithPlugin());

    deps.setAll({ a: 1 });

    expect(deps.getAll()).toStrictEqual({ a: 1 });

    const other = getDependenciesApi(routerWithPlugin());

    other.setAll(new Proxy({ b: 2 }, {}));

    expect(other.getAll()).toStrictEqual({ b: 2 });
  });
});
