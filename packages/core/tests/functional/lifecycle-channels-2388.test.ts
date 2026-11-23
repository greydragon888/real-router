import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createRouter, errorCodes, events } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";
import type { DiagnosticEventMap } from "@real-router/core/types";

/**
 * Guard registration, the guard answers and the listener count on the check
 * and diagnostic channels (#2388), on a router with no plugin installed: what
 * each position and kind receives, and when.
 *
 * ⚑ `@real-router/validation-plugin` registers every consumer of a door at
 * once, so its suites cannot tell which consumer makes core compute a count.
 * The "lone consumer" cells below can: each registers one.
 */
const POSITIONS = ["canActivate:count", "canDeactivate:count"] as const;

/**
 * The kinds of guard registration, guard answers and the listener count. One
 * named so and missing from `KINDS` fails type-check in the isolation table.
 */
type StepKind = Extract<
  keyof DiagnosticEventMap,
  `CAN_${string}` | `${string}GUARD_${string}` | `LISTENER_${string}`
>;

const KINDS = [
  "CAN_ACTIVATE_COUNT",
  "CAN_DEACTIVATE_COUNT",
  "CAN_ACTIVATE_OVERWRITE",
  "CAN_DEACTIVATE_OVERWRITE",
  "SYNC_GUARD_THENABLE",
  "SYNC_GUARD_NON_BOOLEAN",
  "GUARD_NON_BOOLEAN",
  "LISTENER_COUNT",
] as const satisfies readonly StepKind[];

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "items", path: "/items/:id" },
  { name: "landing", path: "/landing" },
];

const allow = () => () => true;
const block = () => () => false;

/** Every position and kind of the step, into one log, in the order they run. */
const listenToAll = (router: Router, log: unknown[][]): void => {
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
};

/** A router whose logger callback collects `warn` and `error` lines. */
const loggedRouter = (
  routes: Route[] = ROUTES,
): { router: Router; warns: unknown[][]; errors: unknown[][] } => {
  const warns: unknown[][] = [];
  const errors: unknown[][] = [];
  const router = createRouter(routes, {
    logger: {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (level, context, message, ...args) => {
        if (level === "warn") {
          warns.push([context, message, ...args]);
        } else if (level === "error") {
          errors.push([context, message, ...args]);
        }
      },
    },
  });

  return { router, warns, errors };
};

