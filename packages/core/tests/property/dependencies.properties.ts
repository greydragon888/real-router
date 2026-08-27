import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  createFixtureRouter,
  arbParamKey,
  arbParamValue,
  NUM_RUNS,
} from "./helpers";

import type { DependenciesApi } from "@real-router/core/api";

type AnyDepsApi = DependenciesApi<Record<string, unknown>>;

function getTypedDepsApi(): { deps: AnyDepsApi } {
  const router = createFixtureRouter();
  const deps = getDependenciesApi(router) as unknown as AnyDepsApi;

  return { deps };
}

describe("getDependenciesApi CRUD Properties", () => {
  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "set → has: after set(name, value), has(name) === true",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);

      expect(deps.has(name)).toBe(true);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "set → get: after set(name, value), get(name) === value",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);

      expect(deps.get(name)).toBe(value);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "remove → has: after remove(name), has(name) === false",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);
      deps.remove(name);

      expect(deps.has(name)).toBe(false);
    },
  );

  test.prop(
    [
      fc
        .array(
          fc.tuple(
            arbParamKey.filter(
              (k) =>
                k !== "__proto__" && k !== "constructor" && k !== "prototype",
            ),
            arbParamValue,
          ),
          { minLength: 1, maxLength: 5 },
        )
        .map((entries) => Object.fromEntries(entries)),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "setAll → getAll: setAll(deps) means getAll() contains all pairs",
    (depsMap) => {
      const { deps } = getTypedDepsApi();

      deps.setAll(depsMap);

      const all = deps.getAll();

      for (const [key, value] of Object.entries(depsMap)) {
        expect(all[key]).toBe(value);
      }
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "idempotent set: set(name, value) twice does not break",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);
      const before = deps.get(name);

      deps.set(name, value);

      expect(deps.get(name)).toBe(before);
    },
  );

  // The store-level idempotency above (Object.is semantics) holds for NaN too,
  // but it can't exercise the `bothAreNaN` special case in setDependency: that
  // case only suppresses the validator's overwrite WARNING (validation-plugin-
  // gated) — the store writes NaN regardless. `arbParamValue` also never emits
  // NaN. So a focused unit with a mock validator is the right probe.
  it("NaN idempotency: re-setting NaN over NaN suppresses the overwrite warning (bothAreNaN)", () => {
    const router = createFixtureRouter();
    const deps = getDependenciesApi(router) as unknown as AnyDepsApi;

    const overwriteWarnings: string[] = [];

    // set() calls several validator.dependencies hooks (validateSetDependencyArgs,
    // validateDependencyCount, warnOverwrite, …). Stub them all as no-ops via a
    // Proxy and record only warnOverwrite — the bothAreNaN signal under test.
    const dependenciesValidator = new Proxy(
      {
        warnOverwrite: (name: string) => {
          overwriteWarnings.push(name);
        },
      } as Record<string, (...args: unknown[]) => unknown>,
      {
        get: (target, prop: string) => target[prop] ?? (() => undefined),
      },
    );

    getInternals(router).validator = {
      dependencies: dependenciesValidator,
    } as never;

    // NaN over NaN looks like a change (NaN !== NaN) but `bothAreNaN` suppresses
    // the overwrite warning — idempotent.
    deps.set("k", Number.NaN);
    // eslint-disable-next-line sonarjs/no-element-overwrite -- re-setting the same key IS the idempotency under test
    deps.set("k", Number.NaN);

    expect(overwriteWarnings).toStrictEqual([]);

    // A genuine value change DOES warn — proves the suppression is NaN-specific
    // (not a blanket "never warn").
    deps.set("k", 1);
    // eslint-disable-next-line sonarjs/no-element-overwrite -- intentional overwrite with a different value
    deps.set("k", 2);

    expect(overwriteWarnings).toContain("k");
  });

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "reset → has: after reset(), has(name) === false for all",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);
      deps.reset();

      expect(deps.has(name)).toBe(false);
    },
  );

  test.prop([arbParamKey, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "getAll returns a copy, not the internal object",
    (name, value) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, value);

      const all1 = deps.getAll();
      const all2 = deps.getAll();

      expect(all1).not.toBe(all2);
      expect(all1).toStrictEqual(all2);
    },
  );

  test.prop([arbParamKey], { numRuns: NUM_RUNS.fast })(
    "set undefined is a no-op: has(name) remains false",
    (name) => {
      const { deps } = getTypedDepsApi();

      deps.set(name, undefined);

      expect(deps.has(name)).toBe(false);
    },
  );
});

