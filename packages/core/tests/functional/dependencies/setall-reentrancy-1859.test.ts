import { describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core/api";

/**
 * #1859 — the write paths re-read `store.dependencies` on every access, and
 * `dispose()` / `reset()` clear this channel by REPLACING that property. So a
 * teardown triggered from inside the call found the fresh object and had the
 * remaining writes land in it. Every clear path is a write path and refuses on a
 * disposed router, so the caller's value was pinned with nothing able to release
 * it, while `getAll()` kept answering with the leak.
 *
 * ⚑ There are TWO user-code windows per key, not one, and that is why the fix is
 * a captured target rather than a disposal probe: reading `deps[key]` runs a
 * `get` trap if the caller handed in a `Proxy` (an own accessor is refused
 * before it is read, below), and the count check and the reports run
 * application code — a check or a diagnostic handler directly, and through the
 * logger the application's `LoggerConfig.callback`. A probe between them closes
 * the first and leaves the second wide open — the callback route reproduced the
 * leak in full on a bag with no accessors at all.
 */
const ROUTES = [{ name: "a", path: "/a" }];

/**
 * ⚠ The REPORT window is core's own code, reached here through
 * `PluginApi.subscribeDiagnostic`; the describe `a report that tears the
 * router down lands nothing` drives it. `@real-router/validation-plugin`'s
 * `dependencies-reentrancy-1859.test.ts` drives the same window through the
 * logger callback its reports reach.
 */
const attempt = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("a teardown from inside the call cannot land a write (#1859)", () => {
  /**
   * ⚑ **One of the two windows is GONE, closed at its source rather than
   * survived (#1860).** `setAll` reached no structural check at all, which is the
   * only reason a bag carrying an own enumerable getter could ever reach the copy
   * loop; it now goes through `ingestDependencies`, the door the constructor has
   * always used, and an accessor is refused there. So the cells below assert that
   * the getter never RUNS, where they used to assert that a teardown from inside
   * it could not land a write.
   *
   * ⚠ The class is not closed, and the fix that closed this window is not the fix
   * for it. The REPORT window needs no accessor at all and is still live; the
   * captured target is what holds it, and the describe `a report that tears the
   * router down lands nothing` exercises it.
   */
  it("setAll: the accessor window is refused, so nothing can tear down inside it", () => {
    const router = createRouter(ROUTES, {}, { boot: "B" } as never);
    const api = getDependenciesApi(router);
    let invoked = 0;

    expect(
      attempt(() => {
        api.setAll({
          a: 1,
          get b() {
            invoked += 1;
            router.dispose();

            return "PAYLOAD";
          },
          c: 3,
        } as never);
      }),
      "the refusal comes from the DOOR, not from a disposal mid-copy",
    ).toBe('[router] dependencies cannot contain getters: "b"');

    expect(invoked, "the whole point: the caller's code does not run").toBe(0);
    expect(
      Object.keys(api.getAll()),
      "and the store is exactly as it was — no key from before the getter either",
    ).toStrictEqual(["boot"]);

    router.dispose();
  });

  it("reset() mid-call cannot straddle two stores, for the same reason", () => {
    // ⚠ `reset()` replaces the same slot `dispose()` does, so it was the second
    // path this class covered. It needed an accessor to reach, and there is no
    // longer a way to put one in.
    const router = createRouter(ROUTES, {}, { boot: "B" } as never);
    const api = getDependenciesApi(router);
    let invoked = 0;

    expect(
      attempt(() => {
        api.setAll({
          a: 1,
          get b() {
            invoked += 1;
            api.reset();

            return 2;
          },
          c: 3,
        } as never);
      }),
    ).toBe('[router] dependencies cannot contain getters: "b"');

    expect(invoked).toBe(0);
    expect(Object.keys(api.getAll())).toStrictEqual(["boot"]);

    router.dispose();
  });

  it("CONTROL — the ban is on the SHAPE, so a harmless accessor is refused too", () => {
    // The previous control asserted the opposite — that an accessor which does
    // not tear down is copied normally. That was true while `setAll` had no
    // structural check; keeping it would now pin the hole rather than the rule.
    const router = createRouter(ROUTES);
    const api = getDependenciesApi(router);

    expect(() => {
      api.setAll({
        a: 1,
        get b() {
          return "B";
        },
        c: 3,
      });
    }).toThrow('[router] dependencies cannot contain getters: "b"');

    expect(
      Object.keys(api.getAll()),
      "refusal is atomic — `a` was not installed before `b` was judged",
    ).toStrictEqual([]);

    router.dispose();
  });

  it("CONTROL — a plain bag still goes in, so the door is not refusing everything", () => {
    const router = createRouter(ROUTES);
    const api = getDependenciesApi(router);

    api.setAll({ a: 1, b: "B", c: 3 });

    expect(Object.keys(api.getAll())).toStrictEqual(["a", "b", "c"]);

    router.dispose();
  });
});

/** The CODE when there is one: these rows are about `ROUTER_DISPOSED`. */
const codeOf = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
};

