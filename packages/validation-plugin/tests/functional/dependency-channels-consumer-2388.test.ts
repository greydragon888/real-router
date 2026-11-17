import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { Router } from "@real-router/core";

/**
 * The dependency doors and `cloneRouter` refuse through checks and report
 * through diagnostic kinds (#2388).
 *
 * `maxDependencies: 10` puts the warning at 2 held keys and the error at 5
 * (`computeThresholds`). Core hands both channels the count BEFORE the write,
 * so the key that lands on 2 is the third.
 */
type Deps = Record<string, unknown>;

const LIMITS = { maxDependencies: 10 };

/** What the router logged, one line per call: level, channel, message, args. */
const routerWithSink = (
  mode: "bare" | "installed" | "torn down",
): { router: Router<Deps>; logged: string[] } => {
  const logged: string[] = [];
  const router = createRouter<Deps>([], {
    limits: LIMITS,
    logger: {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (level, channel, message, ...args) => {
        if (level !== "log") {
          logged.push([level, channel, message, ...args].map(String).join(" "));
        }
      },
    },
  });

  if (mode !== "bare") {
    const remove = router.usePlugin(validationPlugin());

    if (mode === "torn down") {
      remove();
    }
  }

  logged.length = 0;

  return { router, logged };
};

const depsOf = (router: Router<Deps>) => getDependenciesApi(router);

const bagOf = (size: number): Deps =>
  Object.fromEntries(Array.from({ length: size }, (_, i) => [`k${i}`, i]));

describe("teardown removes every dependency registration (#2388)", () => {
  // ⚑ One row per registration's effect: an input the plugin refuses or
  // reports and bare core does not. A row whose installed arm equals bare core
  // would prove nothing about its remover, so each row asserts that too.
  const ROWS: readonly (readonly [
    label: string,
    run: (router: Router<Deps>) => void,
  ])[] = [
    [
      "getDependency:entry",
      (router) => {
        depsOf(router).set("42", 1);
        depsOf(router).get(42 as never);
      },
    ],
    [
      "getDependency:value",
      (router) => {
        depsOf(router).get("missing");
      },
    ],
    [
      "setDependency:entry",
      (router) => {
        depsOf(router).set(42 as never, 1);
      },
    ],
    [
      "setDependency:count",
      (router) => {
        for (let i = 0; i <= LIMITS.maxDependencies; i++) {
          depsOf(router).set(`k${i}`, i);
        }
      },
    ],
    [
      "setDependencies:entry, the shape",
      (router) => {
        depsOf(router).setAll({
          a: 1,
          get b() {
            return 2;
          },
        });
      },
    ],
    [
      "setDependencies:entry, the batch limit, and setDependencies:count",
      (router) => {
        depsOf(router).setAll(bagOf(LIMITS.maxDependencies + 1));
      },
    ],
    [
      "removeDependency:entry",
      (router) => {
        depsOf(router).set("42", 1);
        depsOf(router).remove(42 as never);
      },
    ],
    [
      "hasDependency:entry",
      (router) => {
        depsOf(router).has(42 as never);
      },
    ],
    [
      "cloneRouter:entry",
      (router) => {
        cloneRouter(router, {
          get b() {
            return 1;
          },
        }).dispose();
      },
    ],
    [
      "SET_DEPENDENCY_COUNT",
      (router) => {
        for (let i = 0; i < 3; i++) {
          depsOf(router).set(`k${i}`, i);
        }
      },
    ],
    [
      "SET_DEPENDENCIES_COUNT",
      (router) => {
        depsOf(router).setAll(bagOf(3));
      },
    ],
    [
      "SET_DEPENDENCY_OVERWRITE",
      (router) => {
        depsOf(router).set("a", 1);
        // eslint-disable-next-line sonarjs/no-element-overwrite -- the overwrite IS the report under test
        depsOf(router).set("a", 2);
      },
    ],
    [
      "SET_DEPENDENCIES_OVERWRITE",
      (router) => {
        depsOf(router).setAll({ a: 1 });
        depsOf(router).setAll({ a: 2 });
      },
    ],
    [
      "REMOVE_DEPENDENCY_MISSING",
      (router) => {
        depsOf(router).remove("ghost");
      },
    ],
  ];

  const outcomeOf = (
    mode: "bare" | "installed" | "torn down",
    run: (router: Router<Deps>) => void,
  ) => {
    const { router, logged } = routerWithSink(mode);
    let thrown = "no throw";

    try {
      run(router);
    } catch (error) {
      thrown = (error as Error).message;
    }

    router.dispose();

    return { thrown, logged };
  };

  it.each(ROWS)(
    "%s: after teardown the door answers as bare core does",
    (_label, run) => {
      const bare = outcomeOf("bare", run);

      expect(
        outcomeOf("installed", run),
        "the row reaches the plugin",
      ).not.toStrictEqual(bare);
      expect(outcomeOf("torn down", run)).toStrictEqual(bare);
    },
  );
});

describe("one count, a refusal and a report (#2388)", () => {
  it("set: each threshold is logged once, and nothing throws below the limit", () => {
    const { router, logged } = routerWithSink("installed");

    for (let i = 0; i < LIMITS.maxDependencies; i++) {
      depsOf(router).set(`k${i}`, i);
    }

    expect(logged).toStrictEqual([
      "warn router.setDependency 2 dependencies registered. Consider if all are necessary.",
      "error router.setDependency 5 dependencies registered! This indicates architectural problems. Hard limit at 10.",
    ]);

    router.dispose();
  });

  it("set: at the limit the refusal is the same RangeError, and the key is not written", () => {
    // ⚑ That the check does not log is the cell above: a leaf left whole at the
    // count position logs each threshold twice.
    const { router } = routerWithSink("installed");

    for (let i = 0; i < LIMITS.maxDependencies; i++) {
      depsOf(router).set(`k${i}`, i);
    }

    expect(() => {
      depsOf(router).set("k10", 10);
    }).toThrow(
      new RangeError(
        "[router.setDependency] Dependency limit exceeded (10). Current: 10.",
      ),
    );
    expect(depsOf(router).has("k10")).toBe(false);

    router.dispose();
  });

  it("setAll: the thresholds are logged as the batch grows the record", () => {
    const { router, logged } = routerWithSink("installed");

    depsOf(router).setAll(bagOf(6));

    expect(logged).toStrictEqual([
      "warn router.setDependencies 2 dependencies registered. Consider if all are necessary.",
      "error router.setDependencies 5 dependencies registered! This indicates architectural problems. Hard limit at 10.",
    ]);

    router.dispose();
  });
});
