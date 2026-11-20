import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { ParamsSearch, Router } from "@real-router/core";

/**
 * The route resolver's three reports on the diagnostic channel (#2388), on a
 * router with no plugin installed: each port sink is present exactly while its
 * own kind has a listener, what each kind receives, and what a throwing handler
 * does to the door that raised it.
 */
const KINDS = [
  "DROPPED_QUERY_KEY",
  "UNDECLARED_PARAM_KEY",
  "CODEC_ROUND_TRIP",
] as const;

type ResolverKind = (typeof KINDS)[number];

/** The port sink each kind feeds. */
const SINK = {
  DROPPED_QUERY_KEY: "reportDroppedQueryKey",
  UNDECLARED_PARAM_KEY: "reportUndeclaredParamKey",
  CODEC_ROUND_TRIP: "reportCodecRoundTrip",
} as const satisfies Record<ResolverKind, string>;

const lowered = ({ params, search }: ParamsSearch): ParamsSearch => ({
  params: { ...params, slug: (params.slug as string).toLowerCase() },
  search,
});

const routes = [
  { name: "home", path: "/home" },
  { name: "list", path: "/list?q" },
  { name: "cars", path: "/cars/:slug", encodeParams: lowered },
];

const started = async (): Promise<Router> => {
  const router = createRouter(routes, { queryParamsMode: "default" });

  await router.start("/home");

  return router;
};

/** The kinds whose sink the port hands out right now. */
const present = (router: Router): ResolverKind[] => {
  const port = getInternals(router).port();

  return KINDS.filter((kind) => port[SINK[kind]] !== undefined);
};

/** Every report of the three kinds, into one log, in the order raised. */
const listenToAll = (router: Router, log: unknown[][]): void => {
  const api = getPluginApi(router);

  for (const kind of KINDS) {
    api.subscribeDiagnostic(kind, (...args: unknown[]) => {
      log.push([kind, ...args]);
    });
  }
};

