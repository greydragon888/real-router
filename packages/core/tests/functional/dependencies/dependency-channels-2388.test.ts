import { describe, expect, expectTypeOf, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";
import type { DiagnosticEventMap } from "@real-router/core/types";

/**
 * The dependency doors and `cloneRouter` on the check and diagnostic channels
 * (#2388), on a router with no plugin installed: what each position and kind
 * receives, and when.
 *
 * ⚑ `@real-router/validation-plugin` registers every consumer of a door at
 * once, so its suites cannot tell which consumer makes core read the record's
 * keys. The "lone consumer" cells below can: each registers one.
 */
type Deps = Record<string, unknown>;

const ROUTES = [{ name: "home", path: "/" }];

/** The resolved default of `limits.maxDependencies`. */
const MAX = 100;

const POSITIONS = [
  "getDependency:entry",
  "getDependency:value",
  "setDependency:entry",
  "setDependency:count",
  "setDependencies:entry",
  "setDependencies:count",
  "removeDependency:entry",
  "hasDependency:entry",
  "cloneRouter:entry",
] as const;

/**
 * The kinds `DiagnosticEventMap` names after the dependency doors. One named so
 * and missing from `KINDS` fails type-check in the counting cell below.
 */
type DependencyKind = Extract<
  keyof DiagnosticEventMap,
  `${string}DEPENDENC${string}`
>;

const KINDS = [
  "SET_DEPENDENCY_COUNT",
  "SET_DEPENDENCIES_COUNT",
  "SET_DEPENDENCY_OVERWRITE",
  "SET_DEPENDENCIES_OVERWRITE",
  "REMOVE_DEPENDENCY_MISSING",
] as const satisfies readonly DependencyKind[];

const make = (initial: Deps = {}) => {
  const router = createRouter<Deps>(ROUTES, {}, initial);

  return {
    router,
    deps: getDependenciesApi(router),
  };
};

type DepsApi = ReturnType<typeof make>["deps"];

/** Every position and kind of the step, into one log, in the order they run. */
const listenToAll = (router: Router<Deps>): unknown[][] => {
  const log: unknown[][] = [];
  const api = getPluginApi(router);

  for (const position of POSITIONS) {
    api.addCheck(position, (...args: unknown[]) => {
      log.push([position, ...args]);
    });
  }

  for (const kind of KINDS) {
    api.subscribeDiagnostic(kind, (...args: unknown[]) => {
      log.push([kind, ...args]);
    });
  }

  return log;
};

const codeOf = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
};

