import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

/**
 * The layer that JUDGES and the layer that SHIPS read the same value (#2134).
 *
 * ⚑ **Bare core is the control, and it is inside the assertion.** Every cell
 * compares the door's answer with the plugin installed against the same door
 * without it, so the table cannot go vacuous: a fixture that stopped reaching
 * the bag would agree trivially on both arms and the read counts beside it
 * would print zero.
 *
 * The bag answers `v1` on a key's first read and `v2`, `v3`, … after — so the
 * ordinal of the read that reaches the URL is legible in the URL itself.
 * Measured before the fix: `buildPath` shipped `/u/v3` with the plugin against
 * `/u/v1` without it, and `navigate` shipped `v4`. Core reads exactly once on
 * every door; the earlier reads are the plugin's, and the values it judged are
 * precisely the ones nothing shipped.
 *
 * ⚠ **`isActiveRoute` is a different question and is NOT in this table.** It
 * returns a boolean and ships no value out of the bag, so "judged ≠ shipped"
 * has nothing to name there. Its row lives with the read counts below, where
 * the defect is that the plugin runs the application's getter on a door where
 * bare core runs nothing.
 */
describe("judged and shipped are the same read (#2134)", () => {
  const ROUTES = [
    { name: "home", path: "/home" },
    { name: "u", path: "/u/:id?tab" },
  ];

  /** `v1` on the first read of a key, `v2` on the second, and so on. */
  const driftingBag = (): { bag: Record<string, unknown>; reads: number } => {
    const state = { reads: 0 };
    const bag = {};

    Object.defineProperty(bag, "id", {
      enumerable: true,
      configurable: true,
      get(): string {
        state.reads += 1;

        return `v${state.reads}`;
      },
    });

    return {
      bag: bag,
      get reads(): number {
        return state.reads;
      },
    };
  };

  const router = async (
    withPlugin: boolean,
  ): Promise<ReturnType<typeof createRouter>> => {
    const instance = createRouter(ROUTES as never);

    if (withPlugin) {
      instance.usePlugin(validationPlugin());
    }

    await instance.start("/home");

    return instance;
  };

  /** The door's answer and the number of caller reads it took to get there. */
  const measure = async (
    withPlugin: boolean,
    door: (
      instance: ReturnType<typeof createRouter>,
      bag: Record<string, unknown>,
    ) => unknown,
  ): Promise<{ answer: unknown; reads: number }> => {
    const instance = await router(withPlugin);
    const drifting = driftingBag();
    const answer = await door(instance, drifting.bag);

    instance.dispose();

    return { answer, reads: drifting.reads };
  };

  const DOORS: readonly (readonly [
    string,
    (
      instance: ReturnType<typeof createRouter>,
      bag: Record<string, unknown>,
    ) => unknown,
  ])[] = [
    [
      "buildPath",
      (instance, bag): string => instance.buildPath("u", bag as never),
    ],
    [
      "navigate",
      async (instance, bag): Promise<string> => {
        const state = await instance.navigate("u", bag as never);

        return state.path;
      },
    ],
    [
      "canNavigateTo",
      (instance, bag): boolean => instance.canNavigateTo("u", bag as never),
    ],
  ];

  it("each of the three producer doors answers the same with the plugin as without", async () => {
    const table: Record<string, { bare: unknown; withPlugin: unknown }> = {};

    for (const [name, door] of DOORS) {
      const bare = await measure(false, door);
      const withPlugin = await measure(true, door);

      table[name] = { bare: bare.answer, withPlugin: withPlugin.answer };
    }

    expect(table).toStrictEqual({
      buildPath: { bare: "/u/v1", withPlugin: "/u/v1" },
      navigate: { bare: "/u/v1", withPlugin: "/u/v1" },
      canNavigateTo: { bare: true, withPlugin: true },
    });
  });

  it("and reads the caller's bag the same number of times", async () => {
    const table: Record<string, { bare: number; withPlugin: number }> = {};

    for (const [name, door] of DOORS) {
      const bare = await measure(false, door);
      const withPlugin = await measure(true, door);

      table[name] = { bare: bare.reads, withPlugin: withPlugin.reads };
    }

    expect(table).toStrictEqual({
      buildPath: { bare: 1, withPlugin: 1 },
      navigate: { bare: 1, withPlugin: 1 },
      canNavigateTo: { bare: 1, withPlugin: 1 },
    });
  });

  it("a value the copy still cannot carry is refused — judged on the copy", async () => {
    // ⚑ The split moved the SHAPE check ahead of the copy and left the VALUES
    // behind it, so this is the cell that proves the second half still runs. A
    // function value survives `normalizeChannel` — it is neither `undefined`
    // nor the unsafe key — and reaches the validator inside core's own object.
    const instance = await router(true);

    expect(() =>
      instance.buildPath("u", { id: (): string => "x" } as never),
    ).toThrow(/params must be a plain object/);

    instance.dispose();
  });

  it("a polluted Object.prototype does not make the copy fail validation", async () => {
    // ⚠ The copy is a fresh `{}`, so it INHERITS from `Object.prototype` just as
    // the caller's bag did — the own-key skip in the value walk is still load
    // bearing after the split, and this is the only shape that reaches it now.
    // Before the split the skip was exercised by `Object.create(proto)`, which
    // the shape half now refuses one step earlier.
    // ⚠ Built BEFORE the pollution: `usePlugin` runs its own `for…in` over the
    // plugin object and refuses the inherited key, so polluting first fails the
    // fixture rather than the door under test.
    const instance = await router(true);
    const polluted = Object.prototype as unknown as Record<string, unknown>;

    polluted.ghost = Symbol("polluted");

    try {
      expect(instance.buildPath("u", { id: "7" })).toBe("/u/7");
    } finally {
      delete polluted.ghost;
      instance.dispose();
    }
  });

  it("`null` is refused by the shape half — the one bag with no prototype to ask", async () => {
    // ⚠ The shape half tests the PROTOTYPE, and `null` is the single value that
    // cannot be asked for one: `Object.getPrototypeOf(null)` raises a bare
    // `TypeError` naming neither the door nor the argument. Every other refused
    // shape answers with a prototype that is simply not `Object.prototype`.
    const instance = await router(true);

    expect(() => instance.buildPath("u", null as never)).toThrow(
      /params must be a plain object/,
    );

    instance.dispose();
  });

  it("a null-PROTOTYPE bag is accepted — absent is not the same as wrong", async () => {
    // ⚠ The shape half tests the prototype, and `null` is a legal answer:
    // `Object.create(null)` is what a dictionary-shaped bag looks like and
    // `isParams` has always taken it. Without this cell the predicate could
    // tighten to `proto !== Object.prototype` and refuse a bag core builds
    // itself, with the whole suite still green.
    const instance = await router(true);
    const bag = Object.create(null) as Record<string, unknown>;

    bag.id = "7";

    expect(instance.buildPath("u", bag as never)).toBe("/u/7");

    instance.dispose();
  });

  it("isActiveRoute reads the bag the same number of times as bare core", async () => {
    // ⚑ The door #2134 calls the sharper row, and it is a different shape from
    // the three above: it returns a boolean and ships no value out of the bag,
    // so there is nothing for a judged read to disagree with. What it must not
    // do is run the application's accessors where bare core runs none.
    //
    // ⚠ BOTH arms of the predicate, because bare core's own count is not one
    // number: an inactive link short-circuits before touching the bag, an
    // active one compares it. A cell on only the second would pass while every
    // inactive `<Link>` on the page still paid a read.
    const table: Record<string, { bare: number; withPlugin: number }> = {};

    for (const [label, active] of [
      ["inactive link", false],
      ["active link", true],
    ] as const) {
      for (const [arm, withPlugin] of [
        ["bare", false],
        ["withPlugin", true],
      ] as const) {
        const instance = await router(withPlugin);

        if (active) {
          await instance.navigate("u", { id: "7" });
        }

        const drifting = driftingBag();

        instance.isActiveRoute("u", drifting.bag as never);
        table[label] = { ...table[label], [arm]: drifting.reads };
        instance.dispose();
      }
    }

    expect(table).toStrictEqual({
      "inactive link": { bare: 0, withPlugin: 0 },
      "active link": { bare: 1, withPlugin: 1 },
    });
  });

  it("the plugin-API doors that take a bag answer the same too", async () => {
    // ⚑ The remainder of #2134: the doors the façade table does NOT cover.
    // `makeState` and `buildNavigationState` PRINT a URL out of the bag, so a
    // read the validator never saw reaches the caller — the same split verdict
    // the façade doors had, with a plugin author in place of an application.
    //
    // ⚠ `forwardState` is measured and deliberately absent. It hands the
    // container BACK rather than printing from it — by identity on a clean bag
    // (`handed-out-containers-1957`) — and on a non-forwarding route core reads
    // it zero times, so there is no shipped read to align a judged one with. A
    // copy there would trade that pinned identity for nothing.
    const table: Record<string, { bare: unknown; withPlugin: unknown }> = {};

    const doors: readonly (readonly [
      string,
      (api: Record<string, unknown>, bag: Record<string, unknown>) => unknown,
    ])[] = [
      [
        "makeState",
        (api, bag) =>
          (api.makeState as (...a: unknown[]) => { path: string })("u", bag, {})
            .path,
      ],
      [
        "buildNavigationState",
        (api, bag) =>
          (api.buildNavigationState as (...a: unknown[]) => { path: string })(
            "u",
            bag,
            {},
          ).path,
      ],
    ];

    for (const [name, call] of doors) {
      const cell: Record<string, unknown> = {};

      for (const [arm, withPlugin] of [
        ["bare", false],
        ["withPlugin", true],
      ] as const) {
        const instance = await router(withPlugin);
        const drifting = driftingBag();

        cell[arm] = call(getPluginApi(instance) as never, drifting.bag);
        instance.dispose();
      }

      table[name] = cell as { bare: unknown; withPlugin: unknown };
    }

    expect(table).toStrictEqual({
      makeState: { bare: "/u/v1", withPlugin: "/u/v1" },
      buildNavigationState: { bare: "/u/v1", withPlugin: "/u/v1" },
    });
  });

  it("a null-PROTOTYPE bag is copied too — the shipped read is still the judged one", async () => {
    // ⚠ `Object.create(null)` is a legal params bag, and the copy gate tests the
    // PROTOTYPE — so an arm that admitted only `Object.prototype` would leave
    // exactly this shape uncopied, judged on one read and printed from the next,
    // with the rest of this table still green.
    const drifting = (): Record<string, unknown> => {
      const bag = Object.create(null) as Record<string, unknown>;
      let seen = 0;

      Object.defineProperty(bag, "id", {
        enumerable: true,
        configurable: true,
        get: () => {
          seen += 1;

          return `v${seen}`;
        },
      });

      return bag;
    };

    const bare = await router(false);
    const withPlugin = await router(true);

    expect({
      bare: bare.buildPath("u", drifting() as never),
      withPlugin: withPlugin.buildPath("u", drifting() as never),
    }).toStrictEqual({ bare: "/u/v1", withPlugin: "/u/v1" });

    bare.dispose();
    withPlugin.dispose();
  });

  it("CONTROL — the instrument reaches the bag, so the cells above are not empty", async () => {
    // A fixture that stopped reaching the read would make both arms of every
    // cell agree at zero. Bare core must read, and the drift must be visible
    // when something reads twice.
    const drifting = driftingBag();

    expect(drifting.reads).toBe(0);
    expect(drifting.bag.id).toBe("v1");
    expect(drifting.bag.id).toBe("v2");
    expect(drifting.reads).toBe(2);

    const measured = await measure(false, DOORS[0][1]);

    expect(measured.reads).toBe(1);
  });
});
