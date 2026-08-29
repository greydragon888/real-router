import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

/**
 * #1858 — `guardDependencies` decided "is this a plain object?" by reading
 * `deps.constructor`, a key the CALLER owns. `constructor` is an ordinary
 * dependency name, so storing it made the router permanently un-clonable: every
 * door that rebuilds the bag and re-guards it refused the router's own
 * dependencies. The predicate now asks the PROTOTYPE, which an ordinary
 * dependency name cannot shadow.
 */
const ROUTES = [{ name: "a", path: "/a" }];

/**
 * ⚑ Returns the error's CLASS as well as its message. A helper that reports only
 * `"ok"` / `message` cannot tell the guard's own `TypeError` from a foreign
 * throw raised by the caller's own object, and every cell below would read the
 * same for both.
 */
const attempt = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
};

const REFUSED = "TypeError: dependencies must be a plain object";

describe("the plain-object guard judges the prototype (#1858)", () => {
  it("a dependency named `constructor` SURVIVES every rebuild door", () => {
    // ⚑ Survives, not merely "does not throw". An earlier version of this cell
    // asserted only that the doors did not reject, which a change silently
    // dropping the key from `mergedDeps` would have left green.
    const router = createRouter(ROUTES);
    const api = getDependenciesApi(router);

    api.set("constructor" as never, "V" as never);

    const clone = cloneRouter(router);

    expect(getDependenciesApi(clone).get("constructor" as never)).toBe("V");

    clone.dispose();

    const rebuilt = createRouter(ROUTES, {}, api.getAll());

    expect(getDependenciesApi(rebuilt).get("constructor" as never)).toBe("V");

    rebuilt.dispose();

    // A DIFFERENT value, so the cell can tell "the override was applied" from
    // "the source already had this pair" — with the same value it could not.
    const overridden = cloneRouter(router, { constructor: "W" });

    expect(getDependenciesApi(overridden).get("constructor" as never)).toBe(
      "W",
    );

    overridden.dispose();

    router.dispose();
  });

  it("CONTROL — the other reserved-looking names survive too", () => {
    // ⚠ `__proto__` used to be in this list and is now its own cell below: since
    // #1957 it is the one name that does NOT reach a clone.
    for (const name of ["toString", "valueOf", "hasOwnProperty", "ordinary"]) {
      const router = createRouter(ROUTES);
      const api = getDependenciesApi(router);

      api.set(name as never, "V" as never);

      const clone = cloneRouter(router);

      expect([
        name,
        getDependenciesApi(clone).get(name as never),
      ]).toStrictEqual([name, "V"]);

      clone.dispose();
      router.dispose();
    }
  });

  it("`__proto__` is held by the base and does NOT reach a clone (#1957)", () => {
    // The clone transport is `getCloneState().dependencies` — a container core
    // spreads out of the null-prototype store, on the published
    // `@real-router/core/validation` surface. A spread `[[Define]]`s, so the key
    // landed there as an own key and made that container a prototype-swap
    // primitive for anyone merging it; it is deleted now, exactly as `getAll()`
    // deletes it one door over (#1823).
    //
    // ⚠ The consequence is this cell, and it is the trade #1823 already took:
    // `getAll()` withholds the key from the container while `get()` still
    // answers, so preservation loses to the merge hazard. `UNSAFE_KEY`'s own
    // docblock records why the other direction was shipped once and reverted —
    // `Object.assign` drops the key even in the safe string case, so "the user's
    // data is kept" holds for exactly one hop.
    const router = createRouter(ROUTES);

    getDependenciesApi(router).set("__proto__" as never, "V" as never);

    const clone = cloneRouter(router);

    expect(getDependenciesApi(router).get("__proto__" as never)).toBe("V");
    expect(getDependenciesApi(clone).get("__proto__" as never)).toBeUndefined();

    clone.dispose();
    router.dispose();
  });

  it("accepts a null-prototype bag, which the old spelling refused", () => {
    const bag = Object.create(null) as Record<string, unknown>;

    bag.svc = "V";

    const router = createRouter(ROUTES, {}, bag as never);

    expect(getDependenciesApi(router).get("svc" as never)).toBe("V");

    router.dispose();
  });

  it("still accepts a bag built on another plain object", () => {
    // ⚑ The #1799 / #1823 shape. A `proto === Object.prototype` test would have
    // refused this at the door — which is also the spelling
    // `engine/validation/route-batch` uses for route objects, so the two guards
    // deliberately disagree. Those fixes rely on the bag REACHING the copy loop,
    // where the inherited key is dropped rather than the whole bag rejected.
    const bag = Object.assign(Object.create({ leaked: "LEAK" }), { real: 1 });

    const router = createRouter(ROUTES, {}, bag as never);
    const api = getDependenciesApi(router);

    expect(api.get("real" as never)).toBe(1);
    expect(api.get("leaked" as never)).toBeUndefined();

    router.dispose();
  });

  it("CONTROL — non-plain bags are refused, with the guard's own error", () => {
    class Service {
      a = 1;
    }

    for (const bag of [[1, 2], new Service(), new Map(), "abc", 7, null]) {
      expect(
        attempt(() => {
          createRouter(ROUTES, {}, bag as never).dispose();
        }),
      ).toBe(REFUSED);
    }
  });

  it("pins the forgery that is still OPEN, in both spellings", () => {
    // ⚠ Not a passing grade — a record. The predicate reads a `constructor` off
    // the prototype, and a prototype is something the caller can write to as
    // well. Both of these were accepted BEFORE this change and still are, so the
    // fix moved which object has to lie, not whether lying works.
    //
    // The cell exists so that a future reader does not mistake "judges the
    // prototype" for "cannot be forged", and so that closing it is a visible
    // decision rather than an accident.
    class Forged {
      a = 1;
    }

    Object.defineProperty(Forged.prototype, "constructor", {
      value: Object,
      writable: true,
      configurable: true,
    });

    expect(
      attempt(() => {
        createRouter(ROUTES, {}, new Forged() as never).dispose();
      }),
    ).toBe("ok");

    // The honest half: a prototype that lies the OTHER way is refused, so the
    // hole is one-directional.
    expect(
      attempt(() => {
        createRouter(
          ROUTES,
          {},
          Object.create({ constructor: "V" }) as never,
        ).dispose();
      }),
    ).toBe(REFUSED);
  });
});
