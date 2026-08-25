import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

/**
 * A bag that reports own-ness for a key it does not own cannot put that key
 * into a committed state (#1854).
 *
 * `Object.hasOwn` was the gate, and it is not one: it is `[[GetOwnProperty]]`,
 * which on a Proxy is the `getOwnPropertyDescriptor` TRAP — and the caller of
 * `hasOwn` chooses the key, so the trap is asked about one it may lie about.
 * The Proxy invariants permit exactly that while the target is extensible and
 * the descriptor is `configurable`.
 *
 * ⚑ Not a hypothetical shape. Svelte 5's `$props()` reports own-ness for a key
 * only its prototype has, on every `RouteView` render (#1853) — nobody writes a
 * Proxy, the framework does.
 *
 * The observable damage is a state that contradicts its own URL: the key
 * reached `state.params` while `state.path` printed without it, which is the
 * invariant class this repo has consistently labelled a bug (#1553 / #1554 /
 * #1812).
 */
function lyingBag<T extends object>(own: T, inherited: object): T {
  return new Proxy(Object.assign(Object.create(inherited), own) as T, {
    getOwnPropertyDescriptor(target, key) {
      const value = (target as Record<string | symbol, unknown>)[key];

      return value === undefined
        ? undefined
        : { value, enumerable: true, configurable: true, writable: true };
    },
  });
}

const ROUTES = [{ name: "a", path: "/a/:id?tab" }];

describe("a lying own-ness trap cannot reach a committed state (#1854)", () => {
  it("CONTROL — the trap really does lie, and an honest bag really does inherit", () => {
    // Without this the cells below could pass because the fixture is inert.
    const lying = lyingBag({ id: "1" }, { leaked: "L" });
    const honest = Object.assign(Object.create({ leaked: "L" }), { id: "1" });

    expect({
      trapClaimsOwn: Object.hasOwn(lying, "leaked"),
      ownKeysDoesNot: Object.keys(lying),
      honestReadsThrough: (honest as { leaked?: string }).leaked,
      honestOwnKeys: Object.keys(honest),
    }).toStrictEqual({
      trapClaimsOwn: true,
      ownKeysDoesNot: ["id"],
      honestReadsThrough: "L",
      honestOwnKeys: ["id"],
    });
  });

  it("navigate — neither channel admits the key, and the state matches its URL", async () => {
    const router = createRouter(ROUTES, {});

    await router.start("/a/0");

    const state = await router.navigate(
      "a",
      lyingBag({ id: "2" }, { leaked: "L" }),
      lyingBag({ tab: "y" }, { leaked: "L" }),
    );

    expect({
      params: state.params,
      search: state.search,
      path: state.path,
    }).toStrictEqual({
      params: { id: "2" },
      search: { tab: "y" },
      path: "/a/2?tab=y",
    });

    router.dispose();
  });

  it("buildPath — the URL carries nothing the caller did not own", () => {
    const router = createRouter(ROUTES, {});

    expect(
      router.buildPath(
        "a",
        lyingBag({ id: "1" }, { leaked: "L" }),
        lyingBag({ tab: "x" }, { leaked: "L" }),
      ),
    ).toBe("/a/1?tab=x");

    router.dispose();
  });

  it("a route's own defaultParams is the SIBLING door, and it was live too", async () => {
    // ⚑ Found by probing this door, not by reasoning from the one above: a
    // route's default bag is application data the app still holds, and it does
    // NOT arrive through the channel entry guard. Measured before the fix:
    // `state.params` carried `leaked` while `state.path` printed `/a/D`.
    const router = createRouter(
      [
        {
          name: "d",
          path: "/d/:id",
          defaultParams: lyingBag({ id: "D" }, { leaked: "L" }),
        },
      ],
      {},
    );

    await router.start("/d/1");

    const state = await router.navigate("d", {});

    expect({ params: state.params, path: state.path }).toStrictEqual({
      params: { id: "D" },
      path: "/d/D",
    });

    router.dispose();
  });

  it("CONTROL — an ordinary bag and an ordinary default still work", async () => {
    const router = createRouter(
      [{ name: "d", path: "/d/:id?tab", defaultParams: { id: "D" } }],
      {},
    );

    await router.start("/d/1");

    const defaulted = await router.navigate("d", {});
    const explicit = await router.navigate("d", { id: "9" }, { tab: "t" });

    expect({
      defaulted: [defaulted.params, defaulted.path],
      explicit: [explicit.params, explicit.search, explicit.path],
    }).toStrictEqual({
      defaulted: [{ id: "D" }, "/d/D"],
      explicit: [{ id: "9" }, { tab: "t" }, "/d/9?tab=t"],
    });

    router.dispose();
  });
});
