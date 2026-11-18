import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { DiagnosticEventMap } from "@real-router/core/types";

/**
 * `navigateToState`, `setRootPath`, `navigateToDefault` and `start` on the
 * check and diagnostic channels (#2388), on a router with no plugin installed:
 * what each position and kind receives, and when.
 */
const POSITIONS = [
  "navigateToState:entry",
  "setRootPath:entry",
  "navigateToDefault:entry",
  "navigateToDefault:route",
  "start:entry",
] as const;

/**
 * The kinds `DiagnosticEventMap` names after `navigateToDefault`. One named so
 * and missing from `KINDS` fails type-check in the counting cell below.
 */
type NavigateToDefaultKind = Extract<
  keyof DiagnosticEventMap,
  `NAVIGATE_TO_DEFAULT${string}`
>;

const KINDS = [
  "NAVIGATE_TO_DEFAULT",
] as const satisfies readonly NavigateToDefaultKind[];

const routes = [
  { name: "home", path: "/home" },
  { name: "next", path: "/next" },
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

/** A router on `/next` whose default is `home`, chosen by a callback. */
const startedOnNext = async (): Promise<Router> => {
  const router = createRouter(routes, { defaultRoute: () => "home" });

  await router.start("/next");

  return router;
};

const refusal = new TypeError("refused");

const disposedOf = (call: () => unknown) => {
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

const DISPOSED = {
  code: errorCodes.ROUTER_DISPOSED,
  message: "[router] this router is disposed — dispose() is terminal",
};

describe("#2388 — navigateToState, setRootPath, navigateToDefault and start on the channels", () => {
  describe("what each position and kind receives", () => {
    it("navigateToDefault: the caller's bag, the report, then the route the callback chose", async () => {
      const router = await startedOnNext();
      const log: unknown[][] = [];
      const options = { replace: true };

      listenToAll(router, log);
      await router.navigateToDefault(options);

      expect(log).toStrictEqual([
        ["navigateToDefault:entry", options],
        ["NAVIGATE_TO_DEFAULT"],
        ["navigateToDefault:route", "home"],
      ]);
      expect(log[0][1]).toBe(options);

      router.dispose();
    });

    it("navigateToDefault: an omitted bag arrives as undefined, and a string defaultRoute is not asked at :route", async () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const log: unknown[][] = [];

      await router.start("/next");
      listenToAll(router, log);
      await router.navigateToDefault();

      expect(log).toStrictEqual([
        ["navigateToDefault:entry", undefined],
        ["NAVIGATE_TO_DEFAULT"],
      ]);

      router.dispose();
    });

    it("navigateToState: the caller's state and options, undefined when omitted", async () => {
      const router = createRouter(routes);
      const log: unknown[][] = [];
      const api = getPluginApi(router);

      await router.start("/home");
      listenToAll(router, log);

      const next = api.makeState("next", {}, undefined, "/next");
      const home = api.makeState("home", {}, undefined, "/home");
      const options = { replace: true };

      await api.navigateToState(next, options);
      await api.navigateToState(home);

      expect(log).toStrictEqual([
        ["navigateToState:entry", next, options],
        ["navigateToState:entry", home, undefined],
      ]);
      expect(log[0][1]).toBe(next);
      expect(log[0][2]).toBe(options);

      router.dispose();
    });

    it("setRootPath: the caller's root path", () => {
      const router = createRouter(routes);
      const log: unknown[][] = [];

      listenToAll(router, log);
      getPluginApi(router).setRootPath("/base");

      expect(log).toStrictEqual([["setRootPath:entry", "/base"]]);

      router.dispose();
    });

    it("start: the caller's path, before the start interceptor chain — undefined when omitted", async () => {
      const router = createRouter(routes);
      const log: unknown[][] = [];

      listenToAll(router, log);
      getPluginApi(router).addInterceptor("start", (next, path) => {
        log.push(["interceptor", path]);

        return next(path ?? "/home");
      });

      await router.start(undefined as never);

      expect(log).toStrictEqual([
        ["start:entry", undefined],
        ["interceptor", undefined],
      ]);

      router.dispose();
    });
  });

  describe("a refusal stops the door where it stands", () => {
    it("start: the call throws before the interceptor chain, and the router stays startable", async () => {
      const router = createRouter(routes);
      const intercepted = vi.fn();
      const remove = getPluginApi(router).addCheck("start:entry", () => {
        throw refusal;
      });

      getPluginApi(router).addInterceptor("start", (next, path) => {
        intercepted(path);

        return next(path);
      });

      expect(() => router.start("/home")).toThrow(refusal);
      expect(intercepted).not.toHaveBeenCalled();
      expect(router.isActive()).toBe(false);

      remove();

      await expect(router.start("/home")).resolves.toMatchObject({
        name: "home",
      });

      router.dispose();
    });

    it("navigateToDefault:entry — the call throws, and nothing is reported", async () => {
      const router = await startedOnNext();
      const log: unknown[][] = [];

      listenToAll(router, log);
      getPluginApi(router).addCheck("navigateToDefault:entry", () => {
        throw refusal;
      });

      expect(() => router.navigateToDefault()).toThrow(refusal);
      expect(log).toStrictEqual([["navigateToDefault:entry", undefined]]);

      router.dispose();
    });

    it("navigateToDefault:route — the call rejects after the report, and the state stays", async () => {
      const router = await startedOnNext();
      const log: unknown[][] = [];

      listenToAll(router, log);
      getPluginApi(router).addCheck("navigateToDefault:route", () => {
        throw refusal;
      });

      await expect(router.navigateToDefault()).rejects.toBe(refusal);
      expect(log).toStrictEqual([
        ["navigateToDefault:entry", undefined],
        ["NAVIGATE_TO_DEFAULT"],
        ["navigateToDefault:route", "home"],
      ]);
      expect(router.getState()?.name).toBe("next");

      router.dispose();
    });

    it("navigateToState:entry — the call throws, and the state stays", async () => {
      const router = createRouter(routes);
      const api = getPluginApi(router);

      await router.start("/home");
      api.addCheck("navigateToState:entry", () => {
        throw refusal;
      });

      expect(() =>
        api.navigateToState(api.makeState("next", {}, undefined, "/next")),
      ).toThrow(refusal);
      expect(router.getState()?.name).toBe("home");

      router.dispose();
    });

    it("setRootPath:entry — the call throws, and the root path stays", () => {
      const router = createRouter(routes);
      const api = getPluginApi(router);

      api.addCheck("setRootPath:entry", () => {
        throw refusal;
      });

      expect(() => api.setRootPath("/base")).toThrow(refusal);
      expect(router.buildPath("home")).toBe("/home");

      router.dispose();
    });
  });

  describe("a report handler that throws is isolated", () => {
    // ⚑ The navigation runs as if the handler had returned, and the emitter
    // logs the throw. Only a synchronous throw: an async handler's rejection
    // is #2836's.
    it("NAVIGATE_TO_DEFAULT: the navigation completes, and the throw reaches logger.error", async () => {
      const errors: unknown[][] = [];
      const router = createRouter(routes, {
        defaultRoute: "home",
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
      const fault = new Error("handler of NAVIGATE_TO_DEFAULT");

      await router.start("/next");
      getPluginApi(router).subscribeDiagnostic("NAVIGATE_TO_DEFAULT", () => {
        throw fault;
      });

      await expect(router.navigateToDefault()).resolves.toMatchObject({
        name: "home",
      });
      expect(errors).toStrictEqual([
        ["router", "Error in listener for NAVIGATE_TO_DEFAULT:", fault],
      ]);

      router.dispose();
    });

    it("KINDS holds every kind of the step", () => {
      expectTypeOf<
        Exclude<NavigateToDefaultKind, (typeof KINDS)[number]>
      >().toBeNever();

      expect([...KINDS]).toStrictEqual(["NAVIGATE_TO_DEFAULT"]);
    });
  });

  describe("application code that disposes the router before the default navigation stops it", () => {
    // ⚑ The entry checks and the report's handlers run before core resolves
    // the defaults — the logger callback a report reaches among them. Core asks
    // once more after them, so the navigation does not start on a disposed
    // router.
    it("a check at navigateToDefault:entry that disposes the router", async () => {
      const resolved = vi.fn(() => "home");
      const router = createRouter(routes, { defaultRoute: resolved });

      await router.start("/next");
      getPluginApi(router).addCheck("navigateToDefault:entry", () => {
        router.dispose();
      });

      expect(disposedOf(() => router.navigateToDefault())).toStrictEqual(
        DISPOSED,
      );
      expect(resolved).not.toHaveBeenCalled();
    });

    it("a handler of NAVIGATE_TO_DEFAULT that disposes the router", async () => {
      const resolved = vi.fn(() => "home");
      const router = createRouter(routes, { defaultRoute: resolved });

      await router.start("/next");
      getPluginApi(router).subscribeDiagnostic("NAVIGATE_TO_DEFAULT", () => {
        router.dispose();
      });

      expect(disposedOf(() => router.navigateToDefault())).toStrictEqual(
        DISPOSED,
      );
      expect(resolved).not.toHaveBeenCalled();
    });
  });

  it("ANTI-VACUUM: with no consumer the doors still work", async () => {
    const router = createRouter(routes, { defaultRoute: () => "home" });
    const api = getPluginApi(router);

    await expect(router.start("/next")).resolves.toMatchObject({
      name: "next",
    });
    await expect(router.navigateToDefault()).resolves.toMatchObject({
      name: "home",
    });
    await expect(
      api.navigateToState(api.makeState("next", {}, undefined, "/next")),
    ).resolves.toMatchObject({ name: "next" });

    router.stop();
    api.setRootPath("/base");

    expect(router.buildPath("home")).toBe("/base/home");

    router.dispose();
  });
});
