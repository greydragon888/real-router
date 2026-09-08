// packages/core/tests/functional/options-ownership-1832.test.ts

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
  cloneRouter,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

/**
 * Core borrows the caller's options one level down, so it does not freeze them
 * (#1832).
 *
 * `OptionsNamespace` copies the TOP level of the caller's bag into a literal of
 * its own and freezes that. Everything one level down is the caller's object,
 * aliased by reference under the one-level copy model (#1958) — and core writes
 * to none of it.
 *
 * ⚠ The cells below are about the caller's OWN objects. What `getOptions()`
 * reports for them is the aliasing question #1958 settled, not this one.
 */
const ROUTES = [{ name: "u", path: "/u/:id" }];

class Bag {
  id = "1";
}

/** Shapes that used to sort into "frozen" and "not frozen" by `constructor`. */
function shapes(): [string, Record<string, unknown>][] {
  const nullProto = Object.create(null) as Record<string, unknown>;

  nullProto.id = "1";

  const nullProtoClaimingObject = Object.create(null) as Record<
    string,
    unknown
  >;

  nullProtoClaimingObject.id = "1";
  nullProtoClaimingObject.constructor = Object;

  return [
    ["a plain object", { id: "1" }],
    ["a null-prototype bag", nullProto],
    ["a null-prototype bag with an own constructor", nullProtoClaimingObject],
    ["a class instance", new Bag() as unknown as Record<string, unknown>],
    [
      "a bag whose own constructor is not Object",
      { id: "1", constructor: Array },
    ],
  ];
}

describe("core does not freeze what it borrows (#1832)", () => {
  it.each(shapes())("%s the caller passed stays writable", (_label, bag) => {
    const router = createRouter(ROUTES, { defaultParams: bag as never });

    expect(Object.isFrozen(bag)).toBe(false);
    expect(() => {
      bag.id = "999";
    }).not.toThrow();

    router.dispose();
  });

  it("a REFUSED construction leaves the caller's bag repairable", () => {
    // The door core throws from sits BELOW the options constructor, so a bag
    // frozen on the way in could not be repaired by the caller who had just
    // been told to repair it.
    const bag = { arrayFormat: "none" };

    expect(() =>
      createRouter(
        [
          { name: "a", path: "/a" },
          { name: "a", path: "/b" },
        ],
        { queryParams: bag as never },
      ),
    ).toThrow(/Duplicate route/);

    expect(() => {
      bag.arrayFormat = "brackets";
    }).not.toThrow();
  });

  it("CONTROL: the level core DOES own is still frozen", () => {
    const router = createRouter(ROUTES, { defaultParams: { id: "1" } });
    const opts = getPluginApi(router).getOptions();

    // Without this the cells above are satisfied by a core that froze nothing
    // at all, which is a different — and wrong — change.
    expect(Object.isFrozen(opts)).toBe(true);
    expect(() => {
      (opts as { defaultParams?: unknown }).defaultParams = {};
    }).toThrow(TypeError);

    router.dispose();
  });

  it("CONTROL: core never ASKS a bag for `constructor`, and copies it when the caller declared it", () => {
    // The old walk asked every nested bag for `constructor` to decide whether
    // to recurse — a read of a caller-controlled property, i.e. a call into
    // application code on a slot nobody thinks of as one. That is what this
    // control exists to catch, and it still catches it.
    //
    // ⚑ TWO arms since #2171, because adoption made the one-arm form ambiguous.
    // Copying a bag enumerates its own ENUMERABLE keys, so a caller who defines
    // `constructor` as enumerable data gets it copied like any other key — the
    // documented own-enumerable rule, and the same treatment `adoptForeignBag`
    // gives a published channel. A one-arm control could not tell that apart
    // from the depth-deciding walk it was written against, and would have
    // failed on the copy while the real defect stayed catchable.
    const probe = (enumerable: boolean): number => {
      let reads = 0;
      const bag = { id: "1" };

      Object.defineProperty(bag, "constructor", {
        configurable: true,
        enumerable,
        get() {
          reads += 1;

          return Object;
        },
      });

      createRouter(ROUTES, { defaultParams: bag as never }).dispose();

      return reads;
    };

    expect({
      // The arm that matters: core asks NOTHING for `constructor` on its own
      // initiative. A walk that decided recursion depth would read it here.
      hidden: probe(false),
      // Declared as data by the caller, so it is copied as data — once.
      declared: probe(true),
    }).toStrictEqual({ hidden: 0, declared: 1 });
  });
});

/**
 * The rule #1832 settles, applied to every door that takes an object from the
 * caller: core reads it, aliases it, and writes to none of it.
 *
 * ⚠ The census is BEHAVIOURAL, not a scan — a door that freezes through a
 * helper reds it just the same as one that calls `Object.freeze` inline.
 */