describe("#2388 — the route resolver's reports on the diagnostic channel", () => {
  it("KINDS names one kind per report sink of the port", async () => {
    const router = await started();
    const sinks = Object.keys(getInternals(router).port()).filter((key) =>
      key.startsWith("report"),
    );

    expect(new Set(sinks)).toStrictEqual(new Set(Object.values(SINK)));
    // The count `table-vacuity-authority` reads: an empty table would
    // register no presence cell, in silence.
    expect(KINDS).toHaveLength(3);

    router.dispose();
  });

  describe("a sink is present exactly while its own kind has a listener", () => {
    it.each(KINDS)("%s", async (kind) => {
      const router = await started();

      expect(present(router)).toStrictEqual([]);

      const remove = getPluginApi(router).subscribeDiagnostic(kind, () => {});

      expect(present(router)).toStrictEqual([kind]);

      remove();

      expect(present(router)).toStrictEqual([]);

      router.dispose();
    });

    it("a listener of another kind hands out no sink", async () => {
      const router = await started();

      getPluginApi(router).subscribeDiagnostic("BUILD_PATH", () => {});

      expect(present(router)).toStrictEqual([]);

      router.dispose();
    });
  });

  describe("what each kind receives", () => {
    it("DROPPED_QUERY_KEY: the route and each key the mode gate dropped, from a predicate too", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);

      expect(router.buildPath("list", {}, { q: "1", x: "2", y: "3" })).toBe(
        "/list?q=1",
      );

      getPluginApi(router).matchPath("/list?z=1");

      expect(log).toStrictEqual([
        ["DROPPED_QUERY_KEY", "list", "x"],
        ["DROPPED_QUERY_KEY", "list", "y"],
        ["DROPPED_QUERY_KEY", "list", "z"],
      ]);

      router.dispose();
    });

    it("UNDECLARED_PARAM_KEY: the route and each key declared nowhere, from the committing producers only", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);

      router.buildPath("list", { zz: "1" });
      router.canNavigateTo("list", { zz: "1" });
      router.isActiveRoute("list", { zz: "1" });

      expect(log).toStrictEqual([]);

      await router.navigate("list", { zz: "1" });
      getPluginApi(router).buildNavigationState("list", { yy: "1" });

      expect(log).toStrictEqual([
        ["UNDECLARED_PARAM_KEY", "list", "zz"],
        ["UNDECLARED_PARAM_KEY", "list", "yy"],
      ]);

      router.dispose();
    });

    it("CODEC_ROUND_TRIP: the state, the route's two codecs and the slots its URL prints", async () => {
      const router = await started();
      const log: unknown[][] = [];

      listenToAll(router, log);

      const state = await router.navigate("cars", { slug: "BMW" });

      expect(log).toHaveLength(1);

      const [[kind, reported, codec, slots]] = log as [
        [string, typeof state, Record<string, unknown>, string[]],
      ];

      expect(kind).toBe("CODEC_ROUND_TRIP");
      expect(reported.path).toBe(state.path);
      expect(typeof codec.encode).toBe("function");
      expect(codec.decode).toBeUndefined();
      expect(slots).toStrictEqual(["slug"]);

      router.dispose();
    });
  });

  describe("a report handler that throws is isolated", () => {
    const errorsOf = () => {
      const errors: unknown[][] = [];
      const router = createRouter(routes, {
        queryParamsMode: "default",
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

    const throwingOn = (router: Router, kind: ResolverKind): Error => {
      const fault = new Error(`handler of ${kind}`);

      getPluginApi(router).subscribeDiagnostic(kind, () => {
        throw fault;
      });

      return fault;
    };

    it("DROPPED_QUERY_KEY: the predicate still prints, and the throw reaches logger.error", () => {
      const { errors, router } = errorsOf();
      const fault = throwingOn(router, "DROPPED_QUERY_KEY");

      expect(router.buildPath("list", {}, { x: "1" })).toBe("/list");
      expect(errors).toStrictEqual([
        ["router", "Error in listener for DROPPED_QUERY_KEY:", fault],
      ]);

      router.dispose();
    });

    it("UNDECLARED_PARAM_KEY: the navigation still commits, and the throw reaches logger.error", async () => {
      const { errors, router } = errorsOf();

      await router.start("/home");

      const fault = throwingOn(router, "UNDECLARED_PARAM_KEY");

      await expect(router.navigate("list", { zz: "1" })).resolves.toMatchObject(
        { name: "list" },
      );
      expect(router.getState()?.name).toBe("list");
      expect(errors).toStrictEqual([
        ["router", "Error in listener for UNDECLARED_PARAM_KEY:", fault],
      ]);

      router.dispose();
    });

    it("CODEC_ROUND_TRIP: the builder still returns its state, and the throw reaches logger.error", () => {
      const { errors, router } = errorsOf();
      const fault = throwingOn(router, "CODEC_ROUND_TRIP");

      expect(
        getPluginApi(router).buildNavigationState("cars", { slug: "BMW" })
          ?.path,
      ).toBe("/cars/bmw");
      expect(errors).toStrictEqual([
        ["router", "Error in listener for CODEC_ROUND_TRIP:", fault],
      ]);

      router.dispose();
    });
  });

  it("ANTI-VACUUM: with no consumer the doors still work", async () => {
    const router = await started();
    const api = getPluginApi(router);

    expect(present(router)).toStrictEqual([]);
    expect(router.buildPath("list", {}, { x: "1" })).toBe("/list");
    expect(api.matchPath("/list?z=1")?.search).toStrictEqual({});
    await expect(router.navigate("list", { zz: "1" })).resolves.toMatchObject({
      name: "list",
      params: { zz: "1" },
    });
    expect(api.buildNavigationState("cars", { slug: "BMW" })?.path).toBe(
      "/cars/bmw",
    );

    router.dispose();
  });
});
