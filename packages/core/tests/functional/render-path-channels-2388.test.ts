import { describe, expect, expectTypeOf, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { DiagnosticEventMap } from "@real-router/core/types";

/**
 * The render-path doors and the state builders on the check and diagnostic
 * channels (#2388), on a router with no plugin installed: what each position
 * and kind receives, and when.
 *
 * ⚑ The printers' `:params` positions are in the log too: what a printer asks
 * about the caller's arguments, what it reports and what it asks about its own
 * copy run in that order, and the order is what the report's place decides.
 */
const POSITIONS = [
  "buildPath:entry",
  "buildPath:params",
  "buildPathResolved:entry",
  "buildPathResolved:params",
  "isActiveRoute:entry",
  "areStatesEqual:entry",
  "shouldUpdateNode:entry",
  "matchPath:entry",
  "matchPath:decoded",
  "makeState:state",
  "navigate:state",
] as const;

/**
 * The kinds `DiagnosticEventMap` names after the two printing predicates. One
 * named so and missing from `KINDS` fails type-check in the counting cell below.
 */
type RenderPathKind = Extract<
  keyof DiagnosticEventMap,
  `BUILD_PATH${string}` | `IS_ACTIVE_ROUTE${string}`
>;

const KINDS = [
  "BUILD_PATH",
  "IS_ACTIVE_ROUTE",
] as const satisfies readonly RenderPathKind[];

const routes = [
  { name: "home", path: "/home" },
  { name: "items", path: "/items/:id?q" },
  {
    name: "dec",
    path: "/dec/:id",
    decodeParams: ({ params }: { params: Record<string, unknown> }) => ({
      params: { ...params, injected: "yes" },
      search: {},
    }),
  },
  {
    name: "bare",
    path: "/bare/:id",
    decodeParams: () => ({ search: {} }),
  },
];

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

const started = async (): Promise<Router> => {
  const router = createRouter(routes as never, {
    defaultRoute: "items",
    defaultParams: { id: "9" },
  });

  await router.start("/home");

  return router;
};

const refusal = new TypeError("refused");

/** Adds a check at `position` that refuses every call. */
const refuseAt = (router: Router, position: (typeof POSITIONS)[number]) =>
  getPluginApi(router).addCheck(position, () => {
    throw refusal;
  });

describe("#2388 — the render-path doors and the state builders on the channels", () => {
  describe("what each position and kind receives", () => {
    it("buildPath: the caller's arguments, the report, then core's copy", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const params = { id: "1" };
      const search = { q: "x" };

      listenToAll(router, log);
      router.buildPath("items", params, search);

      expect(log).toStrictEqual([
        ["buildPath:entry", "items", params, search],
        ["BUILD_PATH", "items", params],
        ["buildPath:params", { id: "1" }],
      ]);
      expect(log[0][2]).toBe(params);
      expect(log[0][3]).toBe(search);
      expect(log[1][2]).toBe(params);
      expect(log[2][1]).not.toBe(params);

      router.dispose();
    });

    it("buildPath: omitted bags arrive as undefined", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);
      router.buildPath("home");

      expect(log).toStrictEqual([
        ["buildPath:entry", "home", undefined, undefined],
        ["BUILD_PATH", "home", undefined],
        ["buildPath:params", undefined],
      ]);

      router.dispose();
    });

    it("buildPathResolved: the caller's two bags, then core's copy, and no report", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const params = { id: "1" };
      const search = { q: "x" };

      listenToAll(router, log);
      getPluginApi(router).buildPathResolved("items", params, search);

      expect(log).toStrictEqual([
        ["buildPathResolved:entry", params, search],
        ["buildPathResolved:params", { id: "1" }],
      ]);
      expect(log[0][1]).toBe(params);
      expect(log[0][2]).toBe(search);
      expect(log[1][1]).not.toBe(params);

      router.dispose();
    });

    it("isActiveRoute: the five arguments as the caller passed them, then the report", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const params = { id: "1" };
      const search = { q: "x" };

      listenToAll(router, log);
      router.isActiveRoute("items", params, search, true, false);
      router.isActiveRoute("home");

      expect(log).toStrictEqual([
        ["isActiveRoute:entry", "items", params, search, true, false],
        ["IS_ACTIVE_ROUTE", "items", params],
        [
          "isActiveRoute:entry",
          "home",
          undefined,
          undefined,
          undefined,
          undefined,
        ],
        ["IS_ACTIVE_ROUTE", "home", undefined],
      ]);
      expect(log[0][2]).toBe(params);
      expect(log[0][3]).toBe(search);

      router.dispose();
    });

    it("isActiveRoute: the empty name is asked and reported before the door answers it", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);

      expect(router.isActiveRoute("")).toBe(false);
      expect(log).toStrictEqual([
        ["isActiveRoute:entry", "", undefined, undefined, undefined, undefined],
        ["IS_ACTIVE_ROUTE", "", undefined],
      ]);

      router.dispose();
    });

    it("areStatesEqual: the two states, and the flag with its default applied", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const state = router.getState();
      const other = getPluginApi(router).makeState("items", { id: "1" });

      listenToAll(router, log);
      router.areStatesEqual(state, other);
      router.areStatesEqual(state, other, false);

      expect(log).toStrictEqual([
        ["areStatesEqual:entry", state, other, true],
        ["areStatesEqual:entry", state, other, false],
      ]);
      expect(log[0][1]).toBe(state);
      expect(log[0][2]).toBe(other);

      router.dispose();
    });

    it("shouldUpdateNode: the node name, once per predicate built and never per call", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const api = getPluginApi(router);

      listenToAll(router, log);

      const predicate = router.shouldUpdateNode("items");

      predicate(api.makeState("items", { id: "1" }), router.getState());
      predicate(api.makeState("home", {}), router.getState());

      expect(
        log.filter(([at]) => at === "shouldUpdateNode:entry"),
      ).toStrictEqual([["shouldUpdateNode:entry", "items"]]);

      router.dispose();
    });

    it("matchPath: the path, then — for a route with a decoder only — what the decoder returned", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const api = getPluginApi(router);

      listenToAll(router, log);
      api.matchPath("/home");
      api.matchPath("/dec/7");
      api.matchPath("/bare/7");

      expect(log).toStrictEqual([
        ["matchPath:entry", "/home"],
        ["matchPath:entry", "/dec/7"],
        // The decoder's output, not the matcher's: the matcher never produced
        // `injected`.
        ["matchPath:decoded", "dec", { id: "7", injected: "yes" }],
        ["matchPath:entry", "/bare/7"],
        // A decoder that returns no `params` is reported as returning none.
        ["matchPath:decoded", "bare", undefined],
      ]);

      router.dispose();
    });

    it("makeState: the name, core's copy of the bag, the search and the path", async () => {
      const router = await started();
      const log: unknown[][] = [];
      const params = { id: "1" };
      const search = { q: "x" };

      listenToAll(router, log);
      getPluginApi(router).makeState("items", params, search, "/items/1?q=x");

      expect(log).toStrictEqual([
        ["makeState:state", "items", { id: "1" }, search, "/items/1?q=x"],
      ]);
      expect(log[0][2]).not.toBe(params);
      expect(log[0][3]).toBe(search);

      router.dispose();
    });

    it("navigate:state: the name and the bag the pipeline builds from — core's copy, the one `navigate:params` judged", async () => {
      const router = await started();
      const seen: unknown[][] = [];
      const api = getPluginApi(router);
      const params = { id: "1" };

      api.addCheck("navigate:params", (ownParams) => {
        seen.push(["navigate:params", ownParams]);
      });
      api.addCheck("navigate:state", (...args) => {
        seen.push(["navigate:state", ...args]);
      });

      await router.navigate("items", params);

      expect(seen).toStrictEqual([
        ["navigate:params", { id: "1" }],
        ["navigate:state", "items", { id: "1" }],
      ]);
      expect(seen[1][2]).toBe(seen[0][1]);
      expect(seen[1][2]).not.toBe(params);

      router.dispose();
    });

    it("navigate:state: the defaults navigateToDefault resolved", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);
      await router.navigateToDefault();

      expect(log.filter(([at]) => at === "navigate:state")).toStrictEqual([
        ["navigate:state", "items", { id: "9" }],
      ]);

      router.dispose();
    });
  });

  describe("a lone subscriber of a kind receives its report", () => {
    // ⚑ No check registered anywhere: the report is raised for a listener of
    // its own kind alone.
    it.each(KINDS)("%s", async (kind) => {
      const router = await started();
      const seen: unknown[][] = [];

      getPluginApi(router).subscribeDiagnostic(kind, (...args: unknown[]) => {
        seen.push(args);
      });

      router.buildPath("home");
      router.isActiveRoute("home");

      expect(seen).toStrictEqual([["home", undefined]]);

      router.dispose();
    });
  });

  describe("a refusal stops the door where it stands", () => {
    it("buildPath:entry — the call throws, nothing is reported, and core's copy is not asked about", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);
      refuseAt(router, "buildPath:entry");

      expect(() => router.buildPath("items", { id: "1" })).toThrow(refusal);
      expect(log).toStrictEqual([
        ["buildPath:entry", "items", { id: "1" }, undefined],
      ]);

      router.dispose();
    });

    it("buildPath:params — the call throws after the report", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);
      refuseAt(router, "buildPath:params");

      expect(() => router.buildPath("items", { id: "1" })).toThrow(refusal);
      expect(log).toStrictEqual([
        ["buildPath:entry", "items", { id: "1" }, undefined],
        ["BUILD_PATH", "items", { id: "1" }],
        ["buildPath:params", { id: "1" }],
      ]);

      router.dispose();
    });

    it("isActiveRoute:entry — the call throws, and nothing is reported", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);
      refuseAt(router, "isActiveRoute:entry");

      expect(() => router.isActiveRoute("home")).toThrow(refusal);
      expect(log).toStrictEqual([
        [
          "isActiveRoute:entry",
          "home",
          undefined,
          undefined,
          undefined,
          undefined,
        ],
      ]);

      router.dispose();
    });

    it("buildPathResolved:entry — the call throws, and core's copy is not asked about", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);
      refuseAt(router, "buildPathResolved:entry");

      expect(() =>
        getPluginApi(router).buildPathResolved("items", { id: "1" }),
      ).toThrow(refusal);
      expect(log).toStrictEqual([
        ["buildPathResolved:entry", { id: "1" }, undefined],
      ]);

      router.dispose();
    });

    it.each([
      [
        "areStatesEqual:entry",
        (router: Router) =>
          router.areStatesEqual(router.getState(), router.getState()),
      ],
      [
        "shouldUpdateNode:entry",
        (router: Router) => router.shouldUpdateNode("home"),
      ],
      [
        "matchPath:entry",
        (router: Router) => getPluginApi(router).matchPath("/home"),
      ],
      [
        "matchPath:decoded",
        (router: Router) => getPluginApi(router).matchPath("/dec/7"),
      ],
      [
        "makeState:state",
        (router: Router) => getPluginApi(router).makeState("home", {}),
      ],
    ] as const)(
      "%s — the call throws instead of answering",
      async (position, call) => {
        const router = await started();

        refuseAt(router, position);

        expect(() => call(router)).toThrow(refusal);

        router.dispose();
      },
    );

    it("navigate:state — the navigation REJECTS with the refusal, and the state stays", async () => {
      // ⚠ A rejection rather than a throw: the pipeline builds its target state
      // inside the promise the door answers with.
      const router = await started();

      refuseAt(router, "navigate:state");

      await expect(router.navigate("items", { id: "1" })).rejects.toBe(refusal);
      expect(router.getState()?.name).toBe("home");

      router.dispose();
    });
  });

  describe("a report handler that throws is isolated", () => {
    const errorsOf = () => {
      const errors: unknown[][] = [];
      const router = createRouter(routes as never, {
        logger: {
          level: "none",
          callbackIgnoresLevel: true,
          callback: (level, context, message, ...args) => {
            if (level === "error") {
              errors.push([context, message, ...args]);
            }
          },
        },
      });

      return { errors, router };
    };

    it("BUILD_PATH: the door still prints, and the throw reaches logger.error", () => {
      const { errors, router } = errorsOf();
      const fault = new Error("handler of BUILD_PATH");

      getPluginApi(router).subscribeDiagnostic("BUILD_PATH", () => {
        throw fault;
      });

      expect(router.buildPath("items", { id: "1" })).toBe("/items/1");
      expect(errors).toStrictEqual([
        ["router", "Error in listener for BUILD_PATH:", fault],
      ]);

      router.dispose();
    });

    it("IS_ACTIVE_ROUTE: the door still answers, and the throw reaches logger.error", async () => {
      const { errors, router } = errorsOf();
      const fault = new Error("handler of IS_ACTIVE_ROUTE");

      await router.start("/home");
      getPluginApi(router).subscribeDiagnostic("IS_ACTIVE_ROUTE", () => {
        throw fault;
      });

      expect(router.isActiveRoute("home")).toBe(true);
      expect(errors).toStrictEqual([
        ["router", "Error in listener for IS_ACTIVE_ROUTE:", fault],
      ]);

      router.dispose();
    });

    it("KINDS holds every kind of the step", () => {
      expectTypeOf<
        Exclude<RenderPathKind, (typeof KINDS)[number]>
      >().toBeNever();

      expect([...KINDS]).toStrictEqual(["BUILD_PATH", "IS_ACTIVE_ROUTE"]);
      // The count `table-vacuity-authority` reads: an empty table would
      // register no lone-subscriber cell, in silence.
      expect(KINDS).toHaveLength(2);
    });
  });

  it("ANTI-VACUUM: with no consumer the doors still work", async () => {
    const router = await started();
    const api = getPluginApi(router);
    const home = router.getState();

    expect(router.buildPath("items", { id: "1" }, { q: "x" })).toBe(
      "/items/1?q=x",
    );
    expect(api.buildPathResolved("items", { id: "1" })).toBe("/items/1");
    expect(router.isActiveRoute("home")).toBe(true);
    expect(router.isActiveRoute("items", { id: "1" })).toBe(false);
    expect(router.areStatesEqual(home, home)).toBe(true);
    expect(typeof router.shouldUpdateNode("home")).toBe("function");
    expect(api.matchPath("/dec/7")?.params).toStrictEqual({
      id: "7",
      injected: "yes",
    });
    expect(api.makeState("items", { id: "1" }).name).toBe("items");
    await expect(router.navigate("items", { id: "1" })).resolves.toMatchObject({
      name: "items",
    });

    router.dispose();
  });
});