describe("#2388 — the dependency doors on the channels", () => {
  describe("what each position and kind receives", () => {
    it("set: a NEW key reaches its entry, then the count, with the count BEFORE the write", () => {
      const { router, deps } = make();
      const log = listenToAll(router);

      deps.set("fresh", 1);

      // The check runs before the report, so a refused write reports nothing.
      expect(log).toStrictEqual([
        ["setDependency:entry", "fresh", 1],
        ["setDependency:count", 0, MAX],
        ["SET_DEPENDENCY_COUNT", 0, MAX],
      ]);

      router.dispose();
    });

    it("set: an overwrite with a CHANGED value reports the key and is not counted", () => {
      const { router, deps } = make({ k: 1 });
      const log = listenToAll(router);

      deps.set("k", 2);

      expect(log).toStrictEqual([
        ["setDependency:entry", "k", 2],
        ["SET_DEPENDENCY_OVERWRITE", "k"],
      ]);

      router.dispose();
    });

    it("set: the SAME value reports nothing, and neither does NaN over NaN", () => {
      const { router, deps } = make({ s: 5, n: Number.NaN });
      const log = listenToAll(router);

      deps.set("s", 5);
      deps.set("n", Number.NaN);

      expect(log).toStrictEqual([
        ["setDependency:entry", "s", 5],
        ["setDependency:entry", "n", Number.NaN],
      ]);

      // The suppression is NaN's, not a blanket silence.
      deps.set("n", 1);

      expect(log.at(-1)).toStrictEqual(["SET_DEPENDENCY_OVERWRITE", "n"]);

      router.dispose();
    });

    it("set: an undefined value still reaches the entry, and nothing else runs", () => {
      const { router, deps } = make();
      const log = listenToAll(router);

      deps.set("u", undefined);

      expect(log).toStrictEqual([["setDependency:entry", "u", undefined]]);
      expect(deps.has("u")).toBe(false);

      router.dispose();
    });

    it("setAll: the entry gets the caller's bag, and the count GROWS per new key", () => {
      const { router, deps } = make();
      const log = listenToAll(router);
      const bag = { a: 1, b: 2 };

      deps.setAll(bag);

      expect(log[0][1]).toBe(bag);
      expect(log).toStrictEqual([
        ["setDependencies:entry", bag],
        ["setDependencies:count", 0, MAX],
        ["SET_DEPENDENCIES_COUNT", 0, MAX],
        ["setDependencies:count", 1, MAX],
        ["SET_DEPENDENCIES_COUNT", 1, MAX],
      ]);

      router.dispose();
    });

    it("setAll: only overwritten keys reach the batch report, once, after the walk", () => {
      const { router, deps } = make({ a: 1, b: 2 });
      const log = listenToAll(router);

      deps.setAll({ a: 9, c: 3, b: 8 });

      expect(log.slice(1)).toStrictEqual([
        ["setDependencies:count", 2, MAX],
        ["SET_DEPENDENCIES_COUNT", 2, MAX],
        ["SET_DEPENDENCIES_OVERWRITE", ["a", "b"]],
      ]);

      router.dispose();
    });

    it("setAll: an undefined value is neither counted nor reported", () => {
      const { router, deps } = make({ keep: 1 });
      const log = listenToAll(router);

      deps.setAll({ keep: undefined, brandNew: 2 });

      expect(log.slice(1)).toStrictEqual([
        ["setDependencies:count", 1, MAX],
        ["SET_DEPENDENCIES_COUNT", 1, MAX],
      ]);
      expect(deps.get("keep")).toBe(1);
      expect(deps.get("brandNew")).toBe(2);

      router.dispose();
    });

    it("get: the entry gets the name, and the value position the value get returns", () => {
      const { router, deps } = make({ g: 1 });
      const log = listenToAll(router);

      expect(deps.get("g")).toBe(1);
      expect(deps.get("missing")).toBeUndefined();

      expect(log).toStrictEqual([
        ["getDependency:entry", "g"],
        ["getDependency:value", "g", 1],
        ["getDependency:entry", "missing"],
        ["getDependency:value", "missing", undefined],
      ]);

      router.dispose();
    });

    it("remove: a key the record does not hold is reported, one it holds is not", () => {
      const { router, deps } = make({ real: 1 });
      const log = listenToAll(router);
      const token = Symbol("svc");

      deps.remove("ghost");
      deps.remove("real");
      deps.remove(token as never);

      // A symbol name reaches the report as the symbol: it is the key core asked.
      expect(log).toStrictEqual([
        ["removeDependency:entry", "ghost"],
        ["REMOVE_DEPENDENCY_MISSING", "ghost"],
        ["removeDependency:entry", "real"],
        ["removeDependency:entry", token],
        ["REMOVE_DEPENDENCY_MISSING", token],
      ]);

      router.dispose();
    });

    it("has: the entry gets the name", () => {
      const { router, deps } = make();
      const log = listenToAll(router);

      deps.has("h");

      expect(log).toStrictEqual([["hasDependency:entry", "h"]]);

      router.dispose();
    });

    it("cloneRouter: the BASE's entry gets the override bag, or undefined", () => {
      const { router } = make();
      const log = listenToAll(router);
      const overrides = { traceId: "t" };

      cloneRouter(router, overrides).dispose();
      cloneRouter(router).dispose();

      expect(log).toStrictEqual([
        ["cloneRouter:entry", overrides],
        ["cloneRouter:entry", undefined],
      ]);
      expect(log[0][1]).toBe(overrides);

      router.dispose();
    });

    it("a refusing count check stops the write, and its report does not run", () => {
      const { router, deps } = make({ a: 1 });
      const reports: unknown[] = [];
      const api = getPluginApi(router);
      const refusal = new RangeError("full");

      api.addCheck("setDependency:count", () => {
        throw refusal;
      });
      api.subscribeDiagnostic("SET_DEPENDENCY_COUNT", (count) => {
        reports.push(count);
      });

      expect(() => {
        deps.set("b", 2);
      }).toThrow(refusal);
      expect(reports).toStrictEqual([]);
      expect(deps.has("b")).toBe(false);

      router.dispose();
    });
  });

  describe("a lone consumer is enough for core to read the record's keys", () => {
    // ⚑ Each cell registers ONE consumer on a record that already holds two
    // keys. With its arm missing from the condition core reads the keys under,
    // the count arrives as 0 and an overwrite as a new key. `remove` asks the
    // record about its one key whatever is registered, so the last cell has no
    // arm to lose: it is the lone consumer of its kind.
    const held = { a: 1, b: 2 };

    it("setDependency:count alone receives the real count, and can refuse", () => {
      const { router, deps } = make(held);
      const seen: unknown[][] = [];

      getPluginApi(router).addCheck("setDependency:count", (count, max) => {
        seen.push([count, max]);

        if (count >= 2) {
          throw new RangeError("full");
        }
      });

      expect(
        codeOf(() => {
          deps.set("c", 3);
        }),
      ).toBe("full");
      expect(seen).toStrictEqual([[2, MAX]]);

      router.dispose();
    });

    it("SET_DEPENDENCY_COUNT alone receives the real count", () => {
      const { router, deps } = make(held);
      const seen: unknown[][] = [];

      getPluginApi(router).subscribeDiagnostic(
        "SET_DEPENDENCY_COUNT",
        (count, max) => {
          seen.push([count, max]);
        },
      );

      deps.set("c", 3);

      expect(seen).toStrictEqual([[2, MAX]]);

      router.dispose();
    });

    it("SET_DEPENDENCY_OVERWRITE alone hears the overwrite", () => {
      const { router, deps } = make(held);
      const seen: unknown[] = [];

      getPluginApi(router).subscribeDiagnostic(
        "SET_DEPENDENCY_OVERWRITE",
        (name) => {
          seen.push(name);
        },
      );

      deps.set("a", 9);

      expect(seen).toStrictEqual(["a"]);

      router.dispose();
    });

    it("setDependencies:count alone receives the real count, and can refuse", () => {
      const { router, deps } = make(held);
      const seen: unknown[][] = [];

      getPluginApi(router).addCheck("setDependencies:count", (count, max) => {
        seen.push([count, max]);

        if (count >= 2) {
          throw new RangeError("full");
        }
      });

      expect(
        codeOf(() => {
          deps.setAll({ c: 3 });
        }),
      ).toBe("full");
      expect(seen).toStrictEqual([[2, MAX]]);

      router.dispose();
    });

    it("SET_DEPENDENCIES_COUNT alone receives the real count", () => {
      const { router, deps } = make(held);
      const seen: unknown[][] = [];

      getPluginApi(router).subscribeDiagnostic(
        "SET_DEPENDENCIES_COUNT",
        (count, max) => {
          seen.push([count, max]);
        },
      );

      deps.setAll({ c: 3 });

      expect(seen).toStrictEqual([[2, MAX]]);

      router.dispose();
    });

    it("SET_DEPENDENCIES_OVERWRITE alone hears the overwritten keys", () => {
      const { router, deps } = make(held);
      const seen: unknown[] = [];

      getPluginApi(router).subscribeDiagnostic(
        "SET_DEPENDENCIES_OVERWRITE",
        (keys) => {
          seen.push(keys);
        },
      );

      deps.setAll({ a: 9, c: 3 });

      expect(seen).toStrictEqual([["a"]]);

      router.dispose();
    });

    it("REMOVE_DEPENDENCY_MISSING alone hears the missing key", () => {
      const { router, deps } = make(held);
      const seen: unknown[] = [];

      getPluginApi(router).subscribeDiagnostic(
        "REMOVE_DEPENDENCY_MISSING",
        (name) => {
          seen.push(name);
        },
      );

      deps.remove("ghost");

      expect(seen).toStrictEqual(["ghost"]);

      router.dispose();
    });
  });

  describe("the store seals the reference its doors report through", () => {
    // ⚑ Built on `routes-store-references-2952.test.ts`: the three write forms,
    // and a check that the slot holds an object first — a slot sealed as
    // `undefined` refuses every write too.
    const storeOf = (router: Router<Deps>) =>
      getInternals(router).dependenciesGetStore() as unknown as Record<
        string,
        unknown
      >;

    it("the slot refuses every write form and keeps the original", () => {
      const { router } = make();
      const store = storeOf(router);
      const original = store.diagnostics;
      const impostor = { emit: () => undefined, listenerCount: () => 1 };

      expect(original).toBeTypeOf("object");
      expect(() => {
        store.diagnostics = impostor;
      }).toThrow(TypeError);
      expect(() =>
        Object.defineProperty(store, "diagnostics", { value: impostor }),
      ).toThrow(TypeError);
      expect(() => {
        delete store.diagnostics;
      }).toThrow(TypeError);
      expect(store.diagnostics).toBe(original);

      router.dispose();
    });

    it("the object behind it refuses a write too, and the next report still arrives", () => {
      const { router, deps } = make({ k: 1 });
      const store = storeOf(router);
      const channel = store.diagnostics as Record<string, unknown>;
      const heard: unknown[] = [];

      getPluginApi(router).subscribeDiagnostic(
        "SET_DEPENDENCY_OVERWRITE",
        (name) => {
          heard.push(name);
        },
      );

      expect(() => {
        channel.emit = () => undefined;
      }).toThrow(TypeError);
      expect(() => {
        channel.listenerCount = () => 0;
      }).toThrow(TypeError);

      deps.set("k", 2);

      expect(heard).toStrictEqual(["k"]);

      router.dispose();
    });
  });

  describe("a report handler that throws is isolated", () => {
    // ⚑ The door completes as if the handler had returned, and the emitter
    // logs the throw. Only a synchronous throw: an async handler's rejection
    // is #2836's.
    const ROWS = [
      {
        kind: "SET_DEPENDENCY_COUNT",
        run: (deps: DepsApi) => {
          deps.set("b", 2);
        },
        after: { a: 1, b: 2 },
        times: 1,
      },
      {
        kind: "SET_DEPENDENCIES_COUNT",
        run: (deps: DepsApi) => {
          deps.setAll({ b: 2, c: 3 });
        },
        after: { a: 1, b: 2, c: 3 },
        times: 2,
      },
      {
        kind: "SET_DEPENDENCY_OVERWRITE",
        run: (deps: DepsApi) => {
          deps.set("a", 2);
        },
        after: { a: 2 },
        times: 1,
      },
      {
        kind: "SET_DEPENDENCIES_OVERWRITE",
        run: (deps: DepsApi) => {
          deps.setAll({ a: 2, b: 2 });
        },
        after: { a: 2, b: 2 },
        times: 1,
      },
      {
        kind: "REMOVE_DEPENDENCY_MISSING",
        run: (deps: DepsApi) => {
          deps.remove("ghost");
        },
        after: { a: 1 },
        times: 1,
      },
    ] as const;

    it.each(ROWS)(
      "$kind: the door completes, and the throw reaches logger.error",
      ({ kind, run, after, times }) => {
        const errors: unknown[][] = [];
        const router = createRouter<Deps>(
          ROUTES,
          {
            logger: {
              level: "none",
              callbackIgnoresLevel: true,
              callback: (level, context, message, ...args) => {
                if (level === "error") {
                  errors.push([context, message, ...args]);
                }
              },
            },
          },
          { a: 1 },
        );
        const deps = getDependenciesApi(router);
        const fault = new Error(`handler of ${kind}`);

        getPluginApi(router).subscribeDiagnostic(kind, () => {
          throw fault;
        });

        expect(
          codeOf(() => {
            run(deps);
          }),
        ).toBe("ok");
        expect(deps.getAll()).toStrictEqual(after);
        expect(errors).toStrictEqual(
          Array.from({ length: times }, () => [
            "router",
            `Error in listener for ${kind}:`,
            fault,
          ]),
        );

        router.dispose();
      },
    );

    it("the table holds every kind of the step, once", () => {
      expectTypeOf<
        Exclude<DependencyKind, (typeof KINDS)[number]>
      >().toBeNever();

      expect(ROWS).toHaveLength(KINDS.length);
      expect(ROWS.map(({ kind }) => kind)).toStrictEqual([...KINDS]);
    });
  });

  it("a clone's reports reach the clone's handlers, not the base's", () => {
    const { router: base } = make({ k: 1 });
    const clone = cloneRouter(base);
    const heard: string[] = [];

    getPluginApi(base).subscribeDiagnostic("SET_DEPENDENCY_OVERWRITE", () => {
      heard.push("base");
    });
    getPluginApi(clone).subscribeDiagnostic("SET_DEPENDENCY_OVERWRITE", () => {
      heard.push("clone");
    });

    getDependenciesApi(clone).set("k", 2);

    expect(heard).toStrictEqual(["clone"]);

    getDependenciesApi(base).set("k", 3);

    expect(heard).toStrictEqual(["clone", "base"]);

    clone.dispose();
    base.dispose();
  });

  it("ANTI-VACUUM: with no consumer the doors still work", () => {
    const { router, deps } = make({ a: 1 });

    deps.set("a", 2);
    deps.set("b", 3);
    deps.setAll({ a: 4, c: 5 });
    deps.remove("ghost");
    deps.remove("c");

    expect(deps.getAll()).toStrictEqual({ a: 4, b: 3 });
    expect(deps.has("a")).toBe(true);
    expect(deps.get("b")).toBe(3);

    router.dispose();
  });
});