type Deps = Record<string, unknown>;

const make = (initial: Deps) => {
  const router = createRouter<Deps>(ROUTES, {}, initial);

  return { router, deps: getDependenciesApi(router) };
};

describe("a report that tears the router down lands nothing (#1859)", () => {
  // ⚑ The report runs between the door's reads and its write, and a handler
  // is application code. The door writes into the record it captured before
  // the report, which the teardown discarded. `remove` stores nothing, and
  // refuses after its delete.
  it("set: an overwrite report that disposes", () => {
    const { router, deps } = make({ boot: "B" });
    const retained = { big: "PAYLOAD" };

    getPluginApi(router).subscribeDiagnostic("SET_DEPENDENCY_OVERWRITE", () => {
      router.dispose();
    });

    expect(
      codeOf(() => {
        deps.set("boot", retained);
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
    expect(Object.values(deps.getAll())).not.toContain(retained);
    expect(Object.keys(deps.getAll())).toStrictEqual([]);
  });

  it("setAll: a count report that disposes", () => {
    const { router, deps } = make({ boot: "B" });
    const retained = { big: "PAYLOAD" };
    let disposed = false;

    getPluginApi(router).subscribeDiagnostic("SET_DEPENDENCIES_COUNT", () => {
      if (!disposed) {
        disposed = true;
        router.dispose();
      }
    });

    expect(
      codeOf(() => {
        deps.setAll({ leak: retained, second: 2 });
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
    expect(Object.values(deps.getAll())).not.toContain(retained);
    expect(Object.keys(deps.getAll())).toStrictEqual([]);
  });

  it("CONTROL — the same reports on handlers that do not dispose", () => {
    const { router, deps } = make({ boot: "B" });
    const heard: string[] = [];
    const api = getPluginApi(router);

    api.subscribeDiagnostic("SET_DEPENDENCY_OVERWRITE", () => {
      heard.push("overwrite");
    });
    api.subscribeDiagnostic("SET_DEPENDENCIES_COUNT", () => {
      heard.push("count");
    });

    deps.set("boot", "NEW");
    deps.setAll({ x: 1 });

    expect(heard).toStrictEqual(["overwrite", "count"]);
    expect(deps.getAll()).toStrictEqual({ boot: "NEW", x: 1 });

    router.dispose();
  });

  it("remove: a missing-key report that disposes", () => {
    const { router, deps } = make({ boot: "B" });

    getPluginApi(router).subscribeDiagnostic(
      "REMOVE_DEPENDENCY_MISSING",
      () => {
        router.dispose();
      },
    );

    expect(
      codeOf(() => {
        deps.remove("ghost");
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
  });
});

describe("an entry check that disposes or resets the router (#1859)", () => {
  // ⚑ A check may only refuse, so these break its contract. `set` and `setAll`
  // ask again after the check, before they take the record: a disposed router
  // ends the call before anything is written, and after a reset the fresh
  // record is the one the rest of the call writes into. `remove` asks after its
  // delete.
  it("set: a disposing check ends the call before the write", () => {
    const { router, deps } = make({ boot: "B" });
    const retained = { big: "PAYLOAD" };

    getPluginApi(router).addCheck("setDependency:entry", () => {
      router.dispose();
    });

    expect(
      codeOf(() => {
        deps.set("leak", retained);
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
    expect(Object.keys(deps.getAll())).toStrictEqual([]);
  });

  it("setAll: a disposing check ends the call before the write", () => {
    const { router, deps } = make({ boot: "B" });
    const retained = { big: "PAYLOAD" };

    getPluginApi(router).addCheck("setDependencies:entry", () => {
      router.dispose();
    });

    expect(
      codeOf(() => {
        deps.setAll({ leak: retained });
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
    expect(Object.keys(deps.getAll())).toStrictEqual([]);
  });

  it("set: a resetting check leaves the call as reset() and then the write", () => {
    const { router, deps } = make({ boot: "B" });
    const retained = { big: "PAYLOAD" };

    getPluginApi(router).addCheck("setDependency:entry", () => {
      deps.reset();
    });

    expect(
      codeOf(() => {
        deps.set("leak", retained);
      }),
    ).toBe("ok");
    expect(deps.getAll()).toStrictEqual({ leak: retained });

    router.dispose();
  });

  it("setAll: a resetting check leaves the call as reset() and then the write", () => {
    const { router, deps } = make({ boot: "B" });
    const retained = { big: "PAYLOAD" };

    getPluginApi(router).addCheck("setDependencies:entry", () => {
      deps.reset();
    });

    expect(
      codeOf(() => {
        deps.setAll({ leak: retained });
      }),
    ).toBe("ok");
    expect(deps.getAll()).toStrictEqual({ leak: retained });

    router.dispose();
  });

  it("remove: a disposing check makes the call refuse", () => {
    const { router, deps } = make({ boot: "B" });

    getPluginApi(router).addCheck("removeDependency:entry", () => {
      router.dispose();
    });

    expect(
      codeOf(() => {
        deps.remove("boot");
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
  });
});

describe("cloneRouter refuses a base torn down during the call (#1859)", () => {
  // ⚑ `cloneRouter` writes into no record of the base. It asks again whether the
  // base is alive after the last application code it runs before building the
  // clone, so each of these windows ends in the same refusal.
  it("a check at its entry position", () => {
    const { router } = make({ boot: "B" });

    getPluginApi(router).addCheck("cloneRouter:entry", () => {
      router.dispose();
    });

    expect(
      codeOf(() => {
        cloneRouter(router);
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
  });

  it("a Proxy override bag whose trap disposes the base", () => {
    const { router } = make({ boot: "B" });
    const override = new Proxy<Deps>(
      { extra: 1 },
      {
        ownKeys(target) {
          router.dispose();

          return Reflect.ownKeys(target);
        },
      },
    );

    expect(
      codeOf(() => {
        cloneRouter(router, override);
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
  });

  it("an opts getter that disposes the base", () => {
    const { router } = make({ boot: "B" });
    const opts = {
      get logger() {
        router.dispose();

        return {};
      },
    };

    expect(
      codeOf(() => {
        cloneRouter(router, undefined, opts);
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
  });

  it("a base disposed before the call is refused before its override bag is judged", () => {
    const { router } = make({ boot: "B" });

    router.dispose();

    expect(
      codeOf(() => {
        cloneRouter(router, "not a bag" as never);
      }),
    ).toBe(errorCodes.ROUTER_DISPOSED);
  });

  it("CONTROL — the same arguments on a base nobody disposes give a clone", () => {
    const { router } = make({ boot: "B" });
    const clone = cloneRouter(router, new Proxy<Deps>({ extra: 1 }, {}), {
      logger: {},
    });

    expect(getDependenciesApi(clone).getAll()).toStrictEqual({
      boot: "B",
      extra: 1,
    });

    clone.dispose();
    router.dispose();
  });
});