describe("A dependency NAME is read once (#1843)", () => {
  /**
   * The store `set`/`remove` produce for a name whose `toString` walks
   * `answers`, one entry per read.
   *
   * ⚠ The generator filters the OUTER tuple for distinctness rather than
   * `.filter`ing an inner constant inside a `.chain` — that shape is an
   * unsatisfiable filter and hangs fast-check rather than shrinking.
   */
  const arbTwoDistinctKeys = fc
    .tuple(arbParamKey, arbParamKey)
    .filter(([a, b]) => a !== b);

  const runDoor = (
    door: "set" | "remove",
    answers: readonly string[],
    seed: Readonly<Record<string, unknown>>,
    value: unknown,
  ): Record<string, unknown> => {
    const { deps } = getTypedDepsApi();

    for (const [k, v] of Object.entries(seed)) {
      deps.set(k, v);
    }

    let reads = 0;
    const name = {
      toString() {
        const out = answers[Math.min(reads, answers.length - 1)];

        reads += 1;

        return out;
      },
    } as unknown as string;

    if (door === "set") {
      deps.set(name, value);
    } else {
      deps.remove(name);
    }

    return deps.getAll();
  };

  test.prop([arbTwoDistinctKeys, arbParamValue, arbParamValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "set: a drifting name acts exactly as its FIRST read, on both arms",
    ([first, second], seeded, written) => {
      // Both arms of the `hasOwn` branch, taken by which key is present:
      // `first` seeded → OVERWRITE arm; `second` seeded → new-key arm.
      for (const seed of [{ [first]: seeded }, { [second]: seeded }]) {
        const drifting = runDoor(
          "set",
          [first, second, second, second],
          seed,
          written,
        );
        const plain = runDoor("set", [first], seed, written);

        expect(drifting).toStrictEqual(plain);
      }
    },
  );

  test.prop([arbTwoDistinctKeys, arbParamValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "remove: a drifting name deletes exactly what its FIRST read names",
    ([first, second], seeded) => {
      const seed = { [first]: seeded, [second]: seeded };
      const drifting = runDoor("remove", [first, second, second], seed, 0);
      const plain = runDoor("remove", [first], seed, 0);

      expect(drifting).toStrictEqual(plain);
    },
  );

  it("CONTROL — the property discriminates: a SECOND read changes the answer", () => {
    // Without this cell the two properties above could be vacuous — a name that
    // is never read twice satisfies them trivially. Here the pre-fix behaviour
    // is reproduced by hand on a bare object, and it differs.
    const target: Record<string, unknown> = { a: 1 };
    const answers = ["a", "b", "b"];
    let reads = 0;
    const name = {
      toString() {
        const out = answers[Math.min(reads, answers.length - 1)];

        reads += 1;

        return out;
      },
    } as unknown as string;

    // The shape `setDependency` had before #1843: check one read, write another.
    if (Object.hasOwn(target, name)) {
      target[name] = 99;
    }

    expect(target).toStrictEqual({ a: 1, b: 99 });
    expect(reads).toBe(2);
  });
});

describe("the three dependency doors agree (#1860, #1861)", () => {
  /**
   * `createRouter`, `cloneRouter` and `setAll` all take a dependency bag from
   * the caller, and until #1860 they applied three different rules. The table in
   * `tests/functional/dependency-door-parity-1860.test.ts` asserts that per
   * shape; this states it as one invariant over generated bags, which is what
   * makes it a rule rather than a list of cases.
   *
   * ⚠ The base router for the clone arm carries NO dependencies of its own, so
   * the three stores are comparable by equality rather than by containment.
   */
  const ROUTES = [{ name: "home", path: "/home" }];

  /**
   * ⚠ Read back through `has` / `get`, NOT `getAll()`. `getAll()` withholds
   * `"__proto__"` at every door (#1823), so comparing its output is blind to the
   * one key the hazard generator exists for — measured: with `getAll()` this
   * property survived the mutation that drops `putField` from `cloneRouter`'s
   * merge, which is precisely the `"__proto__"` divergence. `has`/`get` see the
   * store itself.
   */
  const readBack = (
    api: AnyDepsApi,
    keys: readonly string[],
  ): Record<string, unknown> => {
    const seen: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;

    for (const key of keys) {
      seen[key] = api.has(key) ? api.get(key) : "<<absent>>";
    }

    return seen;
  };

  const storeFrom = (
    door: "createRouter" | "cloneRouter" | "setAll",
    bag: Record<string, unknown>,
  ): Record<string, unknown> => {
    const keys = Object.keys(bag);

    if (door === "createRouter") {
      const router = createRouter(ROUTES as never, {}, bag as never);

      try {
        return readBack(
          getDependenciesApi(router) as unknown as AnyDepsApi,
          keys,
        );
      } finally {
        router.dispose();
      }
    }

    if (door === "cloneRouter") {
      const base = createRouter(ROUTES as never);
      const clone = cloneRouter(base, bag as never);

      try {
        return readBack(
          getDependenciesApi(clone) as unknown as AnyDepsApi,
          keys,
        );
      } finally {
        clone.dispose();
        base.dispose();
      }
    }

    const router = createRouter(ROUTES as never);
    const api = getDependenciesApi(router) as unknown as AnyDepsApi;

    try {
      api.setAll(bag);

      return readBack(api, keys);
    } finally {
      router.dispose();
    }
  };

  /**
   * ⚠ `arbParamKey` alone leaves this property nearly inert, and mutation is what
   * said so: removing `setAll`'s structural check reds the getter property below
   * and NOT this one, because an ordinary dictionary lands the same way with or
   * without a guard. The axes on which the doors CAN diverge are the hazard keys
   * — `"__proto__"` above all, whose destination differs per door — and
   * `undefined` values, which one door used to treat as a removal marker. The
   * generator names them explicitly rather than hoping `stringMatching` produces
   * one.
   */
  const arbHazardKey = fc.constantFrom(
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  );

  const arbBag = fc.dictionary(
    fc.oneof(arbParamKey, arbHazardKey),
    fc.oneof(arbParamValue, fc.constant(undefined)),
  );

  test.prop([arbBag], {
    numRuns: NUM_RUNS.standard,
  })("a plain bag lands identically at every door", (bag) => {
    const fromConstructor = storeFrom("createRouter", bag);

    expect(storeFrom("cloneRouter", bag)).toStrictEqual(fromConstructor);
    expect(storeFrom("setAll", bag)).toStrictEqual(fromConstructor);
  });

  test.prop([arbBag, fc.oneof(arbParamKey, arbHazardKey)], {
    numRuns: NUM_RUNS.standard,
  })("an own enumerable getter is refused at every door", (bag, victim) => {
    const withGetter: Record<string, unknown> = { ...bag };
    let invoked = 0;

    Object.defineProperty(withGetter, victim, {
      get() {
        invoked += 1;

        return "FROM-GETTER";
      },
      enumerable: true,
      configurable: true,
    });

    for (const door of ["createRouter", "cloneRouter", "setAll"] as const) {
      expect(() => storeFrom(door, withGetter)).toThrow(TypeError);
    }

    expect(invoked, "no door may run the caller's code").toBe(0);
  });
});