describe("CLASS GUARD: a door does not freeze what the caller handed in", () => {
  it("every door but one leaves the caller's object alone", async () => {
    const frozen: string[] = [];
    const check = (label: string, value: object): void => {
      if (Object.isFrozen(value)) {
        frozen.push(label);
      }
    };

    const routeDefaults = { id: "1" };
    const routeDefinition = {
      name: "u",
      path: "/u/:id",
      defaultParams: routeDefaults,
    };
    const router = createRouter([routeDefinition as never]);

    check("route definition", routeDefinition);
    check("a route's nested config", routeDefaults);

    const addedDefinition = { name: "v", path: "/v" };

    getRoutesApi(router).add([addedDefinition]);
    check("add() definition", addedDefinition);

    const dependencyValue = { svc: 1 };
    const dependenciesBag = { api: dependencyValue };

    getDependenciesApi(router).setAll(dependenciesBag);
    check("dependencies bag", dependenciesBag);
    check("a dependency value", dependencyValue);

    await router.start("/u/1");

    const params = { id: "2" };
    const search = { q: "1" };
    const opts = { replace: true };

    await router.navigate("u", params, search, opts);
    check("navigate params", params);
    check("navigate search", search);
    check("navigate opts", opts);

    const optionsBag = { defaultRoute: "u", defaultParams: { id: "1" } };
    const second = createRouter([{ name: "u", path: "/u/:id" }], optionsBag);

    check("the options bag", optionsBag);
    check("a nested options bag", optionsBag.defaultParams);

    // ⚑ The control is INSIDE the census: without it an empty `frozen` is
    // satisfied by a broken `check`, an emptied door list, or a door that never
    // ran — three ways to pass while measuring nothing.
    check("CONTROL", Object.freeze({ sentinel: true }));

    // Named, so a regression says WHICH door started writing to the caller.
    expect(frozen).toStrictEqual(["CONTROL"]);

    router.dispose();
    second.dispose();
  });

  it("EXCEPTION: usePlugin freezes the object its factory returned", () => {
    // ⚠ The one door that still writes to the caller's object, and it is not an
    // oversight: `teardown` is read LATE — from inside the unsubscribe closure,
    // not captured at registration like every event method beside it — so the
    // freeze is what makes "the teardown you registered is the one that runs"
    // true. Kept, declared, and measured here rather than left as a hole in the
    // census above; capturing `teardown` at registration would retire it (#2051).
    const plugin = { onStart: () => undefined, note: "mine" };
    const router = createRouter([{ name: "u", path: "/u" }]);

    router.usePlugin(() => plugin);

    expect(Object.isFrozen(plugin)).toBe(true);

    router.dispose();
  });

  describe("core knows where an adopted bag CAME from, weakly (#2148)", () => {
    // ⚑ Weak, and that word is the design. Core does not hold the application's
    // container — #2171 is what stopped it — so a strong field here would put it
    // back. Nothing routes through this: it exists so the validation layer can
    // tell an application that mutating its config after `createRouter` no longer
    // reaches the router.
    const ROUTES = [{ name: "u", path: "/u/:id" }];

    it("records the BAG arms and nothing else", () => {
      const params = { id: "1" };
      const search = { tab: "a" };
      const router = createRouter(
        ROUTES as never,
        {
          defaultParams: params,
          defaultSearch: search,
          // ⚠ Two slots that must NOT appear: `limits` is read to numbers at
          // construction and never again, and `queryParams` is not adopted at all
          // (#2171) — a late mutation of either changes no behaviour, so there is
          // nothing to report and nothing to remember.
          limits: { maxListeners: 5 },
          queryParams: { arrayFormat: "brackets" },
        } as never,
      );

      try {
        const origins = getInternals(router).getAdoptedOrigins();

        expect(
          Object.keys(origins).toSorted((a, b) => a.localeCompare(b)),
        ).toStrictEqual(["defaultParams", "defaultSearch"]);
        expect(origins.defaultParams?.deref()).toBe(params);
        expect(origins.defaultSearch?.deref()).toBe(search);
      } finally {
        router.dispose();
      }
    });

    it("records NOTHING for the callback arm", () => {
      // A function is called at the point of use, so there is no container a
      // mutation can silently detach from the router.
      const router = createRouter(ROUTES as never, {
        defaultParams: () => ({ id: "1" }),
      });

      try {
        expect(getInternals(router).getAdoptedOrigins()).toStrictEqual({});
      } finally {
        router.dispose();
      }
    });

    it("a clone of a router that set NEITHER slot records nothing either", () => {
      // ⚠ The arm the cell below does not reach, and it is a different exclusion.
      // When the caller passes no bag, the RESOLVED options carry core's own
      // `defaultOptions` value — a process-wide singleton, and unfrozen — so the
      // freeze test lets it through and only the identity test keeps it out.
      // Without this cell that test survives mutation: measured, removing it left
      // the whole suite green.
      const base = createRouter(ROUTES as never, {});

      try {
        const clone = cloneRouter(base);

        try {
          expect(getInternals(clone).getAdoptedOrigins()).toStrictEqual({});
        } finally {
          clone.dispose();
        }
      } finally {
        base.dispose();
      }
    });

    it("a CLONE records nothing, because it never held a caller bag", () => {
      // ⚠ Pinned rather than assumed: `cloneRouter` builds from the base's frozen
      // copies, so an SSR application cloning per request retains nothing through
      // this field — and reports nothing twice.
      const params = { id: "1" };
      const base = createRouter(ROUTES as never, {
        defaultParams: params,
      });

      try {
        const clone = cloneRouter(base);

        try {
          expect(getInternals(clone).getAdoptedOrigins()).toStrictEqual({});
          // CONTROL — the base DOES record one, so the empty clone above is the
          // clone's own shape and not a door that never records anything.
          expect(
            getInternals(base).getAdoptedOrigins().defaultParams?.deref(),
          ).toBe(params);
        } finally {
          clone.dispose();
        }
      } finally {
        base.dispose();
      }
    });
  });
});
