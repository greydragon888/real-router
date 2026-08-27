import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * The three doors that take a dependency bag from the caller (#1860 / #1861).
 *
 * `guardDependencies` is core's always-on structural check on such a bag, and it
 * had exactly ONE call site — the constructor. `cloneRouter` merged the caller's
 * argument into a fresh literal BEFORE the guard could see it (so the check was
 * structurally vacuous with respect to the value it was meant to judge), and
 * `setAll` never reached it at all.
 *
 * ⚠ These cells assert the doors AGAINST EACH OTHER, which is the point: the
 * asymmetry survived because every existing test exercises one door at a time.
 *
 * ⚑ The judge and the copier also used to be two separate walks of the same bag
 * (#1861). For a plain object that is invisible; for a `Proxy` it is not, because
 * `ownKeys` is a trap and a trap may answer differently on its second call — so a
 * key that appeared only on the copier's walk was installed unjudged.
 */
describe("every door that takes a dependency bag applies one rule (#1860, #1861)", () => {
  const ROUTES = [{ name: "home", path: "/home" }] as unknown as Route[];

  class Service {
    a = 1;

    method(): void {
      /* nothing */
    }
  }

  /** The three doors, each reduced to "hand it a bag → what does the store hold". */
  const DOORS = {
    createRouter: (bag: unknown): Record<string, unknown> => {
      const router = createRouter(ROUTES, {}, bag as never);
      const out = getDependenciesApi(router).getAll();

      router.dispose();

      return out as Record<string, unknown>;
    },
    cloneRouter: (bag: unknown): Record<string, unknown> => {
      const base = createRouter(ROUTES, {}, { boot: "B" });

      try {
        const clone = cloneRouter(base, bag as never);
        const out = getDependenciesApi(clone).getAll();

        clone.dispose();

        return out;
      } finally {
        base.dispose();
      }
    },
    setAll: (bag: unknown): Record<string, unknown> => {
      const router = createRouter(ROUTES);
      const deps = getDependenciesApi(router);

      try {
        deps.setAll(bag as never);

        return deps.getAll() as Record<string, unknown>;
      } finally {
        router.dispose();
      }
    },
  };

  const REFUSED = [
    ["a string", (): unknown => "hi"],
    ["an array", (): unknown => [1, 2]],
    ["a class instance", (): unknown => new Service()],
    ["a Map", (): unknown => new Map([["a", 1]])],
  ] as const;

  it("CONTROL — the tables below are not empty", () => {
    // `it.each([])` / `describe.each([])` register NO cells, in silence, so a
    // shrunk table reads exactly like a passing one. Counted outside the `each`,
    // per `table-vacuity-authority.test.ts`.
    expect(Object.keys(DOORS)).toHaveLength(3);
    expect(REFUSED).toHaveLength(4);
  });

  it("cloneRouter: an explicit undefined is ABSENCE, not a removal marker", () => {
    // ⚠ A behaviour change, and the one axis of this fix that is not about
    // refusing anything. The merge was `{ ...sourceDeps, ...dependencies }`,
    // so an explicit `undefined` from the caller overwrote the base's key with
    // `undefined` and the store's own skip then dropped BOTH — i.e. `undefined`
    // acted as "remove this inherited dependency" at exactly this one door.
    //
    // Core's rule is the opposite everywhere else, and it is written down:
    // *"a caller's explicit `undefined` means 'I said nothing'"* and *"a removal
    // marker does not count as 'filled'"* (#1550 / #1551), with
    // `set(name, undefined)` a documented no-op (INVARIANTS #8). The clone now
    // agrees with them. Measured on `origin/master`: `{keep: 1}` before,
    // `{boot: "B", keep: 1}` after.
    const base = createRouter(ROUTES, {}, { boot: "B", keep: 1 });
    // ⚠ The annotation is on the VARIABLE, not an assertion at the call. Written
    // as `{ boot: undefined } as never`, `lint --fix` strips the assertion — it
    // judges by the parameter, not by the literal's own inferred `undefined` —
    // and the file stops type-checking.
    const removalAttempt: Record<string, unknown> = { boot: undefined };
    const clone = cloneRouter(base, removalAttempt as never);

    expect(getDependenciesApi(clone).getAll()).toStrictEqual({
      boot: "B",
      keep: 1,
    });

    clone.dispose();
    base.dispose();
  });

  it("CONTROL — a defined value from the caller still beats the base's", () => {
    const base = createRouter(ROUTES, {}, { boot: "B" });
    const clone = cloneRouter(base, { boot: "OVERRIDDEN" });

    expect(getDependenciesApi(clone).getAll()).toStrictEqual({
      boot: "OVERRIDDEN",
    });

    clone.dispose();
    base.dispose();
  });

  it("the constructor asks the SHAPE twice, and that refuses a drifting prototype", () => {
    // ⚠ Not debt, and not a violation of the one-walk rule — the WALK happens
    // once (measured: `ownKeys` 1, `getPrototypeOf` 2). The second ask is
    // `Router`'s own early `guardDependencyShape`, which stays above
    // `guardRouteStructure` so "is this even an object" remains the first thing
    // a caller hears about. Its side effect is that both answers must pass, so a
    // `Proxy` lying about its prototype is refused in EITHER order — where a
    // single ask would admit the bag that lies on the first answer. Deleting the
    // early call to remove the "duplicate" would lose that.
    const drifting = (first: object, second: object): object => {
      let asks = 0;

      return new Proxy(
        { svc: 1 },
        {
          getPrototypeOf() {
            asks += 1;

            return asks === 1 ? first : second;
          },
        },
      );
    };

    expect(() =>
      createRouter(
        ROUTES,
        {},
        drifting(Object.prototype, Array.prototype) as never,
      ),
    ).toThrow("dependencies must be a plain object");
    expect(() =>
      createRouter(
        ROUTES,
        {},
        drifting(Array.prototype, Object.prototype) as never,
      ),
    ).toThrow("dependencies must be a plain object");

    // CONTROLS, so the cell cannot pass by refusing everything.
    const ok = createRouter(
      ROUTES,
      {},
      drifting(Object.prototype, Object.prototype) as never,
    );

    expect(getDependenciesApi(ok).getAll()).toStrictEqual({ svc: 1 });

    ok.dispose();

    expect(() =>
      createRouter(
        ROUTES,
        {},
        drifting(Array.prototype, Array.prototype) as never,
      ),
    ).toThrow("dependencies must be a plain object");
  });

  it("an own __proto__ still round-trips through the two NEW doors", () => {
    // The dependency store is `Object.create(null)`, so `"__proto__"` is an
    // ordinary key there and `set("__proto__", v)` is a supported call whose
    // value `has`/`get` return; `getAll()` is the door that withholds it on the
    // way out (#1823). Routing `cloneRouter` and `setAll` through the shared
    // primitive must not disturb any of that — and `cloneRouter`'s merge target
    // is an ORDINARY literal, where a bare `[[Set]]` would have swapped the
    // prototype instead of storing (#1852).
    const bag = {};

    Object.defineProperty(bag, "__proto__", {
      value: "P",
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const base = createRouter(ROUTES);
    const clone = cloneRouter(base, bag as never);
    const cloneDeps = getDependenciesApi(clone);

    expect(cloneDeps.has("__proto__" as never)).toBe(true);
    expect(cloneDeps.get("__proto__" as never)).toBe("P");
    expect(Object.hasOwn(cloneDeps.getAll(), "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(cloneDeps.getAll())).toBe(Object.prototype);

    clone.dispose();
    base.dispose();

    const router = createRouter(ROUTES);
    const deps = getDependenciesApi(router);

    deps.setAll(bag);

    expect(deps.has("__proto__" as never)).toBe(true);
    expect(deps.get("__proto__" as never)).toBe("P");

    router.dispose();
  });

  describe.each(Object.entries(DOORS))("%s", (_name, door) => {
    it.each(REFUSED)(
      "refuses %s, as the constructor always has",
      (_l, make) => {
        // Measured before the fix, per door: the constructor threw on all four,
        // while `cloneRouter` and `setAll` produced `{0:"h",1:"i"}`, `{0:1,1:2}`,
        // `{a:1}` (methods gone) and — the quiet one — `{}` for the Map, so every
        // dependency the caller passed vanished with no error at all.
        expect(() => door(make())).toThrow(TypeError);
      },
    );

    it("refuses an own enumerable getter without invoking it", () => {
      let invoked = 0;

      expect(() =>
        door({
          get g() {
            invoked += 1;

            return "FROM-GETTER";
          },
        }),
      ).toThrow(TypeError);

      expect(invoked, "the ban exists so caller code does not run here").toBe(
        0,
      );
    });

    it("CONTROL — a plain object still passes and still lands", () => {
      expect(door({ ok: 1 })).toMatchObject({ ok: 1 });
    });

    it("CONTROL — an undefined value is still not registered", () => {
      expect(
        Object.hasOwn(door({ ok: 1, skipped: undefined }), "skipped"),
      ).toBe(false);
    });

    it("installs nothing the single walk did not see (#1861)", () => {
      let walks = 0;
      let reads = 0;
      const bag = new Proxy(
        {},
        {
          ownKeys() {
            walks += 1;

            return walks === 1 ? [] : ["evil"];
          },
          getOwnPropertyDescriptor: () => ({
            value: "DATA",
            enumerable: true,
            configurable: true,
          }),
          get() {
            reads += 1;

            return "RAN";
          },
        },
      );

      const store = door(bag);

      expect(
        Object.hasOwn(store, "evil"),
        "the judge walked an empty set; nothing may be installed from a later one",
      ).toBe(false);
      expect(walks, "one ownKeys invocation, not two").toBe(1);
      expect(reads, "no key was vouched for, so no value may be read").toBe(0);
    });
  });
});