describe("#2388 — guards and the event bus on the channels", () => {
  describe("a guard registration", () => {
    it("a new slot: the count position, then the count kind with the count the registration makes", () => {
      const router = createRouter(ROUTES);
      const log: unknown[][] = [];
      const lifecycle = getLifecycleApi(router);

      listenToAll(router, log);
      lifecycle.addActivateGuard("home", allow);
      lifecycle.addActivateGuard("items", allow);

      expect(log).toStrictEqual([
        ["canActivate:count", 0],
        ["CAN_ACTIVATE_COUNT", 1],
        ["canActivate:count", 1],
        ["CAN_ACTIVATE_COUNT", 2],
      ]);

      router.dispose();
    });

    it("a route holding a guard of either origin: an overwrite, reported by name and neither judged nor counted", () => {
      const router = createRouter([
        { name: "home", path: "/home", canActivate: allow },
      ]);
      const log: unknown[][] = [];
      const lifecycle = getLifecycleApi(router);

      listenToAll(router, log);
      lifecycle.addActivateGuard("home", block);
      lifecycle.addActivateGuard("home", allow);

      expect(log).toStrictEqual([
        ["CAN_ACTIVATE_OVERWRITE", "home"],
        ["CAN_ACTIVATE_OVERWRITE", "home"],
      ]);

      router.dispose();
    });

    it("a definition and an external guard on one route are counted once", () => {
      const router = createRouter([
        { name: "home", path: "/home", canActivate: allow },
        { name: "items", path: "/items/:id" },
        { name: "landing", path: "/landing" },
      ]);
      const log: unknown[][] = [];
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("home", allow);
      lifecycle.addActivateGuard("items", allow);
      listenToAll(router, log);
      lifecycle.addActivateGuard("landing", allow);

      expect(log).toStrictEqual([
        ["canActivate:count", 2],
        ["CAN_ACTIVATE_COUNT", 3],
      ]);

      router.dispose();
    });

    it("a canDeactivate guard has a position and kinds of its own", () => {
      const router = createRouter(ROUTES);
      const log: unknown[][] = [];
      const lifecycle = getLifecycleApi(router);

      listenToAll(router, log);
      lifecycle.addDeactivateGuard("home", allow);
      lifecycle.addDeactivateGuard("home", block);

      expect(log).toStrictEqual([
        ["canDeactivate:count", 0],
        ["CAN_DEACTIVATE_COUNT", 1],
        ["CAN_DEACTIVATE_OVERWRITE", "home"],
      ]);

      router.dispose();
    });

    it("a route batch is judged before it writes, with the highest count its slots will meet, then slot by slot", () => {
      const router = createRouter(ROUTES);
      const log: unknown[][] = [];

      getLifecycleApi(router).addActivateGuard("home", allow);
      listenToAll(router, log);
      getRoutesApi(router).add([
        { name: "a", path: "/a", canActivate: allow },
        { name: "b", path: "/b", canActivate: allow, canDeactivate: allow },
      ]);

      expect(log).toStrictEqual([
        ["canActivate:count", 2],
        ["canDeactivate:count", 0],
        ["canActivate:count", 1],
        ["CAN_ACTIVATE_COUNT", 2],
        ["canActivate:count", 2],
        ["CAN_ACTIVATE_COUNT", 3],
        ["canDeactivate:count", 0],
        ["CAN_DEACTIVATE_COUNT", 1],
      ]);

      router.dispose();
    });

    it("route-config guards alone are counted from the definitions", () => {
      const router = createRouter(ROUTES);
      const log: unknown[][] = [];

      listenToAll(router, log);
      getRoutesApi(router).add([
        { name: "a", path: "/a", canActivate: allow },
        { name: "b", path: "/b", canActivate: allow },
      ]);

      expect(log).toStrictEqual([
        ["canActivate:count", 1],
        ["canActivate:count", 0],
        ["CAN_ACTIVATE_COUNT", 1],
        ["canActivate:count", 1],
        ["CAN_ACTIVATE_COUNT", 2],
      ]);

      router.dispose();
    });

    it("replace projects its batch onto the external guards that survive it", () => {
      const router = createRouter([
        { name: "home", path: "/home", canActivate: allow },
        { name: "items", path: "/items/:id" },
      ]);
      const log: unknown[][] = [];

      getLifecycleApi(router).addActivateGuard("items", allow);
      listenToAll(router, log);
      getRoutesApi(router).replace([
        { name: "home", path: "/home", canActivate: allow },
        { name: "items", path: "/items/:id", canActivate: allow },
        { name: "x", path: "/x", canActivate: allow },
      ]);

      expect(log).toStrictEqual([
        ["canActivate:count", 2],
        ["canActivate:count", 1],
        ["CAN_ACTIVATE_COUNT", 2],
        ["CAN_ACTIVATE_OVERWRITE", "items"],
        ["canActivate:count", 2],
        ["CAN_ACTIVATE_COUNT", 3],
      ]);

      router.dispose();
    });

    it("update judges a new slot before it writes, and an overwrite takes none", () => {
      const router = createRouter(ROUTES);
      const log: unknown[][] = [];
      const routes = getRoutesApi(router);

      listenToAll(router, log);
      routes.update("home", { canActivate: allow });
      routes.update("home", { canActivate: block });

      expect(log).toStrictEqual([
        ["canActivate:count", 0],
        ["canActivate:count", 0],
        ["CAN_ACTIVATE_COUNT", 1],
        ["CAN_ACTIVATE_OVERWRITE", "home"],
      ]);

      router.dispose();
    });
  });

  describe("a refusal at the count position comes before the write", () => {
    const refuseFrom =
      (limit: number) =>
      (currentCount: number): void => {
        if (currentCount >= limit) {
          throw new RangeError(`limit ${limit}`);
        }
      };

    it("addActivateGuard: the refused guard is not registered", async () => {
      const router = createRouter(ROUTES);

      getPluginApi(router).addCheck("canActivate:count", refuseFrom(0));

      expect(() => {
        getLifecycleApi(router).addActivateGuard("items", block);
      }).toThrow("limit 0");

      await router.start("/home");

      expect(router.canNavigateTo("items", { id: "1" })).toBe(true);

      router.dispose();
    });

    it("addDeactivateGuard: the refused guard is not registered", async () => {
      const router = createRouter(ROUTES);

      getPluginApi(router).addCheck("canDeactivate:count", refuseFrom(0));

      expect(() => {
        getLifecycleApi(router).addDeactivateGuard("home", block);
      }).toThrow("limit 0");

      await router.start("/home");

      expect(router.canNavigateTo("landing")).toBe(true);

      router.dispose();
    });

    it("a route batch the position refuses writes nothing (#1046)", () => {
      const router = createRouter(ROUTES);
      const routes = getRoutesApi(router);

      getPluginApi(router).addCheck("canActivate:count", refuseFrom(1));

      expect(() => {
        routes.add([
          { name: "a", path: "/a", canActivate: allow },
          { name: "b", path: "/b", canActivate: allow },
        ]);
      }).toThrow("limit 1");
      expect([routes.has("a"), routes.has("b")]).toStrictEqual([false, false]);

      router.dispose();
    });

    it("replace refused there keeps the table it had", () => {
      const router = createRouter(ROUTES);
      const routes = getRoutesApi(router);

      getPluginApi(router).addCheck("canActivate:count", refuseFrom(1));

      expect(() => {
        routes.replace([
          { name: "a", path: "/a", canActivate: allow },
          { name: "b", path: "/b", canActivate: allow },
        ]);
      }).toThrow("limit 1");
      expect([routes.has("home"), routes.has("a")]).toStrictEqual([
        true,
        false,
      ]);

      router.dispose();
    });

    it("update refused there leaves the route as it was", () => {
      const router = createRouter(ROUTES);
      const routes = getRoutesApi(router);

      getPluginApi(router).addCheck("canActivate:count", refuseFrom(0));

      expect(() => {
        routes.update("home", {
          canActivate: allow,
          defaultParams: { tab: "x" },
        });
      }).toThrow("limit 0");
      expect(routes.get("home")?.defaultParams).toBeUndefined();

      router.dispose();
    });
  });

  describe("a lone consumer is enough for core to compute what its position judges", () => {
    // ⚑ Each cell registers ONE consumer and nothing else, so it reds when core
    // stops computing that consumer's count. Both maps hold a guard on `home`,
    // so a count that adds them instead of uniting them is off by one.
    const unitedRouter = (): Router => {
      const router = createRouter([
        {
          name: "home",
          path: "/home",
          canActivate: allow,
          canDeactivate: allow,
        },
        { name: "items", path: "/items/:id" },
        { name: "landing", path: "/landing" },
      ]);
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("home", allow);
      lifecycle.addActivateGuard("items", allow);
      lifecycle.addDeactivateGuard("home", allow);
      lifecycle.addDeactivateGuard("items", allow);

      return router;
    };

    /** Each count position, and the door that registers a guard of its type. */
    const LONE_CHECKS = [
      ["canActivate:count", "addActivateGuard"],
      ["canDeactivate:count", "addDeactivateGuard"],
    ] as const;
    /** Each count kind, and the door that registers a guard of its type. */
    const LONE_KINDS = [
      ["CAN_ACTIVATE_COUNT", "addActivateGuard"],
      ["CAN_DEACTIVATE_COUNT", "addDeactivateGuard"],
    ] as const;

    it("CONTROL — the lone tables hold every count position and count kind", () => {
      expect(LONE_CHECKS).toHaveLength(POSITIONS.length);
      expect(LONE_KINDS).toHaveLength(POSITIONS.length);
      expect(LONE_CHECKS.map(([position]) => position)).toStrictEqual([
        ...POSITIONS,
      ]);
      expect(LONE_KINDS.map(([kind]) => kind)).toStrictEqual(
        KINDS.filter(
          (kind) => kind.endsWith("_COUNT") && kind !== "LISTENER_COUNT",
        ),
      );
    });

    it.each(LONE_CHECKS)(
      "%s alone receives the count of routes holding a guard",
      (position, door) => {
        const router = unitedRouter();
        const seen: unknown[][] = [];

        getPluginApi(router).addCheck(position, (...args) => {
          seen.push(args);
        });
        getLifecycleApi(router)[door]("landing", allow);

        expect(seen).toStrictEqual([[2]]);

        router.dispose();
      },
    );

    it.each(LONE_KINDS)(
      "%s alone receives the count the registration makes",
      (kind, door) => {
        const router = unitedRouter();
        const seen: unknown[][] = [];

        getPluginApi(router).subscribeDiagnostic(kind, (...args) => {
          seen.push(args);
        });
        getLifecycleApi(router)[door]("landing", allow);

        expect(seen).toStrictEqual([[3]]);

        router.dispose();
      },
    );

    it("a lone check is asked by a route batch before it writes", () => {
      const router = unitedRouter();
      const seen: unknown[] = [];

      getPluginApi(router).addCheck("canActivate:count", (currentCount) => {
        seen.push(currentCount);
      });
      getRoutesApi(router).add({ name: "x", path: "/x", canActivate: allow });

      expect(seen).toStrictEqual([2, 2]);

      router.dispose();
    });
  });

  describe("a guard's answer", () => {
    const BOOLEAN_ANSWERS = [true, false] as const;
    /** A guard answering a non-boolean, and the value core hands over. */
    const HANDED_OVER = [
      ["directly", (): unknown => "login", "login"],
      ["through a promise", (): unknown => Promise.resolve(0), 0],
    ] as const;
    /** A guard answering a boolean, directly or through a promise. */
    const KEPT = [
      ["true", (): unknown => true],
      ["false", (): unknown => false],
      ["Promise<true>", (): unknown => Promise.resolve(true)],
      ["Promise<false>", (): unknown => Promise.resolve(false)],
    ] as const;

    const started = async (): Promise<{ router: Router; log: unknown[][] }> => {
      const router = createRouter(ROUTES);
      const log: unknown[][] = [];

      await router.start("/home");
      listenToAll(router, log);

      return { router, log };
    };

    it("the synchronous ask: a thenable is reported with the door that asked", async () => {
      const { router, log } = await started();

      getLifecycleApi(router).addActivateGuard("items", () => async () => true);
      log.length = 0;

      expect(router.canNavigateTo("items", { id: "1" })).toBe(false);
      expect(log).toStrictEqual([
        ["SYNC_GUARD_THENABLE", "items", "canNavigateTo"],
      ]);

      router.dispose();
    });

    // A thenable may be a function: the ask reads `then` off it as off an
    // object, so it is a pending answer rather than a non-boolean one (#2823).
    it("the synchronous ask: a callable thenable is a thenable, not a non-boolean", async () => {
      const { router, log } = await started();

      getLifecycleApi(router).addActivateGuard(
        "items",
        () => () =>
          Object.assign((): void => {}, {
            // eslint-disable-next-line unicorn/no-thenable -- a callable thenable IS the subject
            then: (): void => {},
          }) as never,
      );
      log.length = 0;
      router.canNavigateTo("items", { id: "1" });

      expect(log).toStrictEqual([
        ["SYNC_GUARD_THENABLE", "items", "canNavigateTo"],
      ]);

      router.dispose();
    });

    it("the synchronous ask: a non-boolean is reported with the answer and the door", async () => {
      const { router, log } = await started();

      getLifecycleApi(router).addActivateGuard(
        "items",
        () => () => "login" as never,
      );
      log.length = 0;

      expect(router.canNavigateTo("items", { id: "1" })).toBe(false);
      expect(log).toStrictEqual([
        ["SYNC_GUARD_NON_BOOLEAN", "items", "login", "canNavigateTo"],
      ]);

      router.dispose();
    });

    it.each(BOOLEAN_ANSWERS)(
      "the synchronous ask: answer %s reports nothing",
      async (answer) => {
        const { router, log } = await started();

        getLifecycleApi(router).addActivateGuard("items", () => () => answer);
        log.length = 0;
        router.canNavigateTo("items", { id: "1" });

        expect(log).toStrictEqual([]);

        router.dispose();
      },
    );

    it("the synchronous ask names each door that asks it", async () => {
      const { router, log } = await started();

      getLifecycleApi(router).addDeactivateGuard(
        "home",
        () => async () => true,
      );
      log.length = 0;

      expect(() => router.navigateToNotFound("/nowhere")).toThrow();

      getLifecycleApi(router).removeDeactivateGuard("home");
      getRoutesApi(router).replace([
        { name: "landing", path: "/home", canActivate: () => async () => true },
        { name: "home", path: "/old-home" },
      ]);

      // `replace` also registers the guard it carries, on the count channels.
      expect(
        log.filter(([key]) => key === "SYNC_GUARD_THENABLE"),
      ).toStrictEqual([
        ["SYNC_GUARD_THENABLE", "home", "navigateToNotFound"],
        ["SYNC_GUARD_THENABLE", "landing", "replace"],
      ]);

      router.dispose();
    });

    // The transition hands the answer over with no door: several calls start
    // one (#2823).
    it.each(HANDED_OVER)(
      "a transition: a non-boolean given %s is reported with what it settled on, and refused",
      async (_how, guard, expected) => {
        const { router, log } = await started();

        getLifecycleApi(router).addActivateGuard("items", () => guard as never);
        log.length = 0;

        await expect(
          router.navigate("items", { id: "1" }),
        ).rejects.toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });
        expect(log).toStrictEqual([["GUARD_NON_BOOLEAN", "items", expected]]);

        router.dispose();
      },
    );

    it.each(KEPT)(
      "a transition: answer %s reports nothing",
      async (_, guard) => {
        const { router, log } = await started();

        getLifecycleApi(router).addActivateGuard("items", () => guard as never);
        log.length = 0;
        await router.navigate("items", { id: "1" }).catch(() => undefined);

        expect(log).toStrictEqual([]);

        router.dispose();
      },
    );

    it("CONTROL — the #2823 tables hold the rows they name", () => {
      expect(BOOLEAN_ANSWERS).toHaveLength(2);
      expect(HANDED_OVER).toHaveLength(2);
      expect(KEPT).toHaveLength(4);

      // The promise rows are this suite's reach into the awaited half.
      const promised = (guard: () => unknown): boolean =>
        guard() instanceof Promise;

      expect(HANDED_OVER.filter(([, guard]) => promised(guard))).toHaveLength(
        1,
      );
      expect(KEPT.filter(([, guard]) => promised(guard))).toHaveLength(2);
    });
  });

  describe("the listener count", () => {
    it("each door is named, with the number of listeners the event holds once the listener registers", () => {
      const router = createRouter(ROUTES);
      const seen: unknown[][] = [];

      getPluginApi(router).subscribeDiagnostic("LISTENER_COUNT", (...args) => {
        seen.push(args);
      });
      router.subscribe(() => {});
      router.subscribe(() => {});
      getPluginApi(router).addEventListener(events.ROUTER_STOP, () => {});
      router.usePlugin(() => ({ onStop: () => {} }));

      expect(seen).toStrictEqual([
        [1, events.TRANSITION_SUCCESS, "subscribe"],
        [2, events.TRANSITION_SUCCESS, "subscribe"],
        [1, events.ROUTER_STOP, "addEventListener"],
        [2, events.ROUTER_STOP, "usePlugin"],
      ]);

      router.dispose();
    });
  });

  describe("a report handler that throws is isolated", () => {
    // ⚑ The door completes as if the handler had returned, and the emitter logs
    // the throw. An async handler's rejection is logged the same way once it
    // settles (#2836).
    interface Row {
      kind: (typeof KINDS)[number];
      run: (router: Router) => Promise<unknown> | unknown;
      /** What the door does, asked after the throwing handler. */
      outcome: (router: Router) => Promise<unknown> | unknown;
      expected: unknown;
      /** What `run` handed back, read once the outcome is in. */
      afterwards?: unknown;
    }

    const ISOLATED: Row[] = [
      {
        kind: "CAN_ACTIVATE_COUNT",
        run: (router) => {
          getLifecycleApi(router).addActivateGuard("items", block);
        },
        outcome: (router) => router.canNavigateTo("items", { id: "1" }),
        expected: false,
      },
      {
        kind: "CAN_DEACTIVATE_COUNT",
        run: (router) => {
          getLifecycleApi(router).addDeactivateGuard("home", block);
        },
        outcome: (router) => router.canNavigateTo("landing"),
        expected: false,
      },
      {
        kind: "CAN_ACTIVATE_OVERWRITE",
        run: (router) => {
          getLifecycleApi(router).addActivateGuard("items", allow);
          getLifecycleApi(router).addActivateGuard("items", block);
        },
        outcome: (router) => router.canNavigateTo("items", { id: "1" }),
        expected: false,
      },
      {
        kind: "CAN_DEACTIVATE_OVERWRITE",
        run: (router) => {
          getLifecycleApi(router).addDeactivateGuard("home", allow);
          getLifecycleApi(router).addDeactivateGuard("home", block);
        },
        outcome: (router) => router.canNavigateTo("landing"),
        expected: false,
      },
      {
        kind: "SYNC_GUARD_THENABLE",
        run: (router) => {
          getLifecycleApi(router).addActivateGuard(
            "items",
            () => async () => true,
          );
        },
        outcome: (router) => router.canNavigateTo("items", { id: "1" }),
        expected: false,
      },
      {
        kind: "SYNC_GUARD_NON_BOOLEAN",
        run: (router) => {
          getLifecycleApi(router).addActivateGuard(
            "items",
            () => () => "login" as never,
          );
        },
        outcome: (router) => router.canNavigateTo("items", { id: "1" }),
        expected: false,
      },
      {
        kind: "GUARD_NON_BOOLEAN",
        run: (router) => {
          getLifecycleApi(router).addActivateGuard(
            "items",
            () => () => "login" as never,
          );
        },
        outcome: async (router) => {
          const code = await router.navigate("items", { id: "1" }).then(
            () => "resolved",
            (error: unknown) => (error as { code?: string }).code,
          );

          return [code, router.getState()?.name];
        },
        expected: [errorCodes.CANNOT_ACTIVATE, "home"],
      },
      {
        kind: "LISTENER_COUNT",
        run: (router) => {
          const fired: unknown[] = [];

          router.subscribe(({ route }) => {
            fired.push(route.name);
          });

          return fired;
        },
        outcome: async (router) => {
          await router.navigate("landing");

          return "navigated";
        },
        expected: "navigated",
        afterwards: ["landing"],
      },
    ];

    it.each(ISOLATED)(
      "$kind: the door completes as without the throw, and the throw reaches logger.error, not logger.warn",
      async ({ kind, run, outcome, expected, afterwards }) => {
        const { router, warns, errors } = loggedRouter();
        const fault = new Error(`handler of ${kind}`);

        await router.start("/home");
        getPluginApi(router).subscribeDiagnostic(kind, () => {
          throw fault;
        });

        const ran = await run(router);

        await expect(Promise.resolve(outcome(router))).resolves.toStrictEqual(
          expected,
        );
        expect(errors).toStrictEqual([
          ["router", `Error in listener for ${kind}:`, fault],
        ]);
        expect(warns).toStrictEqual([]);
        expect(ran).toStrictEqual(afterwards);

        router.dispose();
      },
    );

    it("a transition: a throwing handler leaves the refusal CANNOT_ACTIVATE for a promised answer too", async () => {
      const { router, errors } = loggedRouter();
      const fault = new Error("handler of GUARD_NON_BOOLEAN");

      await router.start("/home");
      getLifecycleApi(router).addActivateGuard(
        "items",
        () => () => Promise.resolve(0) as never,
      );
      getPluginApi(router).subscribeDiagnostic("GUARD_NON_BOOLEAN", () => {
        throw fault;
      });

      await expect(router.navigate("items", { id: "1" })).rejects.toMatchObject(
        { code: errorCodes.CANNOT_ACTIVATE },
      );
      expect(router.getState()?.name).toBe("home");
      expect(errors).toStrictEqual([
        ["router", "Error in listener for GUARD_NON_BOOLEAN:", fault],
      ]);

      router.dispose();
    });

    it("the table holds every kind of the step, once", () => {
      expectTypeOf<Exclude<StepKind, (typeof KINDS)[number]>>().toBeNever();

      expect(ISOLATED).toHaveLength(KINDS.length);
      expect(ISOLATED.map(({ kind }) => kind)).toStrictEqual([...KINDS]);
    });
  });

  describe("application code that disposes the router during a registration ends the call", () => {
    // ⚑ A check at a count position, a handler of a kind and a guard factory
    // run application code between the door's first question and its return.
    // Each door asks again once that code has run, so none reports success on
    // a router the code disposed. The synchronous ask and the transition write nothing
    // afterwards, and a disposed router refuses to commit.
    const DISPOSED = {
      code: errorCodes.ROUTER_DISPOSED,
      message: "[router] this router is disposed — dispose() is terminal",
    };

    const thrownBy = (call: () => unknown) => {
      let thrown: unknown;

      try {
        call();
      } catch (error) {
        thrown = error;
      }

      return {
        code: (thrown as { code?: string } | undefined)?.code,
        message: (thrown as Error | undefined)?.message,
      };
    };

    type Consumer =
      | { position: (typeof POSITIONS)[number] }
      | { kind: (typeof KINDS)[number] };

    const disposeOn = (router: Router, consumer: Consumer): void => {
      const dispose = (): void => {
        router.dispose();
      };

      if ("position" in consumer) {
        getPluginApi(router).addCheck(consumer.position, dispose);
      } else {
        getPluginApi(router).subscribeDiagnostic(consumer.kind, dispose);
      }
    };

    const DISPOSING: {
      label: string;
      consumer: Consumer;
      call: (router: Router) => unknown;
    }[] = [
      {
        label: "addActivateGuard, a check at canActivate:count",
        consumer: { position: "canActivate:count" },
        call: (router) => {
          getLifecycleApi(router).addActivateGuard("items", allow);
        },
      },
      {
        label: "addActivateGuard, a handler of CAN_ACTIVATE_COUNT",
        consumer: { kind: "CAN_ACTIVATE_COUNT" },
        call: (router) => {
          getLifecycleApi(router).addActivateGuard("items", allow);
        },
      },
      {
        label: "addActivateGuard, a handler of CAN_ACTIVATE_OVERWRITE",
        consumer: { kind: "CAN_ACTIVATE_OVERWRITE" },
        call: (router) => {
          getLifecycleApi(router).addActivateGuard("home", allow);
        },
      },
      {
        label: "addDeactivateGuard, a check at canDeactivate:count",
        consumer: { position: "canDeactivate:count" },
        call: (router) => {
          getLifecycleApi(router).addDeactivateGuard("items", allow);
        },
      },
      {
        label: "addDeactivateGuard, a handler of CAN_DEACTIVATE_COUNT",
        consumer: { kind: "CAN_DEACTIVATE_COUNT" },
        call: (router) => {
          getLifecycleApi(router).addDeactivateGuard("items", allow);
        },
      },
      {
        label: "addDeactivateGuard, a handler of CAN_DEACTIVATE_OVERWRITE",
        consumer: { kind: "CAN_DEACTIVATE_OVERWRITE" },
        call: (router) => {
          getLifecycleApi(router).addDeactivateGuard("home", allow);
        },
      },
      {
        label: "add, a check at canActivate:count",
        consumer: { position: "canActivate:count" },
        call: (router) => {
          getRoutesApi(router).add({
            name: "x",
            path: "/x",
            canActivate: allow,
          });
        },
      },
      {
        label: "add, a handler of CAN_ACTIVATE_COUNT",
        consumer: { kind: "CAN_ACTIVATE_COUNT" },
        call: (router) => {
          getRoutesApi(router).add({
            name: "x",
            path: "/x",
            canActivate: allow,
          });
        },
      },
      {
        label: "update, a handler of CAN_ACTIVATE_COUNT",
        consumer: { kind: "CAN_ACTIVATE_COUNT" },
        call: (router) => {
          getRoutesApi(router).update("items", { canActivate: allow });
        },
      },
      {
        label: "replace, a handler of CAN_ACTIVATE_COUNT",
        consumer: { kind: "CAN_ACTIVATE_COUNT" },
        call: (router) => {
          getRoutesApi(router).replace([
            { name: "x", path: "/x", canActivate: allow },
          ]);
        },
      },
      {
        label: "addEventListener, a handler of LISTENER_COUNT",
        consumer: { kind: "LISTENER_COUNT" },
        call: (router) =>
          getPluginApi(router).addEventListener(events.ROUTER_STOP, () => {}),
      },
    ];

    it("CONTROL — the table reaches every count position and every registration kind", () => {
      const reached = new Set(
        DISPOSING.map(({ consumer }) =>
          "position" in consumer ? consumer.position : consumer.kind,
        ),
      );

      expect(DISPOSING).toHaveLength(11);
      expect(
        [
          ...POSITIONS,
          ...KINDS.filter(
            (kind) => kind.startsWith("CAN_") || kind === "LISTENER_COUNT",
          ),
        ].filter((consumer) => !reached.has(consumer)),
      ).toStrictEqual([]);
    });

    it.each(DISPOSING)("$label", ({ consumer, call }) => {
      const router = createRouter(ROUTES);

      getLifecycleApi(router).addActivateGuard("home", allow);
      getLifecycleApi(router).addDeactivateGuard("home", allow);
      disposeOn(router, consumer);

      expect(thrownBy(() => call(router))).toStrictEqual(DISPOSED);
    });

    it("addActivateGuard, a guard factory", () => {
      const router = createRouter(ROUTES);

      expect(
        thrownBy(() => {
          getLifecycleApi(router).addActivateGuard("items", (self) => {
            self.dispose();

            return () => true;
          });
        }),
      ).toStrictEqual(DISPOSED);
    });

    it("add, a route's guard factory", () => {
      const router = createRouter(ROUTES);

      expect(
        thrownBy(() => {
          getRoutesApi(router).add({
            name: "late",
            path: "/late",
            canActivate: (self) => {
              self.dispose();

              return () => true;
            },
          });
        }),
      ).toStrictEqual(DISPOSED);
    });

    it("subscribe, a handler of LISTENER_COUNT", () => {
      const router = createRouter(ROUTES);

      disposeOn(router, { kind: "LISTENER_COUNT" });

      expect(thrownBy(() => router.subscribe(() => {}))).toStrictEqual({
        code: errorCodes.ROUTER_DISPOSED,
        message:
          "[router.subscribe] cannot subscribe on a disposed router — dispose() is terminal",
      });
    });

    it("usePlugin, a handler of LISTENER_COUNT raised by a hook: the call refuses, and the plugin's teardown has run", () => {
      const router = createRouter(ROUTES);
      const teardown = vi.fn();

      disposeOn(router, { kind: "LISTENER_COUNT" });

      expect(
        thrownBy(() =>
          router.usePlugin(() => ({ onStop: () => {}, teardown })),
        ),
      ).toStrictEqual({
        code: errorCodes.ROUTER_DISPOSED,
        message:
          "[router.usePlugin] cannot install a plugin on a disposed router — dispose() is terminal",
      });
      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });

  it("ANTI-VACUUM: with no consumer every door still works", async () => {
    const router = createRouter(ROUTES);
    const lifecycle = getLifecycleApi(router);
    const fired: unknown[] = [];

    lifecycle.addActivateGuard("items", () => () => "login" as never);
    lifecycle.addActivateGuard("items", () => async () => true);
    lifecycle.addDeactivateGuard("landing", allow);
    getRoutesApi(router).add({ name: "x", path: "/x", canActivate: block });
    router.subscribe(({ route }) => {
      fired.push(route.name);
    });

    await router.start("/home");

    expect(router.canNavigateTo("items", { id: "1" })).toBe(false);
    expect(router.canNavigateTo("x")).toBe(false);

    lifecycle.addActivateGuard("items", () => () => "login" as never);

    await expect(router.navigate("items", { id: "1" })).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });

    await router.navigate("landing");

    expect(fired).toStrictEqual(["home", "landing"]);

    router.dispose();
  });
});
